import React, { useState, useEffect, useCallback } from 'react'
import { sb } from '../lib/supabase.js'
import IngresoGastoCategorias from '../components/IngresoGastoCategorias.jsx'
import { Bar, Line, Chart as ChartMix } from 'react-chartjs-2'
import { Chart, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, Filler } from 'chart.js'
import PeriodSwitcher from '../components/PeriodSwitcher.jsx'
import ExportBtn from '../components/ExportBtn.jsx'
import { fetchKpiRangoGran, fetchSeriesRangoGran, fetchPorCategoria, fetchPorCanal, fetchGastosPorCategoria, getRangoFechas, trendline, fetchRentabilidadCategoria, fetchKpiAcum } from '../lib/analytics.js'

Chart.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, Filler)

const tc = () => matchMedia('(prefers-color-scheme:dark)').matches?'rgba(255,255,255,0.45)':'rgba(0,0,0,0.4)'
const gc = () => matchMedia('(prefers-color-scheme:dark)').matches?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)'
const fmtM = v => '$'+Math.round(v||0).toLocaleString('es-MX')
const fmtK = v => Math.abs(v||0)>=1000?(v>=0?'$':'-$')+Math.round(Math.abs(v)/1000)+'k':fmtM(v)
const COLORS = ['#378ADD','#1D9E75','#EF9F27','#7F77DD','#D85A30','#E24B4A','#888780','#D4537E']

export default function Analisis() {
  const [rango,       setRango]       = useState('1anio')
  const [granularidad,setGranularidad]= useState('mensual')
  const [rangoDesde,  setRangoDesde]  = useState('')
  const [rangoHasta,  setRangoHasta]  = useState('')
  const [view,        setView]        = useState('dinero')
  const [kpi,         setKpi]         = useState(null)
  const [series,      setSeries]      = useState(null)
  const [cats,        setCats]        = useState([])
  const [gastosCat,   setGastosCat]   = useState([])
  const [pagoSocios,  setPagoSocios]  = useState([])
  const [canales,     setCanales]     = useState([])
  const [canalFiltros,setCanalFiltros]= useState([])
  const [rentCat,     setRentCat]     = useState([])
  const [rentCanalFiltro, setRentCanalFiltro] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [kpiMes,      setKpiMes]      = useState(null)

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

  const load = useCallback(async () => {
    if (rango==='rango' && (!rangoDesde||!rangoHasta)) return
    setLoading(true)
    try {
      const { from, to } = getRangoFechas(rango, rangoDesde, rangoHasta)
      const [k, s, c, gc2, can, rent, socios] = await Promise.all([
        fetchKpiRangoGran(rango, granularidad, rangoDesde, rangoHasta, canalFiltros),
        fetchSeriesRangoGran(rango, granularidad, rangoDesde, rangoHasta, canalFiltros),
        fetchPorCategoria(from, to),
        fetchGastosPorCategoria(from, to),
        fetchPorCanal(from, to),
        fetchRentabilidadCategoria(from, to, canalFiltros),
        sb.from('gastos').select('fecha,monto,subcategoria_gasto').eq('categoria_gasto','PAGO DE GANANCIAS').gte('fecha',from).lte('fecha',to)
      ])
      setKpi(k); setSeries(s); setCats(c); setGastosCat(gc2); setCanales(can); setRentCat(rent)
      // Agrupar pagos por socio
      const sociosMap = {}
      ;(socios?.data||[]).forEach(g => {
        const k = g.subcategoria_gasto || 'Sin asignar'
        sociosMap[k] = (sociosMap[k]||0) + (g.monto||0)
      })
      setPagoSocios(Object.entries(sociosMap).map(([socio,monto])=>({socio,monto})).sort((a,b)=>b.monto-a.monto))
      loadKpiMes(from, to)
    } catch(e) { console.error(e) }
    setLoading(false)
  }, [rango, granularidad, rangoDesde, rangoHasta, canalFiltros, loadKpiMes])

  useEffect(()=>{ load() },[load])

  useEffect(() => {
    if (rango==='rango'&&(!rangoDesde||!rangoHasta)) return
    const { from, to } = getRangoFechas(rango, rangoDesde, rangoHasta)
    fetchRentabilidadCategoria(from, to, rentCanalFiltro).then(setRentCat)
  }, [rentCanalFiltro, rango, rangoDesde, rangoHasta])

  const baseOpts = {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{display:false} },
    scales:{
      x:{ ticks:{color:tc(),font:{size:10}}, grid:{color:gc()}, border:{display:false} },
      y:{ ticks:{color:tc(),font:{size:10},callback:v=>view==='dinero'?fmtK(v):v.toLocaleString()}, grid:{color:gc()}, border:{display:false} },
    }
  }

  // Meta de unidades
  const META_DIARIA = 100
  const metaUnidades = series?.labels ? series.labels.map(() => {
    if (granularidad === 'mensual') return META_DIARIA * 26
    if (granularidad === 'semanal') return META_DIARIA * 6
    return META_DIARIA
  }) : []

  const seriesDataDinero = series ? {
    labels: series.labels,
    datasets:[{
      label:'Ingresos',
      data: series.ventas,
      borderColor:'#378ADD', backgroundColor:'rgba(55,138,221,0.1)',
      fill:true, tension:0.3, pointRadius:2, borderWidth:2,
    }]
  } : null

  const seriesDataUnidades = series ? {
    labels: series.labels,
    datasets:[
      {
        label:'Unidades',
        data: series.unidades,
        borderColor:'#378ADD', backgroundColor:'rgba(55,138,221,0.1)',
        fill:true, tension:0.3, pointRadius:2, borderWidth:2,
      },
      {
        label:'Meta',
        data: metaUnidades,
        borderColor:'#E24B4A',
        borderWidth:2,
        borderDash:[6,3],
        pointRadius:0,
        fill:false,
      }
    ]
  } : null

  const seriesData = view==='dinero' ? seriesDataDinero : seriesDataUnidades

  const mainData = series ? {
    labels: series.labels,
    datasets:[
      { type:'bar', label:'Ingresos', data:series.ventas, backgroundColor:'#378ADD'+'BB', borderRadius:3, order:2 },
      { type:'bar', label:'Gastos',   data:series.gastos.map(v=>-v), backgroundColor:'#E24B4A'+'AA', borderRadius:3, order:2 },
      { type:'line',label:'Utilidad', data:series.utilidad, borderColor:'#1D9E75', borderWidth:2,
        borderDash:[5,4], pointRadius:2, pointBackgroundColor:series.utilidad.map(v=>v>=0?'#1D9E75':'#E24B4A'),
        fill:false, tension:0.3, order:1 },
      { type:'line',label:'Tendencia utilidad', data:trendline(series.utilidad), borderColor:'#1D9E7588',
        borderWidth:1.5, borderDash:[2,4], pointRadius:0, fill:false, tension:0, order:1 },
    ]
  } : null

  const udsLineOpts = { ...baseOpts,
    plugins:{ legend:{display:true,position:'top',labels:{color:tc(),font:{size:10},boxWidth:10,padding:8}} },
    scales:{
      x:{ ticks:{color:tc(),font:{size:10}}, grid:{color:gc()}, border:{display:false} },
      y:{ ticks:{color:tc(),font:{size:10},callback:v=>Math.round(v).toLocaleString()}, grid:{color:gc()}, border:{display:false} },
    }
  }

  const mainOpts = { ...baseOpts, plugins:{ legend:{display:true,position:'top',labels:{color:tc(),font:{size:10},boxWidth:10,padding:10}} },
    scales:{ ...baseOpts.scales, y:{ ...baseOpts.scales.y, ticks:{...baseOpts.scales.y.ticks, callback:v=>fmtK(v)} } } }

  const totalVentas = cats.reduce((s,c)=>s+c.importe,0)

  return (
    <div>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:10}}>
        <PeriodSwitcher rango={rango} granularidad={granularidad}
          onRango={setRango} onGranularidad={setGranularidad}
          rangoDesde={rangoDesde} rangoHasta={rangoHasta}
          onRangoChange={(d,h)=>{setRangoDesde(d);setRangoHasta(h)}}/>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>

          <ExportBtn titulo="Analisis" getElement={()=>document.querySelector('.content')}/>
        </div>
      </div>

      <div style={{padding:'4px 8px',background:'#EAF3DE',borderRadius:4,fontSize:11,marginBottom:8}}>Vista actual: {view}</div>
      {/* FILTRO GLOBAL POR CANAL */}
      {canales.length>0 && (
        <div style={{display:'flex',gap:5,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
          <span style={{fontSize:11,color:'var(--text2)',marginRight:2}}>Canal:</span>
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
        {[
          {label:'Ventas',   val:fmtM(kpi?.ventas)},
          {label:'Unidades', val:(kpi?.unidades||0).toLocaleString()+' uds'},
          {label:'Gastos',   val:fmtM(kpi?.gastos)},
          {label:'Utilidad', val:fmtM(kpi?.utilidad), color:kpi?.utilidad>=0?'#1D9E75':'#E24B4A'},
          {label:'Margen',   val:kpi?.margen!=null?kpi.margen+'%':'—', color:kpi?.margen>=0?'#1D9E75':'#E24B4A'},
        ].map(k2=>(
          <div key={k2.label} className="mc">
            <div className="mc-label">{k2.label}</div>
            <div className="mc-value" style={k2.color?{color:k2.color}:{}}>{loading?'…':k2.val}</div>
          </div>
        ))}
      </div>

      {/* ── KPIs ACUMULADOS DEL PERÍODO ── */}
      {kpiMes && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(105px,1fr))',gap:8,marginBottom:12}}>
          {[
            { label:'Ajustes Efectivo',   val:kpiMes.ajEfvo,    fmt:'$', color:'#EF9F27', hint:'Faltantes − sobrantes acum. período' },
            { label:'Ajustes Tarjeta',    val:kpiMes.ajTc,      fmt:'$', color:'#7F77DD', hint:'Faltantes − sobrantes acum. período' },
            { label:'Ajustes Plataforma', val:kpiMes.ajPlat,    fmt:'$', color:'#E24B4A', hint:'Faltantes − sobrantes acum. período' },
            { label:'☕ Café gratis',      val:kpiMes.artUds||0, fmt:'u', color:'#D85A30', hint:`${kpiMes.artCnt||0} artículos en órdenes pagadas` },
            { label:'🎁 Sin cobro',        val:kpiMes.gUds,      fmt:'u', color:'#378ADD', hint:`${kpiMes.gCnt} órdenes sin cobrar`, sub: kpiMes.gMonto>0?'~'+fmtM(kpiMes.gMonto)+' est.':'' },
            { label:'Uds vendidas',       val:kpiMes.totUds,    fmt:'u', color:'#1D9E75', hint:'Acumulado del período' },
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

      {/* Gráfica principal */}
      <div className="card" style={{marginBottom:12}}>
        <div className="ch"><div className="ct">Ingresos · Gastos · Utilidad</div></div>
        <div className="chart-wrap" style={{height:200}}>
          {loading?<div className="loading-screen"><div className="spinner"/></div>
          :mainData?<Bar data={mainData} options={mainOpts}/>
          :<div style={{textAlign:'center',padding:'40px 0',color:'var(--text3)'}}>Sin datos</div>}
        </div>
      </div>

      {/* Costo vs Ingresos */}
      {series?.costo && (
        <div className="card" style={{marginBottom:12}}>
          <div className="ch">
            <div className="ct">Costo de ventas vs Ingresos</div>
            <div style={{fontSize:10,color:'var(--text2)'}}>Solo costo directo · linea roja = % costo sobre ingreso</div>
          </div>
          <div className="chart-wrap" style={{height:180}}>
            <Bar data={{
              labels:series.labels,
              datasets:[
                {type:'bar',label:'Ingresos',data:series.ventas,backgroundColor:'#378ADD99',borderRadius:3,order:2,yAxisID:'y'},
                {type:'bar',label:'Costo directo',data:series.costo,backgroundColor:'#EF9F27CC',borderRadius:3,order:2,yAxisID:'y'},
                {type:'line',label:'% Costo/Ingreso',data:series.pctCosto,borderColor:'#E24B4A',borderWidth:2,borderDash:[4,3],pointRadius:2,fill:false,tension:0.3,order:1,yAxisID:'y2'},
                {type:'line',label:'Tendencia %',data:trendline(series.pctCosto),borderColor:'#E24B4A66',borderWidth:1.5,borderDash:[2,4],pointRadius:0,fill:false,tension:0,order:1,yAxisID:'y2'},
              ]
            }} options={{
              responsive:true,maintainAspectRatio:false,
              plugins:{legend:{display:true,position:'top',labels:{color:tc(),font:{size:10},boxWidth:10,padding:10}}},
              scales:{
                x:{ticks:{color:tc(),font:{size:10}},grid:{color:gc()},border:{display:false}},
                y:{ticks:{color:tc(),font:{size:10},callback:v=>fmtK(v)},grid:{color:gc()},border:{display:false},position:'left'},
                y2:{ticks:{color:'#E24B4A',font:{size:10},callback:v=>v+'%'},grid:{display:false},border:{display:false},position:'right',min:0,max:100},
              }
            }}/>
          </div>
        </div>
      )}

      {/* Tendencia ingresos */}
      <div className="card" style={{marginBottom:12}}>
        <div className="ch"><div className="ct">Tendencia — ingresos</div></div>
        <div className="chart-wrap" style={{height:180}}>
          {loading?<div className="loading-screen"><div className="spinner"/></div>
          :seriesDataDinero?<Line data={seriesDataDinero} options={baseOpts}/>:null}
        </div>
      </div>

      {/* Tendencia unidades con meta */}
      <div className="card" style={{marginBottom:12}}>
        <div className="ch"><div className="ct">Tendencia — unidades vendidas</div></div>
        <div className="chart-wrap" style={{height:180}}>
          {loading?<div className="loading-screen"><div className="spinner"/></div>
          :seriesDataUnidades?<Line data={seriesDataUnidades} options={udsLineOpts}/>:null}
        </div>
      </div>

      <div className="two">
        {/* Por categoría */}
        <div className="card">
          <div className="ch"><div className="ct">Por familia de productos</div></div>
          {loading?<div className="loading-screen" style={{height:180}}><div className="spinner"/></div>
          :<table className="tbl">
            <thead><tr><th>Familia</th><th className="num">Importe</th><th className="num">Uds</th><th className="num">%</th></tr></thead>
            <tbody>
              {cats.map((c,i)=>(
                <tr key={c.categoria}>
                  <td><span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:COLORS[i%COLORS.length],marginRight:5}}/>{c.categoria}</td>
                  <td className="num">{fmtM(c.importe)}</td>
                  <td className="num">{c.unidades?.toLocaleString()}</td>
                  <td className="num c-muted">{totalVentas>0?Math.round(c.importe/totalVentas*100):0}%</td>
                </tr>
              ))}
            </tbody>
          </table>}
        </div>

        <div>
          {/* Rentabilidad por categoría */}
          {rentCat.length > 0 && (
            <div className="card" style={{marginBottom:10}}>
              <div className="ch"><div className="ct">Rentabilidad por categoría</div></div>
              {/* Selector canal */}
              {canales.length>0&&(
                <div style={{display:'flex',gap:4,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
                  <span style={{fontSize:10,color:'var(--text2)',marginRight:2}}>Canal:</span>
                  <button onClick={()=>setRentCanalFiltro([])}
                    style={{padding:'2px 8px',borderRadius:99,fontSize:10,cursor:'pointer',
                      border:`1.5px solid ${rentCanalFiltro.length===0?'var(--accent)':'var(--border-md)'}`,
                      background:rentCanalFiltro.length===0?'var(--accent)22':'transparent',
                      color:rentCanalFiltro.length===0?'var(--accent)':'var(--text2)'}}>Todos</button>
                  {canales.map(c=>(
                    <button key={c.canal} onClick={()=>setRentCanalFiltro(prev=>prev.includes(c.canal)?prev.filter(x=>x!==c.canal):[...prev,c.canal])}
                      style={{padding:'2px 8px',borderRadius:99,fontSize:10,cursor:'pointer',
                        border:`1.5px solid ${rentCanalFiltro.includes(c.canal)?'var(--accent)':'var(--border-md)'}`,
                        background:rentCanalFiltro.includes(c.canal)?'var(--accent)22':'transparent',
                        color:rentCanalFiltro.includes(c.canal)?'var(--accent)':'var(--text2)'}}>
                      {c.canal}
                    </button>
                  ))}
                </div>
              )}
              <table className="tbl" style={{marginBottom:10}}>
                <thead><tr><th>Categoría</th><th className="num">Ingresos</th><th className="num">Costo</th>{rentCat.some(r=>r.comision>0)&&<th className="num">Comisión</th>}<th className="num">Utilidad</th><th className="num">Margen</th></tr></thead>
                <tbody>
                  {rentCat.map(r=>(
                    <tr key={r.categoria}>
                      <td style={{fontSize:12}}>{r.categoria}</td>
                      <td className="num">{fmtM(r.importe)}</td>
                      <td className="num" style={{color:'#E24B4A'}}>{fmtM(r.costo)}</td>
                      {rentCat.some(x=>x.comision>0)&&<td className="num" style={{color:'#EF9F27'}}>{r.comision>0?fmtM(r.comision):'—'}</td>}
                      <td className="num" style={{color:r.utilidad>=0?'#1D9E75':'#E24B4A',fontWeight:600}}>{fmtM(r.utilidad)}</td>
                      <td className="num">
                        <span style={{color:r.margen>=50?'#1D9E75':r.margen>=30?'#EF9F27':'#E24B4A',fontWeight:600}}>{r.margen}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{fontWeight:700}}>
                    <td>Total</td>
                    <td className="num">{fmtM(rentCat.reduce((s,r)=>s+r.importe,0))}</td>
                    <td className="num" style={{color:'#E24B4A'}}>{fmtM(rentCat.reduce((s,r)=>s+r.costo,0))}</td>
                    {rentCat.some(x=>x.comision>0)&&<td className="num" style={{color:'#EF9F27'}}>{fmtM(rentCat.reduce((s,r)=>s+r.comision,0))}</td>}
                    <td className="num" style={{color:'#1D9E75'}}>{fmtM(rentCat.reduce((s,r)=>s+r.utilidad,0))}</td>
                    <td className="num" style={{color:'#1D9E75'}}>
                      {rentCat.reduce((s,r)=>s+r.importe,0)>0
                        ? Math.round(rentCat.reduce((s,r)=>s+r.utilidad,0)/rentCat.reduce((s,r)=>s+r.importe,0)*100)
                        : 0}%
                    </td>
                  </tr>
                </tfoot>
              </table>
              {/* Barras costo vs ingreso */}
              {rentCat.map(r=>(
                <div key={r.categoria} style={{marginBottom:8}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:3}}>
                    <span style={{fontWeight:500}}>{r.categoria}</span>
                    <span style={{color:'var(--text2)'}}>{fmtM(r.importe)} · margen {r.margen}%</span>
                  </div>
                  <div style={{height:10,background:'var(--border)',borderRadius:5,overflow:'hidden',position:'relative'}}>
                    <div style={{position:'absolute',left:0,top:0,height:'100%',width:`${r.importe>0?100:0}%`,background:'#378ADD33',borderRadius:5}}/>
                    <div style={{position:'absolute',left:0,top:0,height:'100%',
                      width:`${r.importe>0?Math.round(r.costo/r.importe*100):0}%`,
                      background:'#E24B4A',borderRadius:5}}/>
                    <div style={{position:'absolute',left:`${r.importe>0?Math.round(r.costo/r.importe*100):0}%`,top:0,height:'100%',
                      width:`${r.importe>0?r.margen:0}%`,
                      background:'#1D9E75',borderRadius:5}}/>
                  </div>
                  <div style={{display:'flex',gap:12,fontSize:9,color:'var(--text3)',marginTop:2}}>
                    <span style={{color:'#E24B4A'}}>■ Costo {fmtM(r.costo)}</span>
                    <span style={{color:'#1D9E75'}}>■ Utilidad {fmtM(r.utilidad)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <IngresoGastoCategorias titulo="Ingresos vs Gastos por categoria" rango={rango} rangoDesde={rangoDesde} rangoHasta={rangoHasta} />

          {/* Pago de Ganancias por Socio */}
          {pagoSocios.length > 0 && (
            <div className="card" style={{marginBottom:10}}>
              <div className="ch"><div className="ct">Pago de Ganancias por Socio</div>
                <div style={{fontSize:11,color:'var(--text2)'}}>
                  Total: {fmtM(pagoSocios.reduce((s,x)=>s+x.monto,0))}
                </div>
              </div>
              <div style={{padding:'10px 14px'}}>
                {pagoSocios.map(s => {
                  const tot = pagoSocios.reduce((sum,x)=>sum+x.monto,0)
                  const pct = tot > 0 ? (s.monto/tot*100) : 0
                  const color = s.socio === 'Socio 1' ? '#378ADD' : s.socio === 'Socio 2' ? '#D4537E' : '#888'
                  const label = s.socio === 'Socio 1' ? 'Socio 1 (Memo)' : s.socio === 'Socio 2' ? 'Socio 2 (Monica)' : s.socio
                  return (
                    <div key={s.socio} style={{marginBottom:10}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,fontSize:12}}>
                        <span style={{fontWeight:600}}>{label}</span>
                        <span><strong>{fmtM(s.monto)}</strong> <span style={{color:'var(--text3)'}}>({pct.toFixed(1)}%)</span></span>
                      </div>
                      <div style={{height:14,background:'var(--bg)',borderRadius:7,overflow:'hidden'}}>
                        <div style={{width:pct+'%',height:'100%',background:color,transition:'width 0.5s ease'}}/>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Gastos por categoría */}
          <div className="card" style={{marginBottom:10}}>
            <div className="ch"><div className="ct">Gastos por categoria</div></div>
            {loading?<div className="loading-screen" style={{height:100}}><div className="spinner"/></div>
            :<table className="tbl">
              <thead><tr><th>Categoria</th><th className="num">Monto</th><th className="num">%</th></tr></thead>
              <tbody>
                {gastosCat.map(g=>{
                  const tot=gastosCat.reduce((s,x)=>s+x.monto,0)
                  return <tr key={g.categoria}><td style={{fontSize:12}}>{g.categoria}</td><td className="num">{fmtM(g.monto)}</td><td className="num c-muted">{tot>0?Math.round(g.monto/tot*100):0}%</td></tr>
                })}
              </tbody>
            </table>}
          </div>

          {/* Por canal */}
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
                    {c.canal}
                  </button>
                ))}
              </div>
            )}
            {loading?<div className="loading-screen" style={{height:80}}><div className="spinner"/></div>
            :<table className="tbl">
              <thead><tr><th>Canal</th><th className="num">Importe</th><th className="num">Uds</th><th className="num">%</th></tr></thead>
              <tbody>
                {(canalFiltros.length===0?canales:canales.filter(c=>canalFiltros.includes(c.canal))).map(c=>{
                  const base=canalFiltros.length===0?canales:canales.filter(x=>canalFiltros.includes(x.canal))
                  const tot=base.reduce((s,x)=>s+x.importe,0)
                  return <tr key={c.canal}>
                    <td style={{fontSize:12}}>{c.canal}</td>
                    <td className="num">{fmtM(c.importe)}</td>
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
      </div>
    </div>
  )
}
