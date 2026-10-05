import React, { useState, useEffect, useCallback } from 'react'
import { Bar } from 'react-chartjs-2'
import { Chart, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend } from 'chart.js'
import PeriodSwitcher from '../components/PeriodSwitcher.jsx'
import ExportBtn from '../components/ExportBtn.jsx'
import { fetchSeriesRangoGran, fetchGastosPorCategoria, getRangoFechas, trendline } from '../lib/analytics.js'
import IngresoGastoCategorias from '../components/IngresoGastoCategorias.jsx'

Chart.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend)

const fmtM = v => '$'+Math.round(v||0).toLocaleString('es-MX')
const fmtK = v => Math.abs(v||0)>=1000?(v>=0?'$':'-$')+Math.round(Math.abs(v)/1000)+'k':fmtM(v)
const tc = () => matchMedia('(prefers-color-scheme:dark)').matches?'rgba(255,255,255,0.45)':'rgba(0,0,0,0.4)'
const gc = () => matchMedia('(prefers-color-scheme:dark)').matches?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)'

export default function PnL() {
  const [rango,       setRango]       = useState('1anio')
  const [granularidad,setGranularidad]= useState('mensual')
  const [rangoDesde,  setRangoDesde]  = useState('')
  const [rangoHasta,  setRangoHasta]  = useState('')
  const [series,      setSeries]      = useState(null)
  const [gastosCat,   setGastosCat]   = useState([])
  const [loading,     setLoading]     = useState(true)

  const load = useCallback(async () => {
    if (rango==='rango'&&(!rangoDesde||!rangoHasta)) return
    setLoading(true)
    try {
      const { from, to } = getRangoFechas(rango, rangoDesde, rangoHasta)
      const [s, gc2] = await Promise.all([
        fetchSeriesRangoGran(rango, granularidad, rangoDesde, rangoHasta),
        fetchGastosPorCategoria(from, to),
      ])
      setSeries(s); setGastosCat(gc2)
    } catch(e) { console.error(e) }
    setLoading(false)
  }, [rango, granularidad, rangoDesde, rangoHasta])

  useEffect(()=>{ load() },[load])

  if (loading) return <div className="loading-screen"><div className="spinner"/></div>
  if (!series) return null

  const totV = series.ventas.reduce((s,v)=>s+v,0)
  const totG = series.gastos.reduce((s,v)=>s+v,0)
  const totU = series.utilidad.reduce((s,v)=>s+v,0)
  const totUds = series.unidades.reduce((s,v)=>s+v,0)
  const totGCat = gastosCat.reduce((s,g)=>s+g.monto,0)

  const mainData = {
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
  }

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

  return (
    <div>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:10}}>
        <PeriodSwitcher rango={rango} granularidad={granularidad}
          onRango={setRango} onGranularidad={setGranularidad}
          rangoDesde={rangoDesde} rangoHasta={rangoHasta}
          onRangoChange={(d,h)=>{setRangoDesde(d);setRangoHasta(h)}}/>
        <ExportBtn titulo="Estado de resultados P&L" getElement={()=>document.querySelector('.content')}/>
      </div>

      {/* KPIs */}
      <div className="metrics">
        <div className="mc"><div className="mc-label">Ingresos totales</div><div className="mc-value">{fmtM(totV)}</div></div>
        <div className="mc"><div className="mc-label">Gastos totales</div><div className="mc-value">{fmtM(totG)}</div></div>
        <div className="mc"><div className="mc-label">Utilidad neta</div><div className="mc-value" style={{color:totU>=0?'#1D9E75':'#E24B4A'}}>{fmtM(totU)}</div></div>
        <div className="mc"><div className="mc-label">Margen neto</div><div className="mc-value" style={{color:totU>=0?'#1D9E75':'#E24B4A'}}>{totV>0?Math.round(totU/totV*100)+'%':'—'}</div></div>
      </div>

      {/* Gráfica principal */}
      <div className="card" style={{marginBottom:12}}>
        <div className="ch"><div className="ct">Ingresos · Gastos · Utilidad</div>
          <div style={{fontSize:10,color:'var(--text2)'}}>Ingresos arriba · Gastos abajo · Utilidad linea punteada</div>
        </div>
        <div className="chart-wrap" style={{height:220}}>
          <Bar data={mainData} options={mainOpts}/>
        </div>
      </div>

      {/* Costo vs Ingresos */}
      {series.costo && (
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
                y:{ticks:{color:tc(),font:{size:10},callback:v=>'$'+Math.round(Math.abs(v)/1000)+'k'},grid:{color:gc()},border:{display:false},position:'left'},
                y2:{ticks:{color:'#E24B4A',font:{size:10},callback:v=>v+'%'},grid:{display:false},border:{display:false},position:'right',min:0,max:100},
              }
            }}/>
          </div>
        </div>
      )}

      {/* Tabla detalle */}
      <div className="card" style={{marginBottom:12}}>
        <div className="ch"><div className="ct">Detalle por periodo</div></div>
        <div style={{overflowX:'auto',maxHeight:400,overflowY:'auto'}}>
          <table className="tbl" style={{minWidth:650}}>
            <thead style={{position:'sticky',top:0,background:'var(--surface)'}}>
              <tr><th>Periodo</th><th className="num">Ingresos</th><th className="num">Gastos</th><th className="num">Utilidad</th><th className="num">Margen</th><th className="num">Unidades</th><th style={{textAlign:'center'}}>↕</th></tr>
            </thead>
            <tbody>
              {series.labels.map((lbl,i)=>{
                const v=series.ventas[i], g=series.gastos[i], u=series.utilidad[i]
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

      {/* Gastos por categoría */}
      {gastosCat.length>0 && <div className="card">
        <div className="ch"><div className="ct">Gastos por categoria contable</div></div>
        <table className="tbl">
          <thead><tr><th>Categoria</th><th className="num">Monto</th><th className="num">%</th></tr></thead>
          <tbody>
            {gastosCat.map(g=>(
              <tr key={g.categoria}>
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
      </div>}
      <IngresoGastoCategorias titulo="Ingresos vs Gastos por categoria" rango={rango} rangoDesde={rangoDesde} rangoHasta={rangoHasta} />
    </div>
  )
}
