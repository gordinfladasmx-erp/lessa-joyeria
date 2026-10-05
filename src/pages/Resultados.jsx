import React, { useState, useEffect, useCallback, useRef } from 'react'
import { sb } from '../lib/supabase.js'
import { Bar, Line } from 'react-chartjs-2'
import { Chart, CategoryScale, LinearScale, BarElement, LineElement,
         PointElement, ArcElement, Tooltip, Legend, Filler } from 'chart.js'
import KpiCard from '../components/KpiCard.jsx'
import PeriodSwitcher from '../components/PeriodSwitcher.jsx'
import ExportBtn from '../components/ExportBtn.jsx'
import IngresoGastoCategorias from '../components/IngresoGastoCategorias.jsx'
import { fetchKpiRangoGran, fetchSeriesRangoGran, fetchPorCategoria,
         fetchPorCanal, fetchGastosPorCategoria, fetchComparativo,
         fetchCatSeriesRangoGran, getRangoFechas, trendline, fetchRentabilidadCategoria,
         fetchPromedioDiarioMes, fetchComparativoPeriodos, fetchAnualParaCAGR, calcCAGR,
         fetchKpiAcum, fetchRentabilidadCanal, getPrevPeriodRange,
         fetchProyeccionInteligente, fetchProyeccionPeriodo } from '../lib/analytics.js'
import { descargarReporte, compartirReporte } from '../lib/reporte.js'

Chart.register(CategoryScale, LinearScale, BarElement, LineElement,
               PointElement, ArcElement, Tooltip, Legend, Filler)

// ── Helpers ────────────────────────────────────────────────────────────────
const C = { blue:'#378ADD', green:'#1D9E75', red:'#E24B4A', amber:'#EF9F27',
            purple:'#7F77DD', gray:'#888780', pink:'#D4537E', orange:'#D85A30' }
const CAT_COLORS = [C.amber, C.red, C.blue, C.purple, C.green, C.gray, C.pink, C.orange]
const GASTO_COLORS = [C.red, C.orange, C.purple, C.blue, C.gray]
const isDark = () => matchMedia('(prefers-color-scheme:dark)').matches
const tc = () => isDark()?'rgba(255,255,255,0.45)':'rgba(0,0,0,0.4)'
const gc = () => isDark()?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.06)'
const fmtM = v => '$'+Math.round(v||0).toLocaleString('es-MX')
const fmtK = v => Math.abs(v||0)>=1000?(v>=0?'$':'-$')+Math.round(Math.abs(v)/1000)+'k':fmtM(v)
const pctFmt = v => v==null?'—':`${v>=0?'+':''}${v}% vs anterior`
const color  = v => v==null?'':v>=0?' up':' dn'

// ── Días cerrados (lunes + festivos) ──────────────────────────────────────
function isDiaCerrado(d) {
  if(d.getDay()===1) return true
  const m=d.getMonth()+1,dd=d.getDate()
  if(m===1&&dd===1) return true; if(m===12&&dd===25) return true
  const y=d.getFullYear(),a=y%19,b=Math.floor(y/100),c=y%100,d2=Math.floor(b/4),e=b%4
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d2-g+15)%30
  const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m2=Math.floor((a+11*h+22*l)/451)
  const month=Math.floor((h+l-7*m2+114)/31),day=(h+l-7*m2+114)%31+1
  const easter=new Date(y,month-1,day)
  const js=new Date(easter);js.setDate(easter.getDate()-3)
  const vs=new Date(easter);vs.setDate(easter.getDate()-2)
  return d.toDateString()===js.toDateString()||d.toDateString()===vs.toDateString()
}
function diasAbiertoHasta(){const h=new Date(),y=h.getFullYear(),m=h.getMonth();let c=0;for(let d=1;d<=h.getDate();d++)if(!isDiaCerrado(new Date(y,m,d)))c++;return c}
function diasRestantes(cm=[]){const h=new Date(),y=h.getFullYear(),m=h.getMonth(),n=new Date(y,m+1,0).getDate();let c=0;for(let d=h.getDate()+1;d<=n;d++){const f=new Date(y,m,d);if(!isDiaCerrado(f)&&!cm.includes(f.toISOString().slice(0,10)))c++}return c}
function diasTotales(){const h=new Date(),y=h.getFullYear(),m=h.getMonth(),n=new Date(y,m+1,0).getDate();let c=0;for(let d=1;d<=n;d++)if(!isDiaCerrado(new Date(y,m,d)))c++;return c}

// Helpers de días abiertos/restantes para trimestre y año
function diasPeriodo(tipo) {
  const h=new Date(), y=h.getFullYear(), m=h.getMonth()
  let ini, fin
  if (tipo==='trim') { const qm=(Math.floor(m/3))*3; ini=new Date(y,qm,1); fin=new Date(y,qm+3,0) }
  else               { ini=new Date(y,0,1); fin=new Date(y,11,31) }
  let abierto=0, restantes=0, total=0
  for (let d=new Date(ini); d<=fin; d.setDate(d.getDate()+1)) {
    if (!isDiaCerrado(new Date(d))) {
      total++
      if (d<=h) abierto++
      else restantes++
    }
  }
  return { abierto, restantes, total, pct: total>0?Math.round(abierto/total*100):0 }
}

// Plugin: total encima de barra apilada
const stackedTotalPlugin = {
  id:'stackedBarTotal',
  afterDatasetsDraw(chart){
    const { ctx } = chart
    const dark = matchMedia('(prefers-color-scheme:dark)').matches
    const datasets = chart.data.datasets.filter(d=>d.type!=='line')
    const numPoints = datasets[0]?.data?.length||0
    ctx.save(); ctx.font='bold 11px system-ui,sans-serif'
    ctx.textAlign='center'; ctx.textBaseline='bottom'
    ctx.fillStyle = dark?'rgba(255,255,255,0.9)':'rgba(0,0,0,0.75)'
    for(let i=0;i<numPoints;i++){
      let total=0, topY=null
      datasets.forEach(dataset=>{
        const realIdx=chart.data.datasets.indexOf(dataset)
        const meta=chart.getDatasetMeta(realIdx)
        if(!meta.hidden&&meta.data[i]){ total+=Number(dataset.data[i])||0; const y=meta.data[i].y; if(topY===null||y<topY)topY=y }
      })
      if(total>0&&topY!==null){
        const x=chart.getDatasetMeta(chart.data.datasets.indexOf(datasets[0])).data[i]?.x
        if(x!==undefined) ctx.fillText(Math.round(total).toLocaleString('es-MX'),x,topY-4)
      }
    }
    ctx.restore()
  }
}

export default function Resultados() {
  // ── Estado ───────────────────────────────────────────────────────────────
  const [rango,           setRango]           = useState('mes')
  const [granularidad,    setGranularidad]     = useState('diario')
  const [rangoDesde,      setRangoDesde]       = useState('')
  const [rangoHasta,      setRangoHasta]       = useState('')
  const [kpi,             setKpi]             = useState(null)
  const [series,          setSeries]          = useState(null)
  const [cats,            setCats]            = useState([])
  const [gastosCat,       setGastosCat]       = useState([])
  const [canales,         setCanales]         = useState([])
  const [catSeries,       setCatSeries]       = useState(null)
  const [comp,            setComp]            = useState([])
  const [proy,            setProy]            = useState(null)
  const [cierresManuales, setCierresManuales] = useState([])
  const [loading,         setLoading]         = useState(true)
  const [lastUpd,         setLastUpd]         = useState(new Date())
  const [showComp,        setShowComp]        = useState(false)
  const [canalFiltros,    setCanalFiltros]     = useState([])
  const [famFilter,       setFamFilter]       = useState([])
  const [generando,       setGenerando]       = useState(false)
  const [rentCat,         setRentCat]         = useState([])
  const [rentCanalFiltro, setRentCanalFiltro] = useState([])
  const [promedioDiario,  setPromedioDiario]  = useState(null)
  const [promAnios,       setPromAnios]       = useState([2024,2025,2026])
  const [promMetrica,     setPromMetrica]     = useState('unidades')
  const [cagrData,        setCagrData]        = useState(null)
  const [compPeriodos,    setCompPeriodos]    = useState(null)
  const [compMesDesde,    setCompMesDesde]    = useState(1)
  const [compMesHasta,    setCompMesHasta]    = useState(new Date().getMonth()+1)
  const [compMetrica,     setCompMetrica]     = useState('ventas')
  const [kpiMes,          setKpiMes]          = useState(null)
  const [pagoSocios,      setPagoSocios]      = useState([])
  const [rentCanal,       setRentCanal]       = useState([])
  const [detalle,         setDetalle]         = useState(null) // { titulo, filas, cols }
  const [ajustesCaja,     setAjustesCaja]     = useState(0)
  const [gastosPago,      setGastosPago]      = useState({Efectivo:0, Tarjeta:0, otros:0})
  const [kpiMesActual,    setKpiMesActual]    = useState(null) // siempre mes actual, igual que CierreDía
  const [kpiAnt,          setKpiAnt]          = useState(null)
  const [seriesAnt,       setSeriesAnt]       = useState(null)
  const [ajustesCajaAnt,  setAjustesCajaAnt]  = useState(0)
  const [kpiMesAnt,       setKpiMesAnt]       = useState(null)
  const [detalleCargando, setDetalleCargando] = useState(false)
  const [diaSemanaData,   setDiaSemanaData]   = useState(null)
  const [diasSel,         setDiasSel]         = useState([0,1,2,3,4,5,6])
  const [dowMetrica,      setDowMetrica]      = useState('ventas')

  // ── Drill-down: abre modal con detalle de un rubro ───────────────────────
  const abrirDetalle = useCallback(async (tipo, filtro) => {
    const { from, to } = getRangoFechas(rango, rangoDesde, rangoHasta)
    setDetalleCargando(true)
    setDetalle({ titulo: filtro.titulo, filas: [], cols: filtro.cols })
    try {
      let filas = []
      if (tipo === 'gasto_subcategoria') {
        // Detalle de gastos filtrando por subcategoría (ej: Socio 1)
        const { data } = await sb.from('gastos')
          .select('fecha,concepto,proveedor,monto,notas')
          .eq('categoria_gasto', filtro.categoria)
          .eq('subcategoria_gasto', filtro.subcategoria)
          .gte('fecha', from).lte('fecha', to)
          .order('fecha', { ascending: false })
        filas = (data||[]).map(r => [r.fecha, r.concepto||'—', r.proveedor||'—', r.monto])
      } else if (tipo === 'gasto_categoria') {
        const { data } = await sb.from('gastos')
          .select('fecha,concepto,proveedor,subcategoria_gasto,monto')
          .eq('categoria_gasto', filtro.categoria)
          .gte('fecha', from).lte('fecha', to)
          .order('fecha', { ascending: false })
        filas = (data||[]).map(r => [r.fecha, r.concepto||'—', r.subcategoria_gasto||'—', r.proveedor||'—', r.monto])
      } else if (tipo === 'venta_canal') {
        const { data } = await sb.from('ventas')
          .select('fecha,producto,categoria,metodo_pago,unidades,importe')
          .eq('canal', filtro.canal)
          .gte('fecha', from).lte('fecha', to)
          .order('fecha', { ascending: false })
          .limit(500)
        filas = (data||[]).map(r => [r.fecha, r.producto||'—', r.categoria||'—', r.metodo_pago||'—', r.unidades, r.importe])
      } else if (tipo === 'venta_categoria') {
        const { data } = await sb.from('ventas')
          .select('fecha,producto,canal,metodo_pago,unidades,importe')
          .eq('categoria', filtro.categoria)
          .gte('fecha', from).lte('fecha', to)
          .order('fecha', { ascending: false })
          .limit(500)
        filas = (data||[]).map(r => [r.fecha, r.producto||'—', r.canal||'—', r.metodo_pago||'—', r.unidades, r.importe])
      }
      setDetalle({ titulo: filtro.titulo, filas, cols: filtro.cols })
    } catch(e) { console.error(e) }
    setDetalleCargando(false)
  }, [rango, rangoDesde, rangoHasta])

  // ── Saldo por caja del mes actual (último cierre del mes, igual que CierreDía) ──
  useEffect(() => {
    const mesActual = new Date().toISOString().slice(0,7)
    const from = mesActual + '-01', to = mesActual + '-31'
    const PLAT_FIELDS = ['saldo_fin_uber','saldo_fin_uber_chi','saldo_fin_didi','saldo_fin_didi_chi','saldo_fin_rappi','saldo_fin_ola']
    const platSum = row => PLAT_FIELDS.reduce((s,f) => s + (parseFloat(row?.[f])||0), 0)
    const SEL = 'saldo_final_efvo,saldo_final_tc,' + PLAT_FIELDS.join(',')
    Promise.all([
      // último cierre del mes actual
      sb.from('cierres_dia').select(SEL).gte('fecha', from).lte('fecha', to)
        .order('fecha', { ascending: false }).limit(1),
      // último cierre ANTES del mes actual (saldo meses anteriores)
      sb.from('cierres_dia').select(PLAT_FIELDS.join(','))
        .lt('fecha', from).order('fecha', { ascending: false }).limit(1),
    ]).then(([{ data: cur }, { data: ant }]) => {
      const c = cur?.[0]
      if (!c) return
      const plat    = platSum(c)
      const platAnt = platSum(ant?.[0])
      setKpiMesActual({
        efvo:      Math.round(parseFloat(c.saldo_final_efvo)||0),
        tc:        Math.round(parseFloat(c.saldo_final_tc)||0),
        plat:      Math.round(plat),
        platMes:   Math.round(plat - platAnt),   // solo lo acumulado en el mes cte (= CierreDía "📅 Mes")
        label: new Date(from+'T12:00:00').toLocaleString('es-MX',{month:'long',year:'numeric'}),
      })
    }).catch(e => console.error('loadSaldoMes:', e))
  }, [])

  // ── KPIs acumulados ──────────────────────────────────────────────────────
  const loadKpiMes = useCallback(async (from, to) => {
    const labelPeriodo = () => {
      if(from===to) return new Date(from+'T12:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'short'})
      if(from.slice(0,7)===to.slice(0,7)) return new Date(from+'T12:00:00').toLocaleString('es-MX',{month:'long',year:'numeric'})
      if(from.slice(0,4)===to.slice(0,4)) return from.slice(0,4)
      return new Date(from+'T12:00:00').toLocaleString('es-MX',{month:'short',year:'numeric'})+' – '+new Date(to+'T12:00:00').toLocaleString('es-MX',{month:'short',year:'numeric'})
    }
    try {
      const data = await fetchKpiAcum(from, to)
      setKpiMes({ ...data, periodoLabel: labelPeriodo() })
      // Sincronizar ajustesCaja con la misma fuente que las 3 cards de canal (cierres_dia)
      setAjustesCaja(Math.round((data.ajEfvo||0) + (data.ajTc||0) + (data.ajPlat||0)))
    } catch(e) { console.error('loadKpiMes:', e) }
  }, [])

  // ── Filtro canal ─────────────────────────────────────────────────────────
  const aplicarFiltroCanal = useCallback(async (canalesFiltro) => {
    if(!kpi) return
    const [newSeries, newKpi] = await Promise.all([
      fetchSeriesRangoGran(rango, granularidad, rangoDesde, rangoHasta, canalesFiltro),
      fetchKpiRangoGran(rango, granularidad, rangoDesde, rangoHasta, canalesFiltro),
    ])
    setSeries(newSeries); setKpi(newKpi)
  }, [kpi, rango, granularidad, rangoDesde, rangoHasta])

  // ── Reporte ──────────────────────────────────────────────────────────────
  const handleReporte = async (compartir=false) => {
    setGenerando(true)
    try {
      const params = { kpi, series, cats, gastosCat, canales, rango, granularidad }
      if(compartir) await compartirReporte(params)
      else await descargarReporte(params)
    } catch(e) { console.error(e) }
    setGenerando(false)
  }

  // ── Carga principal ──────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if(rango==='rango'&&(!rangoDesde||!rangoHasta)) return
    setLoading(true)
    try {
      const { from, to } = getRangoFechas(rango, rangoDesde, rangoHasta)
      const [k, s, c, gc2, can, cs, sociosRes, ajustesRes] = await Promise.all([
        fetchKpiRangoGran(rango, granularidad, rangoDesde, rangoHasta),
        fetchSeriesRangoGran(rango, granularidad, rangoDesde, rangoHasta),
        fetchPorCategoria(from, to),
        fetchGastosPorCategoria(from, to),
        fetchPorCanal(from, to),
        fetchCatSeriesRangoGran(rango, granularidad, rangoDesde, rangoHasta),
        sb.from('gastos').select('fecha,monto,subcategoria_gasto')
          .eq('categoria_gasto','PAGO DE GANANCIAS').gte('fecha',from).lte('fecha',to),
        sb.from('gastos').select('monto')
          .eq('categoria_gasto','Ajuste caja').gte('fecha',from).lte('fecha',to),
      ])
      setKpi(k); setSeries(s); setCats(c); setGastosCat(gc2); setCanales(can); setCatSeries(cs)
      const aj = (ajustesRes?.data||[]).reduce((s,g)=>s+(parseFloat(g.monto)||0),0)
      setAjustesCaja(Math.round(aj))

      // Gastos por método de pago (para card de distribución de utilidad)
      const { data: gastosRows } = await sb.from('gastos').select('monto,metodo_pago').gte('fecha',from).lte('fecha',to)
      const gpMap = { Efectivo:0, Tarjeta:0, otros:0 }
      ;(gastosRows||[]).forEach(r => {
        const m = r.metodo_pago
        if (m==='Efectivo') gpMap.Efectivo += r.monto||0
        else if (m==='Tarjeta') gpMap.Tarjeta += r.monto||0
        else gpMap.otros += r.monto||0
      })
      setGastosPago({ Efectivo:Math.round(gpMap.Efectivo), Tarjeta:Math.round(gpMap.Tarjeta), otros:Math.round(gpMap.otros) })

      // Pago de ganancias por socio
      const sociosMap = {}
      ;(sociosRes?.data||[]).forEach(g=>{
        const key = g.subcategoria_gasto||'Sin asignar'
        sociosMap[key] = (sociosMap[key]||0)+(g.monto||0)
      })
      setPagoSocios(Object.entries(sociosMap).map(([socio,monto])=>({socio,monto})).sort((a,b)=>b.monto-a.monto))

      // Rentabilidad por categoría y por canal (en paralelo)
      const [rent, rentC] = await Promise.all([
        fetchRentabilidadCategoria(from, to),
        fetchRentabilidadCanal(from, to),
      ])
      setRentCat(rent); setRentCanal(rentC)

      // Comparativo años
      const co = await fetchComparativo('anual', new Date(), 3)
      setComp(co)

      // Promedio diario
      const pd = await fetchPromedioDiarioMes([2024, 2025, 2026])
      setPromedioDiario(pd)

      // CAGR
      const cagr = await fetchAnualParaCAGR()
      setCagrData(cagr)

      // Proyección inteligente de cierre de período
      const tipoProy = (rango==='mes'||(rango==='1anio'&&granularidad==='mensual')) ? 'mes'
        : (rango==='trim'||granularidad==='trimestral') ? 'trim'
        : (rango==='anio-actual'||granularidad==='anual') ? 'anio'
        : null
      if (tipoProy) {
        const { from: pFrom, to: pTo } = tipoProy==='mes'
          ? { from: new Date().toISOString().slice(0,8)+'01', to: new Date().toISOString().slice(0,10) }
          : tipoProy==='trim'
          ? (() => { const h=new Date(),y=h.getFullYear(),qm=Math.floor(h.getMonth()/3)*3; return { from:`${y}-${String(qm+1).padStart(2,'0')}-01`, to:h.toISOString().slice(0,10) } })()
          : { from: `${new Date().getFullYear()}-01-01`, to: new Date().toISOString().slice(0,10) }
        const periKpi = await fetchKpiRangoGran('rango','diario', pFrom, pTo)
        let dt, dr, total, pct
        if (tipoProy==='mes') {
          dt=diasAbiertoHasta(); dr=diasRestantes(cierresManuales); total=diasTotales(); pct=Math.round(dt/total*100)
        } else {
          const pd=diasPeriodo(tipoProy); dt=pd.abierto; dr=pd.restantes; total=pd.total; pct=pd.pct
        }
        const smartProy = await fetchProyeccionPeriodo(tipoProy, periKpi.ventas, periKpi.gastos, periKpi.unidades, dt, dr)
        setProy({ tipo:tipoProy, dt, dr, total, pct,
          pV:smartProy.pV, pG:smartProy.pG, pU:smartProy.pU, pUnids:smartProy.pUnids,
          ventasActual:periKpi.ventas, gastosActual:periKpi.gastos,
          utilidadActual:periKpi.ventas-periKpi.gastos, unidadesActual:periKpi.unidades,
          ratioUsado:smartProy.ratioUsado, cagrMesPct:smartProy.cagrMesPct,
          proyHistorico:smartProy.proyHistorico, proyLineal:smartProy.proyLineal,
          aniosUsados:smartProy.aniosUsados,
        })
      } else setProy(null)

      loadKpiMes(from, to)

      // Período anterior como referencia ghost (para cualquier rango)
      const prev = getPrevPeriodRange(rango, rangoDesde, rangoHasta)
      const [kA, sA, kMesAnt] = await Promise.all([
        fetchKpiRangoGran('rango', granularidad, prev.from, prev.to),
        fetchSeriesRangoGran('rango', granularidad, prev.from, prev.to),
        fetchKpiAcum(prev.from, prev.to),
      ])
      setKpiAnt(kA)
      setSeriesAnt(sA)
      setAjustesCajaAnt(Math.round((kMesAnt?.ajEfvo||0)+(kMesAnt?.ajTc||0)+(kMesAnt?.ajPlat||0)))
      setKpiMesAnt(kMesAnt)

      // ── Ventas por día de semana ─────────────────────────────
      const { data: dowRows } = await sb.from('v_ventas_dia')
        .select('fecha,importe,unidades')
        .neq('metodo_pago','Gratis')
        .gte('fecha', from).lte('fecha', to)
      const fechaMap = {}
      ;(dowRows||[]).forEach(r => {
        const f = r.fecha
        if (!fechaMap[f]) fechaMap[f] = { importe:0, unidades:0 }
        fechaMap[f].importe  += parseFloat(r.importe)||0
        fechaMap[f].unidades += parseFloat(r.unidades)||0
      })
      // 0=Lun … 6=Dom  (JS getDay(): 0=Dom,1=Lun…6=Sáb → reindex)
      const JS2IDX = {1:0,2:1,3:2,4:3,5:4,6:5,0:6}
      const buckets = Array.from({length:7}, ()=>({importes:[],unidades:[]}))
      Object.entries(fechaMap).forEach(([fecha, v]) => {
        const idx = JS2IDX[new Date(fecha+'T12:00').getDay()]
        buckets[idx].importes.push(v.importe)
        buckets[idx].unidades.push(v.unidades)
      })
      setDiaSemanaData({
        avgImporte:  buckets.map(b => b.importes.length  ? b.importes.reduce((s,v)=>s+v,0)/b.importes.length   : null),
        avgUnidades: buckets.map(b => b.unidades.length  ? b.unidades.reduce((s,v)=>s+v,0)/b.unidades.length   : null),
        maxImporte:  buckets.map(b => b.importes.length  ? Math.max(...b.importes)  : null),
        minImporte:  buckets.map(b => b.importes.length  ? Math.min(...b.importes)  : null),
        maxUnidades: buckets.map(b => b.unidades.length  ? Math.max(...b.unidades)  : null),
        minUnidades: buckets.map(b => b.unidades.length  ? Math.min(...b.unidades)  : null),
        cnt:         buckets.map(b => b.importes.length),
      })

      setLastUpd(new Date())
    } catch(e) { console.error(e) }
    setLoading(false)
  }, [rango, granularidad, rangoDesde, rangoHasta, cierresManuales, loadKpiMes])

  useEffect(()=>{ load() },[load])

  // Re-calcular rentabilidad al cambiar filtro canal
  useEffect(()=>{
    if(!kpi) return
    const { from, to } = getRangoFechas(rango, rangoDesde, rangoHasta)
    fetchRentabilidadCategoria(from, to, rentCanalFiltro).then(setRentCat)
  }, [rentCanalFiltro, rango, rangoDesde, rangoHasta, kpi])

  // ── Datos de gráficas ────────────────────────────────────────────────────
  const catsFiltered = catSeries?(famFilter.length>0?catSeries.cats.filter(c=>famFilter.includes(c)):catSeries.cats):[]

  // Series fantasma del período anterior
  const ghostLabel = rango==='semana'?'sem. ant.':rango==='mes'||rango==='mes-ant'?'mes ant.':rango==='trim'?'trim. ant.':rango==='12m'?'12m ant.':rango==='18m'?'18m ant.':rango==='36m'?'36m ant.':'año ant.'
  const ghostPad = (arr) => {
    if (!arr || !series) return []
    const len = series.labels.length
    return arr.length >= len ? arr.slice(0, len) : [...arr, ...Array(len - arr.length).fill(null)]
  }
  const ghostDatasets = seriesAnt ? [
    { type:'bar',  label:`Ing. ${ghostLabel}`,  data: ghostPad(seriesAnt.ventas),    backgroundColor:'#00000018', borderRadius:3, order:3, borderSkipped:false },
    { type:'line', label:`Util. ${ghostLabel}`,  data: ghostPad(seriesAnt.utilidad), borderColor:'#00000030', borderWidth:1.5, borderDash:[3,3], pointRadius:0, fill:false, tension:0.3, order:1 },
  ] : []

  const mainData = series ? {
    labels: series.labels,
    datasets:[
      ...ghostDatasets,
      {type:'bar', label:'Ingresos', data:series.ventas, backgroundColor:C.blue+'BB', borderRadius:3, order:2},
      {type:'bar', label:'Gastos',   data:series.gastos.map(v=>-v), backgroundColor:C.red+'AA', borderRadius:3, order:2},
      {type:'line',label:'Utilidad', data:series.utilidad, borderColor:C.green, borderWidth:2,
       borderDash:[5,4], pointRadius:2, pointBackgroundColor:series.utilidad.map(v=>v>=0?C.green:C.red),
       fill:false, tension:0.3, order:1},
      {type:'line',label:'Tendencia utilidad', data:trendline(series.utilidad), borderColor:C.green+'88',
       borderWidth:1.5, borderDash:[2,4], pointRadius:0, fill:false, tension:0, order:1},
    ]
  } : null

  const mainOpts = {
    responsive:true, maintainAspectRatio:false,
    plugins:{legend:{display:true,position:'top',labels:{color:tc(),font:{size:10},boxWidth:10,padding:10}},
      tooltip:{callbacks:{label:ctx=>{const v=ctx.raw;return ctx.dataset.label==='Gastos'?'Gastos: '+fmtK(Math.abs(v)):ctx.dataset.label+': '+fmtK(v)}}}},
    scales:{
      x:{ticks:{color:tc(),font:{size:10}},grid:{color:gc()},border:{display:false}},
      y:{ticks:{color:tc(),font:{size:10},callback:v=>fmtK(v)},grid:{color:gc()},border:{display:false}},
    }
  }

  const META_DIARIA = 100
  const metaUds = series?.labels ? series.labels.map(()=>{
    if(granularidad==='mensual') return META_DIARIA*26
    if(granularidad==='semanal') return META_DIARIA*6
    return META_DIARIA
  }) : []

  const famData = catSeries ? {
    labels: series?.labels||[],
    datasets:[
      ...(seriesAnt ? [{
        label: ghostLabel, type:'line',
        data: ghostPad(seriesAnt.ventas),
        borderColor:'#00000030', borderWidth:1.5, borderDash:[3,3],
        pointRadius:0, fill:false, tension:0.3, order:0,
      }] : []),
      ...catsFiltered.map((cat)=>({
        label:cat,
        data: catSeries.periodKeys.map(k=>Math.round((catSeries.impMap[k]?.[cat])||0)),
        backgroundColor: CAT_COLORS[catSeries.cats.indexOf(cat)%CAT_COLORS.length]+'CC',
        borderRadius:2, stack:'cats',
      }))
    ]
  } : null

  const udsData = catSeries ? {
    labels: series?.labels||[],
    datasets:[
      ...(seriesAnt ? [{
        label: ghostLabel, type:'line',
        data: ghostPad(seriesAnt.unidades),
        borderColor:'#00000030', borderWidth:1.5, borderDash:[3,3],
        pointRadius:0, fill:false, tension:0.3, order:0,
      }] : []),
      ...catsFiltered.map((cat)=>({
        label:cat,
        data: catSeries.periodKeys.map(k=>Math.round((catSeries.udsMap[k]?.[cat])||0)),
        backgroundColor: CAT_COLORS[catSeries.cats.indexOf(cat)%CAT_COLORS.length]+'CC',
        borderRadius:2, stack:'uds',
      })),
      {label:'Meta',data:metaUds,type:'line',borderColor:'#E24B4A',borderWidth:2,borderDash:[6,3],pointRadius:0,fill:false}
    ]
  } : null

  const gastoData = gastosCat.length ? {
    labels: gastosCat.map(g=>g.categoria),
    datasets:[{data:gastosCat.map(g=>g.monto),backgroundColor:GASTO_COLORS,borderRadius:4}]
  } : null

  const famOpts = {
    responsive:true, maintainAspectRatio:false,
    plugins:{legend:{display:true,position:'top',labels:{color:tc(),font:{size:10},boxWidth:10,padding:8}}},
    scales:{
      x:{ticks:{color:tc(),font:{size:10}},grid:{color:gc()},border:{display:false},stacked:true},
      y:{ticks:{color:tc(),font:{size:10},callback:v=>fmtK(v)},grid:{color:gc()},border:{display:false},stacked:true},
    }
  }

  const udsOpts = {...famOpts,
    scales:{...famOpts.scales,y:{...famOpts.scales.y,ticks:{color:tc(),font:{size:10},callback:v=>v.toLocaleString()}}}}

  const gastoOpts = {
    responsive:true, maintainAspectRatio:false, indexAxis:'y',
    plugins:{legend:{display:false}},
    scales:{
      x:{ticks:{color:tc(),font:{size:10},callback:v=>fmtK(v)},grid:{color:gc()},border:{display:false}},
      y:{ticks:{color:tc(),font:{size:10}},grid:{display:false},border:{display:false}},
    }
  }

  // Totales para P&L
  const totV        = series?.ventas.reduce((s,v)=>s+v,0)||0
  const totG        = series?.gastos.reduce((s,v)=>s+v,0)||0
  const totGCat     = gastosCat.reduce((s,g)=>s+g.monto,0)
  const totUds      = series?.unidades.reduce((s,v)=>s+v,0)||0
  const totGratis   = kpiMes?.gImporte || 0
  const totU        = totV - totG - ajustesCaja - totGratis

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div>

      {/* ── MODAL DRILL-DOWN ── */}
      {detalle && (
        <div onClick={()=>setDetalle(null)}
          style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:'var(--surface)',borderRadius:'var(--r-lg)',width:'100%',maxWidth:680,maxHeight:'80vh',display:'flex',flexDirection:'column',border:'0.5px solid var(--border-md)'}}>
            {/* Header */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 18px',borderBottom:'0.5px solid var(--border-md)'}}>
              <div>
                <div style={{fontSize:14,fontWeight:700}}>{detalle.titulo}</div>
                <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>
                  {getRangoFechas(rango,rangoDesde,rangoHasta).from} → {getRangoFechas(rango,rangoDesde,rangoHasta).to}
                </div>
              </div>
              <button onClick={()=>setDetalle(null)}
                style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--text2)',lineHeight:1,padding:'0 4px'}}>✕</button>
            </div>
            {/* Body */}
            <div style={{overflowY:'auto',flex:1}}>
              {detalleCargando ? (
                <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:120}}>
                  <div className="spinner"/>
                </div>
              ) : detalle.filas.length === 0 ? (
                <div style={{textAlign:'center',padding:'40px 0',color:'var(--text3)',fontSize:13}}>Sin registros en este período</div>
              ) : (
                <table className="tbl" style={{width:'100%'}}>
                  <thead>
                    <tr>{detalle.cols.map((c,i)=>(
                      <th key={i} className={i>0&&i===detalle.cols.length-1?'num':i>=detalle.cols.length-2?'num':''} style={{position:'sticky',top:0,background:'var(--surface)',fontSize:11}}>{c}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {detalle.filas.map((fila,i)=>(
                      <tr key={i}>
                        {fila.map((cel,j)=>{
                          const isNum = typeof cel === 'number'
                          const isLast = j === fila.length - 1
                          return (
                            <td key={j} className={isNum?'num':''} style={{fontSize:12,color:isLast&&isNum?'var(--text1)':undefined,fontWeight:isLast&&isNum?600:undefined}}>
                              {isLast&&isNum ? fmtM(cel) : isNum ? cel.toLocaleString('es-MX') : cel}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{fontWeight:700,borderTop:'2px solid var(--border-md)'}}>
                      {detalle.cols.map((c,i)=>{
                        const isLastNum = i === detalle.cols.length - 1
                        const total = isLastNum ? detalle.filas.reduce((s,f)=>s+(f[i]||0),0) : null
                        return <td key={i} className={isLastNum?'num':''} style={{fontSize:12}}>
                          {i===0?`${detalle.filas.length} registros`:total!=null?fmtM(total):''}
                        </td>
                      })}
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:10}}>
        <PeriodSwitcher rango={rango} granularidad={granularidad}
          onRango={setRango} onGranularidad={setGranularidad}
          rangoDesde={rangoDesde} rangoHasta={rangoHasta}
          onRangoChange={(d,h)=>{setRangoDesde(d);setRangoHasta(h)}}/>
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <button onClick={()=>setShowComp(s=>!s)}
            style={{padding:'3px 10px',borderRadius:99,fontSize:11,cursor:'pointer',border:'0.5px solid var(--border-md)',
              background:showComp?'var(--accent)':'transparent',color:showComp?'#fff':'var(--text2)'}}>
            Comparar años
          </button>
          <ExportBtn titulo="Resultados" getElement={()=>document.querySelector('.content')}/>
          <button onClick={()=>handleReporte(false)} disabled={generando||loading}
            style={{padding:'3px 10px',borderRadius:99,fontSize:11,cursor:'pointer',border:'0.5px solid var(--border-md)',background:'transparent',color:'var(--text2)'}}>
            {generando?'Generando…':'⬇ PDF'}
          </button>
          <button onClick={()=>handleReporte(true)} disabled={generando||loading}
            style={{padding:'3px 10px',borderRadius:99,fontSize:11,cursor:'pointer',border:'0.5px solid #25D366',background:'transparent',color:'#25D366'}}>
            📤 Compartir
          </button>
          <div style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'var(--text3)'}}>
            <span className="live-dot"/>
            {lastUpd.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}
          </div>
        </div>
      </div>

      {/* ── FILTRO CANAL ── */}
      {canales.length>0 && (
        <div style={{display:'flex',gap:5,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
          <span style={{fontSize:11,color:'var(--text2)',marginRight:2}}>Canal:</span>
          <button onClick={()=>{setCanalFiltros([]);aplicarFiltroCanal([])}}
            style={{padding:'3px 10px',borderRadius:99,fontSize:10,cursor:'pointer',
              border:`1.5px solid ${canalFiltros.length===0?'var(--accent)':'var(--border-md)'}`,
              background:canalFiltros.length===0?'var(--accent)22':'transparent',
              color:canalFiltros.length===0?'var(--accent)':'var(--text2)'}}>Todos</button>
          {canales.map(c=>(
            <button key={c.canal} onClick={()=>{
              const nv=canalFiltros.includes(c.canal)?canalFiltros.filter(x=>x!==c.canal):[...canalFiltros,c.canal]
              setCanalFiltros(nv); aplicarFiltroCanal(nv)
            }} style={{padding:'3px 10px',borderRadius:99,fontSize:10,cursor:'pointer',
              border:`1.5px solid ${canalFiltros.includes(c.canal)?'var(--accent)':'var(--border-md)'}`,
              background:canalFiltros.includes(c.canal)?'var(--accent)22':'transparent',
              color:canalFiltros.includes(c.canal)?'var(--accent)':'var(--text2)'}}>
              {c.canal}
            </button>
          ))}
          {canalFiltros.length>0&&<span style={{fontSize:10,color:'var(--text3)',marginLeft:4}}>— filtrando</span>}
        </div>
      )}

      {/* ── KPI CARDS PRINCIPALES ── */}
      {(() => {
        const ventasGratis  = kpiMes?.gImporte || 0
        const utilidad      = kpi ? kpi.ventas - kpi.gastos - ajustesCaja - ventasGratis : 0
        const margen        = kpi?.ventas > 0 ? Math.round(utilidad / kpi.ventas * 100) : 0
        return (
          <div className="metrics">
            <KpiCard label="Ventas"           value={kpi?.ventas}     prefix="$"    loading={loading} sub={<span className={`mc-sub${color(kpi?.ventasVsPrev)}`}>{pctFmt(kpi?.ventasVsPrev)}</span>} ghost={kpiAnt?.ventas}/>
            <KpiCard label="Unidades"         value={kpi?.unidades}   suffix=" uds" loading={loading} ghost={kpiAnt?.unidades}/>
            <KpiCard label="Ticket promedio"  value={kpi?.ticketProm} prefix="$"    loading={loading} sub={kpi?.ordenes?`${kpi.ordenes.toLocaleString('es-MX')} comandas`:''} ghost={kpiAnt?.ticketProm}/>
            <KpiCard label="Gastos"           value={kpi?.gastos}     prefix="$"    loading={loading} ghost={kpiAnt?.gastos}/>
            <KpiCard label="Ajustes de caja"  value={ajustesCaja}     prefix="$"    loading={loading} sub="incl. en Gastos" ghost={ajustesCajaAnt||null}/>
            <KpiCard label="No cobrado"       value={ventasGratis}    prefix="$"    loading={loading} sub={kpiMes ? `${kpiMes.gCnt} órdenes gratis` : ''} ghost={kpiMesAnt?.gImporte||null}/>
            <KpiCard label="Utilidad"         value={utilidad}        prefix="$"    loading={loading} sub={`Margen ${margen}%`} ghost={kpiAnt ? kpiAnt.ventas - kpiAnt.gastos - (ajustesCajaAnt||0) - (kpiMesAnt?.gImporte||0) : null}/>
          </div>
        )
      })()}

      {/* ── SALDO POR CAJA — solo en vista mensual ── */}
      {rango === 'mes' && kpiMesActual && (() => {
        const { efvo, tc, plat, platMes, label } = kpiMesActual
        const total = efvo + tc + plat
        const items = [
          { label:'💵 Efectivo',              val: efvo,    sub: null },
          { label:'💳 Tarjeta',               val: tc,      sub: null },
          { label:'📦 Plataformas · saldo',   val: plat,    sub: 'Acumulado pendiente de cobro' },
          { label:'📦 Plataformas · mes',     val: platMes, sub: 'Acumulado del mes en curso' },
        ]
        return (
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:12}}>
            {items.map(it=>(
              <div key={it.label} style={{
                padding:'12px 14px', borderRadius:'var(--r-sm)',
                background:'#EAF3DE', border:'1.5px solid #1D9E7533',
              }}>
                <div style={{fontSize:10,fontWeight:700,color:'#3B6D11',textTransform:'uppercase',letterSpacing:.5,marginBottom:4}}>{it.label}</div>
                <div style={{fontSize:20,fontWeight:800,color:it.val>=0?'#1D9E75':'#E24B4A',lineHeight:1}}>
                  {it.val>=0?'':'-'}{fmtM(Math.abs(it.val))}
                </div>
                <div style={{fontSize:9,color:'#3B6D11',marginTop:4}}>
                  {it.sub ?? `${total!==0?Math.round(it.val/Math.abs(total)*100):0}% del saldo · ${label}`}
                </div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* ── AJUSTES POR CANAL (3 cards, fila completa) ── */}
      {kpiMes && (Math.abs(kpiMes.ajEfvo)>=1||Math.abs(kpiMes.ajTc)>=1||Math.abs(kpiMes.ajPlat)>=1) && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:12}}>
          {[
            {label:'Ajuste Efectivo',   val:kpiMes.ajEfvo, hint:'Faltantes − sobrantes en caja física'},
            {label:'Ajuste Tarjeta',    val:kpiMes.ajTc,   hint:'Faltantes − sobrantes en terminal'},
            {label:'Ajuste Plataforma', val:kpiMes.ajPlat, hint:'Faltantes − sobrantes en plataformas'},
          ].map(k=>(
            <div key={k.label} title={k.hint} style={{
              padding:'10px 14px', borderRadius:'var(--r-sm)',
              background:'#FFF8E6', border:'0.5px solid #EF9F2744',
              textAlign:'center',
            }}>
              <div style={{fontSize:9,fontWeight:700,color:'#8A5A00',textTransform:'uppercase',letterSpacing:.5,marginBottom:3}}>{k.label}</div>
              <div style={{fontSize:18,fontWeight:800,color:Math.abs(k.val)<1?'var(--text2)':k.val>0?'#EF9F27':'#1D9E75'}}>
                {(k.val>0?'+':'')+fmtM(k.val)}
              </div>
              <div style={{fontSize:9,color:'#8A5A00',marginTop:2}}>{kpiMes.periodoLabel}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── PROYECCIÓN DE CIERRE DE MES ── */}
      {proy&&!loading&&(
        <div className="card" style={{marginBottom:12,padding:'12px 16px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <div>
              <div style={{fontSize:12,fontWeight:600}}>
                Proyección de cierre de {proy.tipo==='trim'?'trimestre':proy.tipo==='anio'?'año':'mes'}
              </div>
              <div style={{fontSize:11,color:'var(--text2)'}}>{proy.dt} días abiertos de {proy.total} · {proy.pct}% · {proy.dr} días restantes</div>
            </div>
            <button onClick={()=>{const f=prompt('Fecha cierre manual (YYYY-MM-DD):');if(f&&/^\d{4}-\d{2}-\d{2}$/.test(f))setCierresManuales(p=>[...p,f])}}
              style={{padding:'3px 9px',fontSize:11,borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',color:'var(--text2)'}}>
              + Cierre manual
            </button>
          </div>
          <div style={{background:'var(--bg)',borderRadius:99,height:5,marginBottom:10,overflow:'hidden'}}>
            <div style={{width:proy.pct+'%',height:'100%',background:'var(--accent)',borderRadius:99}}/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
            {[
              {label:'Ventas proy.',   val:proy.pV,     actual:proy.ventasActual,    color:C.blue,  fmt:fmtM},
              {label:'Gastos proy.',   val:proy.pG,     actual:proy.gastosActual,    color:C.red,   fmt:fmtM},
              {label:'Utilidad proy.', val:proy.pU,     actual:proy.utilidadActual,  color:proy.pU>=0?C.green:C.red, fmt:fmtM},
              {label:'Unidades proy.', val:proy.pUnids, actual:proy.unidadesActual,  color:C.amber, fmt:v=>v?.toLocaleString('es-MX')},
            ].map(k2=>(
              <div key={k2.label} style={{background:'var(--bg)',borderRadius:'var(--r-md)',padding:'9px 11px',border:'0.5px solid var(--border)'}}>
                <div style={{fontSize:10,color:'var(--text2)',marginBottom:2}}>{k2.label}</div>
                <div style={{fontSize:15,fontWeight:700,color:k2.color}}>{k2.fmt(k2.val)}</div>
                <div style={{fontSize:10,color:'var(--text3)',marginTop:1}}>actual: {k2.fmt(k2.actual)}</div>
              </div>
            ))}
          </div>
          {/* Metadatos de la proyección inteligente */}
          <div style={{marginTop:8,display:'flex',gap:12,flexWrap:'wrap',fontSize:10,color:'var(--text3)'}}>
            {proy.aniosUsados > 0 && proy.ratioUsado != null ? (<>
              <span>📊 Basado en {proy.aniosUsados} año{proy.aniosUsados>1?'s':''} histórico{proy.aniosUsados>1?'s':''}</span>
              <span>· Completitud histórica a este día: <strong style={{color:'var(--text2)'}}>{proy.ratioUsado}%</strong></span>
              {proy.cagrMesPct !== 0 && <span>· CAGR del {proy.tipo==='trim'?'trimestre':proy.tipo==='anio'?'año':'mes'}: <strong style={{color:proy.cagrMesPct>=0?C.green:C.red}}>{proy.cagrMesPct>0?'+':''}{proy.cagrMesPct}%</strong></span>}
              <span>· Lineal: <strong>{fmtM(proy.proyLineal)}</strong></span>
            </>) : (
              <span>⚠ Sin datos históricos suficientes · usando proyección lineal</span>
            )}
          </div>
        </div>
      )}

      {/* ── COMPARATIVO ANUAL (toggle) ── */}
      {showComp&&comp.length>0&&!loading&&(
        <div className="card" style={{marginBottom:12}}>
          <div className="ch"><div className="ct">Comparativo anual</div></div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:8}}>
            {comp.map((c,i)=>(
              <div key={c.anio} style={{background:'var(--bg)',borderRadius:'var(--r-md)',padding:'10px 12px',borderLeft:`3px solid ${CAT_COLORS[i]}`}}>
                <div style={{fontSize:11,fontWeight:600,color:CAT_COLORS[i],marginBottom:4}}>{c.label} ({c.anio})</div>
                <div style={{fontSize:14,fontWeight:700}}>{fmtM(c.ventas)}</div>
                <div style={{fontSize:11,color:c.utilidad>=0?C.green:C.red,marginTop:2}}>Util: {fmtM(c.utilidad)}</div>
                <div style={{fontSize:10,color:'var(--text3)',marginTop:1}}>{c.unidades.toLocaleString()} uds</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PATRÓN POR DÍA DE SEMANA ── */}
      {(() => {
        const DIAS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
        const toggleDia = (i) => setDiasSel(prev =>
          prev.includes(i)
            ? prev.length > 1 ? prev.filter(d=>d!==i) : prev
            : [...prev, i].sort((a,b)=>a-b)
        )
        const sel = diasSel
        const avg     = dowMetrica==='ventas' ? diaSemanaData?.avgImporte  : diaSemanaData?.avgUnidades
        const maxArr  = dowMetrica==='ventas' ? diaSemanaData?.maxImporte  : diaSemanaData?.maxUnidades
        const minArr  = dowMetrica==='ventas' ? diaSemanaData?.minImporte  : diaSemanaData?.minUnidades
        const cnt     = diaSemanaData?.cnt || Array(7).fill(0)
        const fmtVal  = v => dowMetrica==='ventas' ? fmtK(v) : (v!=null?Math.round(v):null)
        // Promedio de los días seleccionados
        const selVals = sel.map(i => avg?.[i]).filter(v=>v!=null)
        const selAvg  = selVals.length ? selVals.reduce((s,v)=>s+v,0)/selVals.length : 0
        const barColors = DIAS.map((_,i) => sel.includes(i) ? (dowMetrica==='ventas'?C.blue+'CC':C.green+'CC') : '#cccccc44')
        const dowData = {
          labels: DIAS,
          datasets: [
            {
              type: 'bar',
              label: dowMetrica==='ventas' ? 'Promedio ingresos' : 'Promedio unidades',
              data: avg || Array(7).fill(null),
              backgroundColor: barColors,
              borderRadius: 4,
              order: 2,
              yAxisID: 'y',
            },
            {
              type: 'line',
              label: `Promedio general (días sel.)`,
              data: Array(7).fill(selAvg),
              borderColor: dowMetrica==='ventas' ? C.blue : C.green,
              borderWidth: 1.5,
              borderDash: [5,4],
              pointRadius: 0,
              fill: false,
              tension: 0,
              order: 1,
              yAxisID: 'y',
            },
          ]
        }
        const dowOpts = {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: ctx => {
                  const i = ctx[0].dataIndex
                  return `${DIAS[i]} — ${cnt[i]} días`
                },
                label: ctx => {
                  if (ctx.dataset.type === 'line') return ` Prom. gral: ${fmtVal(ctx.raw)}`
                  const i = ctx.dataIndex
                  return [
                    ` Prom: ${fmtVal(ctx.raw)}`,
                    maxArr?.[i] != null ? ` Máx: ${fmtVal(maxArr[i])}` : null,
                    minArr?.[i] != null ? ` Mín: ${fmtVal(minArr[i])}` : null,
                  ].filter(Boolean)
                }
              }
            }
          },
          scales: {
            x: { ticks:{color:tc(),font:{size:11}}, grid:{color:gc()}, border:{display:false} },
            y: { ticks:{color:tc(),font:{size:10},callback:v=>fmtVal(v)}, grid:{color:gc()}, border:{display:false} },
          }
        }
        return (
          <div className="card" style={{marginBottom:12}}>
            <div className="ch">
              <div className="ct">Patrón por día de semana</div>
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                <div className="period-sw">
                  <button className={`psw-btn${dowMetrica==='ventas'?' active':''}`} onClick={()=>setDowMetrica('ventas')}>Ingresos</button>
                  <button className={`psw-btn${dowMetrica==='unidades'?' active':''}`} onClick={()=>setDowMetrica('unidades')}>Unidades</button>
                </div>
              </div>
            </div>
            {/* Selectores de días */}
            <div style={{display:'flex',gap:6,marginBottom:10,flexWrap:'wrap'}}>
              {DIAS.map((d,i)=>(
                <button key={i} onClick={()=>toggleDia(i)} style={{
                  padding:'3px 10px', borderRadius:99, fontSize:11, fontWeight:600, cursor:'pointer',
                  border: sel.includes(i) ? `1.5px solid ${dowMetrica==='ventas'?C.blue:C.green}` : '1.5px solid var(--border)',
                  background: sel.includes(i) ? (dowMetrica==='ventas'?C.blue+'22':C.green+'22') : 'transparent',
                  color: sel.includes(i) ? (dowMetrica==='ventas'?C.blue:C.green) : 'var(--text3)',
                  transition: 'all 0.15s',
                }}>
                  {d}
                  {cnt[i]>0 && <span style={{fontSize:9,opacity:0.7,marginLeft:4}}>{cnt[i]}d</span>}
                </button>
              ))}
              {sel.length<7 && (
                <button onClick={()=>setDiasSel([0,1,2,3,4,5,6])} style={{
                  padding:'3px 10px',borderRadius:99,fontSize:10,cursor:'pointer',
                  border:'1.5px dashed var(--border)',background:'transparent',color:'var(--text3)',
                }}>Todos</button>
              )}
            </div>
            <div className="chart-wrap" style={{height:200}}>
              {loading
                ? <div className="loading-screen"><div className="spinner"/></div>
                : diaSemanaData
                  ? <Bar data={dowData} options={dowOpts}/>
                  : <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'var(--text3)',fontSize:12}}>Sin datos</div>
              }
            </div>
            {selAvg > 0 && (
              <div style={{marginTop:6,fontSize:10,color:'var(--text3)'}}>
                Prom. {sel.map(i=>DIAS[i]).join(', ')}: <strong style={{color:'var(--text1)'}}>{dowMetrica==='ventas'?'$':''}{Math.round(selAvg).toLocaleString('es-MX')}{dowMetrica==='unidades'?' uds':''}</strong>
                {sel.length < 7 && ` · ${sel.length} de 7 días seleccionados`}
              </div>
            )}
          </div>
        )
      })()}

      {/* ── GRÁFICA PRINCIPAL: INGRESOS · GASTOS · UTILIDAD ── */}
      <div className="card" style={{marginBottom:12}}>
        <div className="ch">
          <div className="ct">Ingresos · Gastos · Utilidad</div>
          <div style={{fontSize:10,color:'var(--text2)'}}>Ingresos arriba · Gastos abajo · Utilidad línea punteada</div>
        </div>
        <div className="chart-wrap" style={{height:210}}>
          {loading?<div className="loading-screen"><div className="spinner"/></div>
          :mainData?<Bar data={mainData} options={mainOpts}/>
          :<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'var(--text3)',fontSize:12}}>Sin datos</div>}
        </div>
      </div>

      {/* ── COSTO DE VENTAS VS INGRESOS ── */}
      {series?.costo&&(
        <div className="card" style={{marginBottom:12}}>
          <div className="ch">
            <div className="ct">Costo de ventas vs Ingresos</div>
            <div style={{fontSize:10,color:'var(--text2)'}}>Solo costo directo · línea roja = % costo sobre ingreso</div>
          </div>
          <div className="chart-wrap" style={{height:180}}>
            {loading?<div className="loading-screen"><div className="spinner"/></div>
            :<Bar data={{
              labels:series.labels,
              datasets:[
                ...(seriesAnt?[{type:'bar',label:ghostLabel,data:ghostPad(seriesAnt.ventas),backgroundColor:'#00000015',borderRadius:3,order:3,yAxisID:'y'}]:[]),
                {type:'bar',label:'Ingresos',data:series.ventas,backgroundColor:C.blue+'99',borderRadius:3,order:2,yAxisID:'y'},
                {type:'bar',label:'Costo directo',data:series.costo,backgroundColor:C.amber+'CC',borderRadius:3,order:2,yAxisID:'y'},
                {type:'line',label:'% Costo/Ingreso',data:series.pctCosto,borderColor:C.red,borderWidth:2,borderDash:[4,3],pointRadius:2,fill:false,tension:0.3,order:1,yAxisID:'y2'},
                {type:'line',label:'Tendencia %',data:trendline(series.pctCosto),borderColor:C.red+'66',borderWidth:1.5,borderDash:[2,4],pointRadius:0,fill:false,tension:0,order:1,yAxisID:'y2'},
              ]
            }} options={{
              responsive:true,maintainAspectRatio:false,
              plugins:{legend:{display:true,position:'top',labels:{color:tc(),font:{size:10},boxWidth:10,padding:10}}},
              scales:{
                x:{ticks:{color:tc(),font:{size:10}},grid:{color:gc()},border:{display:false}},
                y:{ticks:{color:tc(),font:{size:10},callback:v=>fmtK(v)},grid:{color:gc()},border:{display:false},position:'left'},
                y2:{ticks:{color:C.red,font:{size:10},callback:v=>v+'%'},grid:{display:false},border:{display:false},position:'right',min:0,max:100},
              }
            }}/>}
          </div>
        </div>
      )}

      {/* ── TENDENCIA INGRESOS Y UNIDADES ── */}
      <div className="two" style={{marginBottom:12}}>
        <div className="card">
          <div className="ch"><div className="ct">Tendencia — ingresos</div></div>
          <div className="chart-wrap" style={{height:170}}>
            {loading?<div className="loading-screen"><div className="spinner"/></div>
            :series?<Line data={{labels:series.labels,datasets:[
              ...(seriesAnt?[{label:ghostLabel,data:ghostPad(seriesAnt.ventas),borderColor:'#00000035',backgroundColor:'transparent',fill:false,tension:0.3,pointRadius:0,borderWidth:1.5,borderDash:[3,3]}]:[]),
              {label:'Ingresos',data:series.ventas,borderColor:C.blue,backgroundColor:C.blue+'15',fill:true,tension:0.3,pointRadius:2,borderWidth:2}
            ]}} options={{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{color:tc(),font:{size:10}},grid:{color:gc()},border:{display:false}},y:{ticks:{color:tc(),font:{size:10},callback:v=>fmtK(v)},grid:{color:gc()},border:{display:false}}}}}/>:null}
          </div>
        </div>
        <div className="card">
          <div className="ch"><div className="ct">Tendencia — unidades vendidas</div></div>
          <div className="chart-wrap" style={{height:170}}>
            {loading?<div className="loading-screen"><div className="spinner"/></div>
            :series?<Line data={{labels:series.labels,datasets:[
              ...(seriesAnt?[{label:ghostLabel,data:ghostPad(seriesAnt.unidades),borderColor:'#00000035',backgroundColor:'transparent',fill:false,tension:0.3,pointRadius:0,borderWidth:1.5,borderDash:[3,3]}]:[]),
              {label:'Unidades',data:series.unidades,borderColor:C.blue,backgroundColor:C.blue+'15',fill:true,tension:0.3,pointRadius:2,borderWidth:2},
              {label:'Meta',data:metaUds,borderColor:C.red,borderWidth:2,borderDash:[6,3],pointRadius:0,fill:false}
            ]}} options={{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'top',labels:{color:tc(),font:{size:10},boxWidth:10,padding:8}}},scales:{x:{ticks:{color:tc(),font:{size:10}},grid:{color:gc()},border:{display:false}},y:{ticks:{color:tc(),font:{size:10}},grid:{color:gc()},border:{display:false}}}}}/>:null}
          </div>
        </div>
      </div>

      {/* ── INGRESOS POR FAMILIA + EGRESOS POR CATEGORÍA ── */}
      <div className="two" style={{marginBottom:12}}>
        <div className="card">
          <div className="ch"><div className="ct">Ingresos por familia</div>
            {catSeries&&<div style={{display:'flex',flexWrap:'wrap',gap:4}}>
              <button onClick={()=>setFamFilter([])} style={{padding:'2px 8px',borderRadius:99,fontSize:10,cursor:'pointer',border:'0.5px solid var(--border-md)',background:famFilter.length===0?'var(--accent)':'transparent',color:famFilter.length===0?'#fff':'var(--text2)'}}>Todas</button>
              {catSeries.cats.map((cat,i)=>(
                <button key={cat} onClick={()=>setFamFilter(f=>f.includes(cat)?f.filter(x=>x!==cat):[...f,cat])}
                  style={{padding:'2px 8px',borderRadius:99,fontSize:10,cursor:'pointer',border:`0.5px solid ${CAT_COLORS[i%CAT_COLORS.length]}`,
                    background:famFilter.includes(cat)?CAT_COLORS[i%CAT_COLORS.length]:'transparent',color:famFilter.includes(cat)?'#fff':CAT_COLORS[i%CAT_COLORS.length]}}>
                  {cat}
                </button>
              ))}
            </div>}
          </div>
          <div className="chart-wrap" style={{height:180}}>
            {loading?<div className="loading-screen"><div className="spinner"/></div>
            :famData?<Bar data={famData} options={famOpts}/>:null}
          </div>
        </div>
        <div className="card">
          <div className="ch"><div className="ct">Egresos por categoría contable</div></div>
          <div className="chart-wrap" style={{height:210}}>
            {loading?<div className="loading-screen"><div className="spinner"/></div>
            :gastoData?<Bar data={gastoData} options={gastoOpts}/>:null}
          </div>
        </div>
      </div>

      {/* ── UNIDADES POR FAMILIA ── */}
      <div className="card" style={{marginBottom:12}}>
        <div className="ch">
          <div className="ct">Unidades vendidas por familia</div>
          {catSeries&&<div style={{display:'flex',flexWrap:'wrap',gap:4}}>
            <button onClick={()=>setFamFilter([])} style={{padding:'2px 8px',borderRadius:99,fontSize:10,cursor:'pointer',border:'0.5px solid var(--border-md)',background:famFilter.length===0?'var(--accent)':'transparent',color:famFilter.length===0?'#fff':'var(--text2)'}}>Todas</button>
            {catSeries.cats.map((cat,i)=>(
              <button key={cat} onClick={()=>setFamFilter(f=>f.includes(cat)?f.filter(x=>x!==cat):[...f,cat])}
                style={{padding:'2px 8px',borderRadius:99,fontSize:10,cursor:'pointer',border:`0.5px solid ${CAT_COLORS[i%CAT_COLORS.length]}`,
                  background:famFilter.includes(cat)?CAT_COLORS[i%CAT_COLORS.length]:'transparent',color:famFilter.includes(cat)?'#fff':CAT_COLORS[i%CAT_COLORS.length]}}>
                {cat}
              </button>
            ))}
          </div>}
        </div>
        <div className="chart-wrap" style={{height:180}}>
          {loading?<div className="loading-screen"><div className="spinner"/></div>
          :udsData?<Bar data={udsData} options={udsOpts} plugins={[stackedTotalPlugin]}/>:null}
        </div>
      </div>

      {/* ── TABLAS: POR FAMILIA + POR CANAL ── */}
      <div className="two" style={{marginBottom:12}}>
        <div className="card">
          <div className="ch"><div className="ct">Por familia</div></div>
          {loading?<div className="loading-screen" style={{height:140}}><div className="spinner"/></div>
          :<table className="tbl">
            <thead><tr><th>Familia</th><th className="num">Importe</th><th className="num">Uds</th><th className="num">%</th></tr></thead>
            <tbody>
              {cats.map((c,i)=>{
                const tot=cats.reduce((s,x)=>s+x.importe,0)
                return <tr key={c.categoria}>
                  <td><span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:CAT_COLORS[i],marginRight:5}}/><span style={{fontSize:12}}>{c.categoria}</span></td>
                  <td className="num" style={{fontWeight:500}}>{fmtM(c.importe)}</td>
                  <td className="num">{(c.unidades||0).toLocaleString()}</td>
                  <td className="num c-muted">{tot>0?Math.round(c.importe/tot*100):0}%</td>
                </tr>
              })}
            </tbody>
          </table>}
        </div>
        <div className="card">
          <div className="ch"><div className="ct">Por canal de venta</div></div>
          {canales.length>0&&(
            <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:10}}>
              <button onClick={()=>setCanalFiltros([])}
                style={{padding:'3px 10px',borderRadius:99,fontSize:10,cursor:'pointer',
                  border:`1.5px solid ${canalFiltros.length===0?'var(--accent)':'var(--border-md)'}`,
                  background:canalFiltros.length===0?'var(--accent)22':'transparent',
                  color:canalFiltros.length===0?'var(--accent)':'var(--text2)'}}>Todos</button>
              {canales.map(c=>(
                <button key={c.canal} onClick={()=>setCanalFiltros(prev=>prev.includes(c.canal)?prev.filter(x=>x!==c.canal):[...prev,c.canal])}
                  style={{padding:'3px 10px',borderRadius:99,fontSize:10,cursor:'pointer',
                    border:`1.5px solid ${canalFiltros.includes(c.canal)?'var(--accent)':'var(--border-md)'}`,
                    background:canalFiltros.includes(c.canal)?'var(--accent)22':'transparent',
                    color:canalFiltros.includes(c.canal)?'var(--accent)':'var(--text2)'}}>
                  {c.canal||'Sin dato'}
                </button>
              ))}
            </div>
          )}
          {loading?<div className="loading-screen" style={{height:140}}><div className="spinner"/></div>
          :<table className="tbl">
            <thead><tr><th>Canal</th><th className="num">Importe</th><th className="num">Uds</th><th className="num">%</th></tr></thead>
            <tbody>
              {(canalFiltros.length===0?canales:canales.filter(c=>canalFiltros.includes(c.canal))).map(c=>{
                const base=canalFiltros.length===0?canales:canales.filter(x=>canalFiltros.includes(x.canal))
                const tot=base.reduce((s,x)=>s+x.importe,0)
                return <tr key={c.canal} style={{cursor:'pointer'}} title="Doble clic para ver detalle"
                  onDoubleClick={()=>abrirDetalle('venta_canal',{
                    titulo:`Ventas canal: ${c.canal||'Sin dato'}`, canal:c.canal,
                    cols:['Fecha','Producto','Categoría','Método pago','Uds','Importe'],
                  })}>
                  <td style={{fontSize:12}}>{c.canal||'Sin dato'}</td>
                  <td className="num" style={{fontWeight:500}}>{fmtM(c.importe)}</td>
                  <td className="num c-muted">{(c.unidades||0).toLocaleString('es-MX')}</td>
                  <td className="num c-muted">{tot>0?Math.round(c.importe/tot*100):0}%</td>
                </tr>
              })}
            </tbody>
            {canalFiltros.length>0&&<tfoot><tr style={{fontWeight:700}}>
              <td>Selección</td>
              <td className="num">{fmtM(canales.filter(c=>canalFiltros.includes(c.canal)).reduce((s,c)=>s+c.importe,0))}</td>
              <td className="num">{canales.filter(c=>canalFiltros.includes(c.canal)).reduce((s,c)=>s+(c.unidades||0),0).toLocaleString('es-MX')}</td>
              <td className="num">{Math.round(canales.filter(c=>canalFiltros.includes(c.canal)).reduce((s,c)=>s+c.importe,0)/canales.reduce((s,c)=>s+c.importe,0)*100)}%</td>
            </tr></tfoot>}
          </table>}
        </div>
      </div>

      {/* ── RENTABILIDAD POR CATEGORÍA ── */}
      {rentCat.length>0&&(
        <div style={{marginBottom:12}}>
          <div style={{display:'flex',gap:5,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
            <span style={{fontSize:11,color:'var(--text2)',marginRight:4}}>Canal rentabilidad:</span>
            <button onClick={()=>setRentCanalFiltro([])}
              style={{padding:'3px 10px',borderRadius:99,fontSize:10,cursor:'pointer',
                border:`1.5px solid ${rentCanalFiltro.length===0?'var(--accent)':'var(--border-md)'}`,
                background:rentCanalFiltro.length===0?'var(--accent)22':'transparent',
                color:rentCanalFiltro.length===0?'var(--accent)':'var(--text2)'}}>Todos</button>
            {canales.map(c=>(
              <button key={c.canal} onClick={()=>setRentCanalFiltro(prev=>prev.includes(c.canal)?prev.filter(x=>x!==c.canal):[...prev,c.canal])}
                style={{padding:'3px 10px',borderRadius:99,fontSize:10,cursor:'pointer',
                  border:`1.5px solid ${rentCanalFiltro.includes(c.canal)?'var(--accent)':'var(--border-md)'}`,
                  background:rentCanalFiltro.includes(c.canal)?'var(--accent)22':'transparent',
                  color:rentCanalFiltro.includes(c.canal)?'var(--accent)':'var(--text2)'}}>
                {c.canal}
              </button>
            ))}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div className="card">
              <div className="ch"><div className="ct">Rentabilidad por categoría</div></div>
              <table className="tbl">
                <thead><tr><th>Categoría</th><th className="num">Ingresos</th><th className="num">Costo</th>{rentCat.some(r=>r.comision>0)&&<th className="num">Comisión</th>}<th className="num">Utilidad</th><th className="num">Margen</th></tr></thead>
                <tbody>
                  {rentCat.map(r=>(
                    <tr key={r.categoria} style={{cursor:'pointer'}} title="Doble clic para ver detalle"
                      onDoubleClick={()=>abrirDetalle('venta_categoria',{
                        titulo:`Ventas: ${r.categoria}`, categoria:r.categoria,
                        cols:['Fecha','Producto','Canal','Método pago','Uds','Importe'],
                      })}>
                      <td style={{fontSize:12}}>{r.categoria}</td>
                      <td className="num">{fmtM(r.importe)}</td>
                      <td className="num" style={{color:C.red}}>{fmtM(r.costo)}</td>
                      {rentCat.some(x=>x.comision>0)&&<td className="num" style={{color:C.amber}}>{r.comision>0?fmtM(r.comision):'—'}</td>}
                      <td className="num" style={{color:r.utilidad>=0?C.green:C.red,fontWeight:600}}>{fmtM(r.utilidad)}</td>
                      <td className="num"><span style={{color:r.margen>=50?C.green:r.margen>=30?C.amber:C.red,fontWeight:600}}>{r.margen}%</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card">
              <div className="ch"><div className="ct">Costo vs Ingreso por categoría</div></div>
              {rentCat.map(r=>(
                <div key={r.categoria} style={{marginBottom:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:3}}>
                    <span style={{fontWeight:500}}>{r.categoria}</span>
                    <span style={{color:'var(--text2)',fontSize:10}}>margen {r.margen}%</span>
                  </div>
                  <div style={{height:12,background:'var(--border)',borderRadius:6,overflow:'hidden',position:'relative'}}>
                    <div style={{position:'absolute',left:0,top:0,height:'100%',width:`${r.importe>0?Math.min(100,Math.round(r.costo/r.importe*100)):0}%`,background:C.red,borderRadius:6}}/>
                    <div style={{position:'absolute',left:`${r.importe>0?Math.min(100,Math.round(r.costo/r.importe*100)):0}%`,top:0,height:'100%',width:`${r.importe>0?r.margen:0}%`,background:C.green,borderRadius:6}}/>
                  </div>
                  <div style={{display:'flex',gap:10,fontSize:9,color:'var(--text3)',marginTop:2}}>
                    <span style={{color:C.red}}>■ Costo {fmtM(r.costo)}</span>
                    <span style={{color:C.green}}>■ Utilidad {fmtM(r.utilidad)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── RENTABILIDAD POR CANAL ── */}
      {rentCanal.length>0&&(
        <div className="card" style={{marginBottom:12}}>
          <div className="ch"><div className="ct">Rentabilidad por canal</div></div>
          <table className="tbl" style={{marginBottom:12}}>
            <thead>
              <tr>
                <th>Canal</th>
                <th className="num">Ingresos</th>
                <th className="num">Costo</th>
                {rentCanal.some(r=>r.comision>0)&&<th className="num">Comisión</th>}
                <th className="num">Utilidad</th>
                <th className="num">Margen</th>
              </tr>
            </thead>
            <tbody>
              {rentCanal.map(r=>(
                <tr key={r.canal} style={{cursor:'pointer'}} title="Doble clic para ver detalle"
                  onDoubleClick={()=>abrirDetalle('venta_canal',{
                    titulo:`Ventas canal: ${r.canal}`, canal:r.canal,
                    cols:['Fecha','Producto','Categoría','Método pago','Uds','Importe'],
                  })}>
                  <td style={{fontSize:12,fontWeight:500}}>{r.canal}</td>
                  <td className="num">{fmtM(r.importe)}</td>
                  <td className="num" style={{color:C.red}}>{fmtM(r.costo)}</td>
                  {rentCanal.some(x=>x.comision>0)&&<td className="num" style={{color:C.amber}}>{r.comision>0?fmtM(r.comision):'—'}</td>}
                  <td className="num" style={{color:r.utilidad>=0?C.green:C.red,fontWeight:600}}>{fmtM(r.utilidad)}</td>
                  <td className="num"><span style={{color:r.margen>=50?C.green:r.margen>=30?C.amber:C.red,fontWeight:600}}>{r.margen}%</span></td>
                </tr>
              ))}
              <tr style={{fontWeight:700,borderTop:'2px solid var(--border-md)'}}>
                <td>Total</td>
                <td className="num">{fmtM(rentCanal.reduce((s,r)=>s+r.importe,0))}</td>
                <td className="num" style={{color:C.red}}>{fmtM(rentCanal.reduce((s,r)=>s+r.costo,0))}</td>
                {rentCanal.some(x=>x.comision>0)&&<td className="num" style={{color:C.amber}}>{fmtM(rentCanal.reduce((s,r)=>s+r.comision,0))}</td>}
                <td className="num" style={{color:C.green}}>{fmtM(rentCanal.reduce((s,r)=>s+r.utilidad,0))}</td>
                <td className="num" style={{color:C.green}}>
                  {(()=>{const tot=rentCanal.reduce((s,r)=>s+r.importe,0);return tot>0?Math.round(rentCanal.reduce((s,r)=>s+r.utilidad,0)/tot*100)+'%':'—'})()}
                </td>
              </tr>
            </tbody>
          </table>
          {/* Barras visuales por canal */}
          {rentCanal.map((r,i)=>(
            <div key={r.canal} style={{marginBottom:10}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:3}}>
                <span style={{fontWeight:500}}>{r.canal}</span>
                <span style={{color:'var(--text2)',fontSize:10}}>{fmtM(r.importe)} · margen {r.margen}%</span>
              </div>
              <div style={{height:12,background:'var(--border)',borderRadius:6,overflow:'hidden',position:'relative'}}>
                <div style={{position:'absolute',left:0,top:0,height:'100%',width:`${r.importe>0?Math.min(100,Math.round(r.costo/r.importe*100)):0}%`,background:C.red,borderRadius:6}}/>
                <div style={{position:'absolute',left:`${r.importe>0?Math.min(100,Math.round(r.costo/r.importe*100)):0}%`,top:0,height:'100%',width:`${r.importe>0?r.margen:0}%`,background:CAT_COLORS[i%CAT_COLORS.length],borderRadius:6}}/>
              </div>
              <div style={{display:'flex',gap:10,fontSize:9,color:'var(--text3)',marginTop:2}}>
                <span style={{color:C.red}}>■ Costo {fmtM(r.costo)}</span>
                {r.comision>0&&<span style={{color:C.amber}}>■ Comisión {fmtM(r.comision)}</span>}
                <span style={{color:CAT_COLORS[i%CAT_COLORS.length]}}>■ Utilidad {fmtM(r.utilidad)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── P&L: DETALLE POR PERIODO ── */}
      {series&&(
        <div className="card" style={{marginBottom:12}}>
          <div className="ch">
            <div className="ct">P&L — Detalle por periodo</div>
            <div style={{fontSize:10,color:'var(--text2)'}}>
              {fmtM(totV)} ingresos · {fmtM(totG)} gastos{totGratis>0?` · ${fmtM(totGratis)} no cobrado`:''} · <span style={{color:totU>=0?C.green:C.red,fontWeight:600}}>{fmtM(totU)} utilidad</span> · {totV>0?Math.round(totU/totV*100)+'%':'—'} margen
            </div>
          </div>
          <div style={{overflowX:'auto',maxHeight:380,overflowY:'auto'}}>
            <table className="tbl" style={{minWidth:600}}>
              <thead style={{position:'sticky',top:0,background:'var(--surface)'}}>
                <tr><th>Periodo</th><th className="num">Ingresos</th><th className="num">Gastos</th><th className="num">Utilidad</th><th className="num">Margen</th><th className="num">Uds</th><th style={{textAlign:'center'}}>↕</th></tr>
              </thead>
              <tbody>
                {series.labels.map((lbl,i)=>{
                  const v=series.ventas[i],g=series.gastos[i],u=series.utilidad[i]
                  const m=v>0?Math.round(u/v*100):null
                  const trend=i>0?(v>series.ventas[i-1]?'↑':'↓'):'—'
                  return <tr key={lbl}>
                    <td style={{fontWeight:500,whiteSpace:'nowrap'}}>{lbl}</td>
                    <td className="num">{fmtM(v)}</td>
                    <td className="num">{fmtM(g)}</td>
                    <td className={`num ${u>=0?'c-green':'c-red'}`}>{fmtM(u)}</td>
                    <td className={`num ${m!=null&&m>=0?'c-green':'c-red'}`}>{m!=null?m+'%':'—'}</td>
                    <td className="num">{series.unidades[i].toLocaleString()}</td>
                    <td style={{textAlign:'center',fontSize:14}} className={trend==='↑'?'c-green':trend==='↓'?'c-red':'c-muted'}>{trend}</td>
                  </tr>
                })}
                <tr style={{fontWeight:700,borderTop:'2px solid var(--border-md)'}}>
                  <td>Total</td>
                  <td className="num">{fmtM(totV)}</td>
                  <td className="num">{fmtM(totG)}</td>
                  <td className={`num ${totU>=0?'c-green':'c-red'}`}>{fmtM(totU)}</td>
                  <td className={`num ${totU>=0?'c-green':'c-red'}`}>{totV>0?Math.round(totU/totV*100)+'%':'—'}</td>
                  <td className="num">{totUds.toLocaleString()}</td>
                  <td/>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── GASTOS POR CATEGORÍA CONTABLE ── */}
      {gastosCat.length>0&&(
        <div className="card" style={{marginBottom:12}}>
          <div className="ch">
            <div className="ct">Gastos por categoría contable</div>
            <div style={{fontSize:10,color:'var(--text3)'}}>💡 Doble clic en fila para ver detalle</div>
          </div>
          <table className="tbl">
            <thead><tr><th>Categoría</th><th className="num">Monto</th><th className="num">%</th></tr></thead>
            <tbody>
              {gastosCat.map(g=>(
                <tr key={g.categoria} style={{cursor:'pointer'}} title="Doble clic para ver detalle"
                  onDoubleClick={()=>abrirDetalle('gasto_categoria',{
                    titulo:`Gastos: ${g.categoria}`, categoria:g.categoria,
                    cols:['Fecha','Concepto','Subcategoría','Proveedor','Monto'],
                  })}>
                  <td>{g.categoria}</td>
                  <td className="num">{fmtM(g.monto)}</td>
                  <td className="num c-muted">{totGCat>0?Math.round(g.monto/totGCat*100):0}%</td>
                </tr>
              ))}
              <tr style={{fontWeight:600,borderTop:'1px solid var(--border-md)'}}>
                <td>Total gastos</td><td className="num">{fmtM(totGCat)}</td><td className="num">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── PAGO DE GANANCIAS POR SOCIO ── */}
      {pagoSocios.length>0&&(
        <div className="card" style={{marginBottom:12}}>
          <div className="ch">
            <div className="ct">Pago de Ganancias por Socio</div>
            <div style={{fontSize:11,color:'var(--text2)'}}>Total: {fmtM(pagoSocios.reduce((s,x)=>s+x.monto,0))}</div>
          </div>
          <div style={{padding:'10px 14px'}}>
            <div style={{fontSize:10,color:'var(--text3)',marginBottom:8}}>💡 Doble clic en una barra para ver el detalle</div>
            {pagoSocios.map(s=>{
              const tot=pagoSocios.reduce((sum,x)=>sum+x.monto,0)
              const pct=tot>0?(s.monto/tot*100):0
              const col=s.socio==='Socio 1'?C.blue:s.socio==='Socio 2'?C.pink:C.gray
              const lbl=s.socio==='Socio 1'?'Socio 1 (Memo)':s.socio==='Socio 2'?'Socio 2 (Monica)':s.socio
              return(
                <div key={s.socio} style={{marginBottom:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,fontSize:12}}>
                    <span style={{fontWeight:600}}>{lbl}</span>
                    <span><strong>{fmtM(s.monto)}</strong> <span style={{color:'var(--text3)'}}>({pct.toFixed(1)}%)</span></span>
                  </div>
                  <div title="Doble clic para ver detalle" onDoubleClick={()=>abrirDetalle('gasto_subcategoria',{
                    titulo:`Ganancias ${lbl}`, categoria:'PAGO DE GANANCIAS', subcategoria:s.socio,
                    cols:['Fecha','Concepto','Proveedor','Monto'],
                  })} style={{height:14,background:'var(--bg)',borderRadius:7,overflow:'hidden',cursor:'pointer'}}>
                    <div style={{width:pct+'%',height:'100%',background:col,transition:'width 0.5s ease'}}/>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── INGRESOS VS GASTOS POR CATEGORÍA ── */}
      <IngresoGastoCategorias titulo="Ingresos vs Gastos por categoría" rango={rango} rangoDesde={rangoDesde} rangoHasta={rangoHasta}/>

      {/* ── PROMEDIO DIARIO POR CATEGORÍA ── */}
      {promedioDiario&&promedioDiario.meses.length>0&&(
        <div className="card" style={{marginTop:12}}>
          <div className="ch">
            <div className="ct">Promedio diario por categoría — mes a mes</div>
            <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
              {[2024,2025,2026].map(a=>(
                <button key={a} onClick={async()=>{
                  const activos=promAnios.includes(a)?promAnios.filter(x=>x!==a):[...promAnios,a]
                  if(activos.length===0) return
                  setPromAnios(activos)
                  setPromedioDiario(await fetchPromedioDiarioMes(activos))
                }} className={`psw-btn${promAnios.includes(a)?' active':''}`} style={{fontSize:10,padding:'3px 10px'}}>{a}</button>
              ))}
              <button onClick={()=>setPromMetrica('unidades')} className={`psw-btn${promMetrica==='unidades'?' active':''}`}>Unidades</button>
              <button onClick={()=>setPromMetrica('importe')}  className={`psw-btn${promMetrica==='importe'?' active':''}`}>Ingresos</button>
            </div>
          </div>
          <div style={{overflowX:'auto'}}>
            <table className="tbl" style={{minWidth:700}}>
              <thead>
                <tr>
                  <th>Categoría</th>
                  {promedioDiario.meses.map(m=>(
                    <th key={m} className="num" style={{fontSize:10}}>
                      {new Date(m+'-15').toLocaleDateString('es-MX',{month:'short',year:'2-digit'})}
                      <div style={{fontSize:9,color:'var(--text3)',fontWeight:400}}>{promedioDiario.result[m]?.[promedioDiario.cats[0]]?.dias||0}d</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {promedioDiario.cats.map((cat,ci)=>(
                  <tr key={cat}>
                    <td style={{fontSize:11,fontWeight:500}}>
                      <span style={{display:'inline-block',width:8,height:8,borderRadius:99,background:CAT_COLORS[ci%CAT_COLORS.length],marginRight:6}}/>
                      {cat}
                    </td>
                    {promedioDiario.meses.map(m=>{
                      const v=promedioDiario.result[m]?.[cat]?.[promMetrica]||0
                      const vals=promedioDiario.meses.map(mm=>promedioDiario.result[mm]?.[cat]?.[promMetrica]||0)
                      const max=Math.max(...vals), pct=max>0?v/max:0
                      return(
                        <td key={m} className="num" style={{fontSize:11}}>
                          <div style={{fontSize:11,fontWeight:v>0?600:400,color:v>0?'var(--text1)':'var(--text3)'}}>
                            {promMetrica==='importe'?(v>0?'$'+Math.round(v/1000*10)/10+'k':'—'):(v||'—')}
                          </div>
                          {v>0&&<div style={{height:3,background:CAT_COLORS[ci%CAT_COLORS.length],borderRadius:99,width:Math.round(pct*100)+'%',marginTop:2,opacity:0.7}}/>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── COMPARATIVO ENTRE PERÍODOS Y AÑOS ── */}
      <div className="card" style={{marginTop:12}}>
        <div className="ch">
          <div className="ct">Comparativo entre períodos y años</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
            <select className="form-input" style={{width:110,padding:'3px 8px',fontSize:11}} value={compMesDesde} onChange={e=>{setCompMesDesde(+e.target.value);setCompPeriodos(null)}}>
              {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map((m,i)=>(<option key={i} value={i+1}>{m}</option>))}
            </select>
            <span style={{fontSize:11,color:'var(--text2)'}}>a</span>
            <select className="form-input" style={{width:110,padding:'3px 8px',fontSize:11}} value={compMesHasta} onChange={e=>{setCompMesHasta(+e.target.value);setCompPeriodos(null)}}>
              {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map((m,i)=>(<option key={i} value={i+1}>{m}</option>))}
            </select>
            {['ventas','unidades','utilidad','gastos'].map(m=>(
              <button key={m} onClick={()=>setCompMetrica(m)} className={`psw-btn${compMetrica===m?' active':''}`} style={{fontSize:10,padding:'3px 10px'}}>
                {m==='ventas'?'Ingresos':m==='unidades'?'Unidades':m==='utilidad'?'Utilidad':'Gastos'}
              </button>
            ))}
            <button onClick={async()=>setCompPeriodos(await fetchComparativoPeriodos(compMesDesde,compMesHasta,[2023,2024,2025,2026]))}
              style={{padding:'3px 14px',borderRadius:99,fontSize:11,cursor:'pointer',border:'none',background:'var(--accent)',color:'#fff',fontWeight:600}}>
              Comparar
            </button>
          </div>
        </div>
        {compPeriodos?(
          <div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:14}}>
              {[2023,2024,2025,2026].map(anio=>{
                const d=compPeriodos[anio]; if(!d) return null
                const v=d[compMetrica]||0, prev=compPeriodos[anio-1]?.[compMetrica]||0
                const crecPct=prev>0?Math.round((v-prev)/prev*100):null
                return(
                  <div key={anio} className="mc">
                    <div className="mc-label">{anio}{anio===2023?' (sep-dic)':''}</div>
                    <div className="mc-value" style={{color:C.blue,fontSize:16}}>{compMetrica==='unidades'?Math.round(v).toLocaleString('es-MX'):fmtM(v)}</div>
                    {crecPct!==null&&<div style={{fontSize:10,color:crecPct>=0?C.green:C.red,marginTop:2}}>{crecPct>=0?'▲':'▼'} {Math.abs(crecPct)}% vs {anio-1}</div>}
                    <div style={{fontSize:9,color:'var(--text3)',marginTop:1}}>{d.diasConVentas} días hábiles</div>
                  </div>
                )
              })}
            </div>
            <Bar data={{
              labels:['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].slice(compMesDesde-1,compMesHasta),
              datasets:[2023,2024,2025,2026].filter(a=>compPeriodos[a]).map((anio,i)=>({
                label:String(anio),
                data:Array.from({length:compMesHasta-compMesDesde+1},(_,idx)=>{
                  const mes=String(compMesDesde+idx).padStart(2,'0')
                  return Math.round(compPeriodos[anio]?.porMes?.[mes]?.[compMetrica]||0)
                }),
                backgroundColor:[C.blue,C.green,C.amber,C.purple][i]+'99',
                borderColor:[C.blue,C.green,C.amber,C.purple][i],
                borderWidth:1,
              }))
            }} options={{responsive:true,
              plugins:{legend:{position:'top',labels:{color:tc(),font:{size:11}}},
                tooltip:{callbacks:{label:ctx=>compMetrica==='unidades'?ctx.dataset.label+': '+ctx.raw+' uds':ctx.dataset.label+': $'+Math.round(ctx.raw).toLocaleString('es-MX')}}},
              scales:{x:{ticks:{color:tc()},grid:{color:gc()}},y:{ticks:{color:tc(),callback:v=>compMetrica==='unidades'?v:fmtK(v)},grid:{color:gc()}}}
            }}/>
          </div>
        ):<div style={{textAlign:'center',padding:'30px 0',color:'var(--text3)',fontSize:12}}>Selecciona el período y presiona Comparar</div>}
      </div>

      {/* ── CAGR ── */}
      {cagrData&&(
        <div className="card" style={{marginTop:12}}>
          <div className="ct" style={{marginBottom:14}}>CAGR — Tasa de crecimiento anual compuesta (base 2024)</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
            {[{label:'Ingresos',key:'ventas',color:C.blue},{label:'Unidades',key:'unidades',color:C.green},{label:'Utilidad',key:'utilidad',color:C.purple}].map(m=>{
              const v2024=cagrData[2024]?.[m.key]||0,v2025=cagrData[2025]?.[m.key]||0,v2026=cagrData[2026]?.[m.key]||0
              const cagr2425=calcCAGR(v2024,v2025,1), cagr2426=calcCAGR(v2024,v2026,2)
              return(
                <div key={m.key} className="mc">
                  <div className="mc-label">{m.label}</div>
                  <div style={{fontSize:22,fontWeight:700,color:m.color}}>{cagr2425!==null?cagr2425+'%':'—'}</div>
                  <div style={{fontSize:10,color:'var(--text3)',marginTop:2}}>CAGR 2024→2025</div>
                  {cagr2426!==null&&<div style={{fontSize:11,color:cagr2426>=0?C.green:C.red,marginTop:4,fontWeight:600}}>{cagr2426}% CAGR 2024→2026</div>}
                </div>
              )
            })}
          </div>
          <div style={{overflowX:'auto'}}>
            <table className="tbl">
              <thead><tr><th>Métrica</th><th className="num">2024</th><th className="num">2025</th><th className="num">2026 (anual.)</th><th className="num">CAGR 24→25</th><th className="num">CAGR 24→26</th></tr></thead>
              <tbody>
                {[{label:'Ingresos',key:'ventas',color:C.blue,fmt:fmtM},{label:'Unidades',key:'unidades',color:C.green,fmt:v=>Math.round(v).toLocaleString('es-MX')},{label:'Utilidad',key:'utilidad',color:C.purple,fmt:fmtM},{label:'Gastos',key:'gastos',color:C.red,fmt:fmtM}].map(m=>{
                  const v2024=cagrData[2024]?.[m.key]||0,v2025=cagrData[2025]?.[m.key]||0,v2026=cagrData[2026]?.[m.key]||0
                  const cagr2425=calcCAGR(v2024,v2025,1),cagr2426=calcCAGR(v2024,v2026,2)
                  return(
                    <tr key={m.key}>
                      <td style={{fontWeight:600,color:m.color}}>{m.label}</td>
                      <td className="num">{m.fmt(v2024)}</td><td className="num">{m.fmt(v2025)}</td><td className="num">{m.fmt(v2026)}</td>
                      <td className="num" style={{fontWeight:700,color:cagr2425>=0?C.green:C.red}}>{cagr2425!==null?cagr2425+'%':'—'}</td>
                      <td className="num" style={{fontWeight:700,color:cagr2426>=0?C.green:C.red}}>{cagr2426!==null?cagr2426+'%':'—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
