import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import Login from './pages/Login.jsx'
import { sb } from './lib/supabase.js'
import './index.css'

function Root() {
  const [user,    setUser]    = useState(null)
  const [role,    setRole]    = useState(null)
  const [loading, setLoading] = useState(true)

  const [diasPermitidos,    setDiasPermitidos]    = useState(null)
  const [modulosPermitidos, setModulosPermitidos] = useState(null)

  const loadRole = async (u) => {
    const { data } = await sb.from('user_roles').select('role,nombre,dias_permitidos').eq('user_id', u.id).single()
    setUser(u)
    setRole(data?.role || 'viewer')
    setDiasPermitidos(data?.dias_permitidos || null)
    setModulosPermitidos(u.app_metadata?.modulos_permitidos || null)
    setLoading(false)
  }

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      if (data.session?.user) loadRole(data.session.user)
      else setLoading(false)
    })
    const { data: listener } = sb.auth.onAuthStateChange((_, session) => {
      if (session?.user) loadRole(session.user)
      else { setUser(null); setRole(null); setLoading(false) }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await sb.auth.signOut()
    setUser(null)
    setRole(null)
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:'sans-serif', color:'#666' }}>
      Cargando...
    </div>
  )

  if (!user || !role) return (
    <Login onLogin={(u) => loadRole(u)} />
  )

  return (
    <BrowserRouter basename="/ERP">
      <App role={role} user={user} onLogout={handleLogout} diasPermitidos={diasPermitidos} modulosPermitidos={modulosPermitidos} />
    </BrowserRouter>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />)
