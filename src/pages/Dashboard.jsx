import React, { useState, useEffect, useCallback } from 'react'
import { sb } from '../lib/supabase.js'
import { Bar } from 'react-chartjs-2'
import { Chart, CategoryScale, LinearScale, BarElement, LineElement,
         PointElement, ArcElement, Tooltip, Legend, Filler } from 'chart.js'
import KpiCard from '../components/KpiCard.jsx'
import PeriodSwitcher from '../components/PeriodSwitcher.jsx'
import { fetchKpiRangoGran, fetchSeriesRangoGran, fetchPorCategoria,
         fetchPorCanal, fetchGastosPorCategoria, fetchComparativo,
         fetchCatSeriesRangoGran, getRangoFechas, trendline, fetchRentabilidadCategoria,
         fetchPromedioDiarioMes, fetchComparativoPeriodos, fetchAnualParaCAGR, calcCAGR,
         fetchKpiAcum } from '../lib/analytics.js'
import { descargarReporte, compartirReporte } from '../lib/reporte.js'
import { startOfWeek, subDays, subMonths, format } from 'date-fns'
import IngresoGastoCategorias from '../components/IngresoGastoCategorias.jsx'

Chart.register(CategoryScale, LinearScale, BarElement, LineElement,
               PointElement, ArcElement, Tooltip, Legend, Filler)

const C = { blue:'#378ADD', green:'#1D9E75', red:'#E24B4A', amber:'#EF9F27', purple:'#7F77DD', gray:'#888780', pink:'#D4537E', orange:'#D85A30' }
const CAT_COLORS = [C.amber, C.red, C.blue, C.purple, C.green, C.gray, C.pink, C.orange]
const GASTO_COLORS = [C.red, C.orange, C.purple, C.blue, C.gray]

const isDark = () => matchMedia('(prefers-color-scheme:dark)').matches
const tc = () => isDark()?'rgba(255,255,255,0.45)':'rgba(0,0,0,0.4)'
const gc = () => isDark()?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.06)'
const fmtM = v => '$'+Math.round(v||0).toLocaleString('es-MX')
const fmtK = v => Math.abs(v||0)>=1000?(v>=0?'$':'-$')+Math.round(Math.abs(v)/1000)+'k':fmtM(v)

// Dias cerrados
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

export default function Dashboard() {
  const [rango,       setRango]       = useState('hoy')
  const [granularidad,setGranularidad]= useState('mensual')
  const [rangoDesde,  setRangoDesde]  = useState('')
  const [rangoHasta,  setRangoHasta]  = useState('')
  const [kpi,         setKpi]         = useState(null)
  const [series,      setSeries]      = useState(null)
  const [cats,        setCats]        = useState([])
  const [gastosCat,   setGastosCat]   = useState([])
  const [canales,     setCanales]     = useState([])
  const [catSeries,   setCatSeries]   = useState(null)
  const [comp,        setComp]        = useState([])
  const [proy,        setProy]        = useState(null)
  const [cierresManuales, setCierresManuales] = useState([])
  const [cierreManualInput, setCierreManualInput] = useState('')
  const [showCierreInput, setShowCierreInput] = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [lastUpd,     setLastUpd]     = useState(new Date())
  const [showComp,    setShowComp]    = useState(false)
  const [canalFiltros, setCanalFiltros] = useState([]) // [] = todos
  const [famFilter,    setFamFilter]    = useState([])
  const [generando,    setGenerando]    = useState(false)
  const [rentCat,      setRentCat]      = useState([])
  const [rentCanalFiltro, setRentCanalFiltro] = useState([])
  const [promedioDiario,  setPromedioDiario]  = useState(null)
  const [promAnios,       setPromAnios]       = useState([2024,2025,2026])
  const [cagrData,        setCagrData]        = useState(null)
  const [compPeriodos,    setCompPeriodos]    = useState(null)
  const [compMesDesde,    setCompMesDesde]    = useState(1)
  const [compMesHasta,    setCompMesHasta]    = useState(new Date().getMonth()+1)
  const [compMetrica,     setCompMetrica]     = useState('ventas') // ventas|unidades|utilidad|gastos
  const [promMetrica,     setPromMetrica]     = useState('unidades') // unidades|importe
  const [kpiMes,          setKpiMes]          = useState(null)

  // KPIs acumulados del período seleccionado — se llama desde load() con from/to del período activo
  const loadKpiMes = useCallback(async (from, to) => {
    const labelPeriodo = () => {
      if (from === to) return new Date(from+'T12:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'short'})
      if (from.slice(0,7) === to.slice(0,7)) return new Date(from+'T12:00:00').toLocaleString('es-MX',{month:'long',year:'numeric'})
      if (from.slice(0,4) === to.slice(0,4)) return from.slice(0,4)
      return new Date(from+'T12:00:00').toLocaleString('es-MX',{month:'short',year:'numeric'})+' – '+new Date(to+'T12:00:00').toLocaleString('es-MX',{month:'short',year:'numeric'})
    }
    try {
      const data = await fetchKpiAcum(from, to)
      setKpiMes({ ...data, periodoLabel: labelPeriodo() })
    } catch(e) { console.error('loadKpiMes error:', e) }
  }, [])

  // Filtro global de canal — recarga series y KPIs
  const aplicarFiltroCanal = useCallback(async (canales) => {
    if (!kpi) return
    const { from, to } = getRangoFechas(rango, rangoDesde, rangoHasta)
    const [newSeries, newKpi] = await Promise.all([
      fetchSeriesRangoGran(rango, granularidad, rangoDesde, rangoHasta, canales),
      fetchKpiRangoGran(rango, granularidad, rangoDesde, rangoHasta, canales),
    ])
    setSeries(newSeries)
    setKpi(newKpi)
  }, [kpi, rango, granularidad, rangoDesde, rangoHasta])

  const handleReporte = async (compartir=false) => {
    setGenerando(true)
    try {
      const params = { kpi, series, cats, gastosCat, canales, rango, granularidad }
      if (compartir) await compartirReporte(params)
      else await descargarReporte(params)
    } catch(e) { console.error(e) }
    setGenerando(false)
  }

  const load = useCallback(async () => {
    if (rango==='rango'&&(!rangoDesde||!rangoHasta)) return
    setLoading(true)
    try {
      const { from, to } = getRangoFechas(rango, rangoDesde, rangoHasta)
      const [k, s, c, gc2, can, cs] = await Promise.all([
        fetchKpiRangoGran(rango, granularidad, rangoDesde, rangoHasta),
        fetchSeriesRangoGran(rango, granularidad, rangoDesde, rangoHasta),
        fetchPorCategoria(from, to),
        fetchGastosPorCategoria(from, to),
        fetchPorCanal(from, to),
        fetchCatSeriesRangoGran(rango, granularidad, rangoDesde, rangoHasta),
      ])
      setKpi(k); setSeries(s); setCats(c); setGastosCat(gc2); setCanales(can); setCatSeries(cs)
      // Rentabilidad por categoría
      const rent = await fetchRentabilidadCategoria(from, to)
      setRentCat(rent)

      // Comparativo años anteriores
      const co = await fetchComparativo('anual', new Date(), 3)
      setComp(co)

      // Promedio diario por categoría
      const pd = await fetchPromedioDiarioMes([2024, 2025, 2026])
      setPromedioDiario(pd)

      // CAGR
      const cagr = await fetchAnualParaCAGR()
      setCagrData(cagr)

      // Proyeccion mensual (solo cuando rango=mes o 1anio+mensual)
      if (rango==='mes' || (rango==='1anio' && granularidad==='mensual')) {
        const dt=diasAbiertoHasta(), dr=diasRestantes(cierresManuales), total=diasTotales()
        const mesKpi = await fetchKpiRangoGran('rango','diario',
          new Date().toISOString().slice(0,8)+'01',
          new Date().toISOString().slice(0,10))
        const pV=dt>0?Math.round(mesKpi.ventas+(mesKpi.ventas/dt)*dr):0
        const pG=dt>0?Math.round(mesKpi.gastos+(mesKpi.gastos/dt)*dr):0
        const pUnids=dt>0?Math.round(mesKpi.unidades+(mesKpi.unidades/dt)*dr):0
        setProy({dt,dr,total,pct:Math.round(dt/total*100),pV,pG,pU:pV-pG,pUnids,
          ventasActual:mesKpi.ventas,gastosActual:mesKpi.gastos,utilidadActual:mesKpi.utilidad,
          unidadesActual:mesKpi.unidades})
      } else setProy(null)

      loadKpiMes(from, to)
      setLastUpd(new Date())
    } catch(e) { console.error(e) }
    setLoading(false)
  }, [rango, granularidad, rangoDesde, rangoHasta, cierresManuales, loadKpiMes])

  useEffect(()=>{ load() },[load])

  // Re-calcular rentabilidad cuando cambia filtro de canal
  useEffect(() => {
    if (!kpi) return
    const { from, to } = getRangoFechas(rango, rangoDesde, rangoHasta)
    fetchRentabilidadCategoria(from, to, rentCanalFiltro).then(setRentCat)
  }, [rentCanalFiltro, rango, rangoDesde, rangoHasta, kpi])

  const catsFiltered = catSeries ? (famFilter.length>0?catSeries.cats.filter(c=>famFilter.includes(c)):catSeries.cats) : []

  const mainData = series ? {
    labels: series.labels,
    datasets:[
      { type:'bar',  label:'Ingresos', data:series.ventas, backgroundColor:C.blue+'BB', borderRadius:3, order:2 },
      { type:'bar',  label:'Gastos',   data:series.gastos.map(v=>-v), backgroundColor:C.red+'AA', borderRadius:3, order:2 },
      { type:'line', label:'Utilidad', data:series.utilidad, borderColor:C.green, borderWidth:2,
        borderDash:[5,4], pointRadius:2, pointBackgroundColor:series.utilidad.map(v=>v>=0?C.green:C.red),
        fill:false, tension:0.3, order:1 },
      { type:'line', label:'Tendencia utilidad', data:trendline(series.utilidad), borderColor:C.green+'88',
        borderWidth:1.5, borderDash:[2,4], pointRadius:0, fill:false, tension:0, order:1 },
    ]
  } : null

  const mainOpts = {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{display:true,position:'top',labels:{color:tc(),font:{size:10},boxWidth:10,padding:10}},
      tooltip:{ callbacks:{ label:ctx=>{ const v=ctx.raw; return ctx.dataset.label==='Gastos'?'Gastos: '+fmtK(Math.abs(v)):ctx.dataset.label+': '+fmtK(v) } } }
    },
    scales:{
      x:{ ticks:{color:tc(),font:{size:10}}, grid:{color:gc()}, border:{display:false} },
      y:{ ticks:{color:tc(),font:{size:10},callback:v=>fmtK(v)}, grid:{color:gc()}, border:{display:false} },
    }
  }

  const famOpts = {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{display:true,position:'top',labels:{color:tc(),font:{size:10},boxWidth:10,padding:8}} },
    scales:{
      x:{ ticks:{color:tc(),font:{size:10}}, grid:{color:gc()}, border:{display:false}, stacked:true },
      y:{ ticks:{color:tc(),font:{size:10},callback:v=>fmtK(v)}, grid:{color:gc()}, border:{display:false}, stacked:true },
    }
  }

  const udsOpts = { ...famOpts, plugins:{ ...famOpts.plugins, legend:{display:true, labels:{color:tc(),font:{size:10},boxWidth:12}} }, scales:{ ...famOpts.scales, y:{ ...famOpts.scales.y, ticks:{color:tc(),font:{size:10},callback:v=>v.toLocaleString()} } } }

  // Plugin inline: dibuja el total encima de cada columna apilada
  const stackedTotalPlugin = {
    id: 'stackedBarTotal',
    afterDatasetsDraw(chart) {
      const { ctx } = chart
      const isDark = matchMedia('(prefers-color-scheme:dark)').matches
      const datasets = chart.data.datasets.filter(d => d.type !== 'line') // excluir línea de meta
      const numPoints = datasets[0]?.data?.length || 0
      ctx.save()
      ctx.font = 'bold 11px system-ui,sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillStyle = isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.75)'
      for (let i = 0; i < numPoints; i++) {
        let total = 0, topY = null
        datasets.forEach((dataset, dIdx) => {
          // buscar el meta del dataset real (index en chart.data.datasets)
          const realIdx = chart.data.datasets.indexOf(dataset)
          const meta = chart.getDatasetMeta(realIdx)
          if (!meta.hidden && meta.data[i]) {
            total += Number(dataset.data[i]) || 0
            const y = meta.data[i].y
            if (topY === null || y < topY) topY = y
          }
        })
        if (total > 0 && topY !== null) {
          const x = chart.getDatasetMeta(chart.data.datasets.indexOf(datasets[0])).data[i]?.x
          if (x !== undefined) {
            ctx.fillText(Math.round(total).toLocaleString('es-MX'), x, topY - 4)
          }
        }
      }
      ctx.restore()
    }
  }

  const gastoOpts = {
    responsive:true, maintainAspectRatio:false,
    indexAxis:'y',
    plugins:{ legend:{display:false} },
    scales:{
      x:{ ticks:{color:tc(),font:{size:10},callback:v=>fmtK(v)}, grid:{color:gc()}, border:{display:false} },
      y:{ ticks:{color:tc(),font:{size:10}}, grid:{display:false}, border:{display:false} },
    }
  }

  const famData = catSeries ? {
    labels: series?.labels||[],
    datasets: catsFiltered.map((cat,i)=>({
      label:cat,
      data: catSeries.periodKeys.map(k=>Math.round((catSeries.impMap[k]?.[cat])||0)),
      backgroundColor: CAT_COLORS[catSeries.cats.indexOf(cat)%CAT_COLORS.length]+'CC',
      borderRadius:2, stack:'cats',
    }))
  } : null

  const META_DIARIA = 100
  const metaUds = series?.labels ? series.labels.map(() => {
    if (granularidad === 'mensual') return META_DIARIA * 26
    if (granularidad === 'semanal') return META_DIARIA * 6
    return META_DIARIA // diario o por defecto
  }) : []
  const udsData = catSeries ? {
    labels: series?.labels||[],
    datasets: [
      ...catsFiltered.map((cat,i)=>({
        label:cat,
        data: catSeries.periodKeys.map(k=>Math.round((catSeries.udsMap[k]?.[cat])||0)),
        backgroundColor: CAT_COLORS[catSeries.cats.indexOf(cat)%CAT_COLORS.length]+'CC',
        borderRadius:2, stack:'uds',
      })),
      {
        label:'Meta',
        data: metaUds,
        type:'line',
        borderColor:'#E24B4A',
        borderWidth:2,
        borderDash:[6,3],
        pointRadius:0,
        fill:false,
      }
    ]
  } : null

  const gastoData = gastosCat.length ? {
    labels: gastosCat.map(g=>g.categoria),
    datasets:[{ data:gastosCat.map(g=>g.monto), backgroundColor:GASTO_COLORS, borderRadius:4 }]
  } : null

  const pctFmt = v => v==null?'—':`${v>=0?'+':''}${v}% vs anterior`
  const color  = v => v==null?'':v>=0?' up':' dn'

  return (
    <div>
      {/* HEADER */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:10}}>
        <PeriodSwitcher rango={rango} granularidad={granularidad}
          onRango={setRango} onGranularidad={setGranularidad}
          rangoDesde={rangoDesde} rangoHasta={rangoHasta}
          onRangoChange={(d,h)=>{setRangoDesde(d);setRangoHasta(h)}}/>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <button onClick={()=>setShowComp(s=>!s)}
            style={{padding:'3px 10px',borderRadius:99,fontSize:11,cursor:'pointer',border:'0.5px solid var(--border-md)',
              background:showComp?'var(--accent)':'transparent',color:showComp?'#fff':'var(--text2)'}}>
            Comparar años
          </button>
          <button onClick={()=>handleReporte(false)} disabled={generando||loading}
            style={{padding:'3px 10px',borderRadius:99,fontSize:11,cursor:'pointer',border:'0.5px solid var(--border-md)',
              background:'transparent',color:'var(--text2)'}}>
            {generando?'Generando…':'⬇ PDF'}
          </button>
          <button onClick={()=>handleReporte(true)} disabled={generando||loading}
            style={{padding:'3px 10px',borderRadius:99,fontSize:11,cursor:'pointer',border:'0.5px solid #25D366',
              background:'transparent',color:'#25D366'}}>
            📤 Compartir
          </button>
          <div style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'var(--text3)'}}>
            <span className="live-dot"/>
            {lastUpd.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}
          </div>
        </div>
      </div>

      {/* FILTRO GLOBAL POR CANAL */}
      {canales.length>0 && (
        <div style={{display:'flex',gap:5,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
          <span style={{fontSize:11,color:'var(--text2)',marginRight:2}}>Canal:</span>
          <button onClick={()=>{ setCanalFiltros([]); aplicarFiltroCanal([]) }}
            style={{padding:'3px 10px',borderRadius:99,fontSize:10,cursor:'pointer',
              border:`1.5px solid ${canalFiltros.length===0?'var(--accent)':'var(--border-md)'}`,
              background:canalFiltros.length===0?'var(--accent)22':'transparent',
              color:canalFiltros.length===0?'var(--accent)':'var(--text2)'}}>Todos</button>
          {canales.map(c=>(
            <button key={c.canal} onClick={()=>{
              const nv = canalFiltros.includes(c.canal)?canalFiltros.filter(x=>x!==c.canal):[...canalFiltros,c.canal]
              setCanalFiltros(nv); aplicarFiltroCanal(nv)
            }}
              style={{padding:'3px 10px',borderRadius:99,fontSize:10,cursor:'pointer',
                border:`1.5px solid ${canalFiltros.includes(c.canal)?'var(--accent)':'var(--border-md)'}`,
                background:canalFiltros.includes(c.canal)?'var(--accent)22':'transparent',
                color:canalFiltros.includes(c.canal)?'var(--accent)':'var(--text2)'}}>
              {c.canal}
            </button>
          ))}
          {canalFiltros.length>0&&<span style={{fontSize:10,color:'var(--text3)',marginLeft:4}}>
            — filtrando gráficas y KPIs
          </span>}
        </div>
      )}

      {/* KPIs */}
      <div className="metrics">
        <KpiCard label="Ventas"   value={kpi?.ventas}   prefix="$" loading={loading} sub={<span className={`mc-sub${color(kpi?.ventasVsPrev)}`}>{pctFmt(kpi?.ventasVsPrev)}</span>}/>
        <KpiCard label="Unidades" value={kpi?.unidades} suffix=" uds" loading={loading}/>
        <KpiCard label="Gastos"   value={kpi?.gastos}   prefix="$" loading={loading}/>
        <KpiCard label="Utilidad" value={kpi?.utilidad} prefix="$" loading={loading} sub={kpi?.margen!=null?`Margen ${kpi.margen}%`:''}/>
      </div>

      {/* ── KPIs ACUMULADOS DEL PERÍODO ── */}
      {kpiMes && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(105px,1fr))',gap:8,marginBottom:12}}>
          {[
            { label:'Ajustes Efectivo',   val:kpiMes.ajEfvo,  fmt:'$', color:'#EF9F27', hint:'Faltantes − sobrantes acum. período' },
            { label:'Ajustes Tarjeta',    val:kpiMes.ajTc,    fmt:'$', color:'#7F77DD', hint:'Faltantes − sobrantes acum. período' },
            { label:'Ajustes Plataforma', val:kpiMes.ajPlat,  fmt:'$', color:'#E24B4A', hint:'Faltantes − sobrantes acum. período' },
            { label:'☕ Café gratis',      val:kpiMes.artUds||0, fmt:'u', color:'#D85A30', hint:`${kpiMes.artCnt||0} artículos en órdenes pagadas` },
            { label:'🎁 Sin cobro',        val:kpiMes.gUds,    fmt:'u', color:'#378ADD', hint:`${kpiMes.gCnt} órdenes sin cobrar`, sub: kpiMes.gMonto>0?'~'+fmtM(kpiMes.gMonto)+' est.':'' },
            { label:'Uds vendidas',       val:kpiMes.totUds,  fmt:'u', color:'#1D9E75', hint:'Acumulado del período' },
          ].map(k=>(
            <div key={k.label} title={k.hint} style={{background:'var(--surface)',border:'0.5px solid var(--border)',borderRadius:'var(--r-sm)',padding:'8px 10px',cursor:'default'}}>
              <div style={{fontSize:9,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:.5,marginBottom:3}}>{k.label}</div>
              <div style={{fontSize:16,fontWeight:800,color:k.fmt==='$'?Math.abs(k.val)<1?'var(--text2)':k.val>0?'#E24B4A':'#1D9E75':k.color}}>
                {k.fmt==='$'
                  ? (k.val>0?'+':'')+fmtM(k.val)
                  : Math.round(k.val).toLocaleString('es-MX')+' uds'}
              </div>
              {k.sub && <div style={{fontSize:10,color:'#E24B4A',fontWeight:700,marginTop:1}}>{k.sub}</div>}
              <div style={{fontSize:9,color:'var(--text3)',marginTop:2}}>{kpiMes.periodoLabel}</div>
            </div>
          ))}
          {(() => {
            const total = kpiMes.ajEfvo + kpiMes.ajTc + kpiMes.ajPlat
            const ok    = Math.abs(total) < 50
            const lineas = [
              Math.abs(kpiMes.ajEfvo)>=1 && `Efvo ${kpiMes.ajEfvo>0?'+':''}${fmtM(kpiMes.ajEfvo)}`,
              Math.abs(kpiMes.ajTc)  >=1 && `TC ${kpiMes.ajTc>0?'+':''}${fmtM(kpiMes.ajTc)}`,
              Math.abs(kpiMes.ajPlat)>=1 && `Plat ${kpiMes.ajPlat>0?'+':''}${fmtM(kpiMes.ajPlat)}`,
            ].filter(Boolean)
            return (
              <div style={{background:'var(--surface)',border:`0.5px solid ${ok?'var(--border)':'#E24B4A44'}`,borderRadius:'var(--r-sm)',padding:'8px 10px'}}>
                <div style={{fontSize:9,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:.5,marginBottom:3}}>Ajuste neto período</div>
                <div style={{fontSize:16,fontWeight:800,color:ok?'#1D9E75':total>0?'#E24B4A':'#EF9F27'}}>
                  {ok?'✓ Cuadrado':(total>0?'+':'')+fmtM(total)}
                </div>
                <div style={{fontSize:9,color:'var(--text3)',marginTop:3,lineHeight:1.6}}>
                  {ok?'Sin diferencias relevantes':lineas.join(' · ')}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* PROYECCION */}
      {proy&&!loading&&(
        <div className="card" style={{marginBottom:12,padding:'12px 16px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <div>
              <div style={{fontSize:12,fontWeight:600}}>Proyeccion de cierre de mes</div>
              <div style={{fontSize:11,color:'var(--text2)'}}>{proy.dt} dias abiertos de {proy.total} · {proy.pct}% · {proy.dr} dias restantes</div>
            </div>
            {showCierreInput ? (
              <span style={{display:'inline-flex',gap:4,alignItems:'center'}}>
                <input
                  type="date"
                  value={cierreManualInput}
                  onChange={e=>setCierreManualInput(e.target.value)}
                  style={{padding:'2px 6px',fontSize:11,borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'var(--bg2)',color:'var(--text1)'}}
                />
                <button onClick={()=>{if(cierreManualInput)setCierresManuales(p=>[...p,cierreManualInput]);setCierreManualInput('');setShowCierreInput(false)}}
                  style={{padding:'2px 8px',fontSize:11,borderRadius:'var(--r-sm)',border:'none',background:'var(--accent)',color:'#fff',cursor:'pointer'}}>
                  ✓
                </button>
                <button onClick={()=>{setCierreManualInput('');setShowCierreInput(false)}}
                  style={{padding:'2px 6px',fontSize:11,borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',color:'var(--text2)'}}>
                  ✕
                </button>
              </span>
            ) : (
              <button onClick={()=>setShowCierreInput(true)}
                style={{padding:'3px 9px',fontSize:11,borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',color:'var(--text2)'}}>
                + Cierre manual
              </button>
            )}
          </div>
          <div style={{background:'var(--bg)',borderRadius:99,height:5,marginBottom:10,overflow:'hidden'}}>
            <div style={{width:proy.pct+'%',height:'100%',background:'var(--accent)',borderRadius:99}}/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
            {[
              {label:'Ventas proy.',val:proy.pV,actual:proy.ventasActual,color:C.blue,fmt:fmtM},
              {label:'Gastos proy.',val:proy.pG,actual:proy.gastosActual,color:C.red,fmt:fmtM},
              {label:'Utilidad proy.',val:proy.pU,actual:proy.utilidadActual,color:proy.pU>=0?C.green:C.red,fmt:fmtM},
              {label:'Unidades proy.',val:proy.pUnids,actual:proy.unidadesActual,color:C.amber,fmt:(v)=>v?.toLocaleString('es-MX')},
            ].map(k2=>(
              <div key={k2.label} style={{background:'var(--bg)',borderRadius:'var(--r-md)',padding:'9px 11px',border:'0.5px solid var(--border)'}}>
                <div style={{fontSize:10,color:'var(--text2)',marginBottom:2}}>{k2.label}</div>
                <div style={{fontSize:15,fontWeight:700,color:k2.color}}>{k2.fmt(k2.val)}</div>
                <div style={{fontSize:10,color:'var(--text3)',marginTop:1}}>actual: {k2.fmt(k2.actual)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* COMPARATIVO */}
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

      {/* GRÁFICA PRINCIPAL */}
      <div className="card" style={{marginBottom:12}}>
        <div className="ch">
          <div className="ct">Ingresos · Gastos · Utilidad</div>
          <div style={{fontSize:10,color:'var(--text2)'}}>Ingresos arriba · Gastos abajo · Utilidad linea punteada</div>
        </div>
        <div id="chart-principal" className="chart-wrap" style={{height:210}}>
          {loading?<div className="loading-screen"><div className="spinner"/></div>
          :mainData?<Bar data={mainData} options={mainOpts}/>
          :<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'var(--text3)',fontSize:12}}>Sin datos para el periodo seleccionado</div>}
        </div>
      </div>

      {/* COSTO VS INGRESOS */}
      {series?.costo && (
        <div className="card" style={{marginBottom:12}}>
          <div className="ch">
            <div className="ct">Costo de ventas vs Ingresos</div>
            <div style={{fontSize:10,color:'var(--text2)'}}>Solo costo directo · linea roja = % costo sobre ingreso</div>
          </div>
          <div id="chart-costo" className="chart-wrap" style={{height:180}}>
            {loading?<div className="loading-screen"><div className="spinner"/></div>
            :<Bar data={{
              labels:series.labels,
              datasets:[
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

      {/* INGRESOS Y UNIDADES POR FAMILIA */}
      <div className="two" style={{marginBottom:12}}>
        <div className="card">
          <div className="ch"><div className="ct">Ingresos por familia</div></div>
          {catSeries && <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:8}}>
            <button onClick={()=>setFamFilter([])} style={{padding:'2px 8px',borderRadius:99,fontSize:10,cursor:'pointer',border:'0.5px solid var(--border-md)',background:famFilter.length===0?'var(--accent)':'transparent',color:famFilter.length===0?'#fff':'var(--text2)'}}>Todas</button>
            {catSeries.cats.map((cat,i)=>(
              <button key={cat} onClick={()=>setFamFilter(f=>f.includes(cat)?f.filter(x=>x!==cat):[...f,cat])}
                style={{padding:'2px 8px',borderRadius:99,fontSize:10,cursor:'pointer',border:`0.5px solid ${CAT_COLORS[i%CAT_COLORS.length]}`,
                  background:famFilter.includes(cat)?CAT_COLORS[i%CAT_COLORS.length]:'transparent',
                  color:famFilter.includes(cat)?'#fff':CAT_COLORS[i%CAT_COLORS.length]}}>
                {cat}
              </button>
            ))}
          </div>}
          <div id="chart-familias" className="chart-wrap" style={{height:180}}>
            {loading?<div className="loading-screen"><div className="spinner"/></div>
            :famData?<Bar data={famData} options={famOpts}/>:null}
          </div>
        </div>

        <div className="card">
          <div className="ch"><div className="ct">Egresos por categoria contable</div></div>
          <div className="chart-wrap" style={{height:210}}>
            {loading?<div className="loading-screen"><div className="spinner"/></div>
            :gastoData?<Bar data={gastoData} options={gastoOpts}/>:null}
          </div>
        </div>
      </div>

      {/* UNIDADES POR FAMILIA */}
      <div className="card" style={{marginBottom:12}}>
        <div className="ch">
          <div className="ct">Unidades vendidas por familia</div>
          {catSeries && <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
            <button onClick={()=>setFamFilter([])} style={{padding:'2px 8px',borderRadius:99,fontSize:10,cursor:'pointer',border:'0.5px solid var(--border-md)',background:famFilter.length===0?'var(--accent)':'transparent',color:famFilter.length===0?'#fff':'var(--text2)'}}>Todas</button>
            {catSeries.cats.map((cat,i)=>(
              <button key={cat} onClick={()=>setFamFilter(f=>f.includes(cat)?f.filter(x=>x!==cat):[...f,cat])}
                style={{padding:'2px 8px',borderRadius:99,fontSize:10,cursor:'pointer',border:`0.5px solid ${CAT_COLORS[i%CAT_COLORS.length]}`,
                  background:famFilter.includes(cat)?CAT_COLORS[i%CAT_COLORS.length]:'transparent',
                  color:famFilter.includes(cat)?'#fff':CAT_COLORS[i%CAT_COLORS.length]}}>
                {cat}
              </button>
            ))}
          </div>}
        </div>
        <div id="chart-unidades" className="chart-wrap" style={{height:180}}>
          {loading?<div className="loading-screen"><div className="spinner"/></div>
          :udsData?<Bar data={udsData} options={udsOpts} plugins={[stackedTotalPlugin]}/>:null}
        </div>
      </div>

      {/* TABLAS */}
      <div className="two">
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
          {/* Selector de canales */}
          {canales.length > 0 && (
            <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:10}}>
              <button onClick={()=>setCanalFiltros([])}
                style={{padding:'3px 10px',borderRadius:99,fontSize:10,cursor:'pointer',
                  border:`1.5px solid ${canalFiltros.length===0?'var(--accent)':'var(--border-md)'}`,
                  background:canalFiltros.length===0?'var(--accent)22':'transparent',
                  color:canalFiltros.length===0?'var(--accent)':'var(--text2)'}}>
                Todos
              </button>
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
                const base = canalFiltros.length===0?canales:canales.filter(x=>canalFiltros.includes(x.canal))
                const tot=base.reduce((s,x)=>s+x.importe,0)
                return <tr key={c.canal}>
                  <td style={{fontSize:12}}>{c.canal||'Sin dato'}</td>
                  <td className="num" style={{fontWeight:500}}>{fmtM(c.importe)}</td>
                  <td className="num c-muted">{(c.unidades||0).toLocaleString('es-MX')}</td>
                  <td className="num c-muted">{tot>0?Math.round(c.importe/tot*100):0}%</td>
                </tr>
              })}
            </tbody>
            {canalFiltros.length>0&&<tfoot>
              <tr style={{fontWeight:700}}>
                <td>Selección</td>
                <td className="num">{fmtM(canales.filter(c=>canalFiltros.includes(c.canal)).reduce((s,c)=>s+c.importe,0))}</td>
                <td className="num">{canales.filter(c=>canalFiltros.includes(c.canal)).reduce((s,c)=>s+(c.unidades||0),0).toLocaleString('es-MX')}</td>
                <td className="num">{Math.round(canales.filter(c=>canalFiltros.includes(c.canal)).reduce((s,c)=>s+c.importe,0)/canales.reduce((s,c)=>s+c.importe,0)*100)}%</td>
              </tr>
            </tfoot>}
          </table>}
        </div>
      </div>

      {/* RENTABILIDAD POR CATEGORÍA */}
      {rentCat.length > 0 && (
        <div style={{marginTop:12}}>
          {/* Selector canal rentabilidad */}
          <div style={{display:'flex',gap:5,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
            <span style={{fontSize:11,color:'var(--text2)',marginRight:4}}>Canal:</span>
            <button onClick={()=>setRentCanalFiltro([])}
              style={{padding:'3px 10px',borderRadius:99,fontSize:10,cursor:'pointer',
                border:`1.5px solid ${rentCanalFiltro.length===0?'var(--accent)':'var(--border-md)'}`,
                background:rentCanalFiltro.length===0?'var(--accent)22':'transparent',
                color:rentCanalFiltro.length===0?'var(--accent)':'var(--text2)'}}>
              Todos
            </button>
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
                  <tr key={r.categoria}>
                    <td style={{fontSize:12}}>{r.categoria}</td>
                    <td className="num">{fmtM(r.importe)}</td>
                    <td className="num" style={{color:'#E24B4A'}}>{fmtM(r.costo)}</td>
                    {rentCat.some(x=>x.comision>0)&&<td className="num" style={{color:'#EF9F27'}}>{r.comision>0?fmtM(r.comision):'—'}</td>}
                    <td className="num" style={{color:r.utilidad>=0?'#1D9E75':'#E24B4A',fontWeight:600}}>{fmtM(r.utilidad)}</td>
                    <td className="num"><span style={{color:r.margen>=50?'#1D9E75':r.margen>=30?'#EF9F27':'#E24B4A',fontWeight:600}}>{r.margen}%</span></td>
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
                  <div style={{position:'absolute',left:0,top:0,height:'100%',
                    width:`${r.importe>0?Math.min(100,Math.round(r.costo/r.importe*100)):0}%`,
                    background:'#E24B4A',borderRadius:6}}/>
                  <div style={{position:'absolute',
                    left:`${r.importe>0?Math.min(100,Math.round(r.costo/r.importe*100)):0}%`,
                    top:0,height:'100%',
                    width:`${r.importe>0?r.margen:0}%`,
                    background:'#1D9E75',borderRadius:6}}/>
                </div>
                <div style={{display:'flex',gap:10,fontSize:9,color:'var(--text3)',marginTop:2}}>
                  <span style={{color:'#E24B4A'}}>■ Costo {fmtM(r.costo)}</span>
                  <span style={{color:'#1D9E75'}}>■ Utilidad {fmtM(r.utilidad)}</span>
                </div>
              </div>
            ))}
          </div>
          </div>
        </div>
      )}

      {/* ── PROMEDIO DIARIO POR CATEGORÍA ── */}
      {promedioDiario && promedioDiario.meses.length > 0 && (
        <div className="card" style={{marginTop:12}}>
          <div className="ch">
            <div className="ct">Promedio diario por categoría — mes a mes</div>
            <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
              {[2024,2025,2026].map(a=>(
                <button key={a} onClick={async()=>{
                  const aniosActivos = promAnios.includes(a) ? promAnios.filter(x=>x!==a) : [...promAnios,a]
                  if (aniosActivos.length===0) return
                  setPromAnios(aniosActivos)
                  const pd = await fetchPromedioDiarioMes(aniosActivos)
                  setPromedioDiario(pd)
                }} className={`psw-btn${promAnios.includes(a)?' active':''}`}
                  style={{fontSize:10,padding:'3px 10px'}}>{a}</button>
              ))}
              <button onClick={()=>setPromMetrica('unidades')}
                className={`psw-btn${promMetrica==='unidades'?' active':''}`}>Unidades</button>
              <button onClick={()=>setPromMetrica('importe')}
                className={`psw-btn${promMetrica==='importe'?' active':''}`}>Ingresos</button>
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
                      <div style={{fontSize:9,color:'var(--text3)',fontWeight:400}}>
                        {promedioDiario.result[m]?.[promedioDiario.cats[0]]?.dias||0}d
                      </div>
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
                      const v = promedioDiario.result[m]?.[cat]?.[promMetrica] || 0
                      const vals = promedioDiario.meses.map(mm=>promedioDiario.result[mm]?.[cat]?.[promMetrica]||0)
                      const max = Math.max(...vals)
                      const pct = max>0 ? v/max : 0
                      return (
                        <td key={m} className="num" style={{fontSize:11}}>
                          <div style={{fontSize:11,fontWeight:v>0?600:400,color:v>0?'var(--text1)':'var(--text3)'}}>
                            {promMetrica==='importe' ? (v>0?'$'+Math.round(v/1000*10)/10+'k':'—') : (v||'—')}
                          </div>
                          {v>0 && <div style={{height:3,background:CAT_COLORS[ci%CAT_COLORS.length],borderRadius:99,width:Math.round(pct*100)+'%',marginTop:2,opacity:0.7}}/>}
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

      {/* ── COMPARATIVO ENTRE PERÍODOS ── */}
      <div className="card" style={{marginTop:12}}>
        <div className="ch">
          <div className="ct">Comparativo entre períodos y años</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
            <select className="form-input" style={{width:110,padding:'3px 8px',fontSize:11}}
              value={compMesDesde} onChange={e=>{setCompMesDesde(+e.target.value);setCompPeriodos(null)}}>
              {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map((m,i)=>(
                <option key={i} value={i+1}>{m}</option>
              ))}
            </select>
            <span style={{fontSize:11,color:'var(--text2)'}}>a</span>
            <select className="form-input" style={{width:110,padding:'3px 8px',fontSize:11}}
              value={compMesHasta} onChange={e=>{setCompMesHasta(+e.target.value);setCompPeriodos(null)}}>
              {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map((m,i)=>(
                <option key={i} value={i+1}>{m}</option>
              ))}
            </select>
            {['ventas','unidades','utilidad','gastos'].map(m=>(
              <button key={m} onClick={()=>setCompMetrica(m)}
                className={`psw-btn${compMetrica===m?' active':''}`}
                style={{fontSize:10,padding:'3px 10px'}}>
                {m==='ventas'?'Ingresos':m==='unidades'?'Unidades':m==='utilidad'?'Utilidad':'Gastos'}
              </button>
            ))}
            <button onClick={async()=>{
              const data = await fetchComparativoPeriodos(compMesDesde, compMesHasta, [2023,2024,2025,2026])
              setCompPeriodos(data)
            }} style={{padding:'3px 14px',borderRadius:99,fontSize:11,cursor:'pointer',border:'none',background:'var(--accent)',color:'#fff',fontWeight:600}}>
              Comparar
            </button>
          </div>
        </div>
        {compPeriodos && (
          <div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:14}}>
              {[2023,2024,2025,2026].map(anio=>{
                const d = compPeriodos[anio]
                if (!d) return null
                const v = d[compMetrica]||0
                const prev = compPeriodos[anio-1]?.[compMetrica]||0
                const crecPct = prev>0 ? Math.round((v-prev)/prev*100) : null
                return (
                  <div key={anio} className="mc">
                    <div className="mc-label">{anio} {anio===2023?'(sep-dic)':''}</div>
                    <div className="mc-value" style={{color:C.blue,fontSize:16}}>
                      {compMetrica==='unidades'?Math.round(v).toLocaleString('es-MX'):fmtM(v)}
                    </div>
                    {crecPct!==null && (
                      <div style={{fontSize:10,color:crecPct>=0?C.green:C.red,marginTop:2}}>
                        {crecPct>=0?'▲':'▼'} {Math.abs(crecPct)}% vs {anio-1}
                      </div>
                    )}
                    <div style={{fontSize:9,color:'var(--text3)',marginTop:1}}>{d.diasConVentas} días hábiles</div>
                  </div>
                )
              })}
            </div>
            <Bar data={{
              labels: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].slice(compMesDesde-1, compMesHasta),
              datasets: [2023,2024,2025,2026].filter(a=>compPeriodos[a]).map((anio,i)=>({
                label: String(anio),
                data: Array.from({length:compMesHasta-compMesDesde+1},(_,idx)=>{
                  const mes = String(compMesDesde+idx).padStart(2,'0')
                  return Math.round(compPeriodos[anio]?.porMes?.[mes]?.[compMetrica]||0)
                }),
                backgroundColor: [C.blue,C.green,C.amber,C.purple][i]+'99',
                borderColor: [C.blue,C.green,C.amber,C.purple][i],
                borderWidth:1,
              }))
            }} options={{responsive:true,plugins:{legend:{position:'top',labels:{color:tc(),font:{size:11}}},
              tooltip:{callbacks:{label:ctx=>compMetrica==='unidades'?ctx.dataset.label+': '+ctx.raw+' uds':ctx.dataset.label+': $'+Math.round(ctx.raw).toLocaleString('es-MX')}}},
              scales:{x:{ticks:{color:tc()},grid:{color:gc()}},y:{ticks:{color:tc(),callback:v=>compMetrica==='unidades'?v:fmtK(v)},grid:{color:gc()}}}
            }}/>
          </div>
        )}
        {!compPeriodos && <div style={{textAlign:'center',padding:'30px 0',color:'var(--text3)',fontSize:12}}>Selecciona el período y presiona Comparar</div>}
      </div>

      {/* ── CAGR ── */}
      {cagrData && (
        <div className="card" style={{marginTop:12}}>
          <div className="ct" style={{marginBottom:14}}>CAGR — Tasa de crecimiento anual compuesta (base 2024)</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
            {[
              {label:'Ingresos',  key:'ventas',   color:C.blue},
              {label:'Unidades',  key:'unidades', color:C.green},
              {label:'Utilidad',  key:'utilidad', color:C.purple},
            ].map(m=>{
              const v2024 = cagrData[2024]?.[m.key]||0
              const v2025 = cagrData[2025]?.[m.key]||0
              const v2026 = cagrData[2026]?.[m.key]||0
              const cagr2425 = calcCAGR(v2024, v2025, 1)
              const cagr2426 = calcCAGR(v2024, v2026, 2)
              return (
                <div key={m.key} className="mc">
                  <div className="mc-label">{m.label}</div>
                  <div style={{fontSize:22,fontWeight:700,color:m.color}}>{cagr2425!==null?cagr2425+'%':'—'}</div>
                  <div style={{fontSize:10,color:'var(--text3)',marginTop:2}}>CAGR 2024→2025</div>
                  {cagr2426!==null && <div style={{fontSize:11,color:cagr2426>=0?C.green:C.red,marginTop:4,fontWeight:600}}>{cagr2426}% CAGR 2024→2026</div>}
                </div>
              )
            })}
          </div>
          <div style={{overflowX:'auto'}}>
            <table className="tbl">
              <thead>
                <tr><th>Métrica</th><th className="num">2024</th><th className="num">2025</th><th className="num">2026 (anual.)</th><th className="num">CAGR 24→25</th><th className="num">CAGR 24→26</th></tr>
              </thead>
              <tbody>
                {[
                  {label:'Ingresos', key:'ventas',   color:C.blue,   fmt:fmtM},
                  {label:'Unidades', key:'unidades',  color:C.green,  fmt:v=>Math.round(v).toLocaleString('es-MX')},
                  {label:'Utilidad', key:'utilidad',  color:C.purple, fmt:fmtM},
                  {label:'Gastos',   key:'gastos',    color:C.red,    fmt:fmtM},
                ].map(m=>{
                  const v2024 = cagrData[2024]?.[m.key]||0
                  const v2025 = cagrData[2025]?.[m.key]||0
                  const v2026 = cagrData[2026]?.[m.key]||0
                  const cagr2425 = calcCAGR(v2024, v2025, 1)
                  const cagr2426 = calcCAGR(v2024, v2026, 2)
                  return (
                    <tr key={m.key}>
                      <td style={{fontWeight:600,color:m.color}}>{m.label}</td>
                      <td className="num">{m.fmt(v2024)}</td>
                      <td className="num">{m.fmt(v2025)}</td>
                      <td className="num">{m.fmt(v2026)}</td>
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
      <IngresoGastoCategorias titulo='Ingresos vs Gastos por categoria' rango={rango} rangoDesde={rangoDesde} rangoHasta={rangoHasta} />
    </div>
  )
}
