import React, { useState, useRef, useEffect } from 'react'
import { sb } from '../lib/supabase.js'

const SUGERENCIAS = [
  '¿Cuánto vendimos hoy?',
  '¿Cuánto vendimos hace una semana?',
  '¿Cuántas aguas de jamaica hay en stock?',
]

export default function AsistenteChat() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [msgs, setMsgs] = useState([]) // { role:'user'|'bot', text }
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [msgs, loading])

  const enviar = async (texto) => {
    const pregunta = (texto ?? input).trim()
    if (!pregunta || loading) return
    setInput('')
    setMsgs(m => [...m, { role: 'user', text: pregunta }])
    setLoading(true)
    try {
      const { data: { session } } = await sb.auth.getSession()
      const res = await fetch('/.netlify/functions/asistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ pregunta }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error del asistente')
      setMsgs(m => [...m, { role: 'bot', text: data.respuesta }])
    } catch (e) {
      setMsgs(m => [...m, { role: 'bot', text: '⚠️ ' + e.message, error: true }])
    }
    setLoading(false)
  }

  return (
    <div style={{ position: 'fixed', bottom: 18, left: 18, zIndex: 90, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
      {open && (
        <div style={{
          width: 340, maxWidth: 'calc(100vw - 36px)', height: 440, maxHeight: '70vh',
          background: 'var(--surface)', border: '1.5px solid var(--border-md)', borderRadius: 'var(--r-lg)',
          boxShadow: '0 6px 24px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 13, fontWeight: 700, display:'flex', alignItems:'center', gap:6 }}>
              <img src="/logo.png" alt="" style={{ width:18, height:18, borderRadius:'50%', objectFit:'cover' }} />
              Asistente de datos
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text3)', padding: 4 }}>✕</button>
          </div>

          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {msgs.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                Pregúntame sobre ventas, gastos o stock de insumos. Ejemplos:
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {SUGERENCIAS.map(s => (
                    <button key={s} onClick={() => enviar(s)}
                      style={{ textAlign: 'left', padding: '6px 10px', borderRadius: 'var(--r-md)', border: '1px solid var(--border-md)', background: 'var(--bg)', color: 'var(--text2)', fontSize: 12, cursor: 'pointer' }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%', padding: '7px 11px', borderRadius: 'var(--r-md)', fontSize: 12.5, lineHeight: 1.4,
                whiteSpace: 'pre-wrap',
                background: m.role === 'user' ? '#378ADD' : (m.error ? '#FCEBEB' : 'var(--bg)'),
                color: m.role === 'user' ? '#fff' : (m.error ? '#A32D2D' : 'var(--text1)'),
                border: m.role === 'bot' && !m.error ? '0.5px solid var(--border-md)' : 'none',
              }}>
                {m.text}
              </div>
            ))}
            {loading && (
              <div style={{ alignSelf: 'flex-start', padding: '7px 11px', fontSize: 12, color: 'var(--text3)' }}>
                Consultando…
              </div>
            )}
          </div>

          <div style={{ padding: 10, borderTop: '0.5px solid var(--border)', display: 'flex', gap: 6 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && enviar()}
              placeholder="Escribe tu pregunta..."
              disabled={loading}
              style={{ flex: 1, padding: '8px 10px', borderRadius: 'var(--r-md)', border: '1px solid var(--border-md)', fontSize: 12.5, background: 'var(--surface)', color: 'var(--text1)' }}
            />
            <button onClick={() => enviar()} disabled={loading || !input.trim()}
              style={{ padding: '8px 12px', borderRadius: 'var(--r-md)', border: 'none', background: '#378ADD', color: '#fff', fontSize: 13, fontWeight: 600, cursor: loading ? 'default' : 'pointer', opacity: loading || !input.trim() ? 0.6 : 1 }}>
              ➤
            </button>
          </div>
        </div>
      )}

      <button onClick={() => setOpen(o => !o)} title="Asistente de datos"
        style={{
          width: 52, height: 52, borderRadius: '50%', border: 'none', background: open ? '#378ADD' : '#fff', color: '#fff',
          fontSize: 22, cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: open ? 0 : 4, overflow: 'hidden',
        }}>
        {open ? '✕' : <img src="/logo.png" alt="Asistente" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />}
      </button>
    </div>
  )
}
