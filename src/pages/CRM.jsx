import React, { useState, useEffect, useCallback } from 'react'
import { sb } from '../lib/supabase.js'

const fmtM = v => '$'+Math.round(v||0).toLocaleString('es-MX')
const fmtD = d => d ? new Date(d+'T12:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'short',year:'numeric'}) : '—'
const WA_NUM_NEG = '524494935377'

const COLORES_CAT = {
  'Los Chilakiles':'#E24B4A','Huevos y Crokantes':'#D85A30','Los Dorados':'#EF9F27',
  'Del Comal':'#BA7517','Enfrijoladas':'#7F77DD','Bebidas Frías':'#378ADD',
  'Bebidas Calientes':'#1D6B50','Postres':'#D4537E'
}

export default function CRM({ role }) {
  const [clientes,    setClientes]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [buscar,      setBuscar]      = useState('')
  const [selCliente,  setSelCliente]  = useState(null)
  const [pedidos,     setPedidos]     = useState([])
  const [loadPedidos, setLoadPedidos] = useState(false)
  const [tab,         setTab]         = useState('lista')
  const [msg,         setMsg]         = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await sb.from('clientes')
      .select('*')
      .order('total_gastado', { ascending: false })
      .limit(500)
    setClientes(data||[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const verCliente = async (c) => {
    setSelCliente(c)
    setTab('detalle')
    setLoadPedidos(true)
    const { data } = await sb.from('clientes_pedidos')
      .select('*')
      .eq('cliente_id', c.id)
      .order('created_at', { ascending: false })
    setPedidos(data||[])
    setLoadPedidos(false)
  }

  const filtrados = clientes.filter(c =>
    !buscar || c.nombre?.toLowerCase().includes(buscar.toLowerCase()) ||
    c.telefono?.includes(buscar)
  )

  const topCat = (cats) => {
    if (!cats) return null
    const sorted = Object.entries(cats).sort((a,b)=>b[1]-a[1])
    return sorted[0]?.[0]
  }

  const enviarPromo = (cliente, texto) => {
    const tel = (cliente.telefono||'').replace(/[^0-9]/g,'')
    const num = tel.startsWith('52') ? tel : '52'+tel
    window.open('https://api.whatsapp.com/send?phone='+num+'&text='+encodeURIComponent(texto), '_blank')
  }

  return (
    <div>
      {msg && <div style={{padding:'8px 14px',borderRadius:'var(--r-md)',marginBottom:10,
        background:msg.ok?'#EAF3DE':'#FCEBEB',color:msg.ok?'#3B6D11':'#A32D2D',fontSize:12}}>{msg.text}</div>}

      {/* TABS */}
      <div style={{display:'flex',gap:6,marginBottom:14}}>
        {[{id:'lista',label:'👥 Clientes'},{id:'detalle',label:'👤 Perfil',disabled:!selCliente}].map(t=>(
          <button key={t.id} onClick={()=>!t.disabled&&setTab(t.id)} disabled={t.disabled}
            style={{padding:'6px 16px',borderRadius:'var(--r-md)',fontSize:12,fontWeight:500,cursor:t.disabled?'default':'pointer',
              border:`1.5px solid ${tab===t.id?'var(--accent)':'var(--border-md)'}`,
              background:tab===t.id?'var(--accent)22':'transparent',
              color:tab===t.id?'var(--accent)':t.disabled?'var(--text3)':'var(--text2)'}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* LISTA DE CLIENTES */}
      {tab==='lista' && (
        <>
          {/* KPIs */}
          <div className="metrics" style={{gridTemplateColumns:'repeat(4,minmax(0,1fr))',marginBottom:12}}>
            <div className="mc"><div className="mc-label">Total clientes</div><div className="mc-value">{clientes.length}</div></div>
            <div className="mc"><div className="mc-label">Con teléfono</div><div className="mc-value">{clientes.filter(c=>c.telefono).length}</div></div>
            <div className="mc"><div className="mc-label">Recurrentes</div><div className="mc-value">{clientes.filter(c=>c.total_pedidos>1).length}</div></div>
            <div className="mc"><div className="mc-label">Total gastado</div><div className="mc-value" style={{fontSize:13}}>{fmtM(clientes.reduce((s,c)=>s+(c.total_gastado||0),0))}</div></div>
          </div>

          {/* BUSCADOR */}
          <div style={{display:'flex',gap:8,marginBottom:12}}>
            <input className="form-input" style={{flex:1}} placeholder="Buscar por nombre o teléfono..."
              value={buscar} onChange={e=>setBuscar(e.target.value)}/>
          </div>

          {loading ? <div className="loading-screen" style={{height:200}}><div className="spinner"/></div>
          : <div className="card">
              <div style={{overflowX:'auto',maxHeight:520,overflowY:'auto'}}>
                <table className="tbl">
                  <thead style={{position:'sticky',top:0,background:'var(--surface)'}}>
                    <tr>
                      <th>Cliente</th>
                      <th>Teléfono</th>
                      <th className="num">Pedidos</th>
                      <th className="num">Total gastado</th>
                      <th>Categoría favorita</th>
                      <th>Última visita</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map(c => (
                      <tr key={c.id} style={{cursor:'pointer'}} onClick={()=>verCliente(c)}>
                        <td style={{fontWeight:600,fontSize:12}}>{c.nombre}</td>
                        <td style={{fontSize:11,color:'var(--text2)'}}>{c.telefono||'—'}</td>
                        <td className="num">
                          <span style={{padding:'1px 8px',borderRadius:99,fontSize:11,fontWeight:700,
                            background:c.total_pedidos>3?'#EAF3DE':c.total_pedidos>1?'#FFF9E6':'#f5f5f5',
                            color:c.total_pedidos>3?'#3B6D11':c.total_pedidos>1?'#8A5A00':'#888'}}>
                            {c.total_pedidos||0}
                          </span>
                        </td>
                        <td className="num" style={{fontWeight:600}}>{fmtM(c.total_gastado)}</td>
                        <td>
                          {topCat(c.categorias_favoritas) && (
                            <span style={{fontSize:10,padding:'1px 7px',borderRadius:99,
                              background:(COLORES_CAT[topCat(c.categorias_favoritas)]||'#888')+'22',
                              color:COLORES_CAT[topCat(c.categorias_favoritas)]||'#888'}}>
                              {topCat(c.categorias_favoritas)}
                            </span>
                          )}
                        </td>
                        <td style={{fontSize:11,color:'var(--text2)'}}>{fmtD(c.ultima_visita)}</td>
                        <td onClick={e=>e.stopPropagation()}>
                          {c.telefono && (
                            <button onClick={()=>enviarPromo(c,'Hola '+c.nombre.split(' ')[0]+'! 👋 Tenemos algo especial para ti hoy en Chilakileando. Ven a visitarnos 💛')}
                              style={{padding:'2px 8px',borderRadius:'var(--r-sm)',border:'1.5px solid #25D366',background:'transparent',color:'#25D366',cursor:'pointer',fontSize:10,fontWeight:600}}>
                              WA
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          }
        </>
      )}

      {/* PERFIL DE CLIENTE */}
      {tab==='detalle' && selCliente && (
        <div>
          <button onClick={()=>setTab('lista')} style={{fontSize:11,color:'var(--text2)',background:'none',border:'none',cursor:'pointer',marginBottom:12}}>
            ← Volver a lista
          </button>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
            {/* Info */}
            <div className="card">
              <div className="ch"><div className="ct">{selCliente.nombre}</div></div>
              <div style={{fontSize:12,color:'var(--text2)',lineHeight:2}}>
                <div>📱 {selCliente.telefono||'Sin teléfono'}</div>
                <div>📅 Primera visita: {fmtD(selCliente.primera_visita)}</div>
                <div>🕐 Última visita: {fmtD(selCliente.ultima_visita)}</div>
                <div>🛒 Total pedidos: <strong>{selCliente.total_pedidos||0}</strong></div>
                <div>💰 Total gastado: <strong style={{color:'#1D9E75'}}>{fmtM(selCliente.total_gastado)}</strong></div>
                <div>🏷 Fuente: {selCliente.fuente||'—'}</div>
              </div>
              {selCliente.notas && (
                <div style={{marginTop:10,padding:'8px 10px',background:'#FFF9E6',borderRadius:'var(--r-sm)',fontSize:11,color:'#8A5A00'}}>
                  📝 {selCliente.notas}
                </div>
              )}
            </div>

            {/* Categorías favoritas */}
            <div className="card">
              <div className="ch"><div className="ct">Preferencias</div></div>
              {selCliente.categorias_favoritas && Object.keys(selCliente.categorias_favoritas).length>0 ? (
                Object.entries(selCliente.categorias_favoritas)
                  .sort((a,b)=>b[1]-a[1])
                  .map(([cat, count]) => {
                    const max = Math.max(...Object.values(selCliente.categorias_favoritas))
                    const color = COLORES_CAT[cat]||'#888'
                    return (
                      <div key={cat} style={{marginBottom:8}}>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:3}}>
                          <span style={{fontWeight:500}}>{cat}</span>
                          <span style={{color:'var(--text2)'}}>{count} veces</span>
                        </div>
                        <div style={{height:6,background:'var(--border)',borderRadius:99,overflow:'hidden'}}>
                          <div style={{height:'100%',width:Math.round(count/max*100)+'%',background:color,borderRadius:99}}/>
                        </div>
                      </div>
                    )
                  })
              ) : <div style={{fontSize:11,color:'var(--text3)'}}>Sin datos de preferencias</div>}

              {/* Botones WhatsApp */}
              {selCliente.telefono && (
                <div style={{marginTop:14,borderTop:'0.5px solid var(--border)',paddingTop:10}}>
                  <div style={{fontSize:11,fontWeight:600,marginBottom:8}}>Enviar mensaje</div>
                  {[
                    {label:'Promo general', msg:`Hola ${selCliente.nombre.split(' ')[0]}! 👋 Tenemos algo especial para ti en Chilakileando. ¡Ven a visitarnos! 💛`},
                    {label:'Invitar a encuesta', msg:`Hola ${selCliente.nombre.split(' ')[0]}! Tu opinión nos importa 🙏 Llena nuestra encuesta y gana un premio: https://chilakileando.netlify.app/encuesta`},
                    {label:'Cumpleaños / Ocasión especial', msg:`Hola ${selCliente.nombre.split(' ')[0]}! 🎉 En Chilakileando queremos celebrar contigo. ¡Visítanos y recibe una sorpresa especial! 💛`},
                  ].map(btn=>(
                    <button key={btn.label} onClick={()=>enviarPromo(selCliente, btn.msg)}
                      style={{width:'100%',padding:'7px 10px',borderRadius:'var(--r-sm)',border:'1.5px solid #25D366',background:'transparent',color:'#25D366',cursor:'pointer',fontSize:11,fontWeight:600,marginBottom:6,textAlign:'left'}}>
                      📲 {btn.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Historial de pedidos */}
          <div className="card">
            <div className="ch"><div className="ct">Historial de pedidos</div><span style={{fontSize:11,color:'var(--text3)'}}>{pedidos.length} pedidos</span></div>
            {loadPedidos ? <div className="loading-screen" style={{height:100}}><div className="spinner"/></div>
            : pedidos.length===0 ? <div style={{fontSize:11,color:'var(--text3)',padding:'20px 0',textAlign:'center'}}>Sin pedidos registrados</div>
            : <div style={{overflowX:'auto'}}>
                <table className="tbl">
                  <thead><tr><th>Fecha</th><th>Modo</th><th className="num">Total</th><th>Estado</th><th>Productos</th></tr></thead>
                  <tbody>
                    {pedidos.map(p=>(
                      <tr key={p.id}>
                        <td style={{fontSize:11}}>{fmtD(p.fecha)}</td>
                        <td><span style={{fontSize:10,padding:'1px 6px',borderRadius:99,background:'#f0f0f0',color:'#666'}}>{p.modo||'—'}</span></td>
                        <td className="num" style={{fontWeight:600}}>{fmtM(p.total)}</td>
                        <td><span style={{fontSize:10,padding:'1px 6px',borderRadius:99,background:'#EAF3DE',color:'#3B6D11'}}>{p.estado}</span></td>
                        <td style={{fontSize:11,color:'var(--text2)',maxWidth:200}}>
                          {p.items ? p.items.slice(0,3).map(i=>i.plato?.nombre||i.nombre).filter(Boolean).join(', ') : '—'}
                          {p.items && p.items.length>3?' ...':''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }
          </div>
        </div>
      )}
    </div>
  )
}
