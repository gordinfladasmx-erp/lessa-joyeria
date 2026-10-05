import React, { useState } from 'react'
import { sb } from '../lib/supabase.js'

export default function Login({ onLogin }) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  const handleLogin = async () => {
    if (!email || !password) return
    setLoading(true)
    setError(null)
    const { data, error } = await sb.auth.signInWithPassword({ email, password })
    if (error) { setError('Email o contrasena incorrectos'); setLoading(false); return }
    onLogin(data.user)
  }

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--bg)' }}>
      <div style={{ background:'var(--surface)', border:'0.5px solid var(--border-md)', borderRadius:'var(--r-lg)', padding:'40px 36px', width:360 }}>
        <div style={{ marginBottom:28 }}>
          <div style={{ fontSize:22, fontWeight:600, color:'var(--text)' }}>Chilakileando</div>
          <div style={{ fontSize:13, color:'var(--text2)', marginTop:4 }}>ERP - Iniciar sesion</div>
        </div>
        {error && (
          <div style={{ background:'#FCEBEB', color:'#A32D2D', padding:'8px 12px', borderRadius:'6px', marginBottom:16, fontSize:12 }}>
            {error}
          </div>
        )}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:500, color:'var(--text2)', marginBottom:4 }}>Email</div>
          <input className="form-input" type="email" placeholder="usuario@chilakileando.com"
            value={email} onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={{ width:'100%' }} />
        </div>
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:11, fontWeight:500, color:'var(--text2)', marginBottom:4 }}>Contrasena</div>
          <input className="form-input" type="password" placeholder="••••••••"
            value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={{ width:'100%' }} />
        </div>
        <button className="btn btn-primary" style={{ width:'100%', padding:10, fontSize:13 }}
          onClick={handleLogin} disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </div>
    </div>
  )
}
