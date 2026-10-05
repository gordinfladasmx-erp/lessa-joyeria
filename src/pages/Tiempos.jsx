import React, { useState, useEffect, useCallback } from 'react'
import { sb } from '../lib/supabase.js'
import { Bar, Line } from 'react-chartjs-2'
import ExportBtn from '../components/ExportBtn.jsx'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend } from 'chart.js'
ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend)

const today = () => { const d=new Date(); return d.getFullYear()+'-'+(String(d.getMonth()+1).padStart(2,'0'))+'-'+(String(d.getDate()).padStart(2,'0')) }
const fmtSeg = s => { if (!s) return '—'; const m=Math.floor(s/60); const ss=s%60; return m>0?`${m}m ${ss}s`:`${ss}s` }

const C = { blue:'#378ADD', amber:'#EF9F27', red:'#E24B4A', green:'#1D9E75', purple:'#7F77DD', coral:'#D85A30' }
const tc = () => getComputedStyle(document.documentElement).getPropertyValue('--text2').trim()||'#888'
const gc = () => getComputedStyle(document.documentElement).getPropertyValue('--border').trim()||'#eee'

const CANAL_COLORS = {
  'Efectivo':C.green,'Tarjeta':C.blue,'Uber':C.amber,'Uber Chilakiles':C.amber,
  'DiDi':C.coral,'DiDi Chilakiles':C.coral,'Rappi':C.purple,'Ola':C.blue,'Gratis':C.red,
}

export default function Tiempos() {
  const [desde,     setDesde]     = useState(today())
  const [hasta,     setHasta]     = useState(today())
  const [loading,   setLoading]   = useState(false)
  const [rows,      setRows]      = useState([])
  const [vistaActiva, setVistaActiva] = useState([]) // comandas en curso

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await sb.from('ventas')
      .select('fecha, producto, categoria, canal, canal_tipo, tiempo_cocina_seg, unidades, importe')
      .gte('fecha', desde).lte('fecha', hasta)
      .not('tiempo_cocina_seg', 'is', null)
      .order('fecha', { ascending:false })
    setRows(data||[])
    setLoading(false)
  }, [desde, hasta])

  // Cargar comandas activas en cocina
  const loadActivas = useCallback(async () => {
    const { data } = await sb.from('comandas_activas')
      .select('*').eq('estado','en_cocina')
    setVistaActiva(data||[])
  }, [])

  useEffect(() => { load(); loadActivas() }, [load, loadActivas])

  // Realtime para comandas activas
  useEffect(() => {
    const ch = sb.channel('tiempos-realtime')
      .on('postgres_changes', { event:'*', schema:'public', table:'comandas_activas' }, loadActivas)
      .subscribe()
    return () => sb.removeChannel(ch)
  }, [loadActivas])

  // KPIs
  const conTiempo = rows.filter(r=>r.tiempo_cocina_seg>0)
  const promGeneral = conTiempo.length ? Math.round(conTiempo.reduce((s,r)=>s+r.tiempo_cocina_seg,0)/conTiempo.length) : 0
  const maxTiempo = conTiempo.length ? Math.max(...conTiempo.map(r=>r.tiempo_cocina_seg)) : 0
  const minTiempo = conTiempo.length ? Math.min(...conTiempo.map(r=>r.tiempo_cocina_seg)) : 0

  // Por canal
  const porCanal = {}
  conTiempo.forEach(r => {
    if (!porCanal[r.canal]) porCanal[r.canal] = []
    porCanal[r.canal].push(r.tiempo_cocina_seg)
  })
  const canales = Object.keys(porCanal).sort()
  const promsCanal = canales.map(c => Math.round(porCanal[c].reduce((s,v)=>s+v,0)/porCanal[c].length))

  // Por categoría
  const porCat = {}
  conTiempo.forEach(r => {
    if (!porCat[r.categoria]) porCat[r.categoria] = []
    porCat[r.categoria].push(r.tiempo_cocina_seg)
  })
  const cats = Object.keys(porCat).sort((a,b)=>
    Math.round(porCat[b].reduce((s,v)=>s+v,0)/porCat[b].length) -
    Math.round(porCat[a].reduce((s,v)=>s+v,0)/porCat[a].length)
  )
  const promsCat = cats.map(c=>Math.round(porCat[c].reduce((s,v)=>s+v,0)/porCat[c].length))

  // Por día
  const porDia = {}
  conTiempo.forEach(r => {
    if (!porDia[r.fecha]) porDia[r.fecha] = []
    porDia[r.fecha].push(r.tiempo_cocina_seg)
  })
  const dias = Object.keys(porDia).sort()
  const promsDia = dias.map(d=>Math.round(porDia[d].reduce((s,v)=>s+v,0)/porDia[d].length))

  const baseOpts = {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ display:false } },
    scales:{
      x:{ ticks:{color:tc(),font:{size:10}}, grid:{color:gc()}, border:{display:false} },
      y:{ ticks:{color:tc(),font:{size:10},callback:v=>fmtSeg(v)}, grid:{color:gc()}, border:{display:false} }
    }
  }

  return (
    <div>
      {/* FILTROS */}
      <div style={{display:'flex',gap:10,alignItems:'flex-end',marginBottom:14,flexWrap:'wrap',justifyContent:'space-between'}}>
        <div style={{display:'flex',gap:10,alignItems:'flex-end',flexWrap:'wrap'}}>
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
            {label:'Hoy', fn:()=>{setDesde(today());setHasta(today())}},
            {label:'7 días', fn:()=>{const d=new Date();d.setDate(d.getDate()-6);setDesde(d.toISOString().slice(0,10));setHasta(today())}},
            {label:'30 días', fn:()=>{const d=new Date();d.setDate(d.getDate()-29);setDesde(d.toISOString().slice(0,10));setHasta(today())}},
          ].map(a=>(
            <button key={a.label} onClick={a.fn}
              style={{padding:'6px 12px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:11,color:'var(--text2)'}}>
              {a.label}
            </button>
          ))}
        </div>
        </div>
        <ExportBtn titulo="Tiempos de cocina" getElement={()=>document.querySelector('.content')}/>
      </div>

      {/* COMANDAS EN COCINA AHORA */}
      {vistaActiva.length > 0 && (
        <div className="card" style={{marginBottom:12,borderLeft:'3px solid #EF9F27'}}>
          <div className="ch"><div className="ct" style={{color:'#EF9F27'}}>🍳 En cocina ahora ({vistaActiva.length})</div></div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {vistaActiva.map(c=>{
              const elapsed = Math.floor((Date.now()-new Date(c.enviado_cocina_at))/1000)
              const pct = Math.min(elapsed/(c.timer_minutos*60),1)
              const color = pct>=1?C.red:pct>=0.75?C.amber:C.green
              return (
                <div key={c.id} style={{background:'var(--bg)',borderRadius:'var(--r-md)',padding:'10px 14px',minWidth:160,border:`1px solid ${color}44`}}>
                  <div style={{fontSize:12,fontWeight:600,marginBottom:4}}>{c.label}{c.cliente?' — '+c.cliente:''}</div>
                  <div style={{fontSize:11,color:'var(--text2)',marginBottom:6}}>Ronda {c.ronda} · Timer {c.timer_minutos} min</div>
                  <div style={{height:5,background:'var(--border)',borderRadius:3,overflow:'hidden',marginBottom:4}}>
                    <div style={{width:`${pct*100}%`,height:'100%',background:color,borderRadius:3}}/>
                  </div>
                  <div style={{fontSize:12,fontWeight:600,color,textAlign:'right'}}>{fmtSeg(elapsed)}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {loading ? <div className="loading-screen"><div className="spinner"/></div> : conTiempo.length===0 ? (
        <div className="card" style={{textAlign:'center',padding:'40px 0',color:'var(--text3)'}}>
          <div style={{fontSize:32,marginBottom:8}}>⏱</div>
          <div>Sin datos de tiempos para este periodo.</div>
          <div style={{fontSize:11,marginTop:6}}>Los tiempos se registran al cobrar comandas enviadas a cocina.</div>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="metrics" style={{gridTemplateColumns:'repeat(4,minmax(0,1fr))',marginBottom:12}}>
            <div className="mc"><div className="mc-label">Promedio general</div><div className="mc-value" style={{color:C.blue}}>{fmtSeg(promGeneral)}</div></div>
            <div className="mc"><div className="mc-label">Más rápido</div><div className="mc-value" style={{color:C.green}}>{fmtSeg(minTiempo)}</div></div>
            <div className="mc"><div className="mc-label">Más lento</div><div className="mc-value" style={{color:C.red}}>{fmtSeg(maxTiempo)}</div></div>
            <div className="mc"><div className="mc-label">Pedidos medidos</div><div className="mc-value">{conTiempo.length}</div></div>
          </div>

          {/* GRÁFICAS */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
            {/* Por canal */}
            <div className="card">
              <div className="ch"><div className="ct">Tiempo promedio por canal</div><div style={{fontSize:10,color:'var(--text2)'}}>segundos</div></div>
              <div className="chart-wrap" style={{height:200}}>
                <Bar data={{
                  labels: canales,
                  datasets:[{ data:promsCanal, backgroundColor:canales.map(c=>CANAL_COLORS[c]||C.blue), borderRadius:4 }]
                }} options={baseOpts}/>
              </div>
            </div>

            {/* Por categoría */}
            <div className="card">
              <div className="ch"><div className="ct">Tiempo promedio por categoría</div></div>
              <div className="chart-wrap" style={{height:200}}>
                <Bar data={{
                  labels: cats,
                  datasets:[{ data:promsCat, backgroundColor:C.purple+'CC', borderRadius:4 }]
                }} options={baseOpts}/>
              </div>
            </div>
          </div>

          {/* Tendencia por día */}
          {dias.length > 1 && (
            <div className="card" style={{marginBottom:12}}>
              <div className="ch"><div className="ct">Evolución del tiempo promedio por día</div></div>
              <div className="chart-wrap" style={{height:180}}>
                <Line data={{
                  labels: dias,
                  datasets:[{
                    label:'Tiempo prom. (seg)', data:promsDia,
                    borderColor:C.amber, backgroundColor:C.amber+'22',
                    borderWidth:2, pointRadius:3, fill:true, tension:0.3
                  }]
                }} options={{...baseOpts, plugins:{legend:{display:false}}}}/>
              </div>
            </div>
          )}

          {/* TABLA DETALLE */}
          <div className="card">
            <div className="ch"><div className="ct">Detalle de tiempos</div><span style={{fontSize:11,color:'var(--text3)'}}>{conTiempo.length} registros</span></div>
            <div style={{overflowX:'auto',maxHeight:400,overflowY:'auto'}}>
              <table className="tbl">
                <thead style={{position:'sticky',top:0,background:'var(--surface)'}}>
                  <tr><th>Fecha</th><th>Producto</th><th>Categoría</th><th>Canal</th><th className="num">Tiempo</th><th className="num">Uds</th></tr>
                </thead>
                <tbody>
                  {conTiempo.slice(0,200).map((r,i)=>(
                    <tr key={i}>
                      <td style={{fontSize:11}}>{r.fecha}</td>
                      <td style={{fontSize:12,fontWeight:500}}>{r.producto}</td>
                      <td><span className="badge b-gray" style={{fontSize:10}}>{r.categoria}</span></td>
                      <td style={{fontSize:11}}>{r.canal}</td>
                      <td className="num" style={{fontWeight:600,color:r.tiempo_cocina_seg>600?C.red:r.tiempo_cocina_seg>300?C.amber:C.green}}>
                        {fmtSeg(r.tiempo_cocina_seg)}
                      </td>
                      <td className="num">{r.unidades}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
