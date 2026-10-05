import React, { useState, useEffect, useMemo } from 'react'
import { sb } from '../lib/supabase.js'
import { Bar } from 'react-chartjs-2'
import { getRangoFechas, fetchVentasRange, fetchGastosRange } from '../lib/analytics.js'

const fmtM = v => '$'+Math.round(v||0).toLocaleString('es-MX')
const COLORS_INGRESO = ['#1D9E75','#378ADD','#7F77DD','#EF9F27','#D4537E','#2D9E6A','#D4A017','#BA7517','#534AB7','#888780']
const COLORS_GASTO   = ['#E24B4A','#A32D2D','#BA3B3B','#D85A30','#EF9F27','#8B6914','#7F77DD','#534AB7','#2568B0','#888780']

export default function IngresoGastoCategorias({ titulo='Ingresos vs Gastos por categoria', rango='anio-actual', rangoDesde='', rangoHasta='' }) {
  const [ventasCat, setVentasCat] = useState([])
  const [gastosCat, setGastosCat] = useState([])
  const [excluidasIng, setExcluidasIng] = useState([])
  const [excluidasGas, setExcluidasGas] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const cargar = async () => {
      setLoading(true)
      const { from, to } = getRangoFechas(rango, rangoDesde, rangoHasta)
      const ventasCatData = await fetchVentasRange(from, to)
      const ingresoMap = {}
      ;(ventasCatData||[]).forEach(v => { const k = v.categoria||'Sin categoria'; ingresoMap[k]=(ingresoMap[k]||0)+(v.importe||0) })
      setVentasCat(Object.entries(ingresoMap).map(([categoria,monto])=>({categoria,monto})).sort((a,b)=>b.monto-a.monto))
      const gastos = await fetchGastosRange(from, to)
      const gastoMap = {}
      ;(gastos||[]).forEach(g => { const k = g.categoria_gasto||'Sin categoria'; gastoMap[k]=(gastoMap[k]||0)+(g.monto||0) })
      setGastosCat(Object.entries(gastoMap).map(([categoria,monto])=>({categoria,monto})).sort((a,b)=>b.monto-a.monto))
      setLoading(false)
    }
    cargar()
  }, [rango, rangoDesde, rangoHasta])

  const toggleIng = (cat) => setExcluidasIng(prev => prev.includes(cat)?prev.filter(c=>c!==cat):[...prev,cat])
  const toggleGas = (cat) => setExcluidasGas(prev => prev.includes(cat)?prev.filter(c=>c!==cat):[...prev,cat])
  const totalIng = useMemo(() => ventasCat.filter(v=>!excluidasIng.includes(v.categoria)).reduce((s,v)=>s+v.monto,0), [ventasCat,excluidasIng])
  const totalGas = useMemo(() => gastosCat.filter(g=>!excluidasGas.includes(g.categoria)).reduce((s,g)=>s+g.monto,0), [gastosCat,excluidasGas])
  const utilNeta = totalIng - totalGas
  const margen = totalIng > 0 ? (utilNeta/totalIng*100) : 0
  const ventasActivas = ventasCat.filter(v=>!excluidasIng.includes(v.categoria))
  const gastosActivos = gastosCat.filter(g=>!excluidasGas.includes(g.categoria))

  const chartData = {
    labels: ['Ingresos','Gastos'],
    datasets: [
      ...ventasActivas.map((v,i)=>({ label:v.categoria, data:[v.monto,0], backgroundColor:COLORS_INGRESO[i%COLORS_INGRESO.length], stack:'ing' })),
      ...gastosActivos.map((g,i)=>({ label:g.categoria, data:[0,g.monto], backgroundColor:COLORS_GASTO[i%COLORS_GASTO.length], stack:'gas' })),
    ]
  }
  const chartOpts = {
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{display:false}, tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${fmtM(ctx.parsed.y)}`}} },
    scales:{ x:{stacked:true,grid:{display:false}}, y:{stacked:true,ticks:{callback:v=>fmtM(v)}} }
  }

  return (
    <div className="card" style={{marginBottom:14}}>
      <div className="ch"><div className="ct">{titulo}</div></div>
      {loading ? <div className="loading-screen" style={{height:120}}><div className="spinner"/></div> : (<>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:14,padding:'0 14px'}}>
          <div style={{padding:10,background:'#EAF3DE',borderRadius:'var(--r-sm)',borderLeft:'3px solid #1D9E75'}}>
            <div style={{fontSize:10,color:'#3B6D11',marginBottom:2}}>Ingresos</div>
            <div style={{fontSize:16,fontWeight:700,color:'#1D9E75'}}>{fmtM(totalIng)}</div>
          </div>
          <div style={{padding:10,background:'#FCEBEB',borderRadius:'var(--r-sm)',borderLeft:'3px solid #E24B4A'}}>
            <div style={{fontSize:10,color:'#A32D2D',marginBottom:2}}>Gastos</div>
            <div style={{fontSize:16,fontWeight:700,color:'#E24B4A'}}>{fmtM(totalGas)}</div>
          </div>
          <div style={{padding:10,background:utilNeta>=0?'#EAF3DE':'#FCEBEB',borderRadius:'var(--r-sm)',borderLeft:`3px solid ${utilNeta>=0?'#1D9E75':'#E24B4A'}`}}>
            <div style={{fontSize:10,color:'var(--text2)',marginBottom:2}}>Utilidad neta</div>
            <div style={{fontSize:16,fontWeight:700,color:utilNeta>=0?'#1D9E75':'#E24B4A'}}>{fmtM(utilNeta)}</div>
          </div>
          <div style={{padding:10,background:'#E6F1FB',borderRadius:'var(--r-sm)',borderLeft:'3px solid #378ADD'}}>
            <div style={{fontSize:10,color:'#185FA5',marginBottom:2}}>Margen</div>
            <div style={{fontSize:16,fontWeight:700,color:'#378ADD'}}>{margen.toFixed(1)}%</div>
          </div>
        </div>
        <div style={{padding:'0 14px',marginBottom:14}}><div style={{height:240}}><Bar data={chartData} options={chartOpts}/></div></div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,padding:'0 14px 14px'}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:'#1D9E75',marginBottom:6}}>💰 Ingresos por categoria</div>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              {ventasCat.map((v,i)=>{ const inc=!excluidasIng.includes(v.categoria); return (
                <label key={v.categoria} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',background:inc?'#EAF3DE':'var(--bg)',borderRadius:'var(--r-sm)',border:`1px solid ${inc?'#C0DD97':'var(--border-md)'}`,cursor:'pointer',opacity:inc?1:0.5}}>
                  <input type="checkbox" checked={inc} onChange={()=>toggleIng(v.categoria)} style={{cursor:'pointer'}}/>
                  <div style={{width:8,height:8,borderRadius:2,background:COLORS_INGRESO[i%COLORS_INGRESO.length]}}/>
                  <div style={{flex:1,fontSize:11}}>{v.categoria}</div>
                  <strong style={{fontSize:11,color:'#1D9E75'}}>{fmtM(v.monto)}</strong>
                </label>
              )})}
            </div>
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:'#E24B4A',marginBottom:6}}>💸 Gastos por categoria</div>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              {gastosCat.map((g,i)=>{ const inc=!excluidasGas.includes(g.categoria); return (
                <label key={g.categoria} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',background:inc?'#FCEBEB':'var(--bg)',borderRadius:'var(--r-sm)',border:`1px solid ${inc?'#F09595':'var(--border-md)'}`,cursor:'pointer',opacity:inc?1:0.5}}>
                  <input type="checkbox" checked={inc} onChange={()=>toggleGas(g.categoria)} style={{cursor:'pointer'}}/>
                  <div style={{width:8,height:8,borderRadius:2,background:COLORS_GASTO[i%COLORS_GASTO.length]}}/>
                  <div style={{flex:1,fontSize:11}}>{g.categoria}</div>
                  <strong style={{fontSize:11,color:'#E24B4A'}}>{fmtM(g.monto)}</strong>
                </label>
              )})}
            </div>
          </div>
        </div>
        <div style={{padding:'8px 14px',background:'#FFF9E6',borderTop:'1px solid #EF9F27',fontSize:10,color:'#8A5A00'}}>
          💡 Desactiva categorias para ver utilidad sin ellas.
        </div>
      </>)}
    </div>
  )
}
