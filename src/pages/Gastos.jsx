import React, { useState, useEffect, useCallback } from 'react'
import { Bar } from 'react-chartjs-2'
import { Chart, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js'
import { sb } from '../lib/supabase.js'
import PeriodSwitcher from '../components/PeriodSwitcher.jsx'
import { getRangoFechas } from '../lib/analytics.js'

Chart.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const fmtM = v => '$' + Math.round(v || 0).toLocaleString('es-MX')
const today = () => new Date().toISOString().slice(0,10)

const CUENTAS = [
  { grupo:'6100 Costos variables', subs:[
    { codigo:'6101', nombre:'Gas',                       isr:'Si 100%', iva:'Si 16%', comp:'CFDI' },
    { codigo:'6102', nombre:'Envios y estacionamientos', isr:'Si 100%', iva:'Si 16%', comp:'Ticket' },
    { codigo:'6103', nombre:'Coca-Agua-Smoothies-Cafe',  isr:'Si 100%', iva:'Si 16%', comp:'Ticket' },
    { codigo:'6104', nombre:'Carne, Huevo, Queso',       isr:'Si 100%', iva:'Si 16%', comp:'Ticket' },
    { codigo:'6105', nombre:'Bodeguita (Super)',          isr:'Si 100%', iva:'Si 16%', comp:'Ticket' },
    { codigo:'6106', nombre:'Masa',                      isr:'Si 100%', iva:'Si 16%', comp:'Ticket' },
    { codigo:'6107', nombre:'Tortillas-Totopos-Reposteria',isr:'Si 100%',iva:'Si 16%', comp:'Ticket' },
    { codigo:'6108', nombre:'Plasticos',                 isr:'Si 100%', iva:'Si 16%', comp:'Ticket' },
    { codigo:'6109', nombre:'Semillas-Chiles-Legumbres', isr:'Si 100%', iva:'Si 16%', comp:'Ticket' },
  ]},
  { grupo:'6200 Gastos de Op y Mtto', subs:[
    { codigo:'6201', nombre:'Ferreteria',                isr:'Si 100%', iva:'Si 16%', comp:'Ticket' },
    { codigo:'6202', nombre:'Papeleria y Equipos',       isr:'Si 100%', iva:'Si 16%', comp:'CFDI'   },
    { codigo:'6203', nombre:'Reparaciones y Mtto',       isr:'Si 100%', iva:'Si 16%', comp:'CFDI'   },
  ]},
  { grupo:'6300 Gastos de ventas', subs:[
    { codigo:'6301', nombre:'Taxes / Comisiones plat.',  isr:'Si 100%', iva:'Si 16%', comp:'CFDI'   },
    { codigo:'6302', nombre:'Digital y BTL',             isr:'Si 100%', iva:'Si 16%', comp:'CFDI'   },
  ]},
  { grupo:'6400 Servicios', subs:[
    { codigo:'6401', nombre:'Internet-Telefono',         isr:'Si 100%', iva:'Si 16%', comp:'CFDI'   },
    { codigo:'6402', nombre:'Agua y Luz',                isr:'Si 100%', iva:'Si 16%', comp:'CFDI'   },
    { codigo:'6403', nombre:'Renta',                     isr:'Si 100%', iva:'Si 16%', comp:'CFDI'   },
  ]},
  { grupo:'6500 Salarios y Bonos', subs:[
    { codigo:'6501', nombre:'Tere',                      isr:'Si 100%', iva:'No acred.', comp:'Recibo' },
    { codigo:'6502', nombre:'Consuelo',                  isr:'Si 100%', iva:'No acred.', comp:'Recibo' },
    { codigo:'6503', nombre:'Ale-Fer',                   isr:'Si 100%', iva:'No acred.', comp:'Recibo' },
    { codigo:'6504', nombre:'Gastos Equipo',             isr:'Si 100%', iva:'No acred.', comp:'Recibo' },
  ]},
  { grupo:'6600 Pago Prestamos', subs:[
    { codigo:'6601', nombre:'Pago Prestamo Uber',        isr:'No',      iva:'No acred.', comp:'Transfer', prestamo_id:'uber' },
    { codigo:'6602', nombre:'Pago Prestamo FMV1',        isr:'No',      iva:'No acred.', comp:'Transfer', prestamo_id:'fmv1' },
    { codigo:'6603', nombre:'Pago Prestamo FMR1',        isr:'No',      iva:'No acred.', comp:'Transfer', prestamo_id:'fmr1' },
    { codigo:'6604', nombre:'Pago Prestamo FMR2',        isr:'No',      iva:'No acred.', comp:'Transfer', prestamo_id:'fmr2' },
    { codigo:'6605', nombre:'Pago Prestamo FMR3',        isr:'No',      iva:'No acred.', comp:'Transfer', prestamo_id:'fmr3' },
  ]},
  { grupo:'6700 Pago de Ganancias', subs:[
    { codigo:'6701', nombre:'Socio 1 (Memo)',           isr:'Si 100%', iva:'No acred.', comp:'Recibo', socio_id:'Socio 1' },
    { codigo:'6702', nombre:'Socio 2 (Monica)',         isr:'Si 100%', iva:'No acred.', comp:'Recibo', socio_id:'Socio 2' },
  ]},
  { grupo:'9900 Ajustes contables', subs:[
    { codigo:'9901', nombre:'Ajuste contable',          isr:'No',      iva:'No acred.', comp:'N/A' },
  ]},
]

// Normaliza cualquier variante de categoría a su forma canónica (case-insensitive)
const normCat = cat => {
  const k = (cat||'').trim().toLowerCase()
  if (k==='costo'||k==='costos')                                return 'COSTOS'
  if (k==='gasto de ventas'||k==='gastos de ventas')            return 'GASTO DE VENTAS'
  if (k==='servicio'||k==='servicios')                          return 'SERVICIOS'
  if (k==='salarios'||k==='salarios y bonos'||k==='salarios & bonos') return 'SALARIOS & BONOS'
  if (k.startsWith('gastos de op')||k.startsWith('gastos de oper')) return 'GASTOS DE OPERACIÓN'
  if (k.startsWith('pago prestamo')||k.startsWith('pago de prestamo')) return 'PAGO PRESTAMOS'
  if (k.startsWith('pago de ganancia')||k.startsWith('pago ganancias')) return 'PAGO DE GANANCIAS'
  return cat  // retorna original si ya es canónica o es 'Ajuste caja' etc.
}

const CAT_BADGE = {
  'COSTOS':              'b-red',
  'GASTO DE VENTAS':     'b-amber',
  'SERVICIOS':           'b-blue',
  'SALARIOS & BONOS':    'b-purple',
  'GASTOS DE OPERACIÓN': 'b-gray',
  'PAGO PRESTAMOS':      'b-purple',
  'PAGO DE GANANCIAS':   'b-green',
  'Ajuste caja':         'b-amber',
}

const EMPTY = () => ({
  fecha: today(), grupo:'', cuenta:'', proveedor_nombre:'', concepto:'',
  cantidad:'', precio_unitario:'', metodo_pago:'Efectivo', notas:'', folio:'',
  _autoFilled: false,   // flag interno — no se guarda en BD
})

export default function Gastos({ role }) {
  const [rango,       setRango]       = useState('mes')
  const [granularidad,setGranularidad]= useState('diario')
  const [rangoDesde,  setRangoDesde]  = useState('')
  const [rangoHasta,  setRangoHasta]  = useState('')
  const [rows,      setRows]      = useState([])
  const [provs,     setProvs]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [form,      setForm]      = useState(EMPTY())
  const [subCtas,   setSubCtas]   = useState([])
  const [deletingId,setDeletingId]= useState(null)
  const [msgDel,    setMsgDel]    = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editRow,   setEditRow]   = useState({})
  const [ctaData,   setCtaData]   = useState(null)
  const [msg,       setMsg]       = useState(null)
  const [filCat,       setFilCat]       = useState('')
  const [filPago,      setFilPago]      = useState('')
  const [filBusca,     setFilBusca]     = useState('')
  const [filSoloDup,   setFilSoloDup]   = useState(false)
  const [dupSnapshot,  setDupSnapshot]  = useState(null)

  const [filSinSub,      setFilSinSub]      = useState(false)
  const [sinSubTotal,    setSinSubTotal]    = useState(0)
  const [allSinSubRows,  setAllSinSubRows]  = useState(null)
  const [loadingSinSub,  setLoadingSinSub]  = useState(false)
  const [asignaciones,   setAsignaciones]   = useState({})
  const [asignando,      setAsignando]      = useState(false)
  // Sin proveedor
  const [filSinProv,     setFilSinProv]     = useState(false)
  const [sinProvTotal,   setSinProvTotal]   = useState(0)
  const [allSinProvRows, setAllSinProvRows] = useState(null)
  const [loadingSinProv, setLoadingSinProv] = useState(false)
  const [asignProv,      setAsignProv]      = useState({})   // { grupoKey: 'Nombre proveedor' }
  const [asignandoProv,  setAsignandoProv]  = useState(false)
  const [tab,            setTab]            = useState('nuevo')
  const [selIds,         setSelIds]         = useState(new Set())  // multi-select gastos
  const [bulkPago,       setBulkPago]       = useState('')
  const [bulkActivo,     setBulkActivo]     = useState(false)
  // Historial completo para autocomplete (todos los periodos)
  const [memoriaHist,    setMemoriaHist]    = useState([])
  // Estado del tab de análisis
  const [anlDim,    setAnlDim]    = useState('categoria')
  const [anlTop,    setAnlTop]    = useState(10)
  const [anlSort,   setAnlSort]   = useState('monto')
  const [anlPago,   setAnlPago]   = useState('')   // '' = todas las formas de pago

  const load = useCallback(async () => {
    if (rango==='rango'&&(!rangoDesde||!rangoHasta)) return
    setLoading(true)
    const { from, to } = getRangoFechas(rango, rangoDesde, rangoHasta)
    // Paginar para superar el límite de 1000 filas del servidor
    const fetchAllGastos = async () => {
      const PAGE = 1000
      let all = [], page = 0, done = false
      while (!done) {
        const { data } = await sb.from('gastos').select('*')
          .gte('fecha', from).lte('fecha', to)
          .order('fecha', { ascending:false })
          .range(page * PAGE, (page + 1) * PAGE - 1)
        if (!data || data.length === 0) break
        all = all.concat(data)
        done = data.length < PAGE
        page++
      }
      return all
    }
    const [gastos, { data: proveedores }] = await Promise.all([
      fetchAllGastos(),
      sb.from('proveedores').select('*').eq('activo', true).order('nombre'),
    ])
    setRows(gastos || [])
    setProvs(proveedores || [])
    setLoading(false)
  }, [rango, rangoDesde, rangoHasta])

  // Carga historial completo de gastos para el autocomplete (una sola vez al montar)
  useEffect(() => {
    sb.from('gastos')
      .select('concepto,cta_gasto,proveedor,metodo_pago')
      .not('concepto', 'is', null)
      .order('fecha', { ascending: false })
      .limit(2000)
      .then(({ data }) => setMemoriaHist(data || []))
  }, [])

  // Conteo global de gastos sin subcuenta (todos los períodos)
  useEffect(() => {
    sb.from('gastos')
      .select('id', { count: 'exact', head: true })
      .or('cta_gasto.is.null,cta_gasto.eq.')
      .then(({ count }) => setSinSubTotal(count || 0))
  }, [rows])

  // Carga TODOS los registros sin subcuenta (todos los períodos) para el panel de asignación
  const loadAllSinSub = useCallback(async () => {
    setLoadingSinSub(true)
    const PAGE = 1000; let all = [], idx = 0, done = false
    while (!done) {
      const { data } = await sb.from('gastos')
        .select('id,fecha,concepto,categoria_gasto,cta_gasto,monto,proveedor')
        .or('cta_gasto.is.null,cta_gasto.eq.')
        .order('fecha', { ascending: false })
        .range(idx, idx + PAGE - 1)
      all = all.concat(data || [])
      if (!data || data.length < PAGE) done = true; else idx += PAGE
    }
    setAllSinSubRows(all)
    setLoadingSinSub(false)
  }, [])

  // Conteo global sin proveedor
  useEffect(() => {
    sb.from('gastos')
      .select('id', { count: 'exact', head: true })
      .or('proveedor.is.null,proveedor.eq.')
      .then(({ count }) => setSinProvTotal(count || 0))
  }, [rows])

  // Carga TODOS los registros sin proveedor (todos los períodos)
  const loadAllSinProv = useCallback(async () => {
    setLoadingSinProv(true)
    const PAGE = 1000; let all = [], idx = 0, done = false
    while (!done) {
      const { data } = await sb.from('gastos')
        .select('id,fecha,concepto,categoria_gasto,cta_gasto,monto,proveedor')
        .or('proveedor.is.null,proveedor.eq.')
        .order('fecha', { ascending: false })
        .range(idx, idx + PAGE - 1)
      all = all.concat(data || [])
      if (!data || data.length < PAGE) done = true; else idx += PAGE
    }
    setAllSinProvRows(all)
    setLoadingSinProv(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Cuando cambia el grupo, cargar subcuentas
  const handleGrupo = (grupo) => {
    const g = CUENTAS.find(c => c.grupo === grupo)
    setSubCtas(g?.subs || [])
    setCtaData(null)
    setForm(f => ({ ...f, grupo, cuenta:'', concepto:'' }))
  }

  const handleCuenta = (codigo) => {
    const all = CUENTAS.flatMap(g => g.subs)
    const c = all.find(x => x.codigo === codigo)
    setCtaData(c || null)
    setForm(f => ({ ...f, cuenta: codigo, concepto: c?.nombre || '' }))
  }

  const monto = () => {
    const cant = parseFloat(form.cantidad) || 0
    const pu   = parseFloat(form.precio_unitario) || 0
    if (cant > 0 && pu > 0) return cant * pu
    if (pu > 0) return pu
    return 0
  }

  const handleSubmit = async () => {
    if (!form.fecha || !form.cuenta || monto() <= 0) {
      setMsg({ ok:false, text:'Fecha, cuenta contable y monto son obligatorios.' }); return
    }
    setSaving(true)
    try {
      // Buscar o crear proveedor
      let proveedor_id = null
      if (form.proveedor_nombre.trim()) {
        const { data: existing } = await sb.from('proveedores').select('id').ilike('nombre', form.proveedor_nombre.trim()).single()
        if (existing) {
          proveedor_id = existing.id
        } else {
          const { data: nuevo } = await sb.from('proveedores').insert({ nombre: form.proveedor_nombre.trim(), activo:true }).select('id').single()
          proveedor_id = nuevo?.id
        }
      }

      const all = CUENTAS.flatMap(g => g.subs)
      const cta = all.find(x => x.codigo === form.cuenta)
      const cat = form.grupo.includes('6100')?'COSTOS':form.grupo.includes('6200')?'GASTOS DE OPERACIÓN':form.grupo.includes('6300')?'GASTO DE VENTAS':form.grupo.includes('6400')?'SERVICIOS':form.grupo.includes('6500')?'SALARIOS & BONOS':form.grupo.includes('6600')?'PAGO PRESTAMOS':form.grupo.includes('6700')?'PAGO DE GANANCIAS':''

      const { error } = await sb.from('gastos').insert({
        fecha:           form.fecha,
        folio_ref:       form.folio || null,
        proveedor_id,
        proveedor:       form.proveedor_nombre || null,
        concepto:        form.concepto,
        categoria_gasto: cat,
        subcategoria_gasto: cat === 'PAGO PRESTAMOS' ? (cta?.prestamo_id || null) : (cat === 'PAGO DE GANANCIAS' ? (cta?.socio_id || null) : null),
        cta_gasto:       form.cuenta + ' - ' + (cta?.nombre || ''),
        metodo_pago:     form.metodo_pago,
        monto:           monto(),
        notas:           form.notas || null,
      })
      if (error) throw error
      setMsg({ ok:true, text:'Gasto registrado correctamente.' })
      setForm(EMPTY()); setSubCtas([]); setCtaData(null)
      load()
    } catch(e) { setMsg({ ok:false, text: e.message }) }
    setSaving(false)
    setTimeout(() => setMsg(null), 4000)
  }

  // Categorías dinámicas — normalizadas para que no aparezcan duplicados por mayúsculas/minúsculas
  const categorias = [...new Set(rows.map(r=>normCat(r.categoria_gasto)).filter(Boolean))].sort()

  // ── Detección de duplicados ──────────────────────────────────
  // Criterio: mismo fecha + monto + concepto (case-insensitive)
  const dupGastosMap = {}
  rows.forEach(r => {
    const k = `${r.fecha}|${r.monto}|${(r.concepto||'').toLowerCase().trim()}`
    dupGastosMap[k] = (dupGastosMap[k]||0) + 1
  })
  const dupGastosSet = new Set(Object.keys(dupGastosMap).filter(k => dupGastosMap[k] > 1))
  const isDupGasto = r => (dupSnapshot || dupGastosSet).has(`${r.fecha}|${r.monto}|${(r.concepto||'').toLowerCase().trim()}`)
  const dupCount = rows.filter(isDupGasto).length

  // Filtros
  const q = filBusca.toLowerCase()
  const filtered = rows
    .filter(r => !filCat || normCat(r.categoria_gasto) === filCat)
    .filter(r => !q ||
      (r.concepto||'').toLowerCase().includes(q) ||
      (r.proveedor||'').toLowerCase().includes(q) ||
      (r.cta_gasto||'').toLowerCase().includes(q) ||
      (r.notas||'').toLowerCase().includes(q))
    .filter(r => !filSoloDup || (dupSnapshot || dupGastosSet).has(`${r.fecha}|${r.monto}|${(r.concepto||'').toLowerCase().trim()}`))
    .filter(r => !filPago || (r.metodo_pago||'').toLowerCase().includes(filPago.toLowerCase()))
    .filter(r => !filSinSub || !r.cta_gasto)
    .filter(r => !filSinProv || !r.proveedor)

  const totalFiltrado = filtered.reduce((s,r) => s+(r.monto||0), 0)

  // Totales por método de pago (sobre el conjunto filtrado)
  const totGasEfectivo   = filtered.filter(r=>r.metodo_pago==='Efectivo').reduce((s,r)=>s+(r.monto||0),0)
  const totGasTarjeta    = filtered.filter(r=>(r.metodo_pago||'').toLowerCase().includes('tarjeta')).reduce((s,r)=>s+(r.monto||0),0)
  const totGasPlataforma = filtered.filter(r=>r.metodo_pago==='Plataforma').reduce((s,r)=>s+(r.monto||0),0)
  const totGasOtros      = totalFiltrado - totGasEfectivo - totGasTarjeta - totGasPlataforma

  // Resumen por categoría (sobre el conjunto filtrado), con desglose por método de pago
  const porCatFilt = {}
  filtered.forEach(r => {
    const c = normCat(r.categoria_gasto) || 'Sin cat.'
    if (!porCatFilt[c]) porCatFilt[c] = { total: 0, efectivo: 0, tarjeta: 0, otros: 0 }
    porCatFilt[c].total    += r.monto || 0
    if (r.metodo_pago === 'Efectivo') porCatFilt[c].efectivo += r.monto || 0
    else if ((r.metodo_pago||'').toLowerCase().includes('tarjeta')) porCatFilt[c].tarjeta += r.monto || 0
    else porCatFilt[c].otros += r.monto || 0
  })

  // Resumen por categoria — agrupado con nombres normalizados
  const porCat = {}
  rows.forEach(r => {
    const c = normCat(r.categoria_gasto) || 'Sin cat.'
    porCat[c] = (porCat[c] || 0) + (r.monto || 0)
  })
  const totalPeriod = rows.reduce((s,r) => s+(r.monto||0), 0)

  // ── Sin subcuenta ─────────────────────────────────────────────
  const sinSubCount = rows.filter(r => !r.cta_gasto).length

  // Agrupar registros SIN subcuenta por concepto + categoria (usa allSinSubRows = todos los períodos)
  const gruposSinSub = React.useMemo(() => {
    const source = allSinSubRows || rows.filter(r => !r.cta_gasto)
    const map = {}
    source.forEach(r => {
      const key = `${normCat(r.categoria_gasto)||'Sin cat'}|||${r.concepto||'Sin concepto'}`
      if (!map[key]) map[key] = {
        key,
        concepto:  r.concepto || 'Sin concepto',
        categoria: normCat(r.categoria_gasto) || 'Sin cat',
        ids:       [],
        monto:     0,
      }
      map[key].ids.push(r.id)
      map[key].monto += r.monto || 0
    })
    return Object.values(map).sort((a,b) => b.ids.length - a.ids.length)
  }, [rows])

  // Lista plana de todas las subcuentas del catálogo
  const todasLasCuentas = React.useMemo(() =>
    CUENTAS.flatMap(g => g.subs.map(s => ({
      codigo: s.codigo,
      nombre: s.nombre,
      grupo:  g.grupo,
      label:  `${s.codigo} — ${s.nombre}`,
      value:  `${s.codigo} - ${s.nombre}`,
    })))
  , [])

  // Asignar subcuenta en bloque a un grupo
  const asignarGrupo = async (grupo) => {
    const cta = asignaciones[grupo.key]
    if (!cta) return
    setAsignando(true)
    try {
      const { error } = await sb.from('gastos').update({ cta_gasto: cta }).in('id', grupo.ids)
      if (error) throw error
      // Actualizar en rows (período actual)
      setRows(prev => prev.map(r => grupo.ids.includes(r.id) ? { ...r, cta_gasto: cta } : r))
      // Quitar de allSinSubRows
      setAllSinSubRows(prev => prev ? prev.filter(r => !grupo.ids.includes(r.id)) : prev)
      setAsignaciones(prev => { const n = {...prev}; delete n[grupo.key]; return n })
      setMsgDel({ ok:true, text:`✓ ${grupo.ids.length} registro${grupo.ids.length>1?'s':''} actualizados` })
      setTimeout(()=>setMsgDel(null), 4000)
    } catch(e) { setMsgDel({ ok:false, text:'Error: '+e.message }) }
    setAsignando(false)
  }

  // Asignar TODOS los grupos de un tirón
  const asignarTodos = async () => {
    const gruposConAsignacion = gruposSinSub.filter(g => asignaciones[g.key])
    if (!gruposConAsignacion.length) return
    setAsignando(true)
    const results = await Promise.all(
      gruposConAsignacion.map(g =>
        sb.from('gastos').update({ cta_gasto: asignaciones[g.key] }).in('id', g.ids)
          .then(({ error }) => ({ g, error }))
      )
    )
    let ok = 0, err = 0, allIds = []
    for (const { g, error } of results) {
      if (error) err++
      else {
        ok += g.ids.length; allIds = allIds.concat(g.ids)
        setRows(prev => prev.map(r => g.ids.includes(r.id) ? { ...r, cta_gasto: asignaciones[g.key] } : r))
      }
    }
    setAllSinSubRows(prev => prev ? prev.filter(r => !allIds.includes(r.id)) : prev)
    setAsignaciones({})
    setMsgDel({ ok: err===0, text: `✓ ${ok} registros actualizados${err>0?` · ${err} errores`:''}` })
    setTimeout(()=>setMsgDel(null), 5000)
    setAsignando(false)
  }

  // ── Proveedores en bloque ──────────────────────────────────────
  // Agrupar por concepto + categoria para asignar proveedor
  const gruposSinProv = React.useMemo(() => {
    const source = allSinProvRows || rows.filter(r => !r.proveedor)
    const map = {}
    source.forEach(r => {
      const key = `${normCat(r.categoria_gasto)||'Sin cat'}|||${r.concepto||'Sin concepto'}`
      if (!map[key]) map[key] = {
        key,
        concepto:  r.concepto || 'Sin concepto',
        categoria: normCat(r.categoria_gasto) || 'Sin cat',
        ids:       [],
        monto:     0,
      }
      map[key].ids.push(r.id)
      map[key].monto += r.monto || 0
    })
    return Object.values(map).sort((a,b) => b.ids.length - a.ids.length)
  }, [allSinProvRows, rows])

  const asignarProvGrupo = async (grupo) => {
    const prov = (asignProv[grupo.key] || '').trim()
    if (!prov) return
    setAsignandoProv(true)
    try {
      const { error } = await sb.from('gastos').update({ proveedor: prov }).in('id', grupo.ids)
      if (error) throw error
      setRows(prev => prev.map(r => grupo.ids.includes(r.id) ? { ...r, proveedor: prov } : r))
      setAllSinProvRows(prev => prev ? prev.filter(r => !grupo.ids.includes(r.id)) : prev)
      setAsignProv(prev => { const n = {...prev}; delete n[grupo.key]; return n })
      setMsgDel({ ok:true, text:`✓ ${grupo.ids.length} registro${grupo.ids.length>1?'s':''} — proveedor "${prov}" asignado` })
      setTimeout(()=>setMsgDel(null), 4000)
    } catch(e) { setMsgDel({ ok:false, text:'Error: '+e.message }) }
    setAsignandoProv(false)
  }

  const asignarProvTodos = async () => {
    const gruposConProv = gruposSinProv.filter(g => (asignProv[g.key]||'').trim())
    if (!gruposConProv.length) return
    setAsignandoProv(true)
    let ok = 0, err = 0, allIds = []
    for (const g of gruposConProv) {
      const prov = asignProv[g.key].trim()
      const { error } = await sb.from('gastos').update({ proveedor: prov }).in('id', g.ids)
      if (error) err++
      else {
        ok += g.ids.length; allIds = allIds.concat(g.ids)
        setRows(prev => prev.map(r => g.ids.includes(r.id) ? { ...r, proveedor: prov } : r))
      }
    }
    setAllSinProvRows(prev => prev ? prev.filter(r => !allIds.includes(r.id)) : prev)
    setAsignProv({})
    setMsgDel({ ok: err===0, text: `✓ ${ok} registros actualizados${err>0?` · ${err} errores`:''}` })
    setTimeout(()=>setMsgDel(null), 5000)
    setAsignandoProv(false)
  }

  // ── Auto-asignación inteligente ────────────────────────────────
  // Palabras clave para mapear concepto → subcuenta del catálogo CUENTAS
  const KEYWORD_SUBCUENTA = [
    { kw:['got gas','gas lp','gas natural','estufas gas','gas doméstico','gas domestico','tanque','recarga gas'],
      value:'6101 - Gas' },
    { kw:['envio','envío','estacion','estacionamiento','gasolina','taxi','uber','flete','mensajeria'],
      value:'6102 - Envios y estacionamientos' },
    { kw:['coca','cocacola','cola','smoothie','jugo','cafe de olla','agua de tetra','refresco'],
      value:'6103 - Coca-Agua-Smoothies-Cafe' },
    { kw:['carne','res','cerdo','pollo','pescado','huevo','queso','jamon','chorizo','tocino','costilla'],
      value:'6104 - Carne, Huevo, Queso' },
    { kw:['bodeg','super','walmart','soriana','chedraui','costco','sam\'s','aurrera','frutas','verduras','abarrotes'],
      value:'6105 - Bodeguita (Super)' },
    { kw:['masa','nixtamal'],
      value:'6106 - Masa' },
    { kw:['tortilla','totopos','tostada','tlayuda','pan','bollería','reposteria','pastel'],
      value:'6107 - Tortillas-Totopos-Reposteria' },
    { kw:['plastico','unicel','bolsa','vaso','plato','cubierto','tenedor','cuchara','servilleta','hule','empaque'],
      value:'6108 - Plasticos' },
    { kw:['semilla','chile','legumbre','frijol','lenteja','garbanzo','haba','epazote','cilantro','especias'],
      value:'6109 - Semillas-Chiles-Legumbres' },
    { kw:['ferreteria','tornillo','clavo','pintura','perno','herramienta','soldadura'],
      value:'6201 - Ferreteria' },
    { kw:['papeleria','computadora','impresora','toner','cartucho','papel','cuaderno','lapiz'],
      value:'6202 - Papeleria y Equipos' },
    { kw:['reparacion','mantenimiento','plomero','electricista','albañil','carpintero','mtto','servicio tecnico','refaccion'],
      value:'6203 - Reparaciones y Mtto' },
    { kw:['comision plat','tax uber','comision uber','comision didi','comision rappi','clip','cobro plat'],
      value:'6301 - Taxes / Comisiones plat.' },
    { kw:['facebook','instagram','publicidad','digital','marketing','redes sociales','btl','volante','diseño'],
      value:'6302 - Digital y BTL' },
    { kw:['internet','telcel','telmex','movistar','att','izzi','megacable','telefono','cel','plan datos'],
      value:'6401 - Internet-Telefono' },
    { kw:['luz','cfe','agua','aguapotable','potable','alcantarilla','gas natural','servicio basico'],
      value:'6402 - Agua y Luz' },
    { kw:['renta','arrendamiento','local','inmueble','mensualidad local'],
      value:'6403 - Renta' },
    { kw:['tere','teresa','salario tere'],          value:'6501 - Tere' },
    { kw:['consuelo','sueldo consuelo'],             value:'6502 - Consuelo' },
    { kw:['ale','alejandra','fer','fernanda','nomina equipo','sueldo'],
      value:'6503 - Ale-Fer' },
    { kw:['gasto equipo','gasto personal','gasto operativo equipo'],
      value:'6504 - Gastos Equipo' },
    { kw:['prestamo uber','pago uber','abono uber'],
      value:'6601 - Pago Prestamo Uber' },
    { kw:['prestamo fmv1','pago fmv1','abono fmv1'], value:'6602 - Pago Prestamo FMV1' },
    { kw:['prestamo fmr1','pago fmr1'],              value:'6603 - Pago Prestamo FMR1' },
    { kw:['prestamo fmr2','pago fmr2'],              value:'6604 - Pago Prestamo FMR2' },
    { kw:['prestamo fmr3','pago fmr3'],              value:'6605 - Pago Prestamo FMR3' },
    { kw:['ganancia socio 1','pago memo','retiro memo','utilidad socio 1'],
      value:'6701 - Socio 1 (Memo)' },
    { kw:['ganancia socio 2','pago monica','retiro monica','utilidad socio 2'],
      value:'6702 - Socio 2 (Monica)' },
  ]

  // ── Memoria inteligente de conceptos ─────────────────────────────
  // Construye un mapa concepto→datos desde el historial de gastos cargado.
  // Para cada concepto guarda la combinación más frecuente de cuenta/proveedor/pago.
  // Usa memoriaHist (todos los períodos) para que el autocomplete funcione siempre.
  const conceptoMemoria = React.useMemo(() => {
    const map = {}
    // Combina historial completo + registros del periodo actual (por si hay nuevos)
    const fuente = memoriaHist.length > 0 ? memoriaHist : rows
    fuente.forEach(r => {
      if (!r.concepto?.trim()) return
      const key = r.concepto.trim().toLowerCase()
      if (!map[key]) {
        map[key] = {
          concepto:    r.concepto.trim(),
          cta_gasto:   r.cta_gasto   || '',
          proveedor:   r.proveedor   || '',
          metodo_pago: r.metodo_pago || '',
          count: 0,
        }
      }
      map[key].count++
      // Preferir los valores más recientes si todavía vacíos
      if (!map[key].cta_gasto   && r.cta_gasto)   map[key].cta_gasto   = r.cta_gasto
      if (!map[key].proveedor   && r.proveedor)    map[key].proveedor   = r.proveedor
      if (!map[key].metodo_pago && r.metodo_pago)  map[key].metodo_pago = r.metodo_pago
    })
    return map
  }, [memoriaHist, rows])

  // Sugerencias activas para el dropdown del campo concepto
  const [conceptoSugs, setConceptoSugs] = useState([])
  const [showSugs,     setShowSugs]     = useState(false)

  // Cuando el usuario escribe en el campo Concepto → busca en la memoria
  const handleConcepto = (val) => {
    setForm(f => ({ ...f, concepto: val, _autoFilled: false }))
    if (val.length >= 2) {
      const q = val.toLowerCase()
      const matches = Object.values(conceptoMemoria)
        .filter(m => m.concepto.toLowerCase().includes(q))
        .sort((a, b) => {
          // Prioridad: empieza-con > contiene, luego más frecuente
          const aStarts = a.concepto.toLowerCase().startsWith(q)
          const bStarts = b.concepto.toLowerCase().startsWith(q)
          if (aStarts && !bStarts) return -1
          if (!aStarts && bStarts) return 1
          return b.count - a.count
        })
        .slice(0, 7)
      setConceptoSugs(matches)
      setShowSugs(matches.length > 0)
    } else {
      setShowSugs(false)
      setConceptoSugs([])
    }
  }

  // Aplica una entrada del historial al formulario (llena grupo, cuenta, proveedor, pago)
  const aplicarMemoria = (mem) => {
    let newGrupo = form.grupo
    let newCuenta = form.cuenta
    let newSubCtas = subCtas
    let newCtaData = ctaData

    if (mem.cta_gasto) {
      // cta_gasto tiene formato "6101 - Gas" → extraer código
      const code = mem.cta_gasto.split(' - ')[0]?.trim()
      for (const g of CUENTAS) {
        const sub = g.subs.find(s => s.codigo === code)
        if (sub) {
          newGrupo   = g.grupo
          newCuenta  = sub.codigo
          newSubCtas = g.subs
          newCtaData = sub
          break
        }
      }
    }

    setSubCtas(newSubCtas)
    setCtaData(newCtaData)
    setForm(f => ({
      ...f,
      concepto:        mem.concepto,
      grupo:           newGrupo,
      cuenta:          newCuenta,
      proveedor_nombre: mem.proveedor   || f.proveedor_nombre,
      metodo_pago:     mem.metodo_pago  || f.metodo_pago,
      _autoFilled:     true,
    }))
    setShowSugs(false)
    setConceptoSugs([])
  }

  // autoPreview: un grupo por concepto — cada fila afecta TODOS los registros con ese concepto
  // { key, concepto, categoria, ids, count, monto, subEdit, provEdit, checked }
  const [autoGroups,   setAutoGroups]   = useState(null)
  const [autoModal,    setAutoModal]    = useState(false)
  const [aplicandoAuto,setAplicandoAuto]= useState(false)

  const matchSub = (concepto) => {
    const c = (concepto || '').toLowerCase()
    for (const entry of KEYWORD_SUBCUENTA) {
      if (entry.kw.some(kw => c.includes(kw))) return entry.value
    }
    for (const g of CUENTAS) {
      for (const s of g.subs) {
        const palabras = s.nombre.toLowerCase().split(/[\-,\s]+/).filter(w => w.length > 3)
        if (palabras.some(p => c.includes(p))) return `${s.codigo} - ${s.nombre}`
      }
    }
    return ''
  }

  const matchProv = (concepto) => {
    const c = (concepto || '').toLowerCase()
    for (const prov of provs) {
      const pw = prov.nombre.toLowerCase().split(/\s+/).filter(w => w.length > 2)
      if (pw.length > 0 && pw.every(w => c.includes(w))) return prov.nombre
      if (pw.some(w => w.length > 3 && c.includes(w))) return prov.nombre
    }
    return ''
  }

  const generarAutoSuggestions = useCallback(async () => {
    setAplicandoAuto(true)
    const PAGE = 1000; let all = [], idx = 0, done = false
    while (!done) {
      const { data } = await sb.from('gastos')
        .select('id,concepto,categoria_gasto,cta_gasto,proveedor,monto')
        .or('cta_gasto.is.null,cta_gasto.eq.,proveedor.is.null,proveedor.eq.')
        .order('fecha', { ascending: false })
        .range(idx, idx + PAGE - 1)
      all = all.concat(data || [])
      if (!data || data.length < PAGE) done = true; else idx += PAGE
    }
    setAplicandoAuto(false)

    // Agrupar por concepto normalizado
    const map = {}
    for (const r of all) {
      const key = (r.concepto || 'Sin concepto').trim().toLowerCase()
      if (!map[key]) {
        map[key] = {
          key,
          concepto:   (r.concepto || 'Sin concepto').trim(),
          categoria:  normCat(r.categoria_gasto) || 'Sin cat',
          ids:        [],
          idsSinSub:  [],  // solo los que aún no tienen subcuenta
          idsSinProv: [],  // solo los que aún no tienen proveedor
          count:      0,
          monto:      0,
          subEdit:    matchSub(r.concepto),
          provEdit:   matchProv(r.concepto),
          checked:    true,
        }
      }
      map[key].ids.push(r.id)
      if (!r.cta_gasto)  map[key].idsSinSub.push(r.id)
      if (!r.proveedor)  map[key].idsSinProv.push(r.id)
      map[key].count++
      map[key].monto += r.monto || 0
    }

    const groups = Object.values(map)
      .filter(g => g.idsSinSub.length > 0 || g.idsSinProv.length > 0)
      .sort((a, b) => b.count - a.count)

    setAutoGroups(groups)
    setAutoModal(true)
  }, [provs])

  const aplicarAutoSuggestions = async () => {
    if (!autoGroups) return
    setAplicandoAuto(true)
    const sel = autoGroups.filter(g => g.checked)
    let okRec = 0, err = 0
    for (const g of sel) {
      // Subcuenta: solo actualizar los registros sin subcuenta
      if (g.subEdit.trim() && g.idsSinSub.length > 0) {
        const { error } = await sb.from('gastos').update({ cta_gasto: g.subEdit.trim() }).in('id', g.idsSinSub)
        if (error) err++
        else {
          okRec += g.idsSinSub.length
          setRows(prev => prev.map(r => g.idsSinSub.includes(r.id) ? { ...r, cta_gasto: g.subEdit.trim() } : r))
        }
      }
      // Proveedor: solo actualizar los registros sin proveedor
      if (g.provEdit.trim() && g.idsSinProv.length > 0) {
        const { error } = await sb.from('gastos').update({ proveedor: g.provEdit.trim() }).in('id', g.idsSinProv)
        if (error) err++
        else {
          okRec += g.idsSinProv.length
          setRows(prev => prev.map(r => g.idsSinProv.includes(r.id) ? { ...r, proveedor: g.provEdit.trim() } : r))
        }
      }
    }
    setAutoModal(false); setAutoGroups(null)
    setAllSinSubRows(null); setAllSinProvRows(null)
    setMsgDel({ ok: err===0, text:`✓ ${okRec} registros actualizados${err>0?` · ${err} errores`:''}` })
    setTimeout(()=>setMsgDel(null), 6000)
    setAplicandoAuto(false)
  }

  const f = form

  // Normalización de categorías — usa ILIKE (case-insensitive) directo en BD, sin leer primero
  const unificarCategorias = async () => {
    if (!window.confirm('¿Normalizar todas las categorías de gastos a las formas canónicas? Esta acción modifica múltiples registros en la base de datos.')) return
    // Cada entrada: [canónica, [patrones a buscar con ilike]]
    const GRUPOS = [
      ['COSTOS',              ['costo', 'costos']],
      ['GASTO DE VENTAS',     ['gasto de ventas', 'gastos de ventas']],
      ['SERVICIOS',           ['servicio', 'servicios']],
      ['SALARIOS & BONOS',    ['salarios', 'salarios y bonos', 'salarios & bonos']],
      ['GASTOS DE OPERACIÓN', ['gastos de op%', 'gastos de operacion%']],
      ['PAGO PRESTAMOS',      ['pago prestamo%', 'pago de prestamo%']],
      ['PAGO DE GANANCIAS',   ['pago de ganancia%', 'pago ganancias%']],
    ]
    let total = 0
    const errores = []
    for (const [canonical, patterns] of GRUPOS) {
      for (const pat of patterns) {
        const { data: upd, error } = await sb.from('gastos')
          .update({ categoria_gasto: canonical })
          .ilike('categoria_gasto', pat)
          .neq('categoria_gasto', canonical)
          .select('id')
        if (error) errores.push(error.message)
        else total += (upd||[]).length
      }
    }
    await load()
    if (errores.length > 0) {
      setMsgDel({ok:false, text:'Errores: '+errores.join(', ')})
    } else {
      setMsgDel({ok:true, text: total > 0
        ? `✓ ${total} registros normalizados a categorías canónicas`
        : '✓ Sin cambios — ya estaban unificadas'})
    }
    setTimeout(()=>setMsgDel(null), 6000)
  }

  return (
    <div>
      {role==='viewer' && (
        <div style={{padding:'8px 14px',borderRadius:'var(--r-md)',marginBottom:12,background:'#EAF3DE',color:'#3B6D11',fontSize:12}}>
          Modo solo lectura — solo puedes ver los datos, no modificarlos.
        </div>
      )}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:8 }}>
        <PeriodSwitcher rango={rango} granularidad={granularidad}
          onRango={setRango} onGranularidad={setGranularidad}
          rangoDesde={rangoDesde} rangoHasta={rangoHasta}
          onRangoChange={(d,h)=>{setRangoDesde(d);setRangoHasta(h)}}/>
        <div style={{ display:'flex', gap:6 }}>
          {role!=='viewer' && <button className={`psw-btn${tab==='nuevo'?' on':''}`} onClick={()=>setTab('nuevo')}>+ Nuevo gasto</button>}
          <button className={`psw-btn${tab==='historial'?' on':''}`} onClick={()=>setTab('historial')}>Historial</button>
          <button className={`psw-btn${tab==='analisis'?' on':''}`} onClick={()=>setTab('analisis')}>📊 Análisis</button>
        </div>
      </div>

      {tab === 'nuevo' && (
        <div className="two">
          {/* FORMULARIO */}
          <div className="card">
            <div className="ct" style={{ marginBottom:14 }}>Registrar gasto</div>
            {msg && <div style={{ padding:'8px 12px', borderRadius:'var(--r-sm)', marginBottom:10,
              background:msg.ok?'#EAF3DE':'#FCEBEB', color:msg.ok?'#3B6D11':'#A32D2D', fontSize:12 }}>{msg.text}</div>}

            <div className="fgrid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>

              {/* ── CONCEPTO — va PRIMERO con autocomplete inteligente ── */}
              <div className="form-group full" style={{ gridColumn:'1/-1', position:'relative' }}>
                <div className="form-label" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span>Concepto del gasto</span>
                  {f._autoFilled && (
                    <span style={{ fontSize:10, fontWeight:600, color:'#1D9E75',
                      background:'#EAF3DE', padding:'2px 8px', borderRadius:99 }}>
                      ✨ Auto-completado desde historial
                    </span>
                  )}
                </div>
                <input
                  className="form-input"
                  type="text"
                  placeholder="Escribe el concepto (ej: Gas LP, Renta, Tortillas…)"
                  value={f.concepto}
                  onChange={e => handleConcepto(e.target.value)}
                  onFocus={() => {
                    if (f.concepto.length >= 2 && conceptoSugs.length > 0) setShowSugs(true)
                  }}
                  onBlur={() => setTimeout(() => setShowSugs(false), 160)}
                  autoComplete="off"
                  style={{ borderColor: f._autoFilled ? '#1D9E75' : undefined }}
                />

                {/* Dropdown de sugerencias */}
                {showSugs && conceptoSugs.length > 0 && (
                  <div style={{
                    position:'absolute', top:'100%', left:0, right:0, zIndex:200,
                    background:'var(--surface)',
                    border:'1px solid var(--border-md)',
                    borderRadius:'var(--r-md)',
                    boxShadow:'0 6px 20px rgba(0,0,0,0.15)',
                    marginTop:3, overflow:'hidden',
                  }}>
                    <div style={{ padding:'6px 12px 4px', fontSize:10, color:'var(--text3)',
                      borderBottom:'0.5px solid var(--border)', background:'var(--bg)' }}>
                      💡 Gastos anteriores — clic para auto-rellenar todo
                    </div>
                    {conceptoSugs.map((mem, i) => (
                      <div
                        key={i}
                        onMouseDown={() => aplicarMemoria(mem)}
                        style={{
                          padding:'9px 12px',
                          cursor:'pointer',
                          borderBottom: i < conceptoSugs.length - 1 ? '0.5px solid var(--border)' : 'none',
                          transition:'background 0.1s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <span style={{ fontSize:13, fontWeight:600 }}>{mem.concepto}</span>
                          <span style={{ fontSize:10, color:'var(--text3)',
                            background:'var(--bg)', padding:'1px 6px', borderRadius:99 }}>
                            {mem.count}× usado
                          </span>
                        </div>
                        <div style={{ fontSize:10, color:'var(--text3)', marginTop:3,
                          display:'flex', gap:10, flexWrap:'wrap' }}>
                          {mem.cta_gasto   && <span>📂 {mem.cta_gasto}</span>}
                          {mem.proveedor   && <span>🏪 {mem.proveedor}</span>}
                          {mem.metodo_pago && <span>💳 {mem.metodo_pago}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Fecha */}
              <div className="form-group">
                <div className="form-label">Fecha</div>
                <input className="form-input" type="date" value={f.fecha} onChange={e=>setForm(x=>({...x,fecha:e.target.value}))}/>
              </div>
              {/* Folio */}
              <div className="form-group">
                <div className="form-label">Folio / Referencia</div>
                <input className="form-input" type="text" placeholder="No. factura, ticket..." value={f.folio} onChange={e=>setForm(x=>({...x,folio:e.target.value}))}/>
              </div>

              {/* Grupo contable */}
              <div className="form-group full" style={{ gridColumn:'1/-1' }}>
                <div className="form-label">
                  Grupo contable
                  {!f._autoFilled && <span style={{ fontStyle:'italic', color:'var(--text3)', fontWeight:400 }}> (o escribe el concepto arriba para auto-llenar)</span>}
                </div>
                <select className="form-input" value={f.grupo} onChange={e=>handleGrupo(e.target.value)}
                  style={{ borderColor: f._autoFilled && f.grupo ? '#1D9E75' : undefined }}>
                  <option value="">— Seleccionar grupo —</option>
                  {CUENTAS.map(g=><option key={g.grupo} value={g.grupo}>{g.grupo}</option>)}
                </select>
              </div>

              {/* Subcuenta */}
              {subCtas.length > 0 && (
                <div className="form-group full" style={{ gridColumn:'1/-1' }}>
                  <div className="form-label">Cuenta contable</div>
                  <select className="form-input" value={f.cuenta} onChange={e=>handleCuenta(e.target.value)}
                    style={{ borderColor: f._autoFilled && f.cuenta ? '#1D9E75' : undefined }}>
                    <option value="">— Seleccionar cuenta —</option>
                    {subCtas.map(s=><option key={s.codigo} value={s.codigo}>{s.codigo} — {s.nombre}</option>)}
                  </select>
                </div>
              )}

              {/* Info fiscal auto */}
              {ctaData && (
                <div style={{ gridColumn:'1/-1', background:'var(--bg)', borderRadius:'var(--r-sm)', padding:'8px 12px', display:'flex', gap:16, fontSize:11 }}>
                  <span style={{ color:'var(--text2)' }}>ISR: <b style={{ color:'var(--text)' }}>{ctaData.isr}</b></span>
                  <span style={{ color:'var(--text2)' }}>IVA: <b style={{ color:'var(--text)' }}>{ctaData.iva}</b></span>
                  <span style={{ color:'var(--text2)' }}>Comprobante: <b style={{ color:'var(--text)' }}>{ctaData.comp}</b></span>
                </div>
              )}

              {/* Proveedor */}
              <div className="form-group full" style={{ gridColumn:'1/-1' }}>
                <div className="form-label">Proveedor</div>
                <input className="form-input" type="text" placeholder="Nombre del proveedor (se crea automaticamente si es nuevo)"
                  value={f.proveedor_nombre} onChange={e=>setForm(x=>({...x,proveedor_nombre:e.target.value}))}
                  list="prov-list"
                  style={{ borderColor: f._autoFilled && f.proveedor_nombre ? '#1D9E75' : undefined }}/>
                <datalist id="prov-list">
                  {provs.map(p=><option key={p.id} value={p.nombre}/>)}
                </datalist>
              </div>

              {/* Cantidad y precio */}
              <div className="form-group">
                <div className="form-label">Cantidad <span style={{ color:'var(--text3)', fontWeight:400 }}>(opcional)</span></div>
                <input className="form-input" type="number" placeholder="0" value={f.cantidad} onChange={e=>setForm(x=>({...x,cantidad:e.target.value}))}/>
              </div>
              <div className="form-group">
                <div className="form-label">Precio unitario / Monto total</div>
                <input className="form-input" type="number" placeholder="0.00" value={f.precio_unitario} onChange={e=>setForm(x=>({...x,precio_unitario:e.target.value}))}/>
              </div>

              {/* Monto calculado */}
              {monto() > 0 && (
                <div style={{ gridColumn:'1/-1', background:'var(--bg)', borderRadius:'var(--r-sm)', padding:'8px 12px', display:'flex', justifyContent:'space-between', fontSize:13 }}>
                  <span style={{ color:'var(--text2)' }}>
                    {parseFloat(f.cantidad)>0 ? `${f.cantidad} x ${fmtM(parseFloat(f.precio_unitario))} =` : 'Monto total:'}
                  </span>
                  <span style={{ fontWeight:600, fontSize:15 }}>{fmtM(monto())}</span>
                </div>
              )}

              {/* Forma de pago */}
              <div className="form-group">
                <div className="form-label">Forma de pago</div>
                <select className="form-input" value={f.metodo_pago} onChange={e=>setForm(x=>({...x,metodo_pago:e.target.value}))}
                  style={{ borderColor: f._autoFilled && f.metodo_pago ? '#1D9E75' : undefined }}>
                  <option>Efectivo</option>
                  <option>Tarjeta debito</option>
                  <option>Tarjeta credito</option>
                  <option>Transferencia</option>
                  <option>Transferencia</option>
                </select>
              </div>
              <div className="form-group">
                <div className="form-label">Notas adicionales</div>
                <input className="form-input" type="text" placeholder="Notas opcionales" value={f.notas} onChange={e=>setForm(x=>({...x,notas:e.target.value}))}/>
              </div>
            </div>

            <button className="btn btn-primary" style={{ width:'100%', marginTop:14, padding:10 }}
              onClick={handleSubmit} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar gasto'}
            </button>
          </div>

          {/* RESUMEN */}
          <div>
            <div className="card">
              <div className="ch"><div className="ct">Resumen del periodo</div></div>
              <div className="mc" style={{ marginBottom:10 }}>
                <div className="ml">Total gastos</div>
                <div className="mv">{fmtM(totalPeriod)}</div>
              </div>
              <table className="tbl">
                <thead><tr><th>Categoria</th><th className="num">Total</th><th className="num">%</th></tr></thead>
                <tbody>
                  {Object.entries(porCat).sort((a,b)=>b[1]-a[1]).map(([k,v])=>(
                    <tr key={k}>
                      <td><span className={`badge ${CAT_BADGE[k]||'b-gray'}`}>{k}</span></td>
                      <td className="num">{fmtM(v)}</td>
                      <td className="num c-muted">{totalPeriod>0?Math.round(v/totalPeriod*100):0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Ultimos gastos */}
            <div className="card">
              <div className="ch"><div className="ct">Ultimos registros</div></div>
              <table className="tbl">
                <thead><tr><th>Fecha</th><th>Concepto</th><th className="num">Monto</th></tr></thead>
                <tbody>
                  {rows.slice(0,8).map((r,i)=>(
                    <tr key={i}>
                      <td style={{ fontSize:11, color:'var(--text2)', whiteSpace:'nowrap' }}>{r.fecha}</td>
                      <td style={{ fontSize:12 }}>{r.concepto}</td>
                      <td className="num" style={{ fontWeight:500 }}>{fmtM(r.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal auto-asignación (agrupado por concepto, editable) ── */}
      {autoModal && autoGroups && (
        <div onClick={()=>setAutoModal(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:500,padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'var(--surface)',borderRadius:'var(--r-lg)',padding:24,width:'min(820px,96vw)',maxHeight:'88vh',display:'flex',flexDirection:'column',border:'0.5px solid var(--border-md)'}}>

            {/* Header */}
            <div style={{marginBottom:10,display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:16}}>
              <div>
                <div style={{fontSize:16,fontWeight:700,marginBottom:3}}>🪄 Asignación por concepto</div>
                <div style={{fontSize:11,color:'var(--text3)',lineHeight:1.6}}>
                  Una fila = un concepto = <strong>todos los registros con ese concepto</strong>.<br/>
                  Edita subcuenta o proveedor → aplica a todos. Deja en blanco lo que no quieras cambiar.
                </div>
              </div>
              <div style={{fontSize:11,color:'var(--text3)',textAlign:'right',flexShrink:0}}>
                <div><strong style={{color:'var(--text1)'}}>{autoGroups.length}</strong> conceptos distintos</div>
                <div><strong style={{color:'var(--text1)'}}>{autoGroups.reduce((s,g)=>s+g.count,0)}</strong> registros totales</div>
              </div>
            </div>

            {/* datalist proveedores */}
            <datalist id="dl-provs-auto">
              {provs.map(p=><option key={p.id} value={p.nombre}/>)}
            </datalist>

            {/* Tabla editable con scroll */}
            <div style={{overflowY:'auto',flex:1,marginBottom:14,borderRadius:'var(--r-sm)',border:'0.5px solid var(--border)'}}>
              <table className="tbl" style={{minWidth:680}}>
                <thead style={{position:'sticky',top:0,background:'var(--surface)',zIndex:2}}>
                  <tr>
                    <th style={{width:32}}>
                      <input type="checkbox"
                        checked={autoGroups.length>0 && autoGroups.every(g=>g.checked)}
                        onChange={e=>setAutoGroups(prev=>prev.map(g=>({...g,checked:e.target.checked})))}/>
                    </th>
                    <th>Concepto</th>
                    <th>Cat.</th>
                    <th className="num" style={{whiteSpace:'nowrap'}}># reg</th>
                    <th style={{color:'#166843',minWidth:220}}>🏷 Subcuenta</th>
                    <th style={{color:'#185FA5',minWidth:160}}>🏪 Proveedor</th>
                  </tr>
                </thead>
                <tbody>
                  {autoGroups.map((g,i) => (
                    <tr key={g.key} style={{background:g.checked?undefined:'#00000006',opacity:g.checked?1:0.55,verticalAlign:'middle'}}>
                      {/* Checkbox */}
                      <td style={{textAlign:'center'}}>
                        <input type="checkbox" checked={g.checked}
                          onChange={()=>setAutoGroups(prev=>prev.map((x,j)=>j===i?{...x,checked:!x.checked}:x))}/>
                      </td>
                      {/* Concepto + monto */}
                      <td>
                        <div style={{fontSize:12,fontWeight:600}}>{g.concepto}</div>
                        <div style={{fontSize:10,color:'var(--text3)'}}>{fmtM(g.monto)}</div>
                      </td>
                      {/* Categoría */}
                      <td><span className={`badge ${CAT_BADGE[g.categoria]||'b-gray'}`} style={{fontSize:9}}>{g.categoria}</span></td>
                      {/* Conteo */}
                      <td className="num" style={{fontSize:11}}>
                        <span title={`${g.idsSinSub.length} sin sub · ${g.idsSinProv.length} sin prov`}>
                          {g.count}
                        </span>
                      </td>
                      {/* Subcuenta — select editable */}
                      <td style={{padding:'4px 8px'}}>
                        {g.idsSinSub.length > 0 ? (
                          <select
                            value={g.subEdit || ''}
                            onChange={e=>setAutoGroups(prev=>prev.map((x,j)=>j===i?{...x,subEdit:e.target.value}:x))}
                            style={{width:'100%',padding:'3px 6px',fontSize:10,borderRadius:'var(--r-sm)',
                              border:`1px solid ${g.subEdit?'#1D9E75':'var(--border-md)'}`,
                              background:g.subEdit?'#F0FBF5':'var(--surface)',color:'var(--text1)',cursor:'pointer'}}>
                            <option value="">— sin cambio —</option>
                            {CUENTAS.map(grp=>(
                              <optgroup key={grp.grupo} label={grp.grupo}>
                                {grp.subs.map(s=>(
                                  <option key={s.codigo} value={`${s.codigo} - ${s.nombre}`}>
                                    {s.codigo} — {s.nombre}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        ) : (
                          <span style={{fontSize:10,color:'#1D9E75',padding:'3px 6px'}}>✓ ya asignada</span>
                        )}
                      </td>
                      {/* Proveedor — input editable con autocomplete */}
                      <td style={{padding:'4px 8px'}}>
                        {g.idsSinProv.length > 0 ? (
                          <input
                            list="dl-provs-auto"
                            value={g.provEdit || ''}
                            onChange={e=>setAutoGroups(prev=>prev.map((x,j)=>j===i?{...x,provEdit:e.target.value}:x))}
                            placeholder="Nombre proveedor..."
                            style={{width:'100%',padding:'3px 6px',fontSize:10,borderRadius:'var(--r-sm)',
                              border:`1px solid ${g.provEdit?'#378ADD':'var(--border-md)'}`,
                              background:g.provEdit?'#EBF2FC':'var(--surface)'}}
                          />
                        ) : (
                          <span style={{fontSize:10,color:'#1D9E75',padding:'3px 6px'}}>✓ ya asignado</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {autoGroups.length === 0 && (
                    <tr><td colSpan={6} style={{textAlign:'center',padding:'30px 0',color:'var(--text3)'}}>
                      No hay registros sin subcuenta o proveedor.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Resumen de lo que se va a aplicar */}
            {(() => {
              const sel = autoGroups.filter(g => g.checked)
              const subCount = sel.reduce((s,g)=>s+(g.subEdit.trim()&&g.idsSinSub.length>0?g.idsSinSub.length:0),0)
              const provCount = sel.reduce((s,g)=>s+(g.provEdit.trim()&&g.idsSinProv.length>0?g.idsSinProv.length:0),0)
              return (
                <div style={{fontSize:11,color:'var(--text3)',marginBottom:10}}>
                  {sel.length} grupo{sel.length!==1?'s':''} seleccionados ·{' '}
                  <span style={{color:'#166843',fontWeight:600}}>{subCount} registros</span> recibirán subcuenta ·{' '}
                  <span style={{color:'#185FA5',fontWeight:600}}>{provCount} registros</span> recibirán proveedor
                </div>
              )
            })()}

            {/* Botones */}
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setAutoModal(false)}
                style={{flex:1,padding:10,borderRadius:'var(--r-md)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:13}}>
                Cancelar
              </button>
              <button onClick={aplicarAutoSuggestions} disabled={aplicandoAuto}
                style={{flex:2,padding:10,borderRadius:'var(--r-md)',border:'none',background:'#1D9E75',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700}}>
                {aplicandoAuto?'⏳ Aplicando…':'✓ Aplicar cambios seleccionados'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'historial' && (<>
        {/* ── Asignación en bloque de subcuentas ── */}
        {filSinSub && gruposSinSub.length > 0 && (
          <div className="card" style={{ marginBottom:12, border:'1.5px solid #7F77DD44' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:'#534AB7' }}>
                  📂 Completar subcuentas — {gruposSinSub.length} grupo{gruposSinSub.length>1?'s':''} sin asignar
                </div>
                <div style={{ fontSize:10, color:'var(--text3)', marginTop:3 }}>
                  {allSinSubRows
                    ? `Mostrando ${allSinSubRows.length} registros de todos los períodos.`
                    : 'Cargando…'}{' '}
                  Agrupa por concepto + categoría — elige subcuenta y aplica en un clic.
                </div>
              </div>
              {Object.keys(asignaciones).length > 0 && !asignando && (
                <button onClick={asignarTodos}
                  style={{ padding:'8px 16px', borderRadius:'var(--r-md)', border:'none', background:'#534AB7', color:'#fff', cursor:'pointer', fontSize:12, fontWeight:700, whiteSpace:'nowrap' }}>
                  ✓ Aplicar todos ({Object.keys(asignaciones).length})
                </button>
              )}
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {gruposSinSub.map(g => (
                <div key={g.key} style={{
                  display:'grid', gridTemplateColumns:'1fr 1fr auto',
                  gap:10, alignItems:'center',
                  padding:'10px 12px', borderRadius:'var(--r-sm)',
                  background:'var(--bg)', border:'0.5px solid var(--border)',
                }}>
                  {/* Info del grupo */}
                  <div>
                    <div style={{ fontSize:12, fontWeight:600 }}>{g.concepto}</div>
                    <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>
                      <span className={`badge ${CAT_BADGE[g.categoria]||'b-gray'}`} style={{ fontSize:9 }}>{g.categoria}</span>
                      {' '}· <strong>{g.ids.length}</strong> registro{g.ids.length>1?'s':''} · {fmtM(g.monto)}
                    </div>
                  </div>

                  {/* Selector de subcuenta */}
                  <select
                    className="form-input"
                    value={asignaciones[g.key] || ''}
                    onChange={e => setAsignaciones(prev => ({ ...prev, [g.key]: e.target.value }))}
                    style={{ fontSize:11 }}
                  >
                    <option value="">— Elegir subcuenta —</option>
                    {CUENTAS.map(grupo => (
                      <optgroup key={grupo.grupo} label={grupo.grupo}>
                        {grupo.subs.map(s => (
                          <option key={s.codigo} value={`${s.codigo} - ${s.nombre}`}>
                            {s.codigo} — {s.nombre}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>

                  {/* Botón aplicar solo este grupo */}
                  <button
                    onClick={() => asignarGrupo(g)}
                    disabled={!asignaciones[g.key] || asignando}
                    style={{
                      padding:'6px 12px', borderRadius:'var(--r-sm)',
                      border:'none', fontSize:11, fontWeight:600, cursor:'pointer',
                      background: asignaciones[g.key] ? '#534AB7' : 'var(--border-md)',
                      color: asignaciones[g.key] ? '#fff' : 'var(--text3)',
                      whiteSpace:'nowrap',
                    }}>
                    {asignando ? '…' : 'Aplicar'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Panel asignación proveedores en bloque ── */}
        {filSinProv && gruposSinProv.length > 0 && (
          <div className="card" style={{ marginBottom:12, border:'1.5px solid #378ADD44' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:'#185FA5' }}>
                  🏪 Asignar proveedores — {gruposSinProv.length} grupo{gruposSinProv.length>1?'s':''} sin asignar
                </div>
                <div style={{ fontSize:10, color:'var(--text3)', marginTop:3 }}>
                  {allSinProvRows
                    ? `${allSinProvRows.length} registros de todos los períodos.`
                    : 'Cargando…'}{' '}
                  Escribe o elige el proveedor para cada grupo y aplica en un clic.
                </div>
              </div>
              {Object.keys(asignProv).filter(k=>(asignProv[k]||'').trim()).length > 0 && !asignandoProv && (
                <button onClick={asignarProvTodos}
                  style={{ padding:'8px 16px', borderRadius:'var(--r-md)', border:'none', background:'#185FA5', color:'#fff', cursor:'pointer', fontSize:12, fontWeight:700, whiteSpace:'nowrap' }}>
                  ✓ Aplicar todos ({Object.keys(asignProv).filter(k=>(asignProv[k]||'').trim()).length})
                </button>
              )}
            </div>

            {/* datalist con proveedores existentes */}
            <datalist id="dl-provs-bulk">
              {provs.map(p => <option key={p.id} value={p.nombre}/>)}
            </datalist>

            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {gruposSinProv.map(g => (
                <div key={g.key} style={{
                  display:'grid', gridTemplateColumns:'1fr 1fr auto',
                  gap:10, alignItems:'center',
                  padding:'10px 12px', borderRadius:'var(--r-sm)',
                  background:'var(--bg)', border:'0.5px solid var(--border)',
                }}>
                  {/* Info del grupo */}
                  <div>
                    <div style={{ fontSize:12, fontWeight:600 }}>{g.concepto}</div>
                    <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>
                      <span className={`badge ${CAT_BADGE[g.categoria]||'b-gray'}`} style={{ fontSize:9 }}>{g.categoria}</span>
                      {' '}· <strong>{g.ids.length}</strong> registro{g.ids.length>1?'s':''} · {fmtM(g.monto)}
                    </div>
                  </div>

                  {/* Input proveedor con autocomplete */}
                  <input
                    list="dl-provs-bulk"
                    className="form-input"
                    placeholder="Nombre del proveedor..."
                    value={asignProv[g.key] || ''}
                    onChange={e => setAsignProv(prev => ({ ...prev, [g.key]: e.target.value }))}
                    style={{ fontSize:11 }}
                  />

                  {/* Botón aplicar */}
                  <button
                    onClick={() => asignarProvGrupo(g)}
                    disabled={!(asignProv[g.key]||'').trim() || asignandoProv}
                    style={{
                      padding:'6px 12px', borderRadius:'var(--r-sm)',
                      border:'none', fontSize:11, fontWeight:600, cursor:'pointer',
                      background: (asignProv[g.key]||'').trim() ? '#185FA5' : 'var(--border-md)',
                      color:      (asignProv[g.key]||'').trim() ? '#fff' : 'var(--text3)',
                      whiteSpace:'nowrap',
                    }}>
                    {asignandoProv ? '…' : 'Aplicar'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Cards resumen por método de pago ── */}
        {(() => {
          const cards = [
            { label:'💵 Efectivo',   val:totGasEfectivo,   color:'#1D9E75' },
            { label:'💳 Tarjeta',    val:totGasTarjeta,    color:'#378ADD' },
            ...(totGasPlataforma > 0 ? [{ label:'📦 Plataforma', val:totGasPlataforma, color:'#7F77DD' }] : []),
            ...(totGasOtros > 0 ? [{ label:'Otros', val:totGasOtros, color:'#999' }] : []),
          ]
          return (
            <div className="metrics" style={{gridTemplateColumns:`repeat(${cards.length},minmax(0,1fr))`,marginBottom:10}}>
              {cards.map(c=>(
                <div key={c.label} className="mc" style={{borderLeft:`3px solid ${c.color}`}}>
                  <div className="mc-label">{c.label}</div>
                  <div className="mc-value" style={{color:c.color}}>{fmtM(c.val)}</div>
                  <div style={{fontSize:10,color:c.color,marginTop:2}}>{totalFiltrado>0?Math.round(c.val/totalFiltrado*100):0}%</div>
                </div>
              ))}
            </div>
          )
        })()}

        {/* ── Cards por categoría ── */}
        <div className="metrics" style={{gridTemplateColumns:`repeat(${Math.min(Object.keys(porCatFilt).length,4)},minmax(0,1fr))`,marginBottom:10}}>
          {Object.entries(porCatFilt).sort((a,b)=>b[1].total-a[1].total).map(([cat,d])=>{
            const pEfe = d.total>0 ? d.efectivo/d.total*100 : 0
            const pTar = d.total>0 ? d.tarjeta/d.total*100 : 0
            const pOtr = d.total>0 ? d.otros/d.total*100 : 0
            return (
              <div key={cat} className="mc">
                <div className="mc-label">{cat}</div>
                <div className="mc-value" style={{fontSize:16}}>{fmtM(d.total)}</div>
                <div style={{fontSize:10,color:'var(--text3)',marginTop:1}}>{totalFiltrado>0?Math.round(d.total/totalFiltrado*100):0}% del total</div>
                {/* Barra apilada Efectivo / Tarjeta / Otros */}
                <div style={{marginTop:6,height:6,borderRadius:3,overflow:'hidden',display:'flex',background:'var(--border)'}}>
                  {pEfe>0 && <div style={{width:`${pEfe}%`,background:'#1D9E75',height:'100%'}}/>}
                  {pTar>0 && <div style={{width:`${pTar}%`,background:'#378ADD',height:'100%'}}/>}
                  {pOtr>0 && <div style={{width:`${pOtr}%`,background:'#888780',height:'100%'}}/>}
                </div>
                <div style={{display:'flex',gap:6,marginTop:4,flexWrap:'wrap'}}>
                  {pEfe>0 && <span style={{fontSize:9,color:'#1D9E75'}}>💵 {Math.round(pEfe)}%</span>}
                  {pTar>0 && <span style={{fontSize:9,color:'#378ADD'}}>💳 {Math.round(pTar)}%</span>}
                  {pOtr>0 && <span style={{fontSize:9,color:'#888780'}}>· {Math.round(pOtr)}%</span>}
                </div>
              </div>
            )
          })}
        </div>

        <div className="card">
          {msgDel && <div style={{padding:'8px 14px',borderRadius:'var(--r-md)',marginBottom:8,
            background:msgDel.ok?'#EAF3DE':'#FCEBEB',color:msgDel.ok?'#3B6D11':'#A32D2D',fontSize:12}}>{msgDel.text}</div>}
          <div className="ch" style={{flexWrap:'wrap',gap:8}}>
            <div className="ct">Historial de gastos — {filtered.length} registros · {fmtM(totalFiltrado)}</div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <input className="form-input" style={{width:200}} placeholder="Buscar concepto, proveedor, cuenta..."
                value={filBusca} onChange={e=>setFilBusca(e.target.value)}/>
              <select className="form-input" style={{width:200}} value={filCat} onChange={e=>setFilCat(e.target.value)}>
                <option value="">Todas las categorías</option>
                {categorias.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              <select className="form-input" style={{width:170}} value={filPago} onChange={e=>setFilPago(e.target.value)}>
                <option value="">Todas las formas de pago</option>
                <option value="Efectivo">Efectivo</option>
                <option value="Tarjeta debito">Tarjeta débito</option>
                <option value="Tarjeta credito">Tarjeta crédito</option>
                <option value="Transferencia">Transferencia</option>
                <option value="Tarjeta">Tarjeta (cualquiera)</option>
              </select>
              {(filBusca||filCat||filPago||filSoloDup||filSinSub||filSinProv) && (
                <button onClick={()=>{setFilBusca('');setFilCat('');setFilPago('');setFilSoloDup(false);setDupSnapshot(null);setFilSinSub(false);setFilSinProv(false)}}
                  style={{padding:'0 10px',borderRadius:99,fontSize:11,border:'0.5px solid var(--border-md)',
                    background:'transparent',color:'var(--text2)',cursor:'pointer'}}>
                  ✕ Limpiar
                </button>
              )}
              {(dupCount > 0 || filSoloDup) && (
                <button
                  onClick={() => {
                    if (!filSoloDup) setDupSnapshot(new Set(dupGastosSet))
                    else setDupSnapshot(null)
                    setFilSoloDup(v => !v)
                  }}
                  title={filSoloDup ? 'Ver todos los gastos' : 'Mostrar solo registros con posibles duplicados'}
                  style={{padding:'0 10px',borderRadius:99,fontSize:11,
                    border:`0.5px solid ${filSoloDup?'#E24B4A':'#E24B4A88'}`,
                    background:filSoloDup?'#FCEBEB':'transparent',
                    color:'#E24B4A',cursor:'pointer',fontWeight:filSoloDup?700:400}}>
                  ⚠ {filSoloDup ? 'Solo duplicados activo — clic para ver todos' : `${dupCount} duplicado${dupCount>1?'s':''}`}
                </button>
              )}
              {sinProvTotal > 0 && (
                <button
                  onClick={async () => {
                    const next = !filSinProv
                    setFilSinProv(next)
                    if (next && !allSinProvRows) await loadAllSinProv()
                  }}
                  title="Ver todos los registros sin proveedor asignado (todos los períodos)"
                  style={{padding:'0 10px',borderRadius:99,fontSize:11,
                    border:`0.5px solid ${filSinProv?'#378ADD':'#378ADD88'}`,
                    background:filSinProv?'#EBF2FC':'transparent',
                    color:'#185FA5',cursor:'pointer',fontWeight:filSinProv?700:400}}>
                  {loadingSinProv ? '⏳ cargando…' : `🏪 ${sinProvTotal} sin proveedor`}
                </button>
              )}
              {sinSubTotal > 0 && (
                <button
                  onClick={async () => {
                    const next = !filSinSub
                    setFilSinSub(next)
                    if (next && !allSinSubRows) await loadAllSinSub()
                  }}
                  title="Ver todos los registros sin subcuenta contable (todos los períodos)"
                  style={{padding:'0 10px',borderRadius:99,fontSize:11,
                    border:`0.5px solid ${filSinSub?'#7F77DD':'#7F77DD88'}`,
                    background:filSinSub?'#EEEDFE':'transparent',
                    color:'#534AB7',cursor:'pointer',fontWeight:filSinSub?700:400}}>
                  {loadingSinSub ? '⏳ cargando…' : `📂 ${sinSubTotal} sin subcuenta`}
                </button>
              )}
              {role==='admin' && (
                <button onClick={generarAutoSuggestions} disabled={aplicandoAuto}
                  style={{padding:'0 10px',borderRadius:99,fontSize:11,border:'0.5px solid #1D9E75',
                    background:'#EAF3DE',color:'#3B6D11',cursor:'pointer',fontWeight:600}}>
                  {aplicandoAuto?'⏳ analizando…':'🪄 Auto-asignar sub+prov'}
                </button>
              )}
              {role==='admin' && (
                <button onClick={unificarCategorias}
                  style={{padding:'0 10px',borderRadius:99,fontSize:11,border:'0.5px solid #EF9F27',
                    background:'#FFF9E6',color:'#8A5A00',cursor:'pointer'}}
                  title="Normaliza todas las categorías a su forma canónica (MAYÚSCULAS)">
                  🔧 Unificar categorías
                </button>
              )}
            </div>
          </div>
          {loading ? <div className="loading-screen" style={{ height:200 }}><div className="spinner"/></div>
          : <div style={{ overflowX:'auto', maxHeight:560, overflowY:'auto' }}>
              <table className="tbl" style={{ minWidth:700 }}>
                {/* Barra acción multi-select */}
                {selIds.size > 0 && (
                  <div style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',marginBottom:6,background:'#1D9E7511',border:'1px solid #1D9E7533',borderRadius:'var(--r-md)',flexWrap:'wrap'}}>
                    <span style={{fontSize:12,fontWeight:700,color:'#1D9E75'}}>{selIds.size} seleccionado{selIds.size>1?'s':''}</span>
                    <select value={bulkPago} onChange={e=>setBulkPago(e.target.value)}
                      style={{fontSize:11,padding:'3px 8px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'var(--surface)',color:'var(--text1)'}}>
                      <option value=''>— cambiar método de pago —</option>
                      <option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option>
                    </select>
                    {bulkPago && (
                      <button onClick={async()=>{
                        setBulkActivo(true)
                        const ids = [...selIds]
                        await Promise.all(ids.map(id => sb.from('gastos').update({metodo_pago:bulkPago}).eq('id',id)))
                        setRows(prev => prev.map(r => selIds.has(r.id) ? {...r,metodo_pago:bulkPago} : r))
                        setSelIds(new Set()); setBulkPago(''); setBulkActivo(false)
                        setMsgDel({ok:true,text:`✓ ${ids.length} gasto(s) actualizados`}); setTimeout(()=>setMsgDel(null),3000)
                      }} disabled={bulkActivo}
                        style={{fontSize:11,padding:'3px 12px',borderRadius:'var(--r-sm)',border:'none',background:'#1D9E75',color:'#fff',cursor:'pointer',fontWeight:600}}>
                        {bulkActivo?'…':'✓ Aplicar'}
                      </button>
                    )}
                    <span style={{flex:1}}/>
                    <button onClick={async()=>{
                      if(!confirm(`¿Eliminar ${selIds.size} gasto(s)?`)) return
                      setBulkActivo(true)
                      const ids = [...selIds]
                      await Promise.all(ids.map(id => sb.from('gastos').delete().eq('id',id)))
                      setRows(prev => prev.filter(r => !selIds.has(r.id)))
                      setSelIds(new Set()); setBulkActivo(false)
                      setMsgDel({ok:true,text:`✓ ${ids.length} gasto(s) eliminados`}); setTimeout(()=>setMsgDel(null),3000)
                    }} disabled={bulkActivo}
                      style={{fontSize:11,padding:'3px 12px',borderRadius:'var(--r-sm)',border:'1px solid #E24B4A',background:'transparent',color:'#E24B4A',cursor:'pointer',fontWeight:600}}>
                      🗑 Eliminar selección
                    </button>
                    <button onClick={()=>setSelIds(new Set())}
                      style={{fontSize:11,padding:'3px 8px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',color:'var(--text3)'}}>
                      ✕ Limpiar
                    </button>
                  </div>
                )}
                <thead style={{ position:'sticky', top:0, background:'var(--surface)' }}>
                  <tr>
                    {role==='admin' && <th style={{width:28,padding:'4px 6px'}}>
                      <input type="checkbox" style={{cursor:'pointer'}}
                        checked={filtered.length>0 && filtered.every(r=>selIds.has(r.id))}
                        onChange={e => setSelIds(e.target.checked ? new Set(filtered.map(r=>r.id).filter(Boolean)) : new Set())}/>
                    </th>}
                    <th>Fecha</th><th>Proveedor</th><th>Concepto</th><th>Cuenta</th>
                    <th>Categoria</th><th>Pago</th><th className="num">Monto</th>
                    {role==='admin' && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r,i)=>{
                    const dup     = isDupGasto(r)
                    const sinSub  = !r.cta_gasto
                    const sinProv = !r.proveedor
                    const selRow  = selIds.has(r.id)
                    return (
                    <tr key={r.id||i} style={{
                      background: selRow ? '#1D9E7511' : dup ? '#FCEBEB44' : sinSub && filSinSub ? '#EEEDFE22' : sinProv && filSinProv ? '#EBF2FC22' : undefined,
                      borderLeft: dup ? '3px solid #E24B4A' : sinSub && filSinSub ? '3px solid #7F77DD' : sinProv && filSinProv ? '3px solid #378ADD' : undefined,
                    }}>
                      {editingId===r.id && role==='admin' ? <>
                        {role==='admin' && <td/>}
                        <td><input className="form-input" style={{padding:'2px 6px',fontSize:11,width:110}} type="date" value={editRow.fecha||''} onChange={e=>setEditRow(x=>({...x,fecha:e.target.value}))}/></td>
                        <td><input className="form-input" style={{padding:'2px 6px',fontSize:11}} value={editRow.proveedor||''} onChange={e=>setEditRow(x=>({...x,proveedor:e.target.value}))}/></td>
                        <td><input className="form-input" style={{padding:'2px 6px',fontSize:11}} value={editRow.concepto||''} onChange={e=>setEditRow(x=>({...x,concepto:e.target.value}))}/></td>
                        <td><input className="form-input" style={{padding:'2px 6px',fontSize:11,width:80}} value={editRow.cta_gasto||''} onChange={e=>setEditRow(x=>({...x,cta_gasto:e.target.value}))}/></td>
                        <td>
                          <select className="form-input" style={{padding:'2px 6px',fontSize:11}} value={editRow.categoria_gasto||''} onChange={e=>setEditRow(x=>({...x,categoria_gasto:e.target.value}))}>
                            {['COSTOS','GASTOS DE OPERACIÓN','GASTO DE VENTAS','SERVICIOS','SALARIOS & BONOS','PAGO PRESTAMOS','PAGO DE GANANCIAS','Ajuste caja'].map(c=><option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td>
                          <select className="form-input" style={{padding:'2px 6px',fontSize:11}} value={editRow.metodo_pago||''} onChange={e=>setEditRow(x=>({...x,metodo_pago:e.target.value}))}>
                            <option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option>
                          </select>
                        </td>
                        <td><input className="form-input" style={{padding:'2px 6px',fontSize:11,width:90,textAlign:'right'}} type="number" value={editRow.monto||''} onChange={e=>setEditRow(x=>({...x,monto:e.target.value}))}/></td>
                        <td>
                          <div style={{display:'flex',gap:4}}>
                            <button onClick={async()=>{
                              const payload = {fecha:editRow.fecha,proveedor:editRow.proveedor||null,concepto:editRow.concepto,cta_gasto:editRow.cta_gasto||null,categoria_gasto:editRow.categoria_gasto,metodo_pago:editRow.metodo_pago||null,monto:parseFloat(editRow.monto)||0}
                              const {error} = await sb.from('gastos').update(payload).eq('id',r.id)
                              if(error) setMsgDel({ok:false,text:'Error: '+error.message})
                              else { setRows(prev=>prev.map(x=>x.id===r.id?{...x,...payload}:x)); setMsgDel({ok:true,text:'Gasto actualizado'}); setTimeout(()=>setMsgDel(null),3000) }
                              setEditingId(null)
                            }} style={{fontSize:10,padding:'1px 7px',borderRadius:'var(--r-sm)',border:'none',background:'#1D9E75',color:'#fff',cursor:'pointer'}}>✓</button>
                            <button onClick={()=>setEditingId(null)} style={{fontSize:10,padding:'1px 7px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',color:'var(--text2)'}}>✕</button>
                          </div>
                        </td>
                      </> : <>
                        {role==='admin' && <td style={{padding:'4px 6px',textAlign:'center'}}>
                          <input type="checkbox" style={{cursor:'pointer'}} checked={selRow}
                            onChange={e=>setSelIds(prev=>{const n=new Set(prev);e.target.checked?n.add(r.id):n.delete(r.id);return n})}/>
                        </td>}
                        <td style={{ whiteSpace:'nowrap', fontSize:11 }}>{r.fecha}</td>
                        <td style={{ fontSize:11, color:'var(--text2)' }}>{r.proveedor||'—'}</td>
                        <td style={{ fontWeight:500 }}>
                          {dup && <span title="Posible registro duplicado (misma fecha, monto y concepto)" style={{fontSize:9,background:'#E24B4A',color:'#fff',padding:'1px 5px',borderRadius:99,marginRight:5,cursor:'default'}}>⚠ dup</span>}
                          {r.concepto}
                        </td>
                        <td style={{ fontSize:11, fontFamily:'monospace', color:'var(--text2)' }}>{r.cta_gasto||'—'}</td>
                        <td><span className={`badge ${CAT_BADGE[normCat(r.categoria_gasto)]||'b-gray'}`}>{normCat(r.categoria_gasto)||'—'}</span></td>
                        <td style={{ fontSize:11 }}>{r.metodo_pago||'—'}</td>
                        <td className="num" style={{ fontWeight:500 }}>{fmtM(r.monto)}</td>
                        {role==='admin' && <td>
                          <div style={{display:'flex',gap:4}}>
                            <button onClick={()=>{setEditingId(r.id);setEditRow({...r})}}
                              style={{fontSize:10,padding:'1px 7px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',color:'var(--text2)',background:'transparent',cursor:'pointer'}}>✎</button>
                            <button onClick={async()=>{
                              if (!r.id) return
                              if (!confirm('¿Eliminar este gasto?')) return
                              setDeletingId(r.id)
                              const {error} = await sb.from('gastos').delete().eq('id',r.id)
                              if(error) setMsgDel({ok:false,text:'Error: '+error.message})
                              else { setMsgDel({ok:true,text:'Gasto eliminado'}); setRows(prev=>prev.filter(x=>x.id!==r.id)) }
                              setDeletingId(null)
                              setTimeout(()=>setMsgDel(null),3000)
                            }} disabled={deletingId===r.id||!r.id}
                              style={{fontSize:10,padding:'1px 7px',borderRadius:'var(--r-sm)',border:'0.5px solid #E24B4A',color:'#E24B4A',background:'transparent',cursor:'pointer',opacity:r.id?1:0.3}}>
                              {deletingId===r.id?'…':'✕'}
                            </button>
                          </div>
                        </td>}
                      </>}
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          }
        </div>
      </>)}
      {/* ── PESTAÑA ANÁLISIS ── */}
      {tab === 'analisis' && (() => {
        const tc = () => matchMedia('(prefers-color-scheme:dark)').matches ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'
        const gc = () => matchMedia('(prefers-color-scheme:dark)').matches ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
        const DIMS = [
          { id:'categoria', label:'Categoría', key: r => normCat(r.categoria_gasto) || 'Sin cat.' },
          { id:'subcuenta', label:'Subcuenta',  key: r => r.cta_gasto || 'Sin subcuenta' },
          { id:'proveedor', label:'Proveedor',  key: r => r.proveedor || 'Sin proveedor' },
        ]
        const COLORS = ['#E24B4A','#EF9F27','#378ADD','#1D9E75','#7F77DD','#D4537E','#D85A30','#8B6914','#2568B0','#639922','#A32D2D','#6E6E73']
        const dimObj = DIMS.find(d => d.id === anlDim)

        // Formas de pago disponibles en los registros filtrados
        const pagosDisponibles = [...new Set(filtered.map(r => r.metodo_pago).filter(Boolean))].sort()

        // Aplicar filtro de forma de pago sobre el historial ya filtrado
        const filteredAnl = anlPago ? filtered.filter(r => r.metodo_pago === anlPago) : filtered

        const grouped = {}
        filteredAnl.forEach(r => {
          const k = dimObj.key(r)
          if (!grouped[k]) grouped[k] = { label:k, monto:0, count:0 }
          grouped[k].monto += r.monto || 0; grouped[k].count++
        })
        const items = Object.values(grouped)
          .map(x => ({ ...x, monto: Math.round(x.monto) }))
          .sort((a, b) => anlSort === 'monto' ? b.monto - a.monto : a.label.localeCompare(b.label))
        const topItems = [...items.slice(0, anlTop)]
        const otrosMonto = items.slice(anlTop).reduce((s, x) => s + x.monto, 0)
        if (otrosMonto > 0) topItems.push({ label:`Otros (${items.length - anlTop})`, monto:otrosMonto, count:0 })
        const chartH = Math.max(220, topItems.length * 34)
        const chartData = {
          labels: topItems.map(x => x.label.length > 22 ? x.label.slice(0,20)+'…' : x.label),
          datasets:[{ label:'Gasto', data:topItems.map(x=>x.monto), backgroundColor:topItems.map((_,i)=>COLORS[i%COLORS.length]+'CC'), borderRadius:4 }],
        }
        const chartOpts = {
          indexAxis:'y', responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{display:false}, tooltip:{callbacks:{label:ctx=>' $'+Math.round(ctx.raw).toLocaleString('es-MX')}} },
          scales:{
            x:{ticks:{color:tc(),callback:v=>'$'+(v/1000).toFixed(0)+'k',font:{size:10}},grid:{color:gc()},border:{display:false}},
            y:{ticks:{color:tc(),font:{size:10}},grid:{display:false},border:{display:false}},
          },
        }
        return (
          <div>
            <div className="card" style={{ marginBottom:12 }}>
              {/* Fila 1: dimensión + opciones */}
              <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
                <span style={{ fontSize:11, color:'var(--text3)', fontWeight:600 }}>Ver por:</span>
                {DIMS.map(d => (
                  <button key={d.id} className={`psw-btn${anlDim===d.id?' active':''}`} onClick={() => setAnlDim(d.id)}>{d.label}</button>
                ))}
                <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                  <span style={{ fontSize:11, color:'var(--text3)' }}>Top:</span>
                  {[5,10,20,50].map(n => (
                    <button key={n} className={`psw-btn${anlTop===n?' active':''}`} onClick={() => setAnlTop(n)}>{n}</button>
                  ))}
                  <span style={{ fontSize:11, color:'var(--text3)', marginLeft:6 }}>Orden:</span>
                  <button className={`psw-btn${anlSort==='monto'?' active':''}`} onClick={() => setAnlSort('monto')}>Mayor monto</button>
                  <button className={`psw-btn${anlSort==='nombre'?' active':''}`} onClick={() => setAnlSort('nombre')}>A-Z</button>
                </div>
              </div>
              {/* Fila 2: forma de pago */}
              {pagosDisponibles.length > 0 && (
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center', marginTop:8, paddingTop:8, borderTop:'0.5px solid var(--border)' }}>
                  <span style={{ fontSize:11, color:'var(--text3)', fontWeight:600 }}>Pago:</span>
                  <button className={`psw-btn${anlPago===''?' active':''}`} onClick={() => setAnlPago('')}>Todos</button>
                  {pagosDisponibles.map(p => (
                    <button key={p} className={`psw-btn${anlPago===p?' active':''}`} onClick={() => setAnlPago(p)}>{p}</button>
                  ))}
                  {anlPago && (
                    <span style={{ fontSize:10, color:'var(--text3)', marginLeft:4 }}>
                      · mostrando solo <strong style={{ color:'var(--text1)' }}>{anlPago}</strong>
                    </span>
                  )}
                </div>
              )}
              {/* Resumen */}
              <div style={{ marginTop:8, fontSize:11, color:'var(--text3)' }}>
                {filteredAnl.length} registro{filteredAnl.length!==1?'s':''} · {items.length} {dimObj.label.toLowerCase()}s · Total: <strong style={{ color:'var(--text1)' }}>{fmtM(filteredAnl.reduce((s,r)=>s+(r.monto||0),0))}</strong>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'3fr 2fr', gap:12 }}>
              <div className="card">
                <div className="ct" style={{ marginBottom:10 }}>Gastos por {dimObj.label.toLowerCase()}</div>
                <div style={{ height:chartH }}><Bar data={chartData} options={chartOpts}/></div>
              </div>
              <div className="card" style={{ overflowY:'auto', maxHeight:chartH+60 }}>
                <div className="ct" style={{ marginBottom:10 }}>Detalle</div>
                <table className="tbl">
                  <thead><tr><th>{dimObj.label}</th><th className="num">Monto</th><th className="num">%</th><th className="num">#</th></tr></thead>
                  <tbody>
                    {topItems.filter(x=>x.count>0).map((x,i)=>(
                      <tr key={x.label}>
                        <td style={{ fontSize:11 }}>
                          <span style={{ display:'inline-block',width:8,height:8,borderRadius:'50%',background:COLORS[i%COLORS.length],marginRight:6 }}/>
                          {x.label}
                        </td>
                        <td className="num">{fmtM(x.monto)}</td>
                        <td className="num c-muted">{totalFiltrado>0?Math.round(x.monto/totalFiltrado*100):0}%</td>
                        <td className="num c-muted">{x.count}</td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight:600, borderTop:'1px solid var(--border-md)' }}>
                      <td>Total</td><td className="num">{fmtM(totalFiltrado)}</td><td className="num">100%</td><td className="num">{filtered.length}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
