import React, { useState } from 'react'
import { sb } from '../lib/supabase.js'
import * as XLSX from 'xlsx'

const today = () => { const d=new Date(); return d.getFullYear()+'-'+(String(d.getMonth()+1).padStart(2,'0'))+'-'+(String(d.getDate()).padStart(2,'0')) }

async function fetchAll(table, select, from, to) {
  const PAGE = 1000; let all=[], idx=0, done=false
  while (!done) {
    const { data, error } = await sb.from(table).select(select)
      .gte('fecha', from).lte('fecha', to)
      .order('fecha', {ascending:true})
      .range(idx, idx+PAGE-1)
    if (error) throw error
    all = all.concat(data||[])
    if (!data || data.length < PAGE) done=true
    else idx += PAGE
  }
  return all
}

async function generarExcel(desde, hasta) {
  const [ventas, ventasCat, gastos, productos] = await Promise.all([
    fetchAll('ventas','fecha,producto,categoria,canal,metodo_pago,unidades,importe,cliente', desde, hasta),
    fetchAll('ventas_cat','fecha,categoria,importe,unidades', desde, hasta),
    fetchAll('gastos','fecha,concepto,categoria_gasto,proveedor,monto,metodo_pago,notas', desde, hasta),
    sb.from('productos').select('codigo,nombre,precio_base,precio_extra,costo_unitario,activo,familias(nombre)').order('nombre').then(r=>r.data||[]),
  ])

  const wb = XLSX.utils.book_new()

  // ── RESUMEN ──────────────────────────────────────────────────
  const totV = ventas.reduce((s,r)=>s+(r.importe||0),0)
  const totG = gastos.reduce((s,r)=>s+(r.monto||0),0)
  const totU = ventas.reduce((s,r)=>s+(r.unidades||0),0)
  const resumen = [
    ['Concepto','Valor'],
    ['Periodo',`${desde} al ${hasta}`],
    ['Total Ventas (neto)',Math.round(totV)],
    ['Total Gastos',Math.round(totG)],
    ['Utilidad Neta',Math.round(totV-totG)],
    ['Margen Neto',totV>0?Math.round((totV-totG)/totV*100)+'%':'—'],
    ['Total Unidades',Math.round(totU)],
    ['Registros de venta',ventas.length],
    ['Registros de gasto',gastos.length],
  ]
  const wsRes = XLSX.utils.aoa_to_sheet(resumen)
  wsRes['!cols'] = [{wch:28},{wch:20}]
  XLSX.utils.book_append_sheet(wb, wsRes, 'Resumen')

  // ── DETALLE POR PRODUCTO ─────────────────────────────────────
  // ventas_cat tiene detalle por categoría, ventas tiene detalle por canal
  // Cruzamos: para cada registro de ventas_cat buscamos el canal del día
  const canalPorFecha = {}
  ventas.forEach(r => { if (!canalPorFecha[r.fecha]) canalPorFecha[r.fecha] = r.canal })

  const detalleRows = [['Fecha','Categoria','Canal','Importe','Unidades']]
  ventasCat.forEach(r => {
    detalleRows.push([r.fecha, r.categoria, canalPorFecha[r.fecha]||'Efectivo', r.importe||0, r.unidades||0])
  })
  // Si no hay ventasCat, usar ventas directamente
  if (ventasCat.length === 0) {
    ventas.forEach(r => {
      detalleRows.push([r.fecha, r.categoria||r.producto, r.canal, r.importe||0, r.unidades||0])
    })
  }
  const wsDet = XLSX.utils.aoa_to_sheet(detalleRows)
  wsDet['!cols'] = [{wch:12},{wch:22},{wch:18},{wch:12},{wch:10}]
  XLSX.utils.book_append_sheet(wb, wsDet, 'Detalle por categoria')

  // ── POR CATEGORÍA Y MES ───────────────────────────────────────
  const catMes = {}, cats = new Set(), meses = new Set()
  ventasCat.forEach(r => {
    const m = r.fecha.slice(0,7), c = r.categoria||'Otros'
    cats.add(c); meses.add(m)
    if (!catMes[c]) catMes[c] = {}
    catMes[c][m] = (catMes[c][m]||0) + (r.importe||0)
  })
  const mesesArr = [...meses].sort(), catsArr = [...cats].sort()
  const catMesRows = [['Categoria',...mesesArr,'TOTAL']]
  catsArr.forEach(c => {
    const row = [c, ...mesesArr.map(m=>Math.round(catMes[c]?.[m]||0))]
    row.push(Math.round(mesesArr.reduce((s,m)=>s+(catMes[c]?.[m]||0),0)))
    catMesRows.push(row)
  })
  const totalRow = ['TOTAL',...mesesArr.map(m=>Math.round(catsArr.reduce((s,c)=>s+(catMes[c]?.[m]||0),0)))]
  totalRow.push(Math.round(totV))
  catMesRows.push(totalRow)
  const wsCatMes = XLSX.utils.aoa_to_sheet(catMesRows)
  wsCatMes['!cols'] = [{wch:22},...mesesArr.map(()=>({wch:12})),{wch:12}]
  XLSX.utils.book_append_sheet(wb, wsCatMes, 'Por categoria y mes')

  // ── POR CANAL Y MES ───────────────────────────────────────────
  const canalMes = {}, canales = new Set()
  ventas.forEach(r => {
    const m = r.fecha.slice(0,7), c = r.canal||'Efectivo'
    canales.add(c); meses.add(m)
    if (!canalMes[c]) canalMes[c] = {}
    canalMes[c][m] = (canalMes[c][m]||0) + (r.importe||0)
  })
  const canalesArr = [...canales].sort()
  const canalMesRows = [['Canal',...mesesArr,'TOTAL']]
  canalesArr.forEach(c => {
    const row = [c,...mesesArr.map(m=>Math.round(canalMes[c]?.[m]||0))]
    row.push(Math.round(mesesArr.reduce((s,m)=>s+(canalMes[c]?.[m]||0),0)))
    canalMesRows.push(row)
  })
  const wsCanalMes = XLSX.utils.aoa_to_sheet(canalMesRows)
  wsCanalMes['!cols'] = [{wch:20},...mesesArr.map(()=>({wch:12})),{wch:12}]
  XLSX.utils.book_append_sheet(wb, wsCanalMes, 'Por canal y mes')

  // ── GASTOS DETALLE ────────────────────────────────────────────
  const gastosRows = [['Fecha','Concepto','Categoria','Proveedor','Monto','Metodo pago','Notas']]
  gastos.forEach(r => gastosRows.push([r.fecha,r.concepto,r.categoria_gasto,r.proveedor||'',r.monto,r.metodo_pago||'',r.notas||'']))
  const wsGastos = XLSX.utils.aoa_to_sheet(gastosRows)
  wsGastos['!cols'] = [{wch:12},{wch:35},{wch:20},{wch:18},{wch:12},{wch:14},{wch:20}]
  XLSX.utils.book_append_sheet(wb, wsGastos, 'Gastos')

  // ── GASTOS POR CATEGORÍA Y MES ────────────────────────────────
  const gcatMes = {}, gcats = new Set(), gmeses = new Set()
  gastos.forEach(r => {
    const m = r.fecha.slice(0,7), c = r.categoria_gasto||'Otros'
    gcats.add(c); gmeses.add(m)
    if (!gcatMes[c]) gcatMes[c] = {}
    gcatMes[c][m] = (gcatMes[c][m]||0) + (r.monto||0)
  })
  const gmesesArr = [...gmeses].sort(), gcatsArr = [...gcats].sort()
  const gcatMesRows = [['Categoria',...gmesesArr,'TOTAL']]
  gcatsArr.forEach(c => {
    const row = [c,...gmesesArr.map(m=>Math.round(gcatMes[c]?.[m]||0))]
    row.push(Math.round(gmesesArr.reduce((s,m)=>s+(gcatMes[c]?.[m]||0),0)))
    gcatMesRows.push(row)
  })
  const wsGcatMes = XLSX.utils.aoa_to_sheet(gcatMesRows)
  wsGcatMes['!cols'] = [{wch:22},...gmesesArr.map(()=>({wch:12})),{wch:12}]
  XLSX.utils.book_append_sheet(wb, wsGcatMes, 'Gastos por categoria')

  // ── PRECIOS ───────────────────────────────────────────────────
  const preciosRows = [['Codigo','Nombre','Familia','Precio base','Precio guiso extra','Costo unitario','Activo']]
  productos.forEach(r => preciosRows.push([r.codigo||'',r.nombre,r.familias?.nombre||'',r.precio_base,r.precio_extra||0,r.costo_unitario||0,r.activo?'Sí':'No']))
  const wsPrecios = XLSX.utils.aoa_to_sheet(preciosRows)
  wsPrecios['!cols'] = [{wch:10},{wch:28},{wch:20},{wch:12},{wch:18},{wch:14},{wch:8}]
  XLSX.utils.book_append_sheet(wb, wsPrecios, 'Precios')

  return wb
}

export default function Exportar() {
  const [desde,   setDesde]   = useState(new Date().getFullYear()+'-01-01')
  const [hasta,   setHasta]   = useState(today())
  const [loading, setLoading] = useState(false)
  const [msg,     setMsg]     = useState(null)

  const exportar = async (tipo) => {
    setLoading(true); setMsg(null)
    try {
      const wb = await generarExcel(desde, hasta)
      // Si es tipo específico, eliminar hojas no requeridas
      if (tipo !== 'todo') {
        const keep = {
          ventas: ['Resumen','Detalle por categoria','Por categoria y mes','Por canal y mes'],
          gastos: ['Resumen','Gastos','Gastos por categoria'],
          precios: ['Precios'],
          inventario: ['Resumen'],
        }[tipo] || wb.SheetNames
        wb.SheetNames = wb.SheetNames.filter(s => keep.includes(s))
        Object.keys(wb.Sheets).forEach(s => { if (!wb.SheetNames.includes(s)) delete wb.Sheets[s] })
      }
      XLSX.writeFile(wb, `Chilakileando-${tipo}-${desde}_${hasta}.xlsx`)
      setMsg({ ok:true, text:`✓ Exportado con ${wb.SheetNames.length} hojas: ${wb.SheetNames.join(', ')}` })
    } catch(e) { setMsg({ ok:false, text:'Error: '+e.message }) }
    setLoading(false)
  }

  const EXPORTS = [
    { id:'ventas',  label:'Ventas e ingresos',  desc:'Detalle por categoría · por mes · por canal',       color:'#378ADD' },
    { id:'gastos',  label:'Gastos y egresos',    desc:'Detalle completo · agrupado por categoría y mes',   color:'#E24B4A' },
    { id:'precios', label:'Catálogo de precios', desc:'Productos con precios, costos y familia',           color:'#1D9E75' },
    { id:'todo',    label:'Reporte completo',    desc:'7 hojas: Resumen · Ventas · Gastos · Precios',      color:'#7F77DD' },
  ]

  return (
    <div>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>Exportar datos a Excel</div>
        <div style={{fontSize:11,color:'var(--text2)'}}>El archivo incluye múltiples hojas con detalle completo y tablas por mes.</div>
      </div>

      {msg && <div style={{padding:'9px 14px',borderRadius:'var(--r-md)',marginBottom:12,
        background:msg.ok?'#EAF3DE':'#FCEBEB',color:msg.ok?'#3B6D11':'#A32D2D',fontSize:12}}>{msg.text}</div>}

      <div className="card" style={{marginBottom:14}}>
        <div className="ch"><div className="ct">Rango de fechas</div></div>
        <div style={{display:'flex',gap:12,alignItems:'flex-end',flexWrap:'wrap'}}>
          <div>
            <label style={{fontSize:11,color:'var(--text2)',display:'block',marginBottom:4}}>Desde</label>
            <input type="date" className="form-input" value={desde} onChange={e=>setDesde(e.target.value)}/>
          </div>
          <div>
            <label style={{fontSize:11,color:'var(--text2)',display:'block',marginBottom:4}}>Hasta</label>
            <input type="date" className="form-input" value={hasta} onChange={e=>setHasta(e.target.value)}/>
          </div>
          <div style={{display:'flex',gap:6}}>
            {[
              {label:'Este mes', fn:()=>{const h=new Date();setDesde(h.getFullYear()+'-'+(String(h.getMonth()+1).padStart(2,'0'))+'-01');setHasta(today())}},
              {label:'Este año', fn:()=>{setDesde(new Date().getFullYear()+'-01-01');setHasta(today())}},
              {label:'Histórico',fn:()=>{setDesde('2024-01-01');setHasta(today())}},
            ].map(a=>(
              <button key={a.label} onClick={a.fn}
                style={{padding:'6px 12px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:11,color:'var(--text2)'}}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))',gap:10}}>
        {EXPORTS.map(ex=>(
          <div key={ex.id} className="card" style={{borderLeft:`3px solid ${ex.color}`}}>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:13,fontWeight:600,color:ex.color,marginBottom:3}}>{ex.label}</div>
              <div style={{fontSize:11,color:'var(--text3)',lineHeight:1.4}}>{ex.desc}</div>
            </div>
            <button onClick={()=>exportar(ex.id)} disabled={loading}
              style={{width:'100%',padding:'9px',borderRadius:'var(--r-md)',
                border:`1px solid ${ex.color}`,background:loading?'var(--bg)':`${ex.color}15`,
                color:ex.color,cursor:loading?'not-allowed':'pointer',fontSize:13,fontWeight:600}}>
              {loading?'⏳ Exportando…':'⬇ Descargar Excel'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
