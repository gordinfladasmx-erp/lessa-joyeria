import React, { useState, useEffect } from 'react'
import { Bar } from 'react-chartjs-2'
import { Chart, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js'
import { sb } from '../lib/supabase.js'
import ExportBtn from '../components/ExportBtn.jsx'

Chart.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const fmtM = v => '$' + Math.round(v||0).toLocaleString('es-MX')
const fmtP = v => (v>=0?'+':'')+Math.round(v||0).toFixed(1)+'%'

const CATS_EQUIPO = ['Equipo Electrónico Fijo','Equipo Electrónico Móvil','Mobiliario y Equipo','Menaje y Loza']

// Tasas de depreciación anual por categoría (SAT México)
const TASA_DEP = {
  'Equipo Electrónico Fijo':  0.25,
  'Equipo Electrónico Móvil': 0.30,
  'Mobiliario y Equipo':      0.10,
  'Menaje y Loza':            0.10,
}
const AÑO_ACTUAL = new Date().getFullYear()

const calcDep = (e) => {
  const tasa = TASA_DEP[e.cat] ?? 0.10
  // 2023 fue solo el último trimestre → 0.75 años menos que un año completo
  const añosUso = Math.max(0, (AÑO_ACTUAL - e.año) - (e.año === 2023 ? 0.75 : 0))
  const costoTotal = e.precio * e.qty
  const depAcum    = Math.min(costoTotal, Math.round(costoTotal * tasa * añosUso))
  const valorActual = Math.max(0, costoTotal - depAcum)
  return { añosUso: Math.round(añosUso * 4) / 4, depAcum, valorActual, tasa }
}
const AREAS_EQUIPO = ['Administración','Cafetería','Cocina','Fachada','Preparación','Salón']

const rowToEquipo = e => ({
  _id: e.id, id: e.id, area: e.area, cat: e.cat,
  nombre: e.nombre, qty: e.qty, precio: Number(e.precio), año: e.anio, isNew: false,
})

// ── PASIVOS FIJOS ─────────────────────────────────────────────
const PASIVOS = [
  { concepto:'Préstamo Clip',           monto:15774,  tipo:'Corto plazo',  original:47323,  desde:'2024' },
  { concepto:'Préstamo Uber',           monto:31947,  tipo:'Corto plazo',  original:67633,  desde:'2024' },
  { concepto:'Préstamo FMV1',           monto:70000,  tipo:'Largo plazo',  original:70000,  desde:'2023' },
  { concepto:'Préstamo FMR1',           monto:70000,  tipo:'Largo plazo',  original:70000,  desde:'2023' },
  { concepto:'Préstamo FMR2',           monto:50000,  tipo:'Largo plazo',  original:50000,  desde:'2024' },
  { concepto:'Préstamo FMR3 (sucursal)',monto:200000, tipo:'Largo plazo',  original:200000, desde:'2025' },
  { concepto:'Préstamo Socio 1',        monto:16953,  tipo:'Socios',       original:16953,  desde:'2025' },
  { concepto:'Préstamo Socio 2',        monto:128490, tipo:'Socios',       original:128490, desde:'2025' },
]

// ── CAPITAL SOCIAL ────────────────────────────────────────────
const CAPITAL_SOCIOS = [
  { socio:'Mónica',   aportacion:70000, fecha:'Sep 2023' },
  { socio:'Guillermo',aportacion:70000, fecha:'Sep 2023' },
]

const capitalSocial= CAPITAL_SOCIOS.reduce((s,c)=>s+c.aportacion, 0)

const CAT_COLOR = {
  'Equipo Electrónico Fijo':  '#378ADD',
  'Equipo Electrónico Móvil': '#7F77DD',
  'Mobiliario y Equipo':      '#D85A30',
  'Menaje y Loza':            '#EF9F27',
}

export default function Balance() {
  const [cash,        setCash]        = useState({ efvo:0, tc:0, plat:0 })
  const [utilidad,    setUtilidad]    = useState(0)
  const [datos2026,   setDatos2026]   = useState(null)
  const [npsScore,    setNpsScore]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [tab,           setTab]           = useState('balance')
  const [equiposEdit,   setEquiposEdit]   = useState([])
  const [equiposLoading,setEquiposLoading]= useState(true)
  const [editModeEq,    setEditModeEq]    = useState(false)
  const [deletedEqIds,  setDeletedEqIds]  = useState([])
  const [guardandoEq,   setGuardandoEq]   = useState(false)
  const [pasivosEdit,   setPasivosEdit]   = useState([])
  const [editMode,      setEditMode]      = useState(false)
  const [mults, setMults] = useState({ '2023':2, '2024':2, '2025':3, '2026':4 })
  const [npsMultEdit, setNpsMultEdit] = useState(null) // null = usa el calculado automático

  const [historico, setHistorico] = useState([])
  const [gananciasChart, setGananciasChart] = useState(null)
  const [ganPopup,  setGanPopup]  = useState(null)
  const [prestPopup,setPrestPopup]= useState(null)

  useEffect(() => {
    const load = async () => {
      // Cash del último cierre
      const { data: ultimoCierre } = await sb.from('cierres_dia')
        .select('saldo_final_efvo,saldo_final_tc,saldo_fin_uber,saldo_fin_uber_chi,saldo_fin_didi,saldo_fin_didi_chi,saldo_fin_rappi,saldo_fin_ola')
        .order('fecha', { ascending: false }).limit(1).maybeSingle()

      // Cargar activos fijos desde BD
      const { data: actFijosDB } = await sb.from('activos_fijos').select('*').order('cat').order('nombre')
      if (actFijosDB) setEquiposEdit(actFijosDB.map(rowToEquipo))
      setEquiposLoading(false)

      // Cargar préstamos desde BD; si no hay datos usa los hardcodeados como fallback
      const { data: prestamosDB } = await sb.from('prestamos').select('*').order('desde')
      if (prestamosDB && prestamosDB.length > 0) {
        setPasivosEdit(prestamosDB.map(p=>({
          _id: p.id,
          concepto: p.concepto,
          acreedor: p.acreedor || '',
          monto: p.saldo_actual,
          original: p.monto_original,
          tipo: p.tipo,
          desde: p.desde,
        })))
      } else {
        // Fallback a datos hardcodeados cuando la tabla está vacía
        setPasivosEdit([])
      }

      const platTotal = ultimoCierre
        ? (ultimoCierre.saldo_fin_uber||0)+(ultimoCierre.saldo_fin_uber_chi||0)+
          (ultimoCierre.saldo_fin_didi||0)+(ultimoCierre.saldo_fin_didi_chi||0)+
          (ultimoCierre.saldo_fin_rappi||0)+(ultimoCierre.saldo_fin_ola||0)
        : 0

      setCash({
        efvo: ultimoCierre?.saldo_final_efvo||0,
        tc:   ultimoCierre?.saldo_final_tc||0,
        plat: platTotal,
      })

      // Datos 2026 reales desde BD — paginados para no perder registros
      const hoy = new Date()
      const inicioAño = hoy.getFullYear()+'-01-01'
      const hoyStr = hoy.toISOString().slice(0,10)
      const diasTranscurridos = Math.round((hoy - new Date(inicioAño)) / (1000*60*60*24)) + 1
      const meses2026 = diasTranscurridos / 30.44

      // ── Helper genérico: fetch paginado con rango de fechas ──
      const fetchRango = async (table, select, desde, hasta) => {
        const PAGE = 1000; let all = [], idx = 0, done = false
        while (!done) {
          const { data } = await sb.from(table).select(select)
            .gte('fecha', desde).lte('fecha', hasta)
            .range(idx, idx + PAGE - 1)
          all = all.concat(data || [])
          if (!data || data.length < PAGE) done = true; else idx += PAGE
        }
        return all
      }

      // ── Helper: construir objeto de datos anuales desde arrays de ventas/gastos ──
      const isComTC = g => /(clip|tarjeta|mixto)/i.test(g.concepto||'')
      const buildDatos = (ventasArr, gastosArr, meses, periodo, multiplicador) => {
        const ventas = ventasArr.reduce((s,r)=>s+(r.importe||0),0)
        const bycat = {}
        gastosArr.forEach(g => { bycat[g.categoria_gasto] = (bycat[g.categoria_gasto]||0)+(g.monto||0) })
        const gvList = gastosArr.filter(g=>(g.categoria_gasto||'').toUpperCase().includes('GASTO DE VENTAS'))
        const comPlat = gvList.filter(g=>!isComTC(g)).reduce((s,g)=>s+(g.monto||0),0)
        const comTC   = gvList.filter(g=> isComTC(g)).reduce((s,g)=>s+(g.monto||0),0)
        return {
          periodo, meses,
          ventas:       Math.round(ventas),
          comPlat:      Math.round(comPlat),
          comTC:        Math.round(comTC),
          costo:        Math.round((bycat['Costo']||0)+(bycat['COSTOS']||0)),
          opMtto:       Math.round((bycat['Gastos de Op y Mtto']||0)+(bycat['GASTOS DE OPERACIÓN']||0)),
          ventasGasto:  0,   // comPlat+comTC ya cubren GASTO DE VENTAS
          servicios:    Math.round((bycat['Servicios']||0)+(bycat['SERVICIOS']||0)),
          salarios:     Math.round((bycat['Salarios']||0)+(bycat['SALARIOS & BONOS']||0)),
          pagoGanancias:Math.round(bycat['PAGO DE GANANCIAS']||0),
          multiplicador,
        }
      }

      // ── Cargar todos los años en paralelo ──
      const [[v2023,g2023],[v2024,g2024],[v2025,g2025],[v2026,g2026]] = await Promise.all([
        Promise.all([fetchRango('ventas','importe,canal,metodo_pago','2023-01-01','2023-12-31'),
                     fetchRango('gastos','fecha,monto,categoria_gasto,concepto','2023-01-01','2023-12-31')]),
        Promise.all([fetchRango('ventas','importe,canal,metodo_pago','2024-01-01','2024-12-31'),
                     fetchRango('gastos','fecha,monto,categoria_gasto,concepto','2024-01-01','2024-12-31')]),
        Promise.all([fetchRango('ventas','importe,canal,metodo_pago','2025-01-01','2025-12-31'),
                     fetchRango('gastos','fecha,monto,categoria_gasto,concepto','2025-01-01','2025-12-31')]),
        Promise.all([fetchRango('ventas','importe,canal,metodo_pago',inicioAño,hoyStr),
                     fetchRango('gastos','fecha,monto,categoria_gasto,concepto',inicioAño,hoyStr)]),
      ])

      const hist2023 = buildDatos(v2023, g2023, 3.5,  '2023', mults['2023']??2)
      const hist2024 = buildDatos(v2024, g2024, 12,   '2024', mults['2024']??2)
      const hist2025 = buildDatos(v2025, g2025, 12,   '2025', mults['2025']??3)
      setHistorico([
        { ...hist2023, label:'2023 (sep-dic)', actFijo:70530  },
        { ...hist2024, label:'2024',           actFijo:131330 },
        { ...hist2025, label:'2025',           actFijo:398910 },
      ])

      const d2026 = buildDatos(v2026, g2026, meses2026, '2026', mults['2026']??4)
      setDatos2026({ ...d2026, meses: meses2026 })

      // ── Ganancias pagadas por socio por año ──
      // Extrae el nombre del socio del concepto: busca (Memo)/(Monica) o Socio1/Socio2
      const extraerSocio = concepto => {
        const c = (concepto||'').toLowerCase()
        if (c.includes('memo') || c.includes('socio 1') || c.includes('socio1')) return 'Memo'
        if (c.includes('monica') || c.includes('mónica') || c.includes('socio 2') || c.includes('socio2')) return 'Monica'
        return 'Otro'
      }
      const AÑOS_GAN = ['2023','2024','2025','2026']
      const gastosPorAño = { '2023':g2023, '2024':g2024, '2025':g2025, '2026':g2026 }
      const ganData    = {}   // { 'Memo': { '2024': total } }
      const ganDetalle = {}   // { 'Memo': { '2024': [{fecha,monto,concepto}] } }
      AÑOS_GAN.forEach(a => {
        ;(gastosPorAño[a]||[])
          .filter(g=>(g.categoria_gasto||'').toUpperCase().includes('PAGO DE GANANCIAS'))
          .forEach(g => {
            const socio = extraerSocio(g.concepto)
            if (!ganData[socio])    ganData[socio]    = {}
            if (!ganDetalle[socio]) ganDetalle[socio] = {}
            if (!ganDetalle[socio][a]) ganDetalle[socio][a] = []
            ganData[socio][a] = (ganData[socio][a]||0) + (g.monto||0)
            ganDetalle[socio][a].push({ fecha: g.fecha, monto: g.monto, concepto: g.concepto })
          })
      })
      const socios = Object.keys(ganData).sort()
      setGananciasChart({ socios, años: AÑOS_GAN, data: ganData, detalle: ganDetalle })

      // NPS score del año (limit alto, NPS no suele tener miles de respuestas)
      const { data: npsData } = await sb.from('nps_respuestas')
        .select('calificacion').gte('fecha', inicioAño).limit(5000)
      if (npsData && npsData.length > 0) {
        const promotores  = npsData.filter(r=>r.calificacion>=9).length
        const detractores = npsData.filter(r=>r.calificacion<=6).length
        const nps = Math.round((promotores-detractores)/npsData.length*100)
        setNpsScore(nps)
      }

      const totalG2026 = g2026.reduce((s,r)=>s+(r.monto||0),0)
      const totalV2026 = v2026.reduce((s,r)=>s+(r.importe||0),0)
      setUtilidad(Math.round(totalV2026-totalG2026))
      setLoading(false)
    }
    load()
  }, [])

  const guardarPasivos = async () => {
    try {
      for (const p of pasivosEdit) {
        if (p._id && !String(p._id).startsWith('new-')) {
          await sb.from('prestamos').update({
            concepto:      p.concepto,
            acreedor:      p.acreedor || null,
            saldo_actual:  p.monto,
            monto_original:p.original,
            tipo:          p.tipo,
            desde:         p.desde,
          }).eq('id', p._id)
        } else {
          await sb.from('prestamos').insert({
            id:            crypto.randomUUID(),
            concepto:      p.concepto,
            acreedor:      p.acreedor || null,
            saldo_actual:  p.monto,
            monto_original:p.original,
            tipo:          p.tipo,
            desde:         p.desde,
          })
        }
      }
      // Recargar desde DB
      const { data } = await sb.from('prestamos').select('*').order('desde')
      if (data) setPasivosEdit(data.map(p=>({
        _id: p.id, concepto: p.concepto, acreedor: p.acreedor||'',
        monto: p.saldo_actual, original: p.monto_original, tipo: p.tipo, desde: p.desde,
      })))
      setEditMode(false)
    } catch(err) {
      console.error(err)
      alert('Error al guardar: ' + err.message)
    }
  }

  const guardarEquipos = async () => {
    setGuardandoEq(true)
    try {
      if (deletedEqIds.length > 0)
        await sb.from('activos_fijos').delete().in('id', deletedEqIds)
      const nuevos     = equiposEdit.filter(e => e.isNew)
      const existentes = equiposEdit.filter(e => !e.isNew)
      if (nuevos.length > 0)
        await sb.from('activos_fijos').insert(nuevos.map(e => ({
          area:e.area, cat:e.cat, nombre:e.nombre, qty:e.qty, precio:e.precio, anio:e.año
        })))
      for (const e of existentes)
        await sb.from('activos_fijos').update({
          area:e.area, cat:e.cat, nombre:e.nombre, qty:e.qty, precio:e.precio, anio:e.año
        }).eq('id', e.id)
      setDeletedEqIds([])
      const { data } = await sb.from('activos_fijos').select('*').order('cat').order('nombre')
      if (data) setEquiposEdit(data.map(rowToEquipo))
      setEditModeEq(false)
    } catch(err) {
      console.error(err)
      alert('Error al guardar: ' + err.message)
    }
    setGuardandoEq(false)
  }

  const cashTotal    = cash.efvo + cash.tc + cash.plat
  const totalEquiposEdit       = equiposEdit.reduce((s,e)=>s+e.precio*e.qty, 0)
  const totalEquiposDepreciado = equiposEdit.reduce((s,e)=>s+calcDep(e).valorActual, 0)
  const totalPasivosEdit = pasivosEdit.reduce((s,p)=>s+p.monto, 0)
  const pasivosCPEdit    = pasivosEdit.filter(p=>p.tipo==='Corto plazo').reduce((s,p)=>s+p.monto, 0)
  const pasivosLPEdit    = pasivosEdit.filter(p=>p.tipo==='Largo plazo').reduce((s,p)=>s+p.monto, 0)
  const pasivosSociosEdit= pasivosEdit.filter(p=>p.tipo==='Socios').reduce((s,p)=>s+p.monto, 0)

  const activosCorrientes = cashTotal
  const activosFijos      = totalEquiposDepreciado
  const totalActivos      = activosCorrientes + activosFijos
  const patrimonio        = capitalSocial + utilidad
  const totalPasivoPatrim = totalPasivosEdit + patrimonio

  // Multiplicador NPS
  const npsMultiplier = npsScore===null ? 0 : npsScore>=95 ? 3 : npsScore>=90 ? 2 : npsScore>=80 ? 1.5 : 0

  // Indicadores
  const roa = totalActivos>0   ? (utilidad/totalActivos*100)   : 0
  const roe = patrimonio>0     ? (utilidad/patrimonio*100)     : 0
  const roi = capitalSocial>0  ? (utilidad/capitalSocial*100)  : 0
  const liquidez = pasivosCPEdit>0 ? (cashTotal/pasivosCPEdit) : 0
  const capitalTrabajo = cashTotal - pasivosCPEdit
  const endeudamiento  = totalActivos>0 ? (totalPasivosEdit/totalActivos*100) : 0

  const catGroupsEdit = {}
  equiposEdit.forEach(e => {
    if (!catGroupsEdit[e.cat]) catGroupsEdit[e.cat] = 0
    catGroupsEdit[e.cat] += calcDep(e).valorActual   // valor depreciado, igual que hoja de Activos
  })

  if (loading) return <div className="loading-screen" style={{height:300}}><div className="spinner"/></div>

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
        <div>
          <div style={{fontSize:14,fontWeight:600}}>Balance General & Indicadores Financieros</div>
          <div style={{fontSize:11,color:'var(--text2)'}}>Al {new Date().toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'})}</div>
        </div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
          {[{id:'balance',label:'Balance'},{id:'indicadores',label:'Indicadores'},{id:'valor',label:'Valor del Negocio'},{id:'equipos',label:'Equipos'},{id:'pasivos',label:'Pasivos'}].map(t=>(
            <button key={t.id} className={`psw-btn${tab===t.id?' active':''}`} onClick={()=>setTab(t.id)}>{t.label}</button>
          ))}
          <ExportBtn titulo="Balance General" getElement={()=>document.querySelector('.content')}/>
        </div>
      </div>

      {/* ── INDICADORES KPI ── */}
      <div className="metrics" style={{gridTemplateColumns:'repeat(6,minmax(0,1fr))',marginBottom:14}}>
        {[
          {label:'ROA',          val:roa.toFixed(1)+'%',  color:roa>=0?'#1D9E75':'#E24B4A', sub:'Retorno s/activos'},
          {label:'ROE',          val:roe.toFixed(1)+'%',  color:roe>=0?'#1D9E75':'#E24B4A', sub:'Retorno s/capital'},
          {label:'ROI',          val:roi.toFixed(1)+'%',  color:roi>=0?'#1D9E75':'#E24B4A', sub:'Retorno inversión'},
          {label:'Liquidez',     val:liquidez.toFixed(2)+'x',color:liquidez>=1?'#1D9E75':'#E24B4A',sub:'Efvo/Deuda CP'},
          {label:'Cap. Trabajo', val:fmtM(capitalTrabajo),color:capitalTrabajo>=0?'#1D9E75':'#E24B4A',sub:'Activo−Pasivo CP'},
          {label:'Endeudamiento',val:endeudamiento.toFixed(1)+'%',color:endeudamiento<70?'#EF9F27':'#E24B4A',sub:'Pasivos/Activos'},
        ].map(k=>(
          <div key={k.label} className="mc">
            <div className="mc-label">{k.label}</div>
            <div className="mc-value" style={{color:k.color,fontSize:15}}>{k.val}</div>
            <div style={{fontSize:9,color:'var(--text3)',marginTop:2}}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── BALANCE ── */}
      {tab==='balance' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          {/* ACTIVOS */}
          <div className="card">
            <div className="ch"><div className="ct" style={{color:'#1D9E75'}}>Activos</div><strong style={{color:'#1D9E75'}}>{fmtM(totalActivos)}</strong></div>

            <div style={{fontSize:11,fontWeight:600,color:'var(--text2)',marginBottom:8,marginTop:4}}>Activos Corrientes</div>
            <div style={{padding:'10px 12px',background:'#EAF3DE',borderRadius:'var(--r-md)',marginBottom:14}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:6}}>
                <span style={{fontWeight:600}}>Cash total</span>
                <strong style={{color:'#1D9E75'}}>{fmtM(cashTotal)}</strong>
              </div>
              {[
                {label:'💵 Efectivo en caja', val:cash.efvo},
                {label:'💳 Tarjeta acumulada', val:cash.tc},
                {label:'🛵 Plataformas por cobrar', val:cash.plat},
              ].map(r=>(
                <div key={r.label} style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text2)',marginBottom:3}}>
                  <span>{r.label}</span><span>{fmtM(r.val)}</span>
                </div>
              ))}
              <div style={{borderTop:'0.5px solid #C0DD97',marginTop:6,paddingTop:6,display:'flex',justifyContent:'space-between',fontSize:11,fontWeight:600}}>
                <span>Total corriente</span><span>{fmtM(activosCorrientes)}</span>
              </div>
            </div>

            <div style={{fontSize:11,fontWeight:600,color:'var(--text2)',marginBottom:8}}>Activos Fijos</div>
            <div style={{padding:'10px 12px',background:'#E6F1FB',borderRadius:'var(--r-md)',marginBottom:14}}>
              {Object.entries(catGroupsEdit).map(([cat,val])=>(
                <div key={cat} style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:4}}>
                  <span style={{color:CAT_COLOR[cat]||'var(--text2)'}}>{cat}</span>
                  <span style={{fontWeight:500}}>{fmtM(val)}</span>
                </div>
              ))}
              <div style={{borderTop:'0.5px solid #B5D4F4',marginTop:6,paddingTop:6,display:'flex',justifyContent:'space-between',fontSize:11,fontWeight:600}}>
                <span>Total activos fijos</span><span>{fmtM(activosFijos)}</span>
              </div>
              <div style={{fontSize:9,color:'var(--text3)',marginTop:3}}>
                Valor depreciado · costo original {fmtM(totalEquiposEdit)}
              </div>
            </div>

            <div style={{display:'flex',justifyContent:'space-between',padding:'10px 12px',background:'#1D9E75',borderRadius:'var(--r-md)',color:'#fff'}}>
              <span style={{fontWeight:700}}>TOTAL ACTIVOS</span>
              <strong style={{fontSize:16}}>{fmtM(totalActivos)}</strong>
            </div>
          </div>

          {/* GRÁFICO GANANCIAS — movido abajo de pasivos, ver después de </div> de pasivos */}
          {false && (() => {
            const { socios, años, data } = gananciasChart
            const AÑO_COLORS = {'2023':'#4472C4','2024':'#ED7D31','2025':'#1E6B3C','2026':'#4DBCD4'}
            const totalPorSocio = Object.fromEntries(socios.map(s=>[s, años.reduce((acc,a)=>acc+(data[s]?.[a]||0),0)]))
            const totalGlobal   = socios.reduce((s,sc)=>s+totalPorSocio[sc],0)
            const maxTotal      = Math.max(...Object.values(totalPorSocio), 1)
            return (
              <div style={{marginTop:16,paddingTop:14,borderTop:'1px solid var(--border)'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}>
                  <span style={{fontSize:12,fontWeight:700,color:'var(--text2)'}}>Ganancias pagadas a socios</span>
                  <span style={{fontSize:12,fontWeight:800,color:'#534AB7'}}>{fmtM(totalGlobal)}</span>
                </div>
                {socios.map(socio=>{
                  const total = totalPorSocio[socio]
                  const barW  = Math.round(total / maxTotal * 100)
                  return (
                    <div key={socio} style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                      <span style={{fontSize:12,fontWeight:600,color:'var(--text2)',width:70,flexShrink:0,textAlign:'right'}}>{socio}</span>
                      <div style={{flex:1,height:36,display:'flex',borderRadius:4,overflow:'hidden',background:'#f0f0f0'}}>
                        <div style={{display:'flex',width:`${barW}%`,height:'100%'}}>
                          {años.map(a=>{
                            const monto = data[socio]?.[a]||0
                            if(!monto) return null
                            const segW = Math.round(monto/total*100)
                            return (
                              <div key={a} style={{width:`${segW}%`,background:AÑO_COLORS[a],
                                display:'flex',alignItems:'center',justifyContent:'center',
                                borderRight:'1px solid rgba(255,255,255,0.4)'}}>
                                <span style={{fontSize:10,fontWeight:700,color:'#fff',
                                  textShadow:'0 1px 2px rgba(0,0,0,0.5)',whiteSpace:'nowrap'}}>
                                  ${Math.round(monto).toLocaleString('es-MX')}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      <span style={{fontSize:12,fontWeight:800,color:'#534AB7',width:72,flexShrink:0}}>{fmtM(total)}</span>
                    </div>
                  )
                })}
                <div style={{display:'flex',gap:12,marginTop:8,justifyContent:'center'}}>
                  {años.filter(a=>socios.some(s=>data[s]?.[a])).map(a=>(
                    <span key={a} style={{display:'flex',alignItems:'center',gap:4,fontSize:11}}>
                      <span style={{width:10,height:10,borderRadius:2,background:AÑO_COLORS[a],display:'inline-block'}}/>
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* PASIVOS + PATRIMONIO */}
          <div className="card">
            <div className="ch"><div className="ct" style={{color:'#E24B4A'}}>Pasivos y Patrimonio</div><strong style={{color:'#E24B4A'}}>{fmtM(totalPasivoPatrim)}</strong></div>

            {/* Pasivos CP */}
            <div style={{fontSize:11,fontWeight:600,color:'var(--text2)',marginBottom:8,marginTop:4}}>Pasivos Corto Plazo</div>
            <div style={{padding:'10px 12px',background:'#FCEBEB',borderRadius:'var(--r-md)',marginBottom:10}}>
              {pasivosEdit.filter(p=>p.tipo==='Corto plazo').map(p=>(
                <div key={p.concepto} style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:4}}>
                  <span>{p.concepto}{p.acreedor?<span style={{color:'var(--text3)',marginLeft:4}}>· {p.acreedor}</span>:null}</span>
                  <span style={{fontWeight:500}}>{fmtM(p.monto)}</span>
                </div>
              ))}
              <div style={{borderTop:'0.5px solid #F09595',marginTop:6,paddingTop:6,display:'flex',justifyContent:'space-between',fontSize:11,fontWeight:600}}>
                <span>Subtotal CP</span><span>{fmtM(pasivosCPEdit)}</span>
              </div>
            </div>

            {/* Pasivos LP */}
            <div style={{fontSize:11,fontWeight:600,color:'var(--text2)',marginBottom:8}}>Pasivos Largo Plazo</div>
            <div style={{padding:'10px 12px',background:'#FCEBEB',borderRadius:'var(--r-md)',marginBottom:10}}>
              {pasivosEdit.filter(p=>p.tipo==='Largo plazo').map(p=>(
                <div key={p.concepto} style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:4}}>
                  <span>{p.concepto}{p.acreedor?<span style={{color:'var(--text3)',marginLeft:4}}>· {p.acreedor}</span>:null}</span>
                  <span style={{fontWeight:500}}>{fmtM(p.monto)}</span>
                </div>
              ))}
              <div style={{borderTop:'0.5px solid #F09595',marginTop:6,paddingTop:6,display:'flex',justifyContent:'space-between',fontSize:11,fontWeight:600}}>
                <span>Subtotal LP</span><span>{fmtM(pasivosLPEdit)}</span>
              </div>
            </div>

            {/* Pasivos Socios */}
            <div style={{fontSize:11,fontWeight:600,color:'var(--text2)',marginBottom:8}}>Préstamos de Socios</div>
            <div style={{padding:'10px 12px',background:'#FAEEDA',borderRadius:'var(--r-md)',marginBottom:10}}>
              {pasivosEdit.filter(p=>p.tipo==='Socios').map(p=>(
                <div key={p.concepto} style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:4}}>
                  <span>{p.concepto}{p.acreedor?<span style={{color:'var(--text3)',marginLeft:4}}>· {p.acreedor}</span>:null}</span>
                  <span style={{fontWeight:500}}>{fmtM(p.monto)}</span>
                </div>
              ))}
              <div style={{borderTop:'0.5px solid #FAC775',marginTop:6,paddingTop:6,display:'flex',justifyContent:'space-between',fontSize:11,fontWeight:600}}>
                <span>Subtotal socios</span><span>{fmtM(pasivosSociosEdit)}</span>
              </div>
            </div>

            {/* Patrimonio */}
            <div style={{fontSize:11,fontWeight:600,color:'var(--text2)',marginBottom:8}}>Patrimonio</div>
            <div style={{padding:'10px 12px',background:'#EEEDFE',borderRadius:'var(--r-md)',marginBottom:14}}>
              {CAPITAL_SOCIOS.map(c=>(
                <div key={c.socio} style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:4}}>
                  <span>Capital {c.socio} ({c.fecha})</span>
                  <span style={{fontWeight:500}}>{fmtM(c.aportacion)}</span>
                </div>
              ))}
              <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:4}}>
                <span>Utilidad acumulada {new Date().getFullYear()}</span>
                <span style={{fontWeight:500,color:utilidad>=0?'#1D9E75':'#E24B4A'}}>{fmtM(utilidad)}</span>
              </div>
              <div style={{borderTop:'0.5px solid #AFA9EC',marginTop:6,paddingTop:6,display:'flex',justifyContent:'space-between',fontSize:11,fontWeight:600}}>
                <span>Total patrimonio</span><span style={{color:'#7F77DD'}}>{fmtM(patrimonio)}</span>
              </div>
            </div>

            <div style={{display:'flex',justifyContent:'space-between',padding:'10px 12px',background:'#E24B4A',borderRadius:'var(--r-md)',color:'#fff'}}>
              <span style={{fontWeight:700}}>TOTAL PASIVOS + PATRIMONIO</span>
              <strong style={{fontSize:16}}>{fmtM(totalPasivoPatrim)}</strong>
            </div>
          </div>

          {/* GRÁFICO GANANCIAS — ocupa las 2 columnas */}
          {gananciasChart && (() => {
            const { socios, años, data, detalle } = gananciasChart
            const AÑO_COLORS = {'2023':'#4472C4','2024':'#ED7D31','2025':'#1E6B3C','2026':'#4DBCD4'}
            const totalPorSocio = Object.fromEntries(socios.map(s=>[s, años.reduce((acc,a)=>acc+(data[s]?.[a]||0),0)]))
            const totalGlobal   = socios.reduce((s,sc)=>s+totalPorSocio[sc],0)
            const maxTotal      = Math.max(...Object.values(totalPorSocio), 1)
            return (
              <div className="card" style={{gridColumn:'1 / -1'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:14}}>
                  <span style={{fontSize:13,fontWeight:700,color:'var(--text2)'}}>Ganancias pagadas a socios</span>
                  <span style={{fontSize:13,fontWeight:800,color:'#534AB7'}}>{fmtM(totalGlobal)}</span>
                </div>
                {socios.length === 0 && (
                  <div style={{fontSize:11,color:'var(--text3)',textAlign:'center',padding:'20px 0',background:'var(--bg)',borderRadius:'var(--r-md)'}}>
                    Sin registros de ganancias pagadas — agrega gastos con categoría "PAGO DE GANANCIAS"
                  </div>
                )}
                {socios.map(socio => {
                  const total = totalPorSocio[socio]
                  const barW  = Math.round(total / maxTotal * 100)
                  return (
                    <div key={socio} style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
                      <span style={{fontSize:12,fontWeight:600,color:'var(--text2)',width:64,flexShrink:0,textAlign:'right'}}>{socio}</span>
                      <div style={{flex:1,height:38,display:'flex',borderRadius:5,overflow:'hidden',background:'#f0f0f0'}}>
                        <div style={{display:'flex',width:`${barW}%`,height:'100%'}}>
                          {años.map(a => {
                            const monto = data[socio]?.[a]||0
                            if (!monto) return null
                            const segW = Math.round(monto/total*100)
                            return (
                              <div key={a}
                                onClick={()=>setGanPopup({socio, año:a, registros:(detalle?.[socio]?.[a]||[]).sort((x,y)=>(x.fecha||'')>(y.fecha||'')?1:-1)})}
                                style={{width:`${segW}%`,background:AÑO_COLORS[a],cursor:'pointer',
                                  display:'flex',alignItems:'center',justifyContent:'center',
                                  borderRight:'1px solid rgba(255,255,255,0.4)',minWidth:36,
                                  transition:'filter 0.15s'}}
                                onMouseEnter={e=>e.currentTarget.style.filter='brightness(1.15)'}
                                onMouseLeave={e=>e.currentTarget.style.filter=''}>
                                <span style={{fontSize:10,fontWeight:700,color:'#fff',
                                  textShadow:'0 1px 2px rgba(0,0,0,0.5)',whiteSpace:'nowrap',padding:'0 2px'}}>
                                  ${Math.round(monto).toLocaleString('es-MX')}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      <span style={{fontSize:13,fontWeight:800,color:'#534AB7',width:76,flexShrink:0}}>{fmtM(total)}</span>
                    </div>
                  )
                })}
                <div style={{display:'flex',gap:14,marginTop:4,justifyContent:'center'}}>
                  {años.filter(a=>socios.some(s=>data[s]?.[a])).map(a=>(
                    <span key={a} style={{display:'flex',alignItems:'center',gap:4,fontSize:11}}>
                      <span style={{width:10,height:10,borderRadius:2,background:AÑO_COLORS[a],display:'inline-block'}}/>
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* GRÁFICO APORTACIONES/PRÉSTAMOS POR SOCIO */}
          {(() => {
            const extraerSocioP = (acreedor, concepto) => {
              const t = ((acreedor||'')+(concepto||'')).toLowerCase()
              if (t.includes('memo') || t.includes('socio 1') || t.includes('socio1') || t.includes('fmv')) return 'Memo'
              if (t.includes('monica') || t.includes('mónica') || t.includes('socio 2') || t.includes('socio2') || t.includes('fmr')) return 'Monica'
              return null
            }
            const AÑOS_P = ['2023','2024','2025','2026']
            const AÑO_COLORS_P = {'2023':'#B5C9E8','2024':'#F4B183','2025':'#70AD47','2026':'#00B0F0'}
            // Agrupar préstamos por socio y año
            const pData    = {}  // { socio: { año: total } }
            const pDetalle = {}  // { socio: { año: [{concepto,monto,desde}] } }
            pasivosEdit.forEach(p => {
              const socio = extraerSocioP(p.acreedor, p.concepto)
              if (!socio) return
              const año = String(parseInt((p.desde||'2023').toString().slice(0,4)))
              if (!AÑOS_P.includes(año)) return
              if (!pData[socio])    pData[socio]    = {}
              if (!pDetalle[socio]) pDetalle[socio] = {}
              if (!pDetalle[socio][año]) pDetalle[socio][año] = []
              pData[socio][año] = (pData[socio][año]||0) + (p.original||0)
              pDetalle[socio][año].push({ concepto: p.concepto, monto: p.original, desde: p.desde })
            })
            const socios = Object.keys(pData).sort()

            // Calcular retorno: ganancias cobradas / prestamos aportados
            const ganTot = gananciasChart?.data
            const totalPrestPorSocio = Object.fromEntries(socios.map(s=>[s, AÑOS_P.reduce((acc,a)=>acc+(pData[s]?.[a]||0),0)]))
            const totalGanPorSocio   = Object.fromEntries(socios.map(s=>[s, gananciasChart ? AÑOS_P.reduce((acc,a)=>acc+(gananciasChart.data[s]?.[a]||0),0) : 0]))
            const maxTotal = Math.max(...socios.map(s=>totalPrestPorSocio[s]), 1)

            return (
              <div className="card" style={{gridColumn:'1 / -1'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:14}}>
                  <span style={{fontSize:13,fontWeight:700,color:'var(--text2)'}}>Aportaciones / Préstamos al negocio</span>
                </div>
                {socios.length === 0 && (
                  <div style={{fontSize:11,color:'var(--text3)',textAlign:'center',padding:'20px 0',background:'var(--bg)',borderRadius:'var(--r-md)'}}>
                    Sin datos de préstamos identificables por socio
                  </div>
                )}
                {socios.map(socio => {
                  const total  = totalPrestPorSocio[socio]
                  const barW   = Math.round(total / maxTotal * 100)
                  const ganTot = totalGanPorSocio[socio]
                  const tasa   = total > 0 ? (ganTot / total * 100) : 0
                  return (
                    <div key={socio} style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
                      <span style={{fontSize:12,fontWeight:600,color:'var(--text2)',width:64,flexShrink:0,textAlign:'right'}}>{socio}</span>
                      <div style={{flex:1,height:38,display:'flex',borderRadius:5,overflow:'hidden',background:'#f0f0f0'}}>
                        <div style={{display:'flex',width:`${barW}%`,height:'100%'}}>
                          {AÑOS_P.map(a => {
                            const monto = pData[socio]?.[a]||0
                            if (!monto) return null
                            const segW = Math.round(monto/total*100)
                            return (
                              <div key={a}
                                onClick={()=>setPrestPopup({socio, año:a, registros:(pDetalle[socio]?.[a]||[])})}
                                style={{width:`${segW}%`,background:AÑO_COLORS_P[a],cursor:'pointer',
                                  display:'flex',alignItems:'center',justifyContent:'center',
                                  borderRight:'1px solid rgba(255,255,255,0.4)',minWidth:36,transition:'filter 0.15s'}}
                                onMouseEnter={e=>e.currentTarget.style.filter='brightness(1.15)'}
                                onMouseLeave={e=>e.currentTarget.style.filter=''}>
                                <span style={{fontSize:10,fontWeight:700,color:'#fff',
                                  textShadow:'0 1px 2px rgba(0,0,0,0.5)',whiteSpace:'nowrap',padding:'0 2px'}}>
                                  ${Math.round(monto).toLocaleString('es-MX')}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      <div style={{width:140,flexShrink:0,textAlign:'right'}}>
                        <div style={{fontSize:13,fontWeight:800,color:'#185FA5'}}>{fmtM(total)}</div>
                        <div style={{fontSize:10,color: tasa>=10?'#1D9E75':'#EF9F27',fontWeight:600,marginTop:1}}>
                          retorno {tasa.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div style={{display:'flex',gap:14,marginTop:4,justifyContent:'center'}}>
                  {AÑOS_P.filter(a=>socios.some(s=>pData[s]?.[a])).map(a=>(
                    <span key={a} style={{display:'flex',alignItems:'center',gap:4,fontSize:11}}>
                      <span style={{width:10,height:10,borderRadius:2,background:AÑO_COLORS_P[a],display:'inline-block'}}/>
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* POPUP DETALLE PRÉSTAMOS */}
          {prestPopup && (
            <div onClick={()=>setPrestPopup(null)}
              style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:1000,
                display:'flex',alignItems:'center',justifyContent:'center'}}>
              <div onClick={e=>e.stopPropagation()}
                style={{background:'#ffffff',borderRadius:12,padding:24,
                  minWidth:320,maxWidth:420,width:'90%',boxShadow:'0 8px 40px rgba(0,0,0,0.35)',border:'1px solid #e0e0e0'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:'#1a1a1a'}}>{prestPopup.socio} · {prestPopup.año}</div>
                    <div style={{fontSize:11,color:'#888',marginTop:2}}>Préstamos aportados</div>
                  </div>
                  <button onClick={()=>setPrestPopup(null)}
                    style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#888',lineHeight:1}}>×</button>
                </div>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead>
                    <tr style={{borderBottom:'1.5px solid #e0e0e0'}}>
                      <th style={{textAlign:'left',padding:'4px 6px',color:'#888',fontWeight:600}}>Concepto</th>
                      <th style={{textAlign:'left',padding:'4px 6px',color:'#888',fontWeight:600}}>Desde</th>
                      <th style={{textAlign:'right',padding:'4px 6px',color:'#888',fontWeight:600}}>Monto original</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prestPopup.registros.map((r,i)=>(
                      <tr key={i} style={{borderBottom:'0.5px solid #f0f0f0'}}>
                        <td style={{padding:'6px 6px',color:'#333'}}>{r.concepto||'—'}</td>
                        <td style={{padding:'6px 6px',color:'#333',whiteSpace:'nowrap'}}>{r.desde||'—'}</td>
                        <td style={{padding:'6px 6px',textAlign:'right',fontWeight:600,color:'#185FA5'}}>{fmtM(r.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{borderTop:'1.5px solid #e0e0e0'}}>
                      <td colSpan={2} style={{padding:'8px 6px',fontWeight:700,color:'#1a1a1a'}}>Total</td>
                      <td style={{padding:'8px 6px',textAlign:'right',fontWeight:800,color:'#185FA5',fontSize:13}}>
                        {fmtM(prestPopup.registros.reduce((s,r)=>s+(r.monto||0),0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* POPUP DETALLE GANANCIAS */}
          {ganPopup && (
            <div onClick={()=>setGanPopup(null)}
              style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:1000,
                display:'flex',alignItems:'center',justifyContent:'center'}}>
              <div onClick={e=>e.stopPropagation()}
                style={{background:'#ffffff',borderRadius:12,padding:24,
                  minWidth:320,maxWidth:420,width:'90%',boxShadow:'0 8px 40px rgba(0,0,0,0.35)',border:'1px solid #e0e0e0'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:'#1a1a1a'}}>{ganPopup.socio} · {ganPopup.año}</div>
                    <div style={{fontSize:11,color:'#888',marginTop:2}}>{ganPopup.registros.length} pago{ganPopup.registros.length!==1?'s':''}</div>
                  </div>
                  <button onClick={()=>setGanPopup(null)}
                    style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--text3)',lineHeight:1}}>×</button>
                </div>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead>
                    <tr style={{borderBottom:'1.5px solid #e0e0e0'}}>
                      <th style={{textAlign:'left',padding:'4px 6px',color:'#888',fontWeight:600}}>Fecha</th>
                      <th style={{textAlign:'left',padding:'4px 6px',color:'#888',fontWeight:600}}>Concepto</th>
                      <th style={{textAlign:'right',padding:'4px 6px',color:'#888',fontWeight:600}}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ganPopup.registros.map((r,i)=>(
                      <tr key={i} style={{borderBottom:'0.5px solid #f0f0f0'}}>
                        <td style={{padding:'6px 6px',color:'#333',whiteSpace:'nowrap'}}>{r.fecha||'—'}</td>
                        <td style={{padding:'6px 6px',color:'#333'}}>{r.concepto||'—'}</td>
                        <td style={{padding:'6px 6px',textAlign:'right',fontWeight:600,color:'#534AB7'}}>{fmtM(r.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{borderTop:'1.5px solid #e0e0e0'}}>
                      <td colSpan={2} style={{padding:'8px 6px',fontWeight:700,color:'#1a1a1a'}}>Total</td>
                      <td style={{padding:'8px 6px',textAlign:'right',fontWeight:800,color:'#534AB7',fontSize:13}}>
                        {fmtM(ganPopup.registros.reduce((s,r)=>s+(r.monto||0),0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── INDICADORES ── */}
      {tab==='indicadores' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div className="card">
            <div className="ct" style={{marginBottom:14}}>Indicadores de rentabilidad</div>
            {[
              {label:'ROA — Retorno sobre Activos', val:roa, fmt:v=>v.toFixed(2)+'%', desc:'Qué tan eficientemente usas tus activos para generar utilidad', benchmark:'Bueno >5%'},
              {label:'ROE — Retorno sobre Capital', val:roe, fmt:v=>v.toFixed(2)+'%', desc:'Cuánto ganan los socios por cada peso invertido', benchmark:'Bueno >10%'},
              {label:'ROI — Retorno sobre Inversión', val:roi, fmt:v=>v.toFixed(2)+'%', desc:'Rendimiento sobre la inversión inicial de los socios', benchmark:'Bueno >15%'},
            ].map(ind=>(
              <div key={ind.label} style={{marginBottom:16,padding:'12px 14px',background:'var(--bg)',borderRadius:'var(--r-md)'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{fontSize:12,fontWeight:600}}>{ind.label}</span>
                  <span style={{fontSize:20,fontWeight:700,color:ind.val>=0?'#1D9E75':'#E24B4A'}}>{ind.fmt(ind.val)}</span>
                </div>
                <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>{ind.desc}</div>
                <div style={{fontSize:10,color:'var(--text3)'}}>{ind.benchmark}</div>
                <div style={{marginTop:6,height:6,background:'var(--border)',borderRadius:99,overflow:'hidden'}}>
                  <div style={{height:'100%',width:Math.min(Math.abs(ind.val),100)+'%',background:ind.val>=0?'#1D9E75':'#E24B4A',borderRadius:99}}/>
                </div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="ct" style={{marginBottom:14}}>Indicadores de liquidez y deuda</div>
            {[
              {label:'Razón de liquidez', val:liquidez, fmt:v=>v.toFixed(2)+'x', desc:'Capacidad de pagar deudas de corto plazo con efectivo disponible', benchmark:'Bueno >1x', color:liquidez>=1?'#1D9E75':'#E24B4A'},
              {label:'Capital de trabajo', val:capitalTrabajo, fmt:fmtM, desc:'Efectivo disponible después de pagar todas las deudas de corto plazo', benchmark:'Positivo = sano', color:capitalTrabajo>=0?'#1D9E75':'#E24B4A'},
              {label:'Nivel de endeudamiento', val:endeudamiento, fmt:v=>v.toFixed(1)+'%', desc:'Qué porcentaje de los activos está financiado con deuda', benchmark:'Preocupante >70%', color:endeudamiento<50?'#1D9E75':endeudamiento<70?'#EF9F27':'#E24B4A'},
            ].map(ind=>(
              <div key={ind.label} style={{marginBottom:16,padding:'12px 14px',background:'var(--bg)',borderRadius:'var(--r-md)'}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{fontSize:12,fontWeight:600}}>{ind.label}</span>
                  <span style={{fontSize:20,fontWeight:700,color:ind.color}}>{ind.fmt(ind.val)}</span>
                </div>
                <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>{ind.desc}</div>
                <div style={{fontSize:10,color:'var(--text3)'}}>{ind.benchmark}</div>
              </div>
            ))}
            <div style={{padding:'12px 14px',background:'#FFF9E6',borderRadius:'var(--r-md)',border:'0.5px solid #EF9F27'}}>
              <div style={{fontSize:11,fontWeight:600,color:'#8A5A00',marginBottom:6}}>Estructura de deuda</div>
              {[
                {label:'Corto plazo (Clip + Uber)', val:pasivosCPEdit, pct:Math.round(pasivosCPEdit/totalPasivosEdit*100)},
                {label:'Largo plazo (préstamos externos)', val:pasivosLPEdit, pct:Math.round(pasivosLPEdit/totalPasivosEdit*100)},
                {label:'Préstamos de socios', val:pasivosSociosEdit, pct:Math.round(pasivosSociosEdit/totalPasivosEdit*100)},
              ].map(r=>(
                <div key={r.label} style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:4}}>
                  <span>{r.label}</span>
                  <span><strong>{fmtM(r.val)}</strong> <span style={{color:'var(--text3)'}}>({r.pct}%)</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── VALOR DEL NEGOCIO ── */}
      {tab==='valor' && datos2026 && historico.length > 0 && (() => {
        const anualizar = (v, meses) => Math.round(v / meses * 12)
        // Pasivos históricos: suma monto_original de préstamos que ya existían al cierre de cada año
        const pasivosAlAño = año =>
          pasivosEdit.reduce((s,p) => {
            const desdeAño = parseInt((p.desde||'9999').toString().slice(0,4))
            return desdeAño <= año ? s + (p.original||0) : s
          }, 0)

        const todos = [
          ...historico.map(d=>({
            ...d,
            multiplicador: mults[d.periodo] ?? d.multiplicador ?? 2,
            pasivosHist: pasivosAlAño(parseInt(d.periodo)),
          })),
          {...datos2026, actFijo: totalEquiposDepreciado, periodo:'2026', multiplicador: mults['2026'] ?? 4,
            pasivosHist: totalPasivosEdit,
            label:`2026 (${Math.round(datos2026.meses*10)/10} meses)`}
        ]

        const calcEBITDA = d => {
          const netIngresos = d.ventas - d.comPlat - d.comTC
          return netIngresos - d.costo - d.opMtto - d.ventasGasto - d.servicios - d.salarios
        }

        const fmtSign = v => {
          const s = Math.round(v||0)
          if (s===0) return '—'
          return (s>0?'$':'−$') + Math.abs(s).toLocaleString('es-MX')
        }
        const pct = (v, base) => base ? Math.round(v/base*100)+'%' : '—'
        const crec = (v, prev) => prev ? Math.round((v-prev)/Math.abs(prev)*100)+'%' : '—'

        const rows = todos.map(d => {
          const a = anualizar
          const netIngresos = d.ventas - d.comPlat - d.comTC
          const ebitda      = calcEBITDA(d)
          const multTot     = d.multiplicador + (d.periodo==='2026' ? (npsMultEdit??npsMultiplier) : 0)
          const evEBITDA    = ebitda * multTot                          // componente EBITDA del EV
          const actFijoVal  = d.actFijo ?? 0                           // activos al valor depreciado
          const ev          = evEBITDA + actFijoVal                    // EV = EBITDA×múltiplo + activos
          const cashHist    = d.periodo==='2026' ? cashTotal : 0
          const valorVenta  = ev - (d.pasivosHist||0) + cashHist       // Equity Value
          return { ...d, netIngresos, ebitda, ev, valorVenta,
            aVentas: a(d.ventas, d.meses), aNetIngresos: a(netIngresos, d.meses),
            aEBITDA: a(ebitda, d.meses) }
        })

        const C = {header:'#185FA5',green:'#1D9E75',red:'#A32D2D',gray:'var(--text2)',muted:'var(--text3)'}
        const rowStyle = {fontSize:11,padding:'4px 8px',borderBottom:'0.5px solid var(--border)'}
        const numStyle = {textAlign:'right',padding:'4px 8px',fontSize:11,borderBottom:'0.5px solid var(--border)'}

        // Helper: renderiza valor + % sobre ingresos brutos debajo
        const cell = (value, base, extraStyle={}, wrap=false) => {
          const pct = base > 0 && Math.abs(value||0) > 0
            ? Math.round(Math.abs(value) / base * 100)
            : null
          const txt = value ? (wrap ? '('+fmtSign(value)+')' : fmtSign(value)) : '—'
          return (
            <div>
              <div>{txt}</div>
              {pct !== null && (
                <div style={{fontSize:9,color:'var(--text3)',marginTop:1,fontWeight:400}}>
                  {pct}%
                </div>
              )}
            </div>
          )
        }

        return (
          <div className="card" style={{overflowX:'auto'}}>
            <div className="ch"><div className="ct">Valor del negocio — análisis histórico</div></div>
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:900}}>
              <thead>
                <tr style={{background:'#E6F1FB'}}>
                  <th style={{...rowStyle,fontWeight:700,color:C.header,width:200}}>Indicador</th>
                  {rows.map(d=>(
                    <th key={d.periodo} style={{...numStyle,fontWeight:700,color:C.header}}>{d.label}</th>
                  ))}
                  <th style={{...numStyle,fontWeight:700,color:'#534AB7',background:'#EEEDFE'}}>2026 Anualizado</th>
                </tr>
              </thead>
              <tbody>
                {/* Ingresos */}
                <tr style={{background:'var(--bg)'}}><td colSpan={rows.length+2} style={{...rowStyle,fontWeight:700,color:C.header,paddingTop:8}}>INGRESOS</td></tr>
                <tr>
                  <td style={rowStyle}>Ingresos brutos</td>
                  {rows.map(d=><td key={d.periodo} style={{...numStyle,fontWeight:600}}>
                    <div><div>{fmtSign(d.ventas)}</div><div style={{fontSize:9,color:'var(--text3)',marginTop:1}}>100%</div></div>
                  </td>)}
                  <td style={{...numStyle,color:'#534AB7',fontWeight:600,background:'#EEEDFE'}}>
                    <div><div>{fmtSign(anualizar(rows[rows.length-1].ventas,datos2026.meses))}</div><div style={{fontSize:9,color:'var(--text3)',marginTop:1}}>100%</div></div>
                  </td>
                </tr>
                <tr>
                  <td style={{...rowStyle,color:C.muted}}>− Costo de Ventas <span style={{fontSize:9,color:'var(--text3)'}}>(com. plat & mkt)</span></td>
                  {rows.map(d=><td key={d.periodo} style={{...numStyle,color:d.comPlat?C.red:C.muted}}>
                    {cell(d.comPlat, d.ventas, {}, true)}
                  </td>)}
                  <td style={{...numStyle,color:C.red,background:'#EEEDFE'}}>
                    {cell(anualizar(datos2026.comPlat,datos2026.meses), anualizar(datos2026.ventas,datos2026.meses), {}, true)}
                  </td>
                </tr>
                <tr>
                  <td style={{...rowStyle,color:C.muted}}>− Comisiones tarjeta</td>
                  {rows.map(d=><td key={d.periodo} style={{...numStyle,color:d.comTC?C.red:C.muted}}>
                    {cell(d.comTC, d.ventas, {}, true)}
                  </td>)}
                  <td style={{...numStyle,color:C.red,background:'#EEEDFE'}}>
                    {cell(anualizar(datos2026.comTC,datos2026.meses), anualizar(datos2026.ventas,datos2026.meses), {}, true)}
                  </td>
                </tr>
                <tr style={{background:'#EAF3DE'}}>
                  <td style={{...rowStyle,fontWeight:700}}>Ingresos netos</td>
                  {rows.map(d=><td key={d.periodo} style={{...numStyle,fontWeight:700,color:C.green}}>
                    {cell(d.netIngresos, d.ventas)}
                  </td>)}
                  <td style={{...numStyle,fontWeight:700,color:'#534AB7',background:'#EEEDFE'}}>
                    {cell(anualizar(rows[rows.length-1].netIngresos,datos2026.meses), anualizar(datos2026.ventas,datos2026.meses))}
                  </td>
                </tr>

                {/* Gastos */}
                <tr style={{background:'var(--bg)'}}><td colSpan={rows.length+2} style={{...rowStyle,fontWeight:700,color:C.red,paddingTop:8}}>GASTOS</td></tr>
                {[
                  {key:'costo',label:'Costo de producción'},
                  {key:'opMtto',label:'Gastos de operación'},
                  {key:'servicios',label:'Servicios'},
                  {key:'salarios',label:'Salarios'},
                ].map(g=>(
                  <tr key={g.key}>
                    <td style={{...rowStyle,color:C.gray}}>{g.label}</td>
                    {rows.map(d=><td key={d.periodo} style={{...numStyle,color:d[g.key]?C.red:C.muted}}>
                      {cell(d[g.key], d.ventas, {}, true)}
                    </td>)}
                    <td style={{...numStyle,color:C.red,background:'#EEEDFE'}}>
                      {cell(anualizar(datos2026[g.key]||0,datos2026.meses), anualizar(datos2026.ventas,datos2026.meses), {}, true)}
                    </td>
                  </tr>
                ))}

                {/* EBITDA */}
                <tr style={{background:rows[rows.length-1].ebitda>=0?'#EAF3DE':'#FCEBEB'}}>
                  <td style={{...rowStyle,fontWeight:700}}>EBITDA</td>
                  {rows.map(d=><td key={d.periodo} style={{...numStyle,fontWeight:700,color:d.ebitda>=0?C.green:C.red}}>
                    {cell(d.ebitda, d.ventas)}
                  </td>)}
                  <td style={{...numStyle,fontWeight:700,color:'#534AB7',background:'#EEEDFE'}}>
                    {cell(anualizar(rows[rows.length-1].ebitda,datos2026.meses), anualizar(datos2026.ventas,datos2026.meses))}
                  </td>
                </tr>

                {/* Multiplicadores */}
                {(()=>{
                  const npsEfectivo   = npsMultEdit !== null ? npsMultEdit : npsMultiplier
                  const multTotal2026 = (mults['2026']??4) + npsEfectivo
                  const ebitdaAnual   = anualizar(rows[rows.length-1].ebitda, datos2026.meses)
                  const evEBITDAAnual  = ebitdaAnual * multTotal2026
                  const evAnual       = evEBITDAAnual + totalEquiposDepreciado
                  return (<>
                    {/* Multiplicador base editable */}
                    <tr>
                      <td style={{...rowStyle,color:C.muted}}>× Múltiplo base</td>
                      {rows.map(d=>(
                        <td key={d.periodo} style={{...numStyle}}>
                          <input type="number" min="0" step="0.5"
                            value={mults[d.periodo] ?? d.multiplicador}
                            onChange={ev=>setMults(m=>({...m,[d.periodo]:+ev.target.value||0}))}
                            style={{width:52,textAlign:'right',fontWeight:700,fontSize:12,
                              border:'1.5px solid #7F77DD55',borderRadius:4,padding:'2px 4px',
                              background:'#EEEDFE44',color:'#534AB7'}}/>
                          <span style={{fontSize:11,color:'#534AB7',marginLeft:2}}>x</span>
                        </td>
                      ))}
                      <td style={{...numStyle,fontWeight:600,background:'#EEEDFE',color:'#534AB7'}}>{mults['2026']??4}x</td>
                    </tr>
                    <tr style={{background:'var(--bg)'}}>
                      <td style={{...rowStyle,color:C.muted,paddingLeft:20,fontSize:10}}>↳ EV mult. base</td>
                      {rows.map(d=><td key={d.periodo} style={{...numStyle,fontSize:10,color:C.muted}}>{fmtSign(d.ebitda*d.multiplicador)}</td>)}
                      <td style={{...numStyle,fontSize:10,color:'#534AB7',background:'#EEEDFE'}}>{fmtSign(ebitdaAnual*(mults['2026']??4))}</td>
                    </tr>

                    {/* Multiplicador NPS editable */}
                    <tr style={{background:'#EAF3DE'}}>
                      <td style={{...rowStyle,color:'#3B6D11',fontWeight:500}}>+ Múltiplo NPS{npsScore!==null?` (NPS ${npsScore}%)`:''}
                        <div style={{fontSize:9,color:'var(--text3)',fontWeight:400,marginTop:1}}>Solo aplica al año actual</div>
                      </td>
                      {rows.map(d=>(
                        <td key={d.periodo} style={{...numStyle}}>
                          {d.periodo==='2026' ? (
                            <span style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:2}}>
                              <span style={{fontSize:11,color:'#3B6D11'}}>+</span>
                              <input type="number" min="0" step="0.5"
                                value={npsEfectivo}
                                onChange={ev=>setNpsMultEdit(+ev.target.value||0)}
                                style={{width:44,textAlign:'right',fontWeight:700,fontSize:12,
                                  border:'1.5px solid #1D9E7555',borderRadius:4,padding:'2px 4px',
                                  background:'#EAF3DE',color:'#1D9E75'}}/>
                              <span style={{fontSize:11,color:'#1D9E75'}}>x</span>
                            </span>
                          ) : <span style={{color:C.muted}}>—</span>}
                        </td>
                      ))}
                      <td style={{...numStyle,fontWeight:600,color:'#1D9E75',background:'#EEEDFE'}}>+{npsEfectivo}x</td>
                    </tr>
                    <tr style={{background:'#EAF3DE'}}>
                      <td style={{...rowStyle,color:'#3B6D11',paddingLeft:20,fontSize:10}}>↳ EV mult. NPS</td>
                      {rows.map(d=><td key={d.periodo} style={{...numStyle,fontSize:10,color:d.periodo==='2026'?'#1D9E75':C.muted}}>
                        {d.periodo==='2026' ? fmtSign(d.ebitda*npsEfectivo) : '—'}
                      </td>)}
                      <td style={{...numStyle,fontSize:10,color:'#1D9E75',background:'#EEEDFE'}}>{fmtSign(ebitdaAnual*npsEfectivo)}</td>
                    </tr>
                    <tr>
                      <td style={{...rowStyle,color:C.gray}}>Múltiplo total</td>
                      {rows.map(d=><td key={d.periodo} style={{...numStyle,fontWeight:700}}>
                        {d.periodo==='2026' ? multTotal2026+'x' : d.multiplicador+'x'}
                      </td>)}
                      <td style={{...numStyle,fontWeight:700,color:'#534AB7',background:'#EEEDFE'}}>{multTotal2026}x</td>
                    </tr>
                    <tr style={{background:'var(--bg)'}}>
                      <td style={{...rowStyle,color:C.muted,paddingLeft:20,fontSize:10}}>↳ EBITDA × múltiplo total</td>
                      {rows.map(d=><td key={d.periodo} style={{...numStyle,fontSize:10,color:C.muted}}>
                        {fmtSign(d.ebitda * (d.periodo==='2026' ? multTotal2026 : d.multiplicador))}
                      </td>)}
                      <td style={{...numStyle,fontSize:10,color:'#534AB7',background:'#EEEDFE'}}>{fmtSign(evEBITDAAnual)}</td>
                    </tr>

                    {/* Activos fijos al valor depreciado */}
                    <tr>
                      <td style={{...rowStyle,color:C.muted}}>+ Activos fijos (valor depreciado)
                        <div style={{fontSize:9,color:'var(--text3)',fontWeight:400,marginTop:1}}>el comprador adquiere los activos al precio presente</div>
                      </td>
                      {rows.map(d=><td key={d.periodo} style={{...numStyle,color:'#1D9E75'}}>
                        {d.actFijo ? fmtSign(d.actFijo) : '—'}
                      </td>)}
                      <td style={{...numStyle,color:'#1D9E75',background:'#EEEDFE'}}>{fmtSign(totalEquiposDepreciado)}</td>
                    </tr>

                    {/* Enterprise Value = EBITDA × múltiplo + activos */}
                    <tr style={{background:'#E6F1FB',borderTop:'2px solid #B5D4F4'}}>
                      <td style={{...rowStyle,fontWeight:700,color:C.header,fontSize:12}}>🏢 Enterprise Value
                        <div style={{fontSize:9,color:'var(--text3)',fontWeight:400,marginTop:1}}>(EBITDA × múltiplo) + activos depreciados</div>
                      </td>
                      {rows.map(d=><td key={d.periodo} style={{...numStyle,fontWeight:700,color:C.header,fontSize:12}}>
                        {fmtSign(d.ev)}
                      </td>)}
                      <td style={{...numStyle,fontWeight:700,color:C.header,fontSize:12,background:'#EEEDFE'}}>{fmtSign(evAnual)}</td>
                    </tr>
                    <tr>
                      <td style={{...rowStyle,color:C.muted,paddingLeft:20,fontSize:11}}>− Deuda neta al cierre</td>
                      {rows.map(d=><td key={d.periodo} style={{...numStyle,fontSize:11,color:C.red}}>
                        {d.pasivosHist ? `(${fmtSign(d.pasivosHist)})` : '—'}
                      </td>)}
                      <td style={{...numStyle,fontSize:11,color:C.red,background:'#EEEDFE'}}>({fmtSign(totalPasivosEdit)})</td>
                    </tr>
                    <tr>
                      <td style={{...rowStyle,color:C.muted,paddingLeft:20,fontSize:11}}>+ Cash disponible</td>
                      {rows.map(d=><td key={d.periodo} style={{...numStyle,fontSize:11,color:d.periodo==='2026'?'#1D9E75':C.muted}}>
                        {d.periodo==='2026' ? fmtSign(cashTotal) : '—'}
                      </td>)}
                      <td style={{...numStyle,fontSize:11,color:'#1D9E75',background:'#EEEDFE'}}>{fmtSign(cashTotal)}</td>
                    </tr>

                    {/* Equity Value */}
                    <tr style={{background:'#EEEDFE',borderTop:'2px solid #AFA9EC'}}>
                      <td style={{...rowStyle,fontWeight:700,color:'#534AB7',fontSize:13}}>💰 Equity Value (para socios)
                        <div style={{fontSize:9,color:'var(--text3)',fontWeight:400,marginTop:1}}>EV − Deuda + Cash</div>
                      </td>
                      {rows.map(d=>(
                        <td key={d.periodo} style={{...numStyle,fontWeight:700,color:d.valorVenta>=0?'#534AB7':C.red,fontSize:13}}>
                          {fmtSign(d.valorVenta)}
                        </td>
                      ))}
                      <td style={{...numStyle,fontWeight:700,color:'#534AB7',fontSize:13,background:'#EEEDFE'}}>{fmtSign(evAnual-totalPasivosEdit+cashTotal)}</td>
                    </tr>
                  </>)
                })()}
              </tbody>
            </table>
            <div style={{marginTop:12,padding:'10px 14px',background:'#f9f9f9',borderRadius:'var(--r-md)',fontSize:10,color:'var(--text3)',lineHeight:1.8}}>
              * EBITDA = Ingresos netos − Costo − Op&Mtto − Gastos ventas − Servicios − Salarios (Earnings Before Interest, Taxes, Depreciation &amp; Amortization)<br/>
              * Enterprise Value = (EBITDA × Múltiplo) + Activos fijos al valor depreciado — el comprador paga por las utilidades futuras Y por los activos que recibe<br/>
              * Equity Value = EV − Deuda + Cash — lo que reciben los socios al vender, una vez liquidadas las deudas<br/>
              * Múltiplo base refleja el riesgo/crecimiento del sector; NPS premia negocios con alta fidelidad de cliente<br/>
              * Anualizado = (monto del período ÷ meses transcurridos) × 12
            </div>
          </div>
        )
      })()}

      {/* ── EQUIPOS ── */}
      {tab==='equipos' && (
        <div className="card">
          <div className="ch">
            <div className="ct">Inventario de activos fijos</div>
            <div style={{display:'flex',gap:12,alignItems:'center'}}>
              <span style={{fontSize:11,color:'var(--text3)'}}>Costo: <strong style={{color:'var(--text2)'}}>{fmtM(totalEquiposEdit)}</strong></span>
              <span style={{fontSize:11,color:'var(--text3)'}}>Valor actual: <strong style={{color:'#1D9E75'}}>{fmtM(totalEquiposDepreciado)}</strong></span>
              {!editModeEq ? (
                <button onClick={()=>setEditModeEq(true)}
                  style={{padding:'3px 12px',borderRadius:99,fontSize:11,cursor:'pointer',
                    border:'1.5px solid var(--border-md)',background:'transparent',color:'var(--text2)'}}>
                  ✏ Editar
                </button>
              ) : (
                <>
                  <button onClick={guardarEquipos} disabled={guardandoEq}
                    style={{padding:'3px 12px',borderRadius:99,fontSize:11,cursor:'pointer',
                      border:'1.5px solid #1D9E75',background:'#EAF3DE',color:'#3B6D11',
                      opacity:guardandoEq?0.6:1}}>
                    {guardandoEq ? '⏳ Guardando…' : '✓ Guardar'}
                  </button>
                  <button onClick={()=>{
                    const nuevo = {_id:'new-'+Date.now(),area:AREAS_EQUIPO[0],cat:CATS_EQUIPO[0],
                      nombre:'',qty:1,precio:0,año:new Date().getFullYear(),isNew:true}
                    setEquiposEdit(prev=>[...prev,nuevo])
                  }} style={{padding:'3px 12px',borderRadius:99,fontSize:11,cursor:'pointer',
                    border:'1.5px solid #378ADD',background:'#E6F1FB',color:'#185FA5'}}>
                    + Agregar
                  </button>
                  <button onClick={()=>{
                    setEditModeEq(false)
                    setDeletedEqIds([])
                    // Recargar estado original desde DB
                    sb.from('activos_fijos').select('*').order('cat').order('nombre')
                      .then(({data})=>{ if(data) setEquiposEdit(data.map(rowToEquipo)) })
                  }} style={{padding:'3px 12px',borderRadius:99,fontSize:11,cursor:'pointer',
                    border:'1.5px solid var(--border-md)',background:'transparent',color:'var(--text3)'}}>
                    Cancelar
                  </button>
                </>
              )}
            </div>
          </div>
          {equiposLoading ? (
            <div style={{textAlign:'center',padding:20}}><div className="spinner"/></div>
          ) : (
            Object.entries(catGroupsEdit).map(([cat, total])=>(
              <div key={cat} style={{marginBottom:16}}>
                {(() => {
                  const depCat = equiposEdit.filter(e=>e.cat===cat).reduce((s,e)=>s+calcDep(e).valorActual,0)
                  return (
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,padding:'6px 10px',background:(CAT_COLOR[cat]||'#888')+'18',borderRadius:'var(--r-sm)'}}>
                      <span style={{fontSize:12,fontWeight:600,color:CAT_COLOR[cat]||'var(--text2)'}}>{cat}</span>
                      <div style={{display:'flex',gap:14,alignItems:'center'}}>
                        {!editModeEq && <span style={{fontSize:11,color:'var(--text3)'}}>Valor actual: <strong style={{color:'#1D9E75'}}>{fmtM(depCat)}</strong></span>}
                        <span style={{fontSize:11,color:'var(--text3)'}}>Costo: <strong style={{color:CAT_COLOR[cat]||'var(--text2)'}}>{fmtM(total)}</strong></span>
                      </div>
                    </div>
                  )
                })()}
                <table className="tbl" style={{marginBottom:0}}>
                  <thead><tr>
                    <th>Equipo</th><th>Área</th>
                    {editModeEq&&<th>Categoría</th>}
                    <th className="num">Cant.</th>
                    <th className="num">Precio unit.</th>
                    <th className="num">Costo total</th>
                    <th>Año</th>
                    {!editModeEq&&<><th className="num" style={{color:'#EF9F27'}}>Años dep.</th><th className="num" style={{color:'#E24B4A'}}>Dep. acum.</th><th className="num" style={{color:'#1D9E75'}}>Valor actual</th></>}
                    {editModeEq&&<th></th>}
                  </tr></thead>
                  <tbody>
                    {equiposEdit.filter(e=>e.cat===cat).map(e=>{
                      const dep = calcDep(e)
                      return (
                      <tr key={e._id}>
                        {editModeEq ? <>
                          <td><input className="form-input" style={{padding:'2px 6px',fontSize:11}} value={e.nombre} onChange={ev=>setEquiposEdit(prev=>prev.map(x=>x._id===e._id?{...x,nombre:ev.target.value}:x))}/></td>
                          <td>
                            <select className="form-input" style={{padding:'2px 4px',fontSize:11}} value={e.area} onChange={ev=>setEquiposEdit(prev=>prev.map(x=>x._id===e._id?{...x,area:ev.target.value}:x))}>
                              {AREAS_EQUIPO.map(a=><option key={a}>{a}</option>)}
                            </select>
                          </td>
                          <td>
                            <select className="form-input" style={{padding:'2px 4px',fontSize:11}} value={e.cat} onChange={ev=>setEquiposEdit(prev=>prev.map(x=>x._id===e._id?{...x,cat:ev.target.value}:x))}>
                              {CATS_EQUIPO.map(c=><option key={c}>{c}</option>)}
                            </select>
                          </td>
                          <td><input className="form-input" type="number" style={{padding:'2px 6px',fontSize:11,width:60,textAlign:'right'}} value={e.qty} onChange={ev=>setEquiposEdit(prev=>prev.map(x=>x._id===e._id?{...x,qty:+ev.target.value||1}:x))}/></td>
                          <td><input className="form-input" type="number" style={{padding:'2px 6px',fontSize:11,width:90,textAlign:'right'}} value={e.precio} onChange={ev=>setEquiposEdit(prev=>prev.map(x=>x._id===e._id?{...x,precio:+ev.target.value||0}:x))}/></td>
                          <td className="num" style={{fontSize:11,fontWeight:600}}>{fmtM(e.precio*e.qty)}</td>
                          <td><input className="form-input" type="number" style={{padding:'2px 6px',fontSize:11,width:70}} value={e.año} onChange={ev=>setEquiposEdit(prev=>prev.map(x=>x._id===e._id?{...x,año:+ev.target.value}:x))}/></td>
                          <td><button onClick={()=>{
                            if (!e.isNew) setDeletedEqIds(prev=>[...prev, e.id])
                            setEquiposEdit(prev=>prev.filter(x=>x._id!==e._id))
                          }} style={{fontSize:11,padding:'1px 7px',borderRadius:'var(--r-sm)',border:'0.5px solid #E24B4A',color:'#E24B4A',background:'transparent',cursor:'pointer'}}>✕</button></td>
                        </> : <>
                          <td style={{fontSize:11,fontWeight:500}}>{e.nombre}</td>
                          <td><span style={{fontSize:10,padding:'1px 6px',borderRadius:99,background:'#f0f0f0',color:'#666'}}>{e.area}</span></td>
                          <td className="num" style={{fontSize:11}}>{e.qty}</td>
                          <td className="num" style={{fontSize:11}}>{fmtM(e.precio)}</td>
                          <td className="num" style={{fontSize:11,fontWeight:600}}>{fmtM(e.precio*e.qty)}</td>
                          <td style={{fontSize:11,color:'var(--text3)'}}>{e.año}</td>
                          <td className="num" style={{fontSize:11,color:'#EF9F27'}}>{dep.añosUso > 0 ? dep.añosUso+'a' : '—'}</td>
                          <td className="num" style={{fontSize:11,color:'#E24B4A'}}>{dep.depAcum > 0 ? fmtM(dep.depAcum) : '—'}</td>
                          <td className="num" style={{fontSize:12,fontWeight:700,color: dep.valorActual < (e.precio*e.qty)*0.25 ? '#E24B4A' : '#1D9E75'}}>{fmtM(dep.valorActual)}</td>
                        </>}
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── PASIVOS ── */}
      {tab==='pasivos' && (
        <div className="card">
          <div className="ch">
            <div className="ct">Detalle de pasivos</div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <strong style={{color:'#E24B4A'}}>{fmtM(totalPasivosEdit)}</strong>
              {!editMode ? (
                <button onClick={()=>setEditMode(true)}
                  style={{padding:'3px 12px',borderRadius:99,fontSize:11,cursor:'pointer',
                    border:'1.5px solid var(--border-md)',background:'transparent',color:'var(--text2)'}}>
                  ✏ Editar
                </button>
              ) : (
                <>
                  <button onClick={guardarPasivos}
                    style={{padding:'3px 12px',borderRadius:99,fontSize:11,cursor:'pointer',
                      border:'1.5px solid #1D9E75',background:'#EAF3DE',color:'#3B6D11'}}>
                    ✓ Guardar
                  </button>
                  <button onClick={()=>{
                    const nuevo = {_id:'new-'+Date.now(),concepto:'',acreedor:'',monto:0,tipo:'Largo plazo',original:0,desde:String(new Date().getFullYear())}
                    setPasivosEdit(prev=>[...prev,nuevo])
                  }} style={{padding:'3px 12px',borderRadius:99,fontSize:11,cursor:'pointer',
                    border:'1.5px solid #E24B4A',background:'#FCEBEB',color:'#A32D2D'}}>
                    + Agregar
                  </button>
                  <button onClick={()=>{
                    setEditMode(false)
                    sb.from('prestamos').select('*').order('desde').then(({data})=>{
                      if(data) setPasivosEdit(data.map(p=>({
                        _id:p.id, concepto:p.concepto, acreedor:p.acreedor||'',
                        monto:p.saldo_actual, original:p.monto_original, tipo:p.tipo, desde:p.desde,
                      })))
                    })
                  }} style={{padding:'3px 12px',borderRadius:99,fontSize:11,cursor:'pointer',
                    border:'1.5px solid var(--border-md)',background:'transparent',color:'var(--text3)'}}>
                    Cancelar
                  </button>
                </>
              )}
            </div>
          </div>
          <table className="tbl">
            <thead><tr><th>Concepto</th><th>Acreedor</th><th>Tipo</th><th className="num">Saldo actual</th><th className="num">Original</th><th className="num">Pagado</th><th>Desde</th>{editMode&&<th></th>}</tr></thead>
            <tbody>
              {pasivosEdit.map(p=>(
                <tr key={p._id}>
                  {editMode ? <>
                    <td><input className="form-input" style={{padding:'2px 6px',fontSize:11}} value={p.concepto} onChange={ev=>setPasivosEdit(prev=>prev.map(x=>x._id===p._id?{...x,concepto:ev.target.value}:x))}/></td>
                    <td><input className="form-input" style={{padding:'2px 6px',fontSize:11}} value={p.acreedor||''} placeholder="Ej: BBVA, Socio…" onChange={ev=>setPasivosEdit(prev=>prev.map(x=>x._id===p._id?{...x,acreedor:ev.target.value}:x))}/></td>
                    <td>
                      <select className="form-input" style={{padding:'2px 6px',fontSize:11}} value={p.tipo} onChange={ev=>setPasivosEdit(prev=>prev.map(x=>x._id===p._id?{...x,tipo:ev.target.value}:x))}>
                        <option>Corto plazo</option><option>Largo plazo</option><option>Socios</option>
                      </select>
                    </td>
                    <td><input className="form-input" type="number" style={{padding:'2px 6px',fontSize:11,width:100,textAlign:'right'}} value={p.monto} onChange={ev=>setPasivosEdit(prev=>prev.map(x=>x._id===p._id?{...x,monto:+ev.target.value||0}:x))}/></td>
                    <td><input className="form-input" type="number" style={{padding:'2px 6px',fontSize:11,width:100,textAlign:'right'}} value={p.original} onChange={ev=>setPasivosEdit(prev=>prev.map(x=>x._id===p._id?{...x,original:+ev.target.value||0}:x))}/></td>
                    <td className="num" style={{fontSize:11,color:'#1D9E75'}}>{fmtM((p.original||0)-(p.monto||0))}</td>
                    <td><input className="form-input" style={{padding:'2px 6px',fontSize:11,width:70}} value={p.desde} onChange={ev=>setPasivosEdit(prev=>prev.map(x=>x._id===p._id?{...x,desde:ev.target.value}:x))}/></td>
                    <td><button onClick={()=>setPasivosEdit(prev=>prev.filter(x=>x._id!==p._id))} style={{fontSize:11,padding:'1px 7px',borderRadius:'var(--r-sm)',border:'0.5px solid #E24B4A',color:'#E24B4A',background:'transparent',cursor:'pointer'}}>✕</button></td>
                  </> : <>
                    <td style={{fontWeight:500}}>{p.concepto}</td>
                    <td style={{fontSize:11,color:'var(--text2)'}}>{p.acreedor||<span style={{color:'var(--text3)'}}>—</span>}</td>
                    <td><span style={{fontSize:10,padding:'1px 8px',borderRadius:99,
                      background:p.tipo==='Corto plazo'?'#FCEBEB':p.tipo==='Largo plazo'?'#FFF9E6':'#EEEDFE',
                      color:p.tipo==='Corto plazo'?'#A32D2D':p.tipo==='Largo plazo'?'#8A5A00':'#534AB7'}}>
                      {p.tipo}
                    </span></td>
                    <td className="num" style={{fontWeight:600,color:'#E24B4A'}}>{fmtM(p.monto)}</td>
                    <td className="num" style={{fontSize:11,color:'var(--text3)'}}>{fmtM(p.original)}</td>
                    <td className="num" style={{fontSize:11,color:'#1D9E75'}}>{fmtM((p.original||0)-(p.monto||0))}</td>
                    <td style={{fontSize:11,color:'var(--text3)'}}>{p.desde}</td>
                  </>}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{fontWeight:700}}>
                <td colSpan={3}>TOTAL</td>
                <td className="num" style={{color:'#E24B4A'}}>{fmtM(totalPasivosEdit)}</td>
                <td className="num" style={{color:'var(--text3)'}}>{fmtM(pasivosEdit.reduce((s,p)=>s+(p.original||0),0))}</td>
                <td className="num" style={{color:'#1D9E75'}}>{fmtM(pasivosEdit.reduce((s,p)=>s+((p.original||0)-(p.monto||0)),0))}</td>
                <td colSpan={editMode?2:1}></td>
              </tr>
            </tfoot>
          </table>
          <div style={{marginTop:14,padding:'12px 14px',background:'#EEEDFE',borderRadius:'var(--r-md)'}}>
            <div style={{fontSize:12,fontWeight:600,color:'#534AB7',marginBottom:8}}>Capital social</div>
            {CAPITAL_SOCIOS.map(c=>(
              <div key={c.socio} style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4}}>
                <span>{c.socio} — aportación inicial ({c.fecha})</span>
                <strong>{fmtM(c.aportacion)}</strong>
              </div>
            ))}
            <div style={{borderTop:'0.5px solid #AFA9EC',marginTop:8,paddingTop:8,display:'flex',justifyContent:'space-between',fontSize:12,fontWeight:600}}>
              <span>Total capital social</span><span style={{color:'#534AB7'}}>{fmtM(capitalSocial)}</span>
            </div>
          </div>

          {/* ── Gráfica aportaciones por acreedor y año ── */}
          {(() => {
            // Agrupa préstamos por año y acreedor (usa acreedor si existe, si no concepto)
            const porAño = {}
            const acreedores = new Set()
            pasivosEdit.forEach(p => {
              const año = (p.desde||'').toString().slice(0,4) || 'S/F'
              const nombre = p.acreedor || p.concepto
              acreedores.add(nombre)
              if (!porAño[año]) porAño[año] = {}
              porAño[año][nombre] = (porAño[año][nombre]||0) + (p.original||0)
            })
            const años = Object.keys(porAño).sort()
            const lista = [...acreedores]
            const COLORES = ['#378ADD','#7F77DD','#D85A30','#EF9F27','#1D9E75','#E24B4A','#9B59B6','#16A085','#E67E22','#2C3E50']
            const tc = () => matchMedia('(prefers-color-scheme:dark)').matches?'rgba(255,255,255,0.45)':'rgba(0,0,0,0.4)'
            const gc = () => matchMedia('(prefers-color-scheme:dark)').matches?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)'
            const datasets = lista.map((nombre, i) => ({
              label: nombre,
              data: años.map(a => porAño[a][nombre] || 0),
              backgroundColor: COLORES[i % COLORES.length] + 'CC',
              borderRadius: 4,
            }))
            const totPorAño = años.map(a => Object.values(porAño[a]).reduce((s,v)=>s+v,0))
            return (
              <div style={{marginTop:14}}>
                <div style={{fontSize:12,fontWeight:600,color:'var(--text1)',marginBottom:10}}>Financiamiento original por acreedor y año</div>
                <div style={{height:220}}>
                  <Bar
                    data={{labels: años, datasets}}
                    options={{
                      responsive:true, maintainAspectRatio:false,
                      plugins:{
                        legend:{display:true,position:'top',labels:{color:tc(),font:{size:10},boxWidth:10,padding:8}},
                        tooltip:{callbacks:{
                          label: ctx => `${ctx.dataset.label}: $${Math.round(ctx.raw).toLocaleString('es-MX')}`,
                          footer: items => `Total ${items[0].label}: $${Math.round(totPorAño[items[0].dataIndex]).toLocaleString('es-MX')}`,
                        }},
                      },
                      scales:{
                        x:{stacked:true, ticks:{color:tc(),font:{size:11}}, grid:{color:gc()}, border:{display:false}},
                        y:{stacked:true, ticks:{color:tc(),font:{size:10},callback:v=>'$'+Math.round(v/1000)+'k'}, grid:{color:gc()}, border:{display:false}},
                      }
                    }}
                  />
                </div>
                <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:10}}>
                  {lista.map((nombre,i)=>{
                    const total = pasivosEdit.filter(p=>(p.acreedor||p.concepto)===nombre).reduce((s,p)=>s+(p.original||0),0)
                    return (
                      <div key={nombre} style={{display:'flex',alignItems:'center',gap:5,fontSize:11,padding:'3px 10px',borderRadius:99,background:'var(--bg)'}}>
                        <span style={{width:8,height:8,borderRadius:99,background:COLORES[i%COLORES.length],flexShrink:0}}/>
                        <span>{nombre}</span>
                        <strong style={{color:'var(--text2)'}}>{fmtM(total)}</strong>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
