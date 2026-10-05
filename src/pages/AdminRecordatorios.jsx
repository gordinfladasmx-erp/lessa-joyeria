import React, { useState, useEffect } from 'react'
import { sb } from '../lib/supabase.js'

const RECURRENCIAS = [
  { id:'', label:'No se repite' },
  { id:'diaria', label:'Cada día' },
  { id:'semanal', label:'Cada semana' },
  { id:'mensual', label:'Cada mes' },
]

export default function AdminRecordatorios({ user }) {
  const [tab, setTab] = useState('lista')
  const [recordatorios, setRecordatorios] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)

  // Form para crear nuevo
  const [form, setForm] = useState({
    texto: '',
    fecha: new Date().toISOString().slice(0,10),
    hora: '09:00',
    recurrencia: ''
  })

  const cargar = async () => {
    setLoading(true)
    const { data } = await sb.from('recordatorios')
      .select('*')
      .order('fecha_hora', { ascending: true })
    setRecordatorios(data || [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  const crear = async () => {
    if (!form.texto.trim()) { setMsg({ ok:false, text:'Escribe el texto del recordatorio' }); return }
    if (!form.fecha || !form.hora) { setMsg({ ok:false, text:'Selecciona fecha y hora' }); return }

    const fecha_hora = new Date(`${form.fecha}T${form.hora}:00`).toISOString()

    const { error } = await sb.from('recordatorios').insert({
      texto: form.texto.trim(),
      fecha_hora,
      recurrencia: form.recurrencia || null,
      created_by: user?.id
    })

    if (error) {
      setMsg({ ok:false, text:'Error: '+error.message })
    } else {
      setMsg({ ok:true, text:'Recordatorio creado' })
      setForm({ texto:'', fecha:new Date().toISOString().slice(0,10), hora:'09:00', recurrencia:'' })
      setTab('lista')
      cargar()
    }
    setTimeout(()=>setMsg(null), 3000)
  }

  const eliminar = async (id, texto) => {
    if (!confirm(`¿Eliminar el recordatorio "${texto}"?`)) return
    const { error } = await sb.from('recordatorios').delete().eq('id', id)
    if (error) {
      setMsg({ ok:false, text:'Error: '+error.message })
    } else {
      setMsg({ ok:true, text:'Eliminado' })
      cargar()
    }
    setTimeout(()=>setMsg(null), 2000)
  }

  const marcarRealizada = async (rec) => {
    await sb.from('recordatorios').update({
      completado: true,
      completado_at: new Date().toISOString(),
      completado_por: user?.id
    }).eq('id', rec.id)

    if (rec.recurrencia) {
      const next = new Date(rec.fecha_hora)
      if (rec.recurrencia === 'diaria') next.setDate(next.getDate() + 1)
      else if (rec.recurrencia === 'semanal') next.setDate(next.getDate() + 7)
      else if (rec.recurrencia === 'mensual') next.setMonth(next.getMonth() + 1)
      await sb.from('recordatorios').insert({
        texto: rec.texto,
        fecha_hora: next.toISOString(),
        recurrencia: rec.recurrencia,
        created_by: user?.id
      })
    }
    cargar()
  }

  const fmt = (iso) => new Date(iso).toLocaleString('es-MX', { 
    weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' 
  })

  const ahora = new Date()
  const pendientes = recordatorios.filter(r => !r.completado)
  const completados = recordatorios.filter(r => r.completado)
  const activosCnt = pendientes.filter(r => new Date(r.fecha_hora) <= ahora).length

  return (
    <div>
      {msg && <div style={{padding:'8px 14px',borderRadius:'var(--r-md)',marginBottom:12,
        background:msg.ok?'#EAF3DE':'#FCEBEB',color:msg.ok?'#3B6D11':'#A32D2D',fontSize:12}}>{msg.text}</div>}

      <div style={{display:'flex',gap:6,marginBottom:14}}>
        <button onClick={()=>setTab('lista')}
          style={{padding:'6px 14px',borderRadius:'var(--r-sm)',
            border:`1.5px solid ${tab==='lista'?'#1D9E75':'var(--border-md)'}`,
            background:tab==='lista'?'#1D9E75':'transparent',
            color:tab==='lista'?'#fff':'var(--text2)',cursor:'pointer',fontSize:12,fontWeight:tab==='lista'?600:400}}>
          Pendientes ({pendientes.length})
        </button>
        <button onClick={()=>setTab('nuevo')}
          style={{padding:'6px 14px',borderRadius:'var(--r-sm)',
            border:`1.5px solid ${tab==='nuevo'?'#1D9E75':'var(--border-md)'}`,
            background:tab==='nuevo'?'#1D9E75':'transparent',
            color:tab==='nuevo'?'#fff':'var(--text2)',cursor:'pointer',fontSize:12,fontWeight:tab==='nuevo'?600:400}}>
          + Nuevo recordatorio
        </button>
        <button onClick={()=>setTab('completados')}
          style={{padding:'6px 14px',borderRadius:'var(--r-sm)',
            border:`1.5px solid ${tab==='completados'?'#1D9E75':'var(--border-md)'}`,
            background:tab==='completados'?'#1D9E75':'transparent',
            color:tab==='completados'?'#fff':'var(--text2)',cursor:'pointer',fontSize:12,fontWeight:tab==='completados'?600:400}}>
          Realizados ({completados.length})
        </button>
      </div>

      {tab==='nuevo' && (
        <div className="card">
          <div className="ch"><div className="ct">Crear recordatorio</div></div>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div>
              <label style={{fontSize:11,color:'var(--text2)',display:'block',marginBottom:4}}>Texto del recordatorio</label>
              <textarea value={form.texto} onChange={e=>setForm(f=>({...f,texto:e.target.value}))}
                placeholder="Ej: Pagar luz, llamar al proveedor, revisar inventario..."
                style={{width:'100%',padding:8,borderRadius:'var(--r-sm)',border:'1px solid var(--border-md)',
                  fontSize:13,minHeight:60,fontFamily:'inherit',background:'var(--surface)',color:'var(--text1)'}}/>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <div>
                <label style={{fontSize:11,color:'var(--text2)',display:'block',marginBottom:4}}>Fecha</label>
                <input type="date" value={form.fecha} onChange={e=>setForm(f=>({...f,fecha:e.target.value}))}
                  style={{width:'100%',padding:8,borderRadius:'var(--r-sm)',border:'1px solid var(--border-md)',fontSize:13,background:'var(--surface)',color:'var(--text1)'}}/>
              </div>
              <div>
                <label style={{fontSize:11,color:'var(--text2)',display:'block',marginBottom:4}}>Hora</label>
                <input type="time" value={form.hora} onChange={e=>setForm(f=>({...f,hora:e.target.value}))}
                  style={{width:'100%',padding:8,borderRadius:'var(--r-sm)',border:'1px solid var(--border-md)',fontSize:13,background:'var(--surface)',color:'var(--text1)'}}/>
              </div>
            </div>

            <div>
              <label style={{fontSize:11,color:'var(--text2)',display:'block',marginBottom:4}}>Recurrencia</label>
              <select value={form.recurrencia} onChange={e=>setForm(f=>({...f,recurrencia:e.target.value}))}
                style={{width:'100%',padding:8,borderRadius:'var(--r-sm)',border:'1px solid var(--border-md)',fontSize:13,background:'var(--surface)',color:'var(--text1)'}}>
                {RECURRENCIAS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>

            <div style={{display:'flex',gap:8}}>
              <button onClick={crear}
                style={{flex:1,padding:10,borderRadius:'var(--r-md)',background:'var(--accent)',color:'#fff',border:'none',cursor:'pointer',fontSize:13,fontWeight:600}}>
                Crear recordatorio
              </button>
              <button onClick={()=>setTab('lista')}
                style={{padding:'10px 20px',borderRadius:'var(--r-md)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:13}}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {tab==='lista' && (
        <div className="card">
          <div className="ch">
            <div className="ct">Recordatorios pendientes</div>
            {activosCnt > 0 && <div style={{fontSize:11,color:'#E24B4A',fontWeight:600}}>⚠️ {activosCnt} vencidos</div>}
          </div>
          {loading ? <div className="loading-screen" style={{height:80}}><div className="spinner"/></div>
          : pendientes.length === 0 ? (
            <div style={{textAlign:'center',padding:30,color:'var(--text3)',fontSize:12}}>
              No hay recordatorios pendientes. Crea uno desde "+ Nuevo recordatorio"
            </div>
          ) : (
            <table className="tbl">
              <thead><tr><th>Texto</th><th>Fecha y hora</th><th>Repetir</th><th></th></tr></thead>
              <tbody>
                {pendientes.map(r => {
                  const vencido = new Date(r.fecha_hora) <= ahora
                  return (
                    <tr key={r.id} style={{background:vencido?'#FCEBEB':'transparent'}}>
                      <td style={{fontSize:12,fontWeight:vencido?600:400}}>{r.texto}</td>
                      <td style={{fontSize:11,color:vencido?'#A32D2D':'var(--text2)'}}>
                        {vencido && '⚠️ '}{fmt(r.fecha_hora)}
                      </td>
                      <td style={{fontSize:11}}>{r.recurrencia ? `🔁 ${r.recurrencia}` : '—'}</td>
                      <td>
                        <div style={{display:'flex',gap:4}}>
                          <button onClick={()=>marcarRealizada(r)}
                            style={{padding:'3px 10px',borderRadius:'var(--r-sm)',border:'1px solid #1D9E75',color:'#1D9E75',background:'transparent',cursor:'pointer',fontSize:10,fontWeight:600}}>
                            ✓ Realizado
                          </button>
                          <button onClick={()=>eliminar(r.id, r.texto)}
                            style={{padding:'3px 10px',borderRadius:'var(--r-sm)',border:'1px solid #E24B4A',color:'#E24B4A',background:'transparent',cursor:'pointer',fontSize:10}}>
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab==='completados' && (
        <div className="card">
          <div className="ch"><div className="ct">Realizados (últimos 50)</div></div>
          {completados.length === 0 ? (
            <div style={{textAlign:'center',padding:30,color:'var(--text3)',fontSize:12}}>
              Aún no hay recordatorios realizados
            </div>
          ) : (
            <table className="tbl">
              <thead><tr><th>Texto</th><th>Era para</th><th>Realizado</th><th></th></tr></thead>
              <tbody>
                {completados.slice(0, 50).map(r => (
                  <tr key={r.id}>
                    <td style={{fontSize:12,color:'var(--text2)'}}>{r.texto}</td>
                    <td style={{fontSize:11,color:'var(--text3)'}}>{fmt(r.fecha_hora)}</td>
                    <td style={{fontSize:11,color:'#1D9E75'}}>{r.completado_at ? fmt(r.completado_at) : '—'}</td>
                    <td>
                      <button onClick={()=>eliminar(r.id, r.texto)}
                        style={{padding:'3px 10px',borderRadius:'var(--r-sm)',border:'1px solid #E24B4A',color:'#E24B4A',background:'transparent',cursor:'pointer',fontSize:10}}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
