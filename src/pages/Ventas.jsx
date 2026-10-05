import React, { useState, useEffect, useCallback } from 'react'
import { Bar } from 'react-chartjs-2'
import { Chart, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js'
import { sb } from '../lib/supabase.js'
import { fetchVentasRange, getRangoFechas } from '../lib/analytics.js'

Chart.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)
import { generarTicket, imprimir } from '../lib/impresora.js'
import { generarTicketPDF } from '../lib/ticketPDF.js'
import PeriodSwitcher from '../components/PeriodSwitcher.jsx'
import ExportBtn from '../components/ExportBtn.jsx'

const fmtM = v => '$' + Math.round(v || 0).toLocaleString('es-MX')
const PAGO_COLORS = { Efectivo:'b-green', Tarjeta:'b-blue', Plataforma:'b-purple', Gratis:'b-gray', '':'b-gray' }

export default function Ventas({ role }) {
  const [rango,        setRango]        = useState('mes')
  const [granularidad, setGranularidad] = useState('diario')
  const [rangoDesde,   setRangoDesde]   = useState('')
  const [rangoHasta,   setRangoHasta]   = useState('')
  const [rows,         setRows]         = useState([])
  const [loading,      setLoading]      = useState(true)
  const [filPago,      setFilPago]      = useState('')
  const [filProd,      setFilProd]      = useState('')
  const [filSoloDup,   setFilSoloDup]   = useState(false)
  const [expandido,    setExpandido]    = useState(null)
  const [msg,          setMsg]          = useState(null)
  const [waMesa,       setWaMesa]       = useState('')
  const [waFolio,      setWaFolio]      = useState(null)
  const [tabVentas,    setTabVentas]    = useState('historial')
  const [anlDow,       setAnlDow]       = useState(-1) // filtro día de semana análisis
  const [deletingId,   setDeletingId]   = useState(null)
  const [deletingFolio,setDeletingFolio]= useState(null)
  const [editingFolio, setEditingFolio] = useState(null)
  const [editCanal,    setEditCanal]    = useState('')
  const [editFecha,    setEditFecha]    = useState('')
  const [addingTo,    setAddingTo]    = useState(null)  // comanda obj cuando se agregan productos
  const [addItems,    setAddItems]    = useState([{producto:'',categoria:'',unidades:1,importe:''}])
  const [guardandoAdd,setGuardandoAdd]= useState(false)
  const [showAtrasada,    setShowAtrasada]    = useState(false)
  const [atForm,          setAtForm]          = useState({ fecha:'', canal:'Efectivo', items:[{producto:'',categoria:'',unidades:1,importe:''}] })
  const [guardandoAtras,  setGuardandoAtras]  = useState(false)
  const [platCatalogo,    setPlatCatalogo]    = useState([])  // productos históricos para autocomplete
  const [descuentosMap,   setDescuentosMap]   = useState({})  // folio → monto descuento
  const [selFolios,       setSelFolios]       = useState(new Set())  // multi-select
  const [bulkPago,        setBulkPago]        = useState('')
  const [bulkActivo,      setBulkActivo]      = useState(false)

  const load = useCallback(async () => {
    if (rango==='rango'&&(!rangoDesde||!rangoHasta)) return
    setLoading(true)
    try {
      const { from, to } = getRangoFechas(rango, rangoDesde, rangoHasta)
      // Paginado para no perder registros cuando el período supera las 1000 filas
      const PAGE = 1000
      let all = [], idx = 0, done = false
      while (!done) {
        const { data, error } = await sb.from('ventas')
          .select('*').gte('fecha', from).lte('fecha', to)
          .order('created_at', { ascending: false })
          .range(idx, idx + PAGE - 1)
        if (error) throw error
        all = all.concat(data || [])
        if (!data || data.length < PAGE) done = true
        else idx += PAGE
      }
      setRows(all)
      // Cargar descuentos del período (guardados como gasto con concepto 'Descuento comanda FOLIO')
      const { from: f2, to: t2 } = getRangoFechas(rango, rangoDesde, rangoHasta)
      const { data: descRows } = await sb.from('gastos')
        .select('concepto,monto').gte('fecha', f2).lte('fecha', t2)
        .ilike('concepto', 'Descuento comanda %')
      const dMap = {}
      ;(descRows || []).forEach(r => {
        const folio = r.concepto.replace('Descuento comanda ', '').trim()
        dMap[folio] = (dMap[folio] || 0) + r.monto
      })
      setDescuentosMap(dMap)
    } catch(e) { console.error(e) }
    setLoading(false)
  }, [rango, rangoDesde, rangoHasta])

  useEffect(() => { load() }, [load])

  // Cargar catálogo desde tabla `productos` (un registro por producto — no depende del historial)
  useEffect(() => {
    if ((!showAtrasada && !addingTo) || platCatalogo.length) return
    sb.from('productos')
      .select('nombre,precio_base,familias(nombre)')
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => {
        if (!data) return
        const cat = data.map(p => ({
          producto:  p.nombre || '',
          categoria: p.familias?.nombre || '',
          importe:   p.precio_base || 0,
        })).filter(p => p.producto)
        setPlatCatalogo(cat)
      })
  }, [showAtrasada, addingTo])

  const elegirProducto = (idx, nombre) => {
    const found = platCatalogo.find(p => p.producto === nombre)
    setAtForm(f => ({
      ...f,
      items: f.items.map((it,i) => i===idx ? {
        ...it,
        producto:  nombre,
        categoria: found?.categoria || it.categoria,
        importe:   found ? (found.importe||'') : it.importe,
      } : it)
    }))
  }

  const elegirAddProducto = (idx, nombre) => {
    const found = platCatalogo.find(p => p.producto === nombre)
    setAddItems(prev => prev.map((it,i) => i===idx ? {
      ...it,
      producto:  nombre,
      categoria: found?.categoria || it.categoria,
      importe:   found ? (found.importe||'') : it.importe,
    } : it))
  }

  const guardarItemsAgregados = async () => {
    if (!addingTo) return
    const items = addItems.filter(i => i.producto.trim() && parseInt(i.unidades) > 0)
    if (!items.length) { setMsg({ ok:false, text:'Agrega al menos un producto' }); return }
    setGuardandoAdd(true)
    try {
      const rows = items.map(item => ({
        fecha:      addingTo.items[0]?.fecha,
        folio:      addingTo.folio,
        metodo_pago: addingTo.items[0]?.metodo_pago,
        canal:      addingTo.canal || addingTo.items[0]?.canal,
        producto:   item.producto.trim(),
        categoria:  item.categoria.trim() || 'Sin categoría',
        unidades:   parseInt(item.unidades) || 1,
        importe:    parseFloat(item.importe) || 0,
      }))
      const { data: inserted, error } = await sb.from('ventas').insert(rows).select()
      if (error) throw error
      // Sincronizar ventas_cat
      const catMap = {}
      rows.forEach(r => {
        if (!catMap[r.categoria]) catMap[r.categoria] = { importe:0, unidades:0 }
        catMap[r.categoria].importe  += r.importe
        catMap[r.categoria].unidades += r.unidades
      })
      for (const [categoria, vals] of Object.entries(catMap)) {
        const { data: vc } = await sb.from('ventas_cat').select('id,importe,unidades').eq('fecha',rows[0].fecha).eq('categoria',categoria).maybeSingle()
        if (vc) await sb.from('ventas_cat').update({ importe:(vc.importe||0)+vals.importe, unidades:(vc.unidades||0)+vals.unidades }).eq('id',vc.id)
        else    await sb.from('ventas_cat').insert({ fecha:rows[0].fecha, categoria, importe:vals.importe, unidades:vals.unidades })
      }
      setAddingTo(null)
      setAddItems([{producto:'',categoria:'',unidades:1,importe:''}])
      setMsg({ ok:true, text:`✓ ${inserted?.length||items.length} producto(s) agregado(s) a ${addingTo.folio}` })
      // Recargar desde DB para que el total y el desglose reflejen los nuevos items
      load()
      setTimeout(()=>setMsg(null), 3500)
    } catch(e) {
      setMsg({ ok:false, text:'Error: ' + e.message })
    }
    setGuardandoAdd(false)
  }

  const eliminarItem = async (id, reg) => {
    if (!window.confirm('¿Eliminar este producto de la venta?')) return
    setDeletingId(id)
    const { error } = await sb.from('ventas').delete().eq('id', id)
    if (error) { setMsg({ ok:false, text:'Error: '+error.message }); setDeletingId(null); return }
    // Actualizar ventas_cat
    if (reg.categoria && reg.fecha) {
      const { data: vc } = await sb.from('ventas_cat')
        .select('id,importe,unidades').eq('fecha',reg.fecha).eq('categoria',reg.categoria).maybeSingle()
      if (vc) {
        await sb.from('ventas_cat').update({
          importe:  Math.max(0, (vc.importe||0)  - (reg.importe||0)),
          unidades: Math.max(0, (vc.unidades||0) - (reg.unidades||0)),
        }).eq('id', vc.id)
      }
    }
    setRows(prev => prev.filter(r => r.id !== id))
    setMsg({ ok:true, text:'Producto eliminado' })
    setTimeout(()=>setMsg(null), 3000)
    setDeletingId(null)
  }

  const CANALES_OPCIONES = ['Efectivo','Tarjeta','Uber','Uber Chilakiles','DiDi','DiDi Chilakiles','Rappi','Ola','Gratis']

  const guardarCanal = async (folio, items) => {
    // Mapeo correcto canal -> metodo_pago
    const metodoPago = ['Uber','Uber Chilakiles','DiDi','DiDi Chilakiles','Rappi','Ola'].includes(editCanal)
      ? 'Plataforma'
      : editCanal === 'Gratis' ? 'Gratis' : editCanal

    // Total de la comanda para calcular comision Clip si aplica
    const totalComanda = items.reduce((s,i)=>s+(i.importe||0),0)
    const fechaComanda = items[0]?.fecha

    // Preguntar si aplica Clip cuando cambia a Tarjeta
    let aplicarClip = false
    if (editCanal === 'Tarjeta' && totalComanda > 0) {
      aplicarClip = window.confirm(
        '¿Esta venta aplica al pago de prestamo Clip?\n\n'+
        'Total comanda: $'+Math.round(totalComanda).toLocaleString('es-MX')+'\n'+
        'Comision Clip (30%): $'+Math.round(totalComanda*0.3).toLocaleString('es-MX')+'\n\n'+
        'Aceptar = SI aplica (se registrara la comision)\n'+
        'Cancelar = NO aplica'
      )
    }

    // Actualizar ventas
    const updatePayload = { canal: editCanal, metodo_pago: metodoPago }
    if (editFecha) updatePayload.fecha = editFecha
    for (const item of items) {
      await sb.from('ventas').update(updatePayload).eq('id', item.id)
    }

    // Si aplica Clip, crear gasto y reducir saldo del prestamo
    if (aplicarClip) {
      const comClip = Math.round(totalComanda * 0.3)
      await sb.from('gastos').insert({
        fecha: fechaComanda,
        concepto: 'Comision Clip (correccion folio '+folio+')',
        categoria_gasto: 'GASTO DE VENTAS',
        monto: comClip,
        metodo_pago: 'Tarjeta'
      })
      // Reducir saldo prestamo Clip
      const { data: prestamo } = await sb.from('prestamos').select('saldo_actual').eq('id','clip').maybeSingle()
      if (prestamo) {
        const nuevoSaldo = Math.max(0, (prestamo.saldo_actual||0) - comClip)
        await sb.from('prestamos').update({ saldo_actual: nuevoSaldo, updated_at: new Date().toISOString() }).eq('id','clip')
      }
    }

    const rowUpdate = { canal:editCanal, metodo_pago:metodoPago, ...(editFecha?{fecha:editFecha}:{}) }
    setRows(prev => prev.map(r => items.some(i=>i.id===r.id) ? {...r, ...rowUpdate} : r))
    setEditingFolio(null)
    setMsg({ ok:true, text: aplicarClip ? 'Canal actualizado + comision Clip registrada' : 'Canal actualizado en toda la comanda' })
    setTimeout(()=>setMsg(null), 3500)
  }

  const eliminarComanda = async (folio, items) => {
    if (!window.confirm('¿Eliminar toda esta comanda? Se eliminarán '+items.length+' productos.')) return
    setDeletingFolio(folio)
    for (const item of items) {
      await sb.from('ventas').delete().eq('id', item.id)
      if (item.categoria && item.fecha) {
        const { data: vc } = await sb.from('ventas_cat')
          .select('id,importe,unidades').eq('fecha',item.fecha).eq('categoria',item.categoria).maybeSingle()
        if (vc) {
          await sb.from('ventas_cat').update({
            importe:  Math.max(0, (vc.importe||0)  - (item.importe||0)),
            unidades: Math.max(0, (vc.unidades||0) - (item.unidades||0)),
          }).eq('id', vc.id)
        }
      }
    }
    // Borrar gasto de descuento asociado al folio si existe
    await sb.from('gastos').delete().ilike('concepto', `Descuento comanda ${folio}`)
    if (descuentosMap[folio]) setDescuentosMap(prev => { const n={...prev}; delete n[folio]; return n })
    setRows(prev => prev.filter(r => r.folio !== folio && !(r.folio===null && items.some(i=>i.id===r.id))))
    setMsg({ ok:true, text:'Comanda eliminada' })
    setTimeout(()=>setMsg(null), 3000)
    setDeletingFolio(null)
  }

  // Agrupar por folio
  const comandas = React.useMemo(() => {
    const map = {}
    rows
      .filter(r => !filPago || r.metodo_pago === filPago)
      .filter(r => !filProd || (r.producto||'').toLowerCase().includes(filProd.toLowerCase()))
      .forEach(r => {
        const folio = r.folio || ('SIN-' + r.id)
        if (!map[folio]) map[folio] = {
          folio, fecha: r.fecha, canal: r.canal, metodo_pago: r.metodo_pago,
          cliente: r.cliente, items: [], total: 0, created_at: r.created_at,
          cobrada_por: r.cobrada_por || null, tomada_por: r.tomada_por || null,
        }
        map[folio].items.push(r)
        map[folio].total += r.importe || 0
      })
    return Object.values(map).sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
  }, [rows, filPago, filProd])

  const totVentas = comandas.reduce((s,c) => s + c.total - (descuentosMap[c.folio] || 0), 0)
  const totUnidades = rows.reduce((s,r) => s + (r.unidades||0), 0)
  const pagos = [...new Set(rows.map(r => r.metodo_pago).filter(Boolean))]
  const totEfectivo   = comandas.filter(c=>c.metodo_pago==='Efectivo').reduce((s,c)=>s+c.total,0)
  const totTarjeta    = comandas.filter(c=>c.metodo_pago==='Tarjeta').reduce((s,c)=>s+c.total,0)
  const totPlataforma = comandas.filter(c=>c.metodo_pago==='Plataforma').reduce((s,c)=>s+c.total,0)
  const totGratis     = comandas.filter(c=>c.metodo_pago==='Gratis').reduce((s,c)=>s+c.total,0)

  // ── Detección de duplicados en comandas ──────────────────────
  // Criterio: misma fecha + mismo canal + mismos productos (nombre+unidades+importe)
  const dupCmds = React.useMemo(() => {
    const keyMap = {}  // fingerprint → [folio, ...]
    comandas.forEach(c => {
      const prods = c.items
        .map(i => `${i.producto}:${i.unidades}:${Math.round(i.importe)}`)
        .sort().join('|')
      const k = `${c.fecha}|${(c.canal||c.metodo_pago||'').toLowerCase()}|${prods}`
      if (!keyMap[k]) keyMap[k] = []
      keyMap[k].push(c.folio)
    })
    const dupFolios = new Set()
    Object.values(keyMap).filter(fs => fs.length > 1).forEach(fs => fs.forEach(f => dupFolios.add(f)))
    return dupFolios  // set de folios que son duplicados
  }, [comandas])
  const isDupCmd = c => dupCmds.has(c.folio)
  const dupCmdCount = comandas.filter(isDupCmd).length

  const enviarTextoWA = (comanda, tel) => {
    const WA_NUM = tel.startsWith('52') ? tel : '52' + tel
    const detalle = comanda.items
      .filter(i => i.importe > 0)
      .map(i => i.unidades + 'x ' + i.producto + '   $' + Math.round(i.importe).toLocaleString('es-MX'))
      .join('%0A')
    const propina = fmtM(Math.round(comanda.total * 0.15))
    const txt = '*Tu ticket - Chilakileando*%0AFolio: ' + comanda.folio + '%0AFecha: ' + comanda.fecha + '%0A%0A' + detalle + '%0A%0A──────────────────%0A*TOTAL: ' + fmtM(comanda.total) + '*%0APropina sugerida (15%25): ' + propina + '%0A%0AiGracias por tu preferencia!%0ATe esperamos nuevamente%0A%0Achilakileando.netlify.app/encuesta'
    window.open('https://api.whatsapp.com/send?phone=' + WA_NUM + '&text=' + txt, '_blank')
    setWaFolio(null)
    setWaMesa('')
  }

  const abrirPDF = async (comanda) => {
    const items = comanda.items.map(r => ({
      plato: { nombre: r.producto, familia: r.categoria },
      qty: r.unidades, subtotal: r.importe, precioUnit: r.importe / (r.unidades||1), desc: ''
    }))
    const doc = await generarTicketPDF({
      comanda: { label: comanda.folio, cliente: comanda.cliente },
      items, total: comanda.total, canal: comanda.canal, descuento: 0
    })
    const blob = doc.output('blob')
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  const reimprimirTicket = (comanda) => {
    const items = comanda.items.map(r => ({
      plato: { nombre: r.producto, familia: r.categoria },
      qty: r.unidades, subtotal: r.importe, precioUnit: r.importe / (r.unidades || 1), desc: ''
    }))
    const doc = generarTicket({
      comanda: { label: comanda.folio, cliente: comanda.cliente },
      items, total: comanda.total, canal: comanda.canal, neto: comanda.total, descuento: 0
    })
    imprimir(doc)
  }

  const PLAT_CANALES_AT = ['Uber','Uber Chilakiles','DiDi','DiDi Chilakiles','Rappi','Ola']

  const guardarVentaAtrasada = async () => {
    if (!atForm.fecha) { setMsg({ ok:false, text:'Selecciona la fecha de la venta' }); return }
    const hoy = new Date().toISOString().slice(0,10)
    if (atForm.fecha >= hoy) { setMsg({ ok:false, text:'La fecha debe ser anterior a hoy' }); return }
    const items = atForm.items.filter(i => i.producto.trim() && parseInt(i.unidades) > 0)
    if (!items.length) { setMsg({ ok:false, text:'Agrega al menos un producto con nombre y unidades' }); return }
    setGuardandoAtras(true)
    try {
      // Generar folio
      const prefijo = PLAT_CANALES_AT.includes(atForm.canal) ? 'P' : atForm.canal==='Tarjeta' ? 'T' : atForm.canal==='Gratis' ? 'G' : 'E'
      const { data: folioData } = await sb.rpc('generar_folio', { p_fecha: atForm.fecha, p_prefijo: prefijo })
      const folio = folioData || ('ATR-' + atForm.fecha.replace(/-/g,'') + '-' + Date.now())
      const metodo = PLAT_CANALES_AT.includes(atForm.canal) ? 'Plataforma' : atForm.canal
      // Insertar filas en ventas
      const rows = items.map(item => ({
        fecha: atForm.fecha, folio, metodo_pago: metodo, canal: atForm.canal,
        producto: item.producto.trim(),
        categoria: item.categoria.trim() || 'Sin categoría',
        unidades: parseInt(item.unidades) || 1,
        importe:  parseFloat(item.importe)  || 0,
      }))
      const { error } = await sb.from('ventas').insert(rows)
      if (error) throw error
      // Sincronizar ventas_cat
      const catMap = {}
      rows.forEach(r => {
        if (!catMap[r.categoria]) catMap[r.categoria] = { importe:0, unidades:0 }
        catMap[r.categoria].importe  += r.importe
        catMap[r.categoria].unidades += r.unidades
      })
      for (const [categoria, vals] of Object.entries(catMap)) {
        const { data: vc } = await sb.from('ventas_cat').select('id,importe,unidades').eq('fecha',atForm.fecha).eq('categoria',categoria).maybeSingle()
        if (vc) await sb.from('ventas_cat').update({ importe:(vc.importe||0)+vals.importe, unidades:(vc.unidades||0)+vals.unidades }).eq('id',vc.id)
        else    await sb.from('ventas_cat').insert({ fecha:atForm.fecha, categoria, importe:vals.importe, unidades:vals.unidades })
      }
      setShowAtrasada(false)
      setAtForm({ fecha:'', canal:'Efectivo', items:[{producto:'',categoria:'',unidades:1,importe:''}] })
      setMsg({ ok:true, text:'✓ Venta registrada — folio ' + folio })
      setTimeout(()=>setMsg(null), 5000)
      load()
    } catch(e) {
      setMsg({ ok:false, text:'Error al guardar: ' + e.message })
    }
    setGuardandoAtras(false)
  }

  return (
    <div>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:10}}>
        <PeriodSwitcher rango={rango} granularidad={granularidad}
          onRango={setRango} onGranularidad={setGranularidad}
          rangoDesde={rangoDesde} rangoHasta={rangoHasta}
          onRangoChange={(d,h)=>{setRangoDesde(d);setRangoHasta(h)}}/>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          <input className="form-input" style={{width:170}} placeholder="Buscar producto..."
            value={filProd} onChange={e=>setFilProd(e.target.value)}/>
          <select className="form-input" style={{width:140}} value={filPago} onChange={e=>setFilPago(e.target.value)}>
            <option value="">Todos los pagos</option>
            {pagos.map(p=><option key={p} value={p}>{p}</option>)}
          </select>
          <button className={`psw-btn${tabVentas==='historial'?' active':''}`} onClick={()=>setTabVentas('historial')}>Historial</button>
          <button className={`psw-btn${tabVentas==='analisis'?' active':''}`} onClick={()=>setTabVentas('analisis')}>📊 Análisis</button>
          <button onClick={()=>setShowAtrasada(true)}
            style={{padding:'6px 12px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:11,color:'var(--text2)',whiteSpace:'nowrap'}}>
            ⊕ Venta atrasada
          </button>
          <ExportBtn titulo="Historial de ventas" getElement={()=>document.querySelector('.content')}/>
        </div>
      </div>

      {msg && <div style={{padding:'8px 14px',borderRadius:'var(--r-md)',marginBottom:10,
        background:msg.ok?'#EAF3DE':'#FCEBEB',color:msg.ok?'#3B6D11':'#A32D2D',fontSize:12}}>{msg.text}</div>}

      {/* ── Modal Venta Atrasada ── */}
      {showAtrasada && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:400}}>
          <div style={{background:'var(--surface)',borderRadius:'var(--r-lg)',padding:22,width:'min(580px,95vw)',maxHeight:'85vh',overflowY:'auto',border:'0.5px solid var(--border-md)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div style={{fontSize:14,fontWeight:700}}>📋 Registrar Venta Atrasada</div>
              <button onClick={()=>setShowAtrasada(false)} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,color:'var(--text3)',lineHeight:1}}>✕</button>
            </div>
            {/* Fecha + Canal */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
              <div>
                <div style={{fontSize:10,color:'var(--text3)',fontWeight:700,marginBottom:4}}>FECHA DE LA VENTA</div>
                <input type="date" className="form-input"
                  max={new Date(Date.now()-86400000).toISOString().slice(0,10)}
                  value={atForm.fecha}
                  onChange={e=>setAtForm(f=>({...f,fecha:e.target.value}))}/>
              </div>
              <div>
                <div style={{fontSize:10,color:'var(--text3)',fontWeight:700,marginBottom:4}}>CANAL DE PAGO</div>
                <select className="form-input" value={atForm.canal} onChange={e=>setAtForm(f=>({...f,canal:e.target.value}))}>
                  {CANALES_OPCIONES.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            {/* datalist para autocomplete */}
            <datalist id="dl-productos-at">
              {platCatalogo.map(p=><option key={p.producto} value={p.producto}/>)}
            </datalist>
            {/* Filas de productos */}
            <div style={{fontSize:10,color:'var(--text3)',fontWeight:700,marginBottom:6}}>PRODUCTOS</div>
            {atForm.items.map((item,idx)=>(
              <div key={idx} style={{background:'var(--bg)',borderRadius:'var(--r-sm)',padding:'10px 12px',marginBottom:8,border:'0.5px solid var(--border)'}}>
                {/* Fila 1: Producto + botón eliminar */}
                <div style={{display:'flex',gap:8,marginBottom:6,alignItems:'center'}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:9,color:'var(--text3)',fontWeight:600,marginBottom:3}}>PRODUCTO</div>
                    <input list="dl-productos-at" className="form-input" style={{width:'100%'}} placeholder="Nombre del producto"
                      value={item.producto}
                      onChange={e=>elegirProducto(idx, e.target.value)}/>
                  </div>
                  {atForm.items.length > 1 && (
                    <button onClick={()=>setAtForm(f=>({...f,items:f.items.filter((_,i)=>i!==idx)}))}
                      style={{background:'none',border:'none',cursor:'pointer',color:'var(--text3)',fontSize:18,paddingTop:14,alignSelf:'flex-end'}}>✕</button>
                  )}
                </div>
                {/* Fila 2: Categoría + Unidades + Precio */}
                <div style={{display:'flex',gap:8}}>
                  <div style={{flex:2}}>
                    <div style={{fontSize:9,color:'var(--text3)',fontWeight:600,marginBottom:3}}>CATEGORÍA</div>
                    <input className="form-input" style={{width:'100%'}} placeholder="Ej: Chilakiles"
                      value={item.categoria}
                      onChange={e=>setAtForm(f=>({...f,items:f.items.map((it,i)=>i===idx?{...it,categoria:e.target.value}:it)}))}/>
                  </div>
                  <div style={{width:60}}>
                    <div style={{fontSize:9,color:'var(--text3)',fontWeight:600,marginBottom:3}}>UNIDADES</div>
                    <input className="form-input" style={{width:'100%'}} type="number" min="1" placeholder="1"
                      value={item.unidades}
                      onChange={e=>setAtForm(f=>({...f,items:f.items.map((it,i)=>i===idx?{...it,unidades:e.target.value}:it)}))}/>
                  </div>
                  <div style={{width:90}}>
                    <div style={{fontSize:9,color:'var(--text3)',fontWeight:600,marginBottom:3}}>PRECIO $</div>
                    <input className="form-input" style={{width:'100%'}} type="number" min="0" step="0.01" placeholder="0.00"
                      value={item.importe}
                      onChange={e=>setAtForm(f=>({...f,items:f.items.map((it,i)=>i===idx?{...it,importe:e.target.value}:it)}))}/>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={()=>setAtForm(f=>({...f,items:[...f.items,{producto:'',categoria:'',unidades:1,importe:''}]}))}
              style={{fontSize:11,color:'var(--accent)',background:'none',border:'none',cursor:'pointer',padding:'3px 0',marginBottom:14}}>
              + Agregar producto
            </button>
            {/* Total */}
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:16,paddingTop:8,borderTop:'0.5px solid var(--border)'}}>
              <span style={{fontSize:13,fontWeight:700}}>
                Total: {fmtM(atForm.items.reduce((s,i)=>s+(parseFloat(i.importe)||0),0))}
              </span>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>setShowAtrasada(false)}
                style={{padding:'7px 16px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:12}}>
                Cancelar
              </button>
              <button onClick={guardarVentaAtrasada} disabled={guardandoAtras}
                style={{padding:'7px 16px',borderRadius:'var(--r-sm)',background:'var(--accent)',border:'none',color:'#fff',cursor:guardandoAtras?'default':'pointer',fontSize:12,fontWeight:600,opacity:guardandoAtras?0.6:1}}>
                {guardandoAtras ? 'Guardando…' : 'Guardar Venta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Agregar Productos a comanda existente ── */}
      {addingTo && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:400}}>
          <div style={{background:'var(--surface)',borderRadius:'var(--r-lg)',padding:22,width:'min(540px,95vw)',maxHeight:'85vh',overflowY:'auto',border:'0.5px solid var(--border-md)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <div>
                <div style={{fontSize:14,fontWeight:700}}>⊕ Agregar productos</div>
                <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>
                  Folio {addingTo.folio} · {addingTo.items[0]?.fecha} · {addingTo.canal||addingTo.items[0]?.canal||addingTo.items[0]?.metodo_pago}
                </div>
              </div>
              <button onClick={()=>setAddingTo(null)} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,color:'var(--text3)',lineHeight:1}}>✕</button>
            </div>
            {/* datalist reutilizado */}
            <datalist id="dl-productos-add">
              {platCatalogo.map(p=><option key={p.producto} value={p.producto}/>)}
            </datalist>
            {/* Filas de productos nuevos */}
            <div style={{fontSize:10,color:'var(--text3)',fontWeight:700,marginBottom:6}}>PRODUCTOS A AGREGAR</div>
            {addItems.map((item,idx)=>(
              <div key={idx} style={{background:'var(--bg)',borderRadius:'var(--r-sm)',padding:'10px 12px',marginBottom:8,border:'0.5px solid var(--border)'}}>
                <div style={{display:'flex',gap:8,marginBottom:6,alignItems:'center'}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:9,color:'var(--text3)',fontWeight:600,marginBottom:3}}>PRODUCTO</div>
                    <input list="dl-productos-add" className="form-input" style={{width:'100%'}} placeholder="Nombre del producto"
                      value={item.producto}
                      onChange={e=>elegirAddProducto(idx, e.target.value)}/>
                  </div>
                  {addItems.length > 1 && (
                    <button onClick={()=>setAddItems(prev=>prev.filter((_,i)=>i!==idx))}
                      style={{background:'none',border:'none',cursor:'pointer',color:'var(--text3)',fontSize:18,paddingTop:14,alignSelf:'flex-end'}}>✕</button>
                  )}
                </div>
                <div style={{display:'flex',gap:8}}>
                  <div style={{flex:2}}>
                    <div style={{fontSize:9,color:'var(--text3)',fontWeight:600,marginBottom:3}}>CATEGORÍA</div>
                    <input className="form-input" style={{width:'100%'}} placeholder="Ej: Chilakiles"
                      value={item.categoria}
                      onChange={e=>setAddItems(prev=>prev.map((it,i)=>i===idx?{...it,categoria:e.target.value}:it))}/>
                  </div>
                  <div style={{width:60}}>
                    <div style={{fontSize:9,color:'var(--text3)',fontWeight:600,marginBottom:3}}>UNIDADES</div>
                    <input className="form-input" style={{width:'100%'}} type="number" min="1" placeholder="1"
                      value={item.unidades}
                      onChange={e=>setAddItems(prev=>prev.map((it,i)=>i===idx?{...it,unidades:e.target.value}:it))}/>
                  </div>
                  <div style={{width:90}}>
                    <div style={{fontSize:9,color:'var(--text3)',fontWeight:600,marginBottom:3}}>PRECIO $</div>
                    <input className="form-input" style={{width:'100%'}} type="number" min="0" step="0.01" placeholder="0.00"
                      value={item.importe}
                      onChange={e=>setAddItems(prev=>prev.map((it,i)=>i===idx?{...it,importe:e.target.value}:it))}/>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={()=>setAddItems(prev=>[...prev,{producto:'',categoria:'',unidades:1,importe:''}])}
              style={{fontSize:11,color:'var(--accent)',background:'none',border:'none',cursor:'pointer',padding:'3px 0',marginBottom:14}}>
              + Agregar otro producto
            </button>
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:14,paddingTop:8,borderTop:'0.5px solid var(--border)'}}>
              <span style={{fontSize:13,fontWeight:700}}>
                Suma a agregar: {fmtM(addItems.reduce((s,i)=>s+(parseFloat(i.importe)||0),0))}
              </span>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>setAddingTo(null)}
                style={{padding:'7px 16px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:12}}>
                Cancelar
              </button>
              <button onClick={guardarItemsAgregados} disabled={guardandoAdd}
                style={{padding:'7px 16px',borderRadius:'var(--r-sm)',background:'var(--accent)',border:'none',color:'#fff',cursor:guardandoAdd?'default':'pointer',fontSize:12,fontWeight:600,opacity:guardandoAdd?0.6:1}}>
                {guardandoAdd ? 'Guardando…' : 'Agregar a comanda'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal WhatsApp */}
      {waFolio && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300}}>
          <div style={{background:'var(--surface)',borderRadius:'var(--r-lg)',padding:22,width:340,border:'0.5px solid var(--border-md)'}}>
            <div style={{fontSize:14,fontWeight:600,marginBottom:12}}>📱 Enviar ticket por WhatsApp</div>
            <div style={{fontSize:11,color:'var(--text2)',marginBottom:6}}>Folio: {waFolio.folio}</div>
            <div style={{fontSize:11,color:'var(--text2)',marginBottom:10}}>Total: {fmtM(waFolio.total)}</div>
            <input className="form-input" style={{width:'100%',marginBottom:12}} placeholder="Número WhatsApp (ej: 4491234567)"
              value={waMesa} onChange={e=>setWaMesa(e.target.value.replace(/[^0-9]/g,''))}/>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>{setWaFolio(null);setWaMesa('')}}
                style={{flex:1,padding:9,borderRadius:'var(--r-md)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:13}}>
                Cancelar
              </button>
              <button onClick={()=>waMesa.length>=10&&enviarTextoWA(waFolio,waMesa)}
                disabled={waMesa.length<10}
                style={{flex:1,padding:9,borderRadius:'var(--r-md)',border:'none',background:waMesa.length>=10?'#25D366':'var(--border)',color:'#fff',cursor:waMesa.length>=10?'pointer':'default',fontSize:12,fontWeight:600}}>
                📱 Texto
              </button>
              <button onClick={()=>{abrirPDF(waFolio);setWaFolio(null);setWaMesa('')}}
                style={{flex:1,padding:9,borderRadius:'var(--r-md)',border:'1.5px solid #378ADD',background:'transparent',color:'#378ADD',cursor:'pointer',fontSize:12,fontWeight:600}}>
                📄 PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {tabVentas === 'analisis' && (()=> {
        const tc = () => matchMedia('(prefers-color-scheme:dark)').matches ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'
        const gc = () => matchMedia('(prefers-color-scheme:dark)').matches ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
        const fmtM2 = v => '$' + Math.round(v||0).toLocaleString('es-MX')

        const DIAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
        const COLORES = ['#378ADD','#1D9E75','#EF9F27','#E24B4A','#7F77DD','#D4537E','#D85A30','#8B6914']

        // anlDow viene del estado del componente (nivel raíz — no hook aquí)
        const rowsFilt = anlDow === -1 ? rows : rows.filter(r => new Date(r.fecha+'T12:00').getDay() === anlDow)

        // ── 1. Por canal ──────────────────────────────────────────
        const canalMap = {}
        rowsFilt.forEach(r => {
          const c = r.canal || r.metodo_pago || 'Sin dato'
          if (!canalMap[c]) canalMap[c] = { uds: 0, importe: 0 }
          canalMap[c].importe += r.importe || 0
          canalMap[c].uds     += r.unidades || 0
        })
        const canales = Object.entries(canalMap)
          .map(([c, v]) => ({ canal: c, importe: Math.round(v.importe), uds: Math.round(v.uds) }))
          .sort((a, b) => b.importe - a.importe)

        // ── 2. Por categoría (top 12) ──────────────────────────────
        const catMap = {}
        rowsFilt.forEach(r => {
          const c = r.categoria || 'Sin categoría'
          if (!catMap[c]) catMap[c] = { uds: 0, importe: 0 }
          catMap[c].importe += r.importe || 0
          catMap[c].uds     += r.unidades || 0
        })
        const cats = Object.entries(catMap)
          .map(([c, v]) => ({ cat: c, importe: Math.round(v.importe), uds: Math.round(v.uds) }))
          .sort((a, b) => b.importe - a.importe).slice(0, 12)

        // ── 3. Por hora del día ───────────────────────────────────
        const hourMap = Array.from({ length: 24 }, (_, h) => ({ h, uds: 0, importe: 0, cmd: 0 }))
        const seenFolio = {}
        rowsFilt.forEach(r => {
          if (!r.created_at) return
          const h = new Date(r.created_at).getHours()
          hourMap[h].importe += r.importe || 0
          hourMap[h].uds     += r.unidades || 0
          if (r.folio && !seenFolio[r.folio]) { seenFolio[r.folio] = true; hourMap[h].cmd++ }
        })
        const horasActivas = hourMap.filter(h => h.uds > 0)
        const maxHoraUds   = Math.max(1, ...horasActivas.map(h => h.uds))

        const totalVentasAnal = rowsFilt.reduce((s, r) => s + (r.importe || 0), 0)

        const barOpts = (titleCb) => ({
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: titleCb } } },
          scales: {
            x: { ticks: { color: tc(), font: { size: 10 } }, grid: { color: gc() }, border: { display: false } },
            y: { ticks: { color: tc(), font: { size: 10 } }, grid: { color: gc() }, border: { display: false } },
          },
        })

        return (
          <div>
            {/* Resumen del período */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', fontSize: 11, color: 'var(--text3)' }}>
              <span>{rowsFilt.length.toLocaleString()} registros</span>
              <span>·</span>
              <span style={{ fontWeight: 600, color: 'var(--text1)' }}>{fmtM2(totalVentasAnal)}</span>
              {anlDow !== -1 && (
                <span style={{ padding: '2px 8px', borderRadius: 99, background: 'var(--bg)', border: '0.5px solid var(--border-md)', fontWeight: 600, color: 'var(--text2)' }}>
                  📅 {DIAS[anlDow]}
                  <button onClick={() => setAnlDow(-1)} style={{ marginLeft: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 10 }}>✕</button>
                </span>
              )}
            </div>

            {/* Fila 1: Canal + Categoría */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              {/* Canal */}
              <div className="card">
                <div className="ct" style={{ marginBottom: 10 }}>Ventas por canal</div>
                <div style={{ height: 200 }}>
                  <Bar
                    data={{
                      labels: canales.map(c => c.canal),
                      datasets: [{
                        label: 'Importe',
                        data: canales.map(c => c.importe),
                        backgroundColor: canales.map((_, i) => COLORES[i % COLORES.length] + 'CC'),
                        borderRadius: 4,
                      }],
                    }}
                    options={barOpts(ctx => ' $' + Math.round(ctx.raw).toLocaleString('es-MX'))}
                  />
                </div>
                <table className="tbl" style={{ marginTop: 10 }}>
                  <thead><tr><th>Canal</th><th className="num">Importe</th><th className="num">Uds</th><th className="num">$/ud</th><th className="num">%</th></tr></thead>
                  <tbody>
                    {canales.map((c, i) => (
                      <tr key={c.canal}>
                        <td style={{ fontSize: 11 }}>
                          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: COLORES[i % COLORES.length], marginRight: 5 }} />
                          {c.canal}
                        </td>
                        <td className="num">{fmtM2(c.importe)}</td>
                        <td className="num">{c.uds}</td>
                        <td className="num" style={{ color:'#7F77DD', fontWeight:600 }}>{c.uds > 0 ? fmtM2(Math.round(c.importe / c.uds)) : '—'}</td>
                        <td className="num c-muted">{totalVentasAnal > 0 ? Math.round(c.importe / totalVentasAnal * 100) : 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Categoría */}
              <div className="card">
                <div className="ct" style={{ marginBottom: 10 }}>Top categorías de producto</div>
                <div style={{ height: 200 }}>
                  <Bar
                    data={{
                      labels: cats.map(c => c.cat.length > 16 ? c.cat.slice(0, 14) + '…' : c.cat),
                      datasets: [{
                        label: 'Importe',
                        data: cats.map(c => c.importe),
                        backgroundColor: cats.map((_, i) => COLORES[i % COLORES.length] + 'CC'),
                        borderRadius: 4,
                      }],
                    }}
                    options={barOpts(ctx => ' $' + Math.round(ctx.raw).toLocaleString('es-MX'))}
                  />
                </div>
                <table className="tbl" style={{ marginTop: 10, maxHeight: 200, display: 'block', overflowY: 'auto' }}>
                  <thead><tr><th>Categoría</th><th className="num">Importe</th><th className="num">Uds</th><th className="num">$/ud</th></tr></thead>
                  <tbody>
                    {cats.map((c, i) => (
                      <tr key={c.cat}>
                        <td style={{ fontSize: 11 }}>
                          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: COLORES[i % COLORES.length], marginRight: 5 }} />
                          {c.cat}
                        </td>
                        <td className="num">{fmtM2(c.importe)}</td>
                        <td className="num">{c.uds}</td>
                        <td className="num" style={{ color:'#7F77DD', fontWeight:600 }}>{c.uds > 0 ? fmtM2(Math.round(c.importe / c.uds)) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Fila 2: Horas del día */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div className="ct" style={{ marginBottom: 3 }}>Concentración de ventas por hora del día</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                    Basado en hora de registro · barras coloreadas por intensidad (🔴 pico · 🟠 moderado · 🟢 bajo)
                  </div>
                </div>
                {/* Selector de día de semana — directamente en el gráfico */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    className={`psw-btn${anlDow === -1 ? ' active' : ''}`}
                    onClick={() => setAnlDow(-1)}
                    style={{ fontSize: 10 }}>
                    Todos
                  </button>
                  {DIAS.map((d, i) => (
                    <button
                      key={i}
                      className={`psw-btn${anlDow === i ? ' active' : ''}`}
                      onClick={() => setAnlDow(i)}
                      style={{ fontSize: 10 }}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ height: 160 }}>
                <Bar
                  data={{
                    labels: hourMap.map(h => h.h + ':00'),
                    datasets: [
                      {
                        label: 'Unidades',
                        data: hourMap.map(h => h.uds),
                        backgroundColor: hourMap.map(h => {
                          const pct = h.uds / maxHoraUds
                          if (pct > 0.75) return '#E24B4ACC'
                          if (pct > 0.4)  return '#EF9F27CC'
                          if (pct > 0.1)  return '#1D9E75CC'
                          return '#378ADD44'
                        }),
                        borderRadius: 3,
                      },
                    ],
                  }}
                  options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: { callbacks: { label: ctx => ` ${ctx.raw} uds · ${horasActivas.find(h=>h.h===ctx.dataIndex)?.cmd||0} comandas` } },
                    },
                    scales: {
                      x: { ticks: { color: tc(), font: { size: 9 }, maxRotation: 0 }, grid: { display: false }, border: { display: false } },
                      y: { ticks: { color: tc(), font: { size: 10 }, stepSize: 1 }, grid: { color: gc() }, border: { display: false } },
                    },
                  }}
                />
              </div>
              {/* Resumen top horas */}
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {[...hourMap].sort((a, b) => b.uds - a.uds).slice(0, 5).filter(h => h.uds > 0).map(h => (
                  <div key={h.h} style={{ padding: '5px 10px', borderRadius: 'var(--r-sm)', background: 'var(--bg)', border: '0.5px solid var(--border)', fontSize: 11, textAlign: 'center' }}>
                    <div style={{ fontWeight: 700 }}>{h.h}:00–{h.h}:59</div>
                    <div style={{ color: '#1D9E75', fontWeight: 600 }}>{h.uds} uds</div>
                    <div style={{ fontSize: 9, color: 'var(--text3)' }}>{h.cmd} cmd · {fmtM2(h.importe)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {tabVentas === 'historial' && <>
      <div className="metrics" style={{gridTemplateColumns:`repeat(${dupCmdCount>0?4:3},minmax(0,1fr))`,marginBottom:8}}>
        <div className="mc"><div className="mc-label">Comandas</div><div className="mc-value">{comandas.length.toLocaleString()}</div></div>
        <div className="mc"><div className="mc-label">Total ventas</div><div className="mc-value">{fmtM(totVentas)}</div></div>
        <div className="mc"><div className="mc-label">Unidades</div><div className="mc-value">{Math.round(totUnidades).toLocaleString()}</div></div>
        {dupCmdCount > 0 && (
          <div className="mc" onClick={()=>setFilSoloDup(v=>!v)}
            style={{border:`1.5px solid ${filSoloDup?'#E24B4A':'#E24B4A44'}`,background:filSoloDup?'#FCEBEB44':'#FCEBEB22',cursor:'pointer'}}>
            <div className="mc-label" style={{color:'#E24B4A'}}>⚠ {filSoloDup?'Mostrando dups':'Posibles dups'}</div>
            <div className="mc-value" style={{color:'#E24B4A',fontSize:18}}>{dupCmdCount}</div>
          </div>
        )}
      </div>
      <div className="metrics" style={{gridTemplateColumns:'repeat(4,minmax(0,1fr))',marginBottom:12}}>
        <div className="mc" style={{borderLeft:'3px solid #1D9E75'}}>
          <div className="mc-label">💵 Efectivo</div>
          <div className="mc-value" style={{color:'#1D9E75'}}>{fmtM(totEfectivo)}</div>
          <div style={{fontSize:10,color:'#1D9E75',marginTop:2}}>{totVentas>0?Math.round(totEfectivo/totVentas*100):0}%</div>
        </div>
        <div className="mc" style={{borderLeft:'3px solid #378ADD'}}>
          <div className="mc-label">💳 Tarjeta</div>
          <div className="mc-value" style={{color:'#378ADD'}}>{fmtM(totTarjeta)}</div>
          <div style={{fontSize:10,color:'#378ADD',marginTop:2}}>{totVentas>0?Math.round(totTarjeta/totVentas*100):0}%</div>
        </div>
        <div className="mc" style={{borderLeft:'3px solid #7F77DD'}}>
          <div className="mc-label">📦 Plataforma</div>
          <div className="mc-value" style={{color:'#7F77DD'}}>{fmtM(totPlataforma)}</div>
          <div style={{fontSize:10,color:'#7F77DD',marginTop:2}}>{totVentas>0?Math.round(totPlataforma/totVentas*100):0}%</div>
        </div>
        <div className="mc" style={{borderLeft:'3px solid #888780'}}>
          <div className="mc-label">🎁 Gratis</div>
          <div className="mc-value" style={{color:'#888780'}}>{fmtM(totGratis)}</div>
          <div style={{fontSize:10,color:'#888780',marginTop:2}}>{totVentas>0?Math.round(totGratis/totVentas*100):0}%</div>
        </div>
      </div>

      <div className="card">
        <div className="ch">
          <div className="ct">Historial de comandas</div>
          <span style={{fontSize:11,color:'var(--text3)'}}>{comandas.length} comandas</span>
        </div>
        {loading
          ? <div className="loading-screen" style={{height:300}}><div className="spinner"/></div>
          : <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {/* Barra acción multi-select */}
              {selFolios.size > 0 && (
                <div style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',background:'#1D9E7511',border:'1px solid #1D9E7533',borderRadius:'var(--r-md)',flexWrap:'wrap'}}>
                  <span style={{fontSize:12,fontWeight:700,color:'#1D9E75'}}>{selFolios.size} comanda{selFolios.size>1?'s':''} seleccionada{selFolios.size>1?'s':''}</span>
                  {role==='admin' && <>
                    <select value={bulkPago} onChange={e=>setBulkPago(e.target.value)}
                      style={{fontSize:11,padding:'3px 8px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'var(--surface)',color:'var(--text1)'}}>
                      <option value=''>— cambiar método de pago —</option>
                      {['Efectivo','Tarjeta','Plataforma','Gratis'].map(p=><option key={p}>{p}</option>)}
                    </select>
                    {bulkPago && (
                      <button onClick={async()=>{
                        setBulkActivo(true)
                        const folios = [...selFolios]
                        const metodo = ['Uber','DiDi','Rappi','Ola'].some(p=>bulkPago.includes(p)) ? 'Plataforma' : bulkPago
                        // Actualizar todos los items de cada folio
                        const allItems = rows.filter(r => folios.includes(r.folio||('SIN-'+r.id)))
                        await Promise.all(allItems.map(r => sb.from('ventas').update({metodo_pago:metodo,canal:bulkPago}).eq('id',r.id)))
                        setRows(prev => prev.map(r => folios.includes(r.folio||('SIN-'+r.id)) ? {...r,metodo_pago:metodo,canal:bulkPago} : r))
                        setSelFolios(new Set()); setBulkPago(''); setBulkActivo(false)
                        setMsg({ok:true,text:`✓ ${folios.length} comanda(s) actualizadas`}); setTimeout(()=>setMsg(null),3000)
                      }} disabled={bulkActivo}
                        style={{fontSize:11,padding:'3px 12px',borderRadius:'var(--r-sm)',border:'none',background:'#1D9E75',color:'#fff',cursor:'pointer',fontWeight:600}}>
                        {bulkActivo?'…':'✓ Aplicar'}
                      </button>
                    )}
                    <span style={{flex:1}}/>
                    <button onClick={async()=>{
                      if(!confirm(`¿Eliminar ${selFolios.size} comanda(s)?`)) return
                      setBulkActivo(true)
                      for (const folio of selFolios) {
                        const items = rows.filter(r=>(r.folio||('SIN-'+r.id))===folio)
                        for (const item of items) await sb.from('ventas').delete().eq('id',item.id)
                        await sb.from('gastos').delete().ilike('concepto',`Descuento comanda ${folio}`)
                      }
                      setRows(prev => prev.filter(r => !selFolios.has(r.folio||('SIN-'+r.id))))
                      setDescuentosMap(prev => { const n={...prev}; selFolios.forEach(f=>{delete n[f]}); return n })
                      setSelFolios(new Set()); setBulkActivo(false)
                      setMsg({ok:true,text:`✓ ${selFolios.size} comanda(s) eliminadas`}); setTimeout(()=>setMsg(null),3000)
                    }} disabled={bulkActivo}
                      style={{fontSize:11,padding:'3px 12px',borderRadius:'var(--r-sm)',border:'1px solid #E24B4A',background:'transparent',color:'#E24B4A',cursor:'pointer',fontWeight:600}}>
                      🗑 Eliminar selección
                    </button>
                  </>}
                  <button onClick={()=>setSelFolios(new Set())}
                    style={{fontSize:11,padding:'3px 8px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',color:'var(--text3)'}}>
                    ✕ Limpiar
                  </button>
                </div>
              )}
              {/* Seleccionar todo (solo admin) */}
              {role==='admin' && comandas.length > 0 && (
                <div style={{display:'flex',alignItems:'center',gap:6,padding:'2px 4px'}}>
                  <input type="checkbox" style={{cursor:'pointer'}}
                    checked={comandas.filter(c=>!filSoloDup||isDupCmd(c)).every(c=>selFolios.has(c.folio))}
                    onChange={e=>setSelFolios(e.target.checked ? new Set(comandas.filter(c=>!filSoloDup||isDupCmd(c)).map(c=>c.folio)) : new Set())}/>
                  <span style={{fontSize:11,color:'var(--text3)'}}>Seleccionar todo</span>
                </div>
              )}
              {comandas.filter(c => !filSoloDup || isDupCmd(c)).map(c => {
                const dup = isDupCmd(c)
                const esGratis = c.metodo_pago === 'Gratis'
                const METODO_ICON = { Efectivo:'💵', Tarjeta:'💳', Plataforma:'📦', Gratis:'🎁' }
                // Detectar mixto: múltiples métodos en items O canal/metodo_pago explícito 'Mixto'
                const esMixtoExplicito = c.canal === 'Mixto' || c.metodo_pago === 'Mixto' || /-(M)-/.test(c.folio||'')
                const pagosPorMetodo = c.items.reduce((acc, item) => {
                  const m = item.metodo_pago && item.metodo_pago !== 'Mixto' ? item.metodo_pago : null
                  if (m) acc[m] = (acc[m] || 0) + (item.importe || 0)
                  return acc
                }, {})
                const esMixto = esMixtoExplicito || Object.keys(pagosPorMetodo).length > 1
                // Items consolidados por producto (evita duplicados del prorrateo mixto)
                const itemsConsolidados = esMixto
                  ? Object.values(c.items.reduce((acc, item) => {
                      const k = item.producto
                      if (!acc[k]) acc[k] = { ...item }
                      else acc[k].importe = (acc[k].importe || 0) + (item.importe || 0)
                      return acc
                    }, {}))
                  : c.items
                // Descuento y total cobrado real
                const desc = descuentosMap[c.folio] || 0
                const totalCobrado = Math.round(c.total - desc)
                const factorDesc = c.total > 0 ? totalCobrado / c.total : 1
                // Pagos mixtos ajustados por descuento
                const pagosMixtoAjustados = esMixto && desc > 0
                  ? Object.fromEntries(Object.entries(pagosPorMetodo).map(([m, v]) => [m, Math.round(v * factorDesc)]))
                  : pagosPorMetodo
                return (
                <div key={c.folio} style={{border:`${dup?'1.5px solid #E24B4A':esGratis?'1.5px solid #EF9F27':'0.5px solid var(--border-md)'}`,borderRadius:'var(--r-md)',overflow:'hidden',background:dup?'#FCEBEB18':esGratis?'#EF9F2711':undefined}}>
                  {/* Fila principal */}
                  <div onClick={()=>setExpandido(expandido===c.folio?null:c.folio)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',cursor:'pointer',background:dup?'#FCEBEB22':esGratis?'#EF9F2718':selFolios.has(c.folio)?'#1D9E7508':'var(--bg)',flexWrap:'wrap'}}>
                    {role==='admin' && (
                      <input type="checkbox" style={{cursor:'pointer',flexShrink:0}} checked={selFolios.has(c.folio)}
                        onClick={e=>e.stopPropagation()}
                        onChange={e=>setSelFolios(prev=>{const n=new Set(prev);e.target.checked?n.add(c.folio):n.delete(c.folio);return n})}/>
                    )}
                    <span style={{fontSize:11,fontWeight:700,color:dup?'#A32D2D':'var(--text2)',minWidth:160}}>
                      {dup && <span title="Posible comanda duplicada (misma fecha, total y canal)" style={{fontSize:9,background:'#E24B4A',color:'#fff',padding:'1px 5px',borderRadius:99,marginRight:5}}>⚠ dup</span>}
                      {c.folio}
                    </span>
                    <span style={{fontSize:11,color:'var(--text3)'}}>{c.fecha}</span>
                    <span style={{fontSize:11,color:'var(--text3)'}}>
                      {c.created_at ? new Date(c.created_at).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}) : ''}
                    </span>
                    {c.cliente && <span style={{fontSize:11,color:'var(--text2)'}}>👤 {c.cliente}</span>}
                    {c.cobrada_por && <span style={{fontSize:10,color:'var(--text3)',background:'var(--bg)',border:'0.5px solid var(--border-md)',borderRadius:99,padding:'1px 7px'}}>💰 {c.cobrada_por}</span>}
                    {esMixto
                      ? <span className="badge b-gray" style={{fontSize:10}}>Mixto · {Object.entries(pagosMixtoAjustados).map(([m,v])=>`${METODO_ICON[m]||''} ${fmtM(v)}`).join(' + ')}</span>
                      : <span className={`badge ${PAGO_COLORS[c.metodo_pago]||'b-gray'}`} style={{fontSize:10}}>{c.canal||c.metodo_pago}</span>
                    }
                    <span style={{flex:1}}/>
                    <span style={{fontSize:13,fontWeight:700,color:'#1D9E75'}}>{fmtM(totalCobrado)}</span>
                    <span style={{fontSize:11,color:'var(--text3)'}}>{expandido===c.folio?'▲':'▼'}</span>
                    {role==='admin' && editingFolio===c.folio ? (
                      <div onClick={e=>e.stopPropagation()} style={{display:'flex',gap:4,alignItems:'center',flexWrap:'wrap'}}>
                        <input type="date" value={editFecha} onChange={e=>setEditFecha(e.target.value)}
                          style={{fontSize:10,padding:'2px 4px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'var(--surface)',color:'var(--text1)',width:120}}/>
                        <select value={editCanal} onChange={e=>setEditCanal(e.target.value)}
                          style={{fontSize:10,padding:'2px 4px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'var(--surface)',color:'var(--text1)'}}>
                          {CANALES_OPCIONES.map(c=><option key={c} value={c}>{c}</option>)}
                        </select>
                        <button onClick={()=>guardarCanal(c.folio,c.items)}
                          style={{fontSize:10,padding:'2px 6px',borderRadius:'var(--r-sm)',border:'none',background:'#1D9E75',color:'#fff',cursor:'pointer'}}>✓</button>
                        <button onClick={()=>setEditingFolio(null)}
                          style={{fontSize:10,padding:'2px 6px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',color:'var(--text2)'}}>✕</button>
                      </div>
                    ) : null}
                    {role==='admin' && editingFolio!==c.folio && (
                      <button onClick={(e)=>{e.stopPropagation();setEditingFolio(c.folio);setEditCanal(c.canal||c.metodo_pago||'Efectivo');setEditFecha(c.items[0]?.fecha||'')}}
                        style={{fontSize:10,padding:'2px 8px',borderRadius:'var(--r-sm)',border:'0.5px solid #378ADD',color:'#378ADD',background:'transparent',cursor:'pointer',marginLeft:4}}>
                        ✎
                      </button>
                    )}
                    {role==='admin' && (
                      <button onClick={(e)=>{e.stopPropagation();eliminarComanda(c.folio,c.items)}}
                        disabled={deletingFolio===c.folio}
                        style={{fontSize:10,padding:'2px 8px',borderRadius:'var(--r-sm)',border:'0.5px solid #E24B4A',color:'#E24B4A',background:'transparent',cursor:'pointer',marginLeft:4}}>
                        {deletingFolio===c.folio?'…':'✕'}
                      </button>
                    )}
                  </div>
                  {/* Detalle expandido */}
                  {expandido===c.folio && (
                    <div style={{padding:'10px 14px',borderTop:'0.5px solid var(--border-md)',background:'var(--surface)'}}>
                      {itemsConsolidados.map((item,i) => (
                        <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'3px 0',borderBottom:'0.5px solid var(--border)',alignItems:'center'}}>
                          <span>{item.unidades}x {item.producto}</span>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <span style={{fontWeight:500}}>{fmtM(item.importe)}</span>
                            {!esMixto && role==='admin' && item.id && (
                              <button onClick={()=>eliminarItem(item.id, item)}
                                disabled={deletingId===item.id}
                                style={{fontSize:10,padding:'1px 6px',borderRadius:'var(--r-sm)',border:'0.5px solid #E24B4A',color:'#E24B4A',background:'transparent',cursor:'pointer'}}>
                                {deletingId===item.id?'…':'✕'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      {/* Desglose pago mixto (montos ajustados por descuento) */}
                      {esMixto && (
                        <div style={{marginTop:8,paddingTop:6,borderTop:'0.5px solid var(--border-md)',display:'flex',gap:12,flexWrap:'wrap'}}>
                          {Object.entries(pagosMixtoAjustados).map(([metodo, monto]) => (
                            <div key={metodo} style={{display:'flex',alignItems:'center',gap:4}}>
                              <span style={{fontSize:11,color:'var(--text2)'}}>{METODO_ICON[metodo]||''} {metodo}</span>
                              <span style={{fontSize:12,fontWeight:700,color:metodo==='Efectivo'?'#1D9E75':metodo==='Tarjeta'?'#378ADD':'var(--text1)'}}>{fmtM(monto)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Subtotal / Descuento / Total cobrado */}
                      <div style={{marginTop:8,paddingTop:6,borderTop:'0.5px solid var(--border-md)'}}>
                        {desc > 0 && (
                          <>
                            <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'var(--text2)',marginBottom:3}}>
                              <span>Subtotal</span><span>{fmtM(c.total)}</span>
                            </div>
                            <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#E24B4A',marginBottom:4}}>
                              <span>🏷 Descuento</span><span>−{fmtM(desc)}</span>
                            </div>
                          </>
                        )}
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:13,fontWeight:700,borderTop: desc>0 ? '0.5px solid var(--border-md)' : 'none',paddingTop: desc>0 ? 4 : 0}}>
                          <span>{desc > 0 ? 'TOTAL COBRADO' : 'TOTAL'}</span>
                          <span style={{color:'#1D9E75'}}>{fmtM(totalCobrado)}</span>
                        </div>
                      </div>
                      {/* Botones acción */}
                      <div style={{display:'flex',gap:8,marginTop:10}}>
                        {role==='admin' && (
                          <button onClick={()=>{setAddingTo(c);setAddItems([{producto:'',categoria:'',unidades:1,importe:''}])}}
                            style={{flex:1,padding:'7px 0',borderRadius:'var(--r-md)',border:'1.5px solid var(--accent)',background:'transparent',color:'var(--accent)',cursor:'pointer',fontSize:12,fontWeight:600}}>
                            ⊕ Agregar producto
                          </button>
                        )}
                        <button onClick={()=>reimprimirTicket(c)}
                          style={{flex:1,padding:'7px 0',borderRadius:'var(--r-md)',border:'1.5px solid #378ADD',background:'transparent',color:'#378ADD',cursor:'pointer',fontSize:12,fontWeight:600}}>
                          🖨 Reimprimir
                        </button>
                        <button onClick={()=>{setWaFolio(c);setWaMesa(c.cliente?.replace(/[^0-9]/g,'')||'')}}
                          style={{flex:1,padding:'7px 0',borderRadius:'var(--r-md)',border:'1.5px solid #25D366',background:'transparent',color:'#25D366',cursor:'pointer',fontSize:12,fontWeight:600}}>
                          📱 WhatsApp
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )})}
              {comandas.length===0 && <div style={{textAlign:'center',color:'var(--text3)',padding:'30px 0',fontSize:12}}>Sin ventas en este período</div>}
            </div>
        }
      </div>
      </>}
    </div>
  )
}
