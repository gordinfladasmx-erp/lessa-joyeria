import React, { useState, useEffect } from 'react'
import { sb } from '../lib/supabase.js'

const fmtM = v => '$' + Math.round(v).toLocaleString('es-MX')
const TIPO_CONFIG = {
  mesa:       { color:'#378ADD', label:'Mesa',        icono:'M' },
  llevar:     { color:'#EF9F27', label:'Para llevar', icono:'L' },
  plataforma: { color:'#7F77DD', label:'Plataforma',  icono:'P' },
}
const timeSince = (ts) => {
  const mins = Math.floor((Date.now() - new Date(ts)) / 60000)
  if (mins < 1) return 'recien abierta'
  if (mins < 60) return mins + ' min'
  return Math.floor(mins/60) + 'h ' + (mins%60) + 'min'
}
const timeColor = (ts) => {
  const mins = Math.floor((Date.now() - new Date(ts)) / 60000)
  if (mins < 15) return '#1D9E75'
  if (mins < 30) return '#EF9F27'
  return '#E24B4A'
}

async function fetchComandasHoy() {
  const hoy = new Date().toISOString().slice(0,10)
  const { data } = await sb.from('comandas').select('*').eq('fecha',hoy).eq('estado','abierta').order('created_at',{ascending:true})
  return data || []
}

export default function Cocina() {
  const [comandas, setComandas] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [tick,     setTick]     = useState(0)
  const [view,     setView]     = useState('grid')

  useEffect(() => {
    const interval = setInterval(()=>setTick(t=>t+1), 60000)
    return ()=>clearInterval(interval)
  }, [])

  useEffect(()=>{
    fetchComandasHoy().then(d=>{setComandas(d);setLoading(false)})
    let ch
    try {
      ch = sb.channel('cocina-live')
        .on('postgres_changes',{event:'*',schema:'public',table:'comandas'},()=>{
          fetchComandasHoy().then(setComandas)
        }).subscribe()
    } catch(e) {}
    return ()=>{ try { ch?.unsubscribe() } catch(e){} }
  },[])

  const marcarCobrada = async (id) => {
    await sb.from('comandas').update({estado:'cobrada',cobrada_at:new Date().toISOString()}).eq('id',id)
    setComandas(prev=>prev.filter(c=>c.id!==id))
  }

  if (loading) return <div className="loading-screen"><div className="spinner"/></div>

  const totalImporte = comandas.reduce((s,c)=>{
    const items = Array.isArray(c.items)?c.items:[]
    return s + items.reduce((ss,i)=>ss+i.subtotal,0)
  },0)

  return (
    <div>
      <div className="metrics" style={{marginBottom:14}}>
        <div className="mc"><div className="ml">Comandas abiertas</div><div className="mv">{comandas.length}</div></div>
        <div className="mc"><div className="ml">Mesas</div><div className="mv" style={{color:'#378ADD'}}>{comandas.filter(c=>c.tipo==='mesa').length}</div></div>
        <div className="mc"><div className="ml">Para llevar</div><div className="mv" style={{color:'#EF9F27'}}>{comandas.filter(c=>c.tipo==='llevar').length}</div></div>
        <div className="mc"><div className="ml">Plataformas</div><div className="mv" style={{color:'#7F77DD'}}>{comandas.filter(c=>c.tipo==='plataforma').length}</div></div>
      </div>

      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
        <div style={{display:'flex',gap:12}}>
          {Object.entries(TIPO_CONFIG).map(([k,v])=>(
            <span key={k} style={{display:'flex',alignItems:'center',gap:5,fontSize:12,color:'var(--text2)'}}>
              <span style={{width:10,height:10,borderRadius:2,background:v.color,display:'inline-block'}}/>
              {v.label}
            </span>
          ))}
          <span style={{display:'flex',alignItems:'center',gap:5,fontSize:12,color:'var(--text2)'}}>
            <span style={{width:10,height:10,borderRadius:2,background:'#E24B4A',display:'inline-block'}}/>
            +30 min
          </span>
        </div>
        <div style={{display:'flex',gap:6}}>
          <button onClick={()=>setView('grid')} className={`psw-btn${view==='grid'?' active':''}`}>Grid</button>
          <button onClick={()=>setView('lista')} className={`psw-btn${view==='lista'?' active':''}`}>Lista</button>
        </div>
      </div>

      {comandas.length===0 ? (
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:300,gap:12,color:'var(--text3)'}}>
          <div style={{fontSize:40}}>✓</div>
          <div style={{fontSize:14,fontWeight:500}}>Sin comandas abiertas</div>
          <div style={{fontSize:12}}>Las comandas apareceran aqui en tiempo real</div>
        </div>
      ) : view==='grid' ? (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:12}}>
          {comandas.map(c=>{
            const cfg   = TIPO_CONFIG[c.tipo]||TIPO_CONFIG.mesa
            const items = Array.isArray(c.items)?c.items:[]
            const total = items.reduce((s,i)=>s+i.subtotal,0)
            return (
              <div key={c.id} style={{background:'var(--surface)',borderRadius:'var(--r-lg)',border:`2px solid ${cfg.color}`,overflow:'hidden'}}>
                <div style={{background:cfg.color,padding:'8px 12px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{background:'rgba(255,255,255,0.25)',borderRadius:'50%',width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:'#fff'}}>
                      {c.tipo==='mesa'?c.mesa:cfg.icono}
                    </span>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:'#fff'}}>{c.label}</div>
                      {c.cliente&&<div style={{fontSize:10,color:'rgba(255,255,255,0.8)'}}>{c.cliente}</div>}
                    </div>
                  </div>
                  <div style={{fontSize:11,color:'rgba(255,255,255,0.9)',background:'rgba(255,255,255,0.2)',borderRadius:99,padding:'2px 8px'}}>
                    {timeSince(c.created_at)}
                  </div>
                </div>
                <div style={{padding:'10px 12px',minHeight:80}}>
                  {items.length===0
                    ? <div style={{fontSize:11,color:'var(--text3)',textAlign:'center',padding:'8px 0'}}>Sin items</div>
                    : items.map((item,idx)=>(
                        <div key={idx} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'3px 0',borderBottom:idx<items.length-1?'0.5px solid var(--border)':'none'}}>
                          <div style={{flex:1}}>
                            <span style={{fontWeight:500}}>{item.qty>1?item.qty+'x ':''}{item.plato?.nombre}</span>
                            {item.desc&&<div style={{fontSize:10,color:'var(--text3)',lineHeight:1.3}}>{item.desc}</div>}
                          </div>
                          <span style={{color:'var(--text2)',marginLeft:8}}>{fmtM(item.subtotal)}</span>
                        </div>
                      ))
                  }
                </div>
                <div style={{padding:'8px 12px',borderTop:'0.5px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',background:'var(--bg)'}}>
                  <div style={{fontSize:14,fontWeight:700}}>{fmtM(total)}</div>
                  <button onClick={()=>marcarCobrada(c.id)}
                    style={{padding:'5px 12px',borderRadius:'var(--r-sm)',border:'none',background:'#1D9E75',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>
                    Cobrado
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card">
          <table className="tbl">
            <thead><tr><th>Comanda</th><th>Cliente</th><th>Items</th><th>Canal</th><th className="num">Total</th><th>Tiempo</th><th>Accion</th></tr></thead>
            <tbody>
              {comandas.map(c=>{
                const cfg=TIPO_CONFIG[c.tipo]||TIPO_CONFIG.mesa
                const items=Array.isArray(c.items)?c.items:[]
                const total=items.reduce((s,i)=>s+i.subtotal,0)
                return (
                  <tr key={c.id}>
                    <td><span style={{fontWeight:600,color:cfg.color}}>{c.label}</span></td>
                    <td style={{color:'var(--text2)'}}>{c.cliente||'—'}</td>
                    <td style={{color:'var(--text2)'}}>{items.length}</td>
                    <td>{c.canal}</td>
                    <td className="num" style={{fontWeight:600}}>{fmtM(total)}</td>
                    <td style={{color:timeColor(c.created_at),fontWeight:500}}>{timeSince(c.created_at)}</td>
                    <td><button onClick={()=>marcarCobrada(c.id)}
                      style={{padding:'4px 10px',borderRadius:'var(--r-sm)',border:'none',background:'#1D9E75',color:'#fff',cursor:'pointer',fontSize:11,fontWeight:600}}>
                      Cobrado</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {comandas.length>0 && (
        <div style={{marginTop:14,padding:'10px 16px',background:'var(--surface)',borderRadius:'var(--r-md)',border:'0.5px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:12,color:'var(--text2)'}}>Total en comandas abiertas</span>
          <span style={{fontSize:18,fontWeight:700}}>{fmtM(totalImporte)}</span>
        </div>
      )}
    </div>
  )
}
