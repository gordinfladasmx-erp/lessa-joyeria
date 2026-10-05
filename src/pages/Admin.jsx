import React, { useState, useEffect, useRef, useCallback } from 'react'
import AdminReporte from './AdminReporte.jsx'
import AdminRecordatorios from './AdminRecordatorios.jsx'

import { sb } from '../lib/supabase.js'
import { fetchKpiPeriod, fetchKpiAcum } from '../lib/analytics.js'
import * as XLSX from 'xlsx'

const today = () => new Date().toISOString().slice(0,10)
const fmtD  = d => new Date(d+'T12:00:00').toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'})

const TABLAS = [
  { id:'ventas',             label:'Ventas',             desc:'Registros de ventas e ingresos',        color:'#378ADD' },
  { id:'gastos',             label:'Gastos',             desc:'Registros de gastos y egresos',         color:'#E24B4A' },
  { id:'comandas',           label:'Comandas',           desc:'Comandas del POS (abiertas y cobradas)', color:'#1D9E75' },
  { id:'cierres_dia',        label:'Cierres de dia',     desc:'Registros de cierre y cuadratura',      color:'#EF9F27' },
  { id:'inventario_maestro', label:'Almacén',            desc:'Movimientos de inventario unificado',   color:'#D85A30' },
  { id:'produccion',         label:'Produccion (legacy)',desc:'Registros de produccion (tabla vieja)', color:'#7F77DD' },
  { id:'inventario_diario',  label:'Inventario (legacy)',desc:'Inventario diario (tabla vieja)',        color:'#888780' },
]

export default function Admin({ user }) {
  const [seccion, setSeccion] = useState('limpieza')
  const [modo,    setModo]    = useState('fecha')   // fecha | rango
  const [fecha,   setFecha]   = useState(today())
  const [desde,   setDesde]   = useState(today())
  const [hasta,   setHasta]   = useState(today())
  const [tablas,  setTablas]  = useState({ventas:true,gastos:true,comandas:true,cierres_dia:false,produccion:false,inventario_diario:false})
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const [msg,     setMsg]     = useState(null)
  const [log,     setLog]     = useState([])

  const togTabla = t => setTablas(x=>({...x,[t]:!x[t]}))

  const seleccionadas = TABLAS.filter(t=>tablas[t.id])

  const previewDelete = async () => {
    setLoading(true)
    setPreview(null)
    try {
      const f1 = modo==='fecha' ? fecha : desde
      const f2 = modo==='fecha' ? fecha : hasta
      const counts = {}
      for (const t of seleccionadas) {
        const col = t.id === 'cierres_dia' ? 'fecha' : 'fecha'
        const { count } = await sb.from(t.id).select('*',{count:'exact',head:true}).gte(col,f1).lte(col,f2)
        counts[t.id] = count || 0
      }
      setPreview({ f1, f2, counts })
      setConfirm(false)
    } catch(e) { setMsg({ok:false,text:e.message}) }
    setLoading(false)
  }

  const ejecutarDelete = async () => {
    if (!preview) return
    setLoading(true)
    setConfirm(false)
    try {
      const deleted = {}
      for (const t of seleccionadas) {
        const { count } = await sb.from(t.id).select('*',{count:'exact',head:true}).gte('fecha',preview.f1).lte('fecha',preview.f2)
        await sb.from(t.id).delete().gte('fecha',preview.f1).lte('fecha',preview.f2)
        deleted[t.id] = count || 0
      }
      const entry = {
        ts: new Date().toLocaleTimeString('es-MX'),
        f1: preview.f1, f2: preview.f2,
        tablas: seleccionadas.map(t=>t.label).join(', '),
        counts: deleted,
      }
      setLog(l=>[entry,...l.slice(0,19)])
      setMsg({ok:true, text:`Eliminados correctamente. ${Object.values(deleted).reduce((s,v)=>s+v,0)} registros borrados.`})
      setPreview(null)
    } catch(e) { setMsg({ok:false,text:e.message}) }
    setLoading(false)
    setTimeout(()=>setMsg(null),5000)
  }

  return (
    <div>
      {/* TABS */}
      <div style={{display:'flex',gap:6,marginBottom:16}}>
        {[{id:'limpieza',label:'Limpieza de datos'},{id:'comisiones',label:'Comisiones'},{id:'recibos',label:'Recibos socios'},{id:'horarios',label:'Horarios'},{id:'usuarios',label:'Usuarios'},{id:'recordatorios',label:'Recordatorios'},{id:'reportes',label:'Reportes IA'},{id:'backup',label:'Backup'}].map(s=>(
          <button key={s.id} onClick={()=>setSeccion(s.id)}
            style={{padding:'6px 16px',borderRadius:'var(--r-md)',fontSize:12,fontWeight:500,cursor:'pointer',
              border:`1.5px solid ${seccion===s.id?'var(--accent)':'var(--border-md)'}`,
              background:seccion===s.id?'var(--accent)22':'transparent',
              color:seccion===s.id?'var(--accent)':'var(--text2)'}}>
            {s.label}
          </button>
        ))}
      </div>

      {seccion==='usuarios' && <AdminUsuarios/>}
      {seccion==='horarios' && <HorariosAdmin/>}
      {seccion==='backup'   && <AdminBackup/>}
      {seccion==='comisiones' && <AdminComisiones/>}
      {seccion==='recibos'  && <AdminRecibos/>}
      {seccion==='reportes' && <AdminReporte/>}
      {seccion==='recordatorios' && <AdminRecordatorios user={user}/>}


      {seccion==='limpieza' && <>
      <div style={{marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:600,color:'#E24B4A'}}>⚠ Limpieza de datos</div>
        <div style={{fontSize:11,color:'var(--text2)',marginTop:2}}>Solo visible para administradores. Las eliminaciones son permanentes e irreversibles.</div>
      </div>

      {msg && <div style={{padding:'9px 14px',borderRadius:'var(--r-md)',marginBottom:12,background:msg.ok?'#EAF3DE':'#FCEBEB',color:msg.ok?'#3B6D11':'#A32D2D',fontSize:12,fontWeight:500}}>{msg.text}</div>}

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        {/* PANEL DE LIMPIEZA */}
        <div className="card">
          <div className="ct" style={{marginBottom:14}}>Eliminar datos de prueba</div>

          {/* Modo */}
          <div style={{display:'flex',gap:6,marginBottom:14}}>
            {[{id:'fecha',label:'Fecha especifica'},{id:'rango',label:'Rango de fechas'}].map(m=>(
              <button key={m.id} onClick={()=>setModo(m.id)}
                style={{flex:1,padding:'7px 12px',borderRadius:'var(--r-sm)',fontSize:12,cursor:'pointer',fontWeight:500,
                  border:`1.5px solid ${modo===m.id?'var(--accent)':'var(--border-md)'}`,
                  background:modo===m.id?'var(--accent)22':'transparent',
                  color:modo===m.id?'var(--accent)':'var(--text2)'}}>
                {m.label}
              </button>
            ))}
          </div>

          {/* Fechas */}
          {modo==='fecha' ? (
            <div className="form-group" style={{marginBottom:14}}>
              <div className="form-label">Fecha a limpiar</div>
              <input className="form-input" type="date" value={fecha} onChange={e=>setFecha(e.target.value)}/>
            </div>
          ) : (
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
              <div className="form-group">
                <div className="form-label">Desde</div>
                <input className="form-input" type="date" value={desde} onChange={e=>setDesde(e.target.value)}/>
              </div>
              <div className="form-group">
                <div className="form-label">Hasta</div>
                <input className="form-input" type="date" value={hasta} onChange={e=>setHasta(e.target.value)}/>
              </div>
            </div>
          )}

          {/* Tablas */}
          <div style={{fontSize:11,fontWeight:600,color:'var(--text2)',marginBottom:8}}>Tablas a limpiar</div>
          <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14}}>
            {TABLAS.map(t=>(
              <div key={t.id} onClick={()=>togTabla(t.id)}
                style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:'var(--r-sm)',
                  border:`1px solid ${tablas[t.id]?t.color+'66':'var(--border)'}`,
                  background:tablas[t.id]?t.color+'11':'var(--bg)',cursor:'pointer'}}>
                <div style={{width:16,height:16,borderRadius:4,border:`2px solid ${tablas[t.id]?t.color:'var(--border-md)'}`,
                  background:tablas[t.id]?t.color:'transparent',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  {tablas[t.id]&&<span style={{color:'#fff',fontSize:10,lineHeight:1}}>✓</span>}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:500,color:tablas[t.id]?t.color:'var(--text)'}}>{t.label}</div>
                  <div style={{fontSize:10,color:'var(--text3)'}}>{t.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {seleccionadas.length===0 && <div style={{fontSize:11,color:'#E24B4A',marginBottom:10}}>Selecciona al menos una tabla.</div>}

          <button className="btn" style={{width:'100%',padding:9,marginBottom:8,background:'var(--accent)',color:'#fff',border:'none',borderRadius:'var(--r-sm)',cursor:'pointer',fontSize:13,fontWeight:600}}
            onClick={previewDelete} disabled={loading||seleccionadas.length===0}>
            {loading?'Consultando...':'Ver cuantos registros se eliminaran'}
          </button>

          {/* Preview */}
          {preview && (
            <div style={{background:'#FFF9E6',border:'1px solid #EF9F27',borderRadius:'var(--r-md)',padding:14,marginTop:4}}>
              <div style={{fontSize:12,fontWeight:600,color:'#8A5A00',marginBottom:8}}>
                Registros a eliminar {preview.f1===preview.f2?`el ${fmtD(preview.f1)}`:`del ${preview.f1} al ${preview.f2}`}:
              </div>
              <table style={{width:'100%',fontSize:12}}>
                <tbody>
                  {seleccionadas.map(t=>(
                    <tr key={t.id}>
                      <td style={{padding:'2px 0',color:'var(--text)'}}>{t.label}</td>
                      <td style={{textAlign:'right',fontWeight:600,color:preview.counts[t.id]>0?'#E24B4A':'var(--text3)'}}>{preview.counts[t.id]} registros</td>
                    </tr>
                  ))}
                  <tr style={{borderTop:'1px solid #EF9F2744'}}>
                    <td style={{padding:'6px 0',fontWeight:700}}>Total</td>
                    <td style={{textAlign:'right',fontWeight:700,color:'#E24B4A'}}>{Object.values(preview.counts).reduce((s,v)=>s+v,0)} registros</td>
                  </tr>
                </tbody>
              </table>

              {!confirm ? (
                <button onClick={()=>setConfirm(true)}
                  style={{width:'100%',marginTop:10,padding:9,borderRadius:'var(--r-sm)',border:'none',background:'#E24B4A',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600}}>
                  Eliminar permanentemente
                </button>
              ) : (
                <div>
                  <div style={{fontSize:11,color:'#A32D2D',margin:'8px 0',textAlign:'center',fontWeight:600}}>
                    ¿Estas seguro? Esta accion NO se puede deshacer.
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    <button onClick={()=>setConfirm(false)} style={{flex:1,padding:8,borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:12}}>Cancelar</button>
                    <button onClick={ejecutarDelete} disabled={loading}
                      style={{flex:2,padding:8,borderRadius:'var(--r-sm)',border:'none',background:'#A32D2D',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:700}}>
                      {loading?'Eliminando...':'SI, ELIMINAR TODO'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* LOG */}
        <div className="card">
          <div className="ct" style={{marginBottom:14}}>Registro de eliminaciones</div>
          {log.length===0
            ? <div style={{color:'var(--text3)',fontSize:12,textAlign:'center',padding:'30px 0'}}>Sin eliminaciones en esta sesion</div>
            : log.map((e,i)=>(
                <div key={i} style={{padding:'10px 0',borderBottom:'0.5px solid var(--border)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:4}}>
                    <span style={{fontWeight:600,color:'#E24B4A'}}>Eliminacion</span>
                    <span style={{color:'var(--text3)'}}>{e.ts}</span>
                  </div>
                  <div style={{fontSize:11,color:'var(--text2)',marginBottom:3}}>
                    Fechas: {e.f1}{e.f1!==e.f2?' al '+e.f2:''}
                  </div>
                  <div style={{fontSize:11,color:'var(--text2)',marginBottom:3}}>Tablas: {e.tablas}</div>
                  <div style={{fontSize:11,fontWeight:600,color:'#E24B4A'}}>
                    {Object.values(e.counts).reduce((s,v)=>s+v,0)} registros eliminados
                  </div>
                </div>
              ))
          }

          {/* Info util */}
          <div style={{marginTop:16,padding:12,background:'var(--bg)',borderRadius:'var(--r-md)'}}>
            <div style={{fontSize:11,fontWeight:600,color:'var(--text2)',marginBottom:8}}>Atajos rapidos</div>
            {[
              { label:'Limpiar hoy (ventas+gastos+comandas)', onClick:()=>{setModo('fecha');setFecha(today());setTablas({ventas:true,gastos:true,comandas:true,cierres_dia:false,produccion:false,inventario_diario:false})} },
              { label:'Limpiar hoy (produccion+inventario)', onClick:()=>{setModo('fecha');setFecha(today());setTablas({ventas:false,gastos:false,comandas:false,cierres_dia:false,produccion:true,inventario_diario:true})} },
              { label:'Limpiar todo hoy', onClick:()=>{setModo('fecha');setFecha(today());setTablas({ventas:true,gastos:true,comandas:true,cierres_dia:true,produccion:true,inventario_diario:true})} },
              { label:'Limpiar ayer', onClick:()=>{const d=new Date();d.setDate(d.getDate()-1);setModo('fecha');setFecha(d.toISOString().slice(0,10));setTablas({ventas:true,gastos:true,comandas:true,cierres_dia:false,produccion:false,inventario_diario:false})} },
            ].map(a=>(
              <button key={a.label} onClick={a.onClick}
                style={{display:'block',width:'100%',marginBottom:6,padding:'6px 10px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:11,textAlign:'left',color:'var(--text2)'}}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      </>}
    </div>
  )
}

// ── MÓDULO DE USUARIOS ────────────────────────────────────────
const ADMIN_FN = '/.netlify/functions/admin-users'
const ROLES = ['admin','mesero','viewer']
const ROLE_LABEL = { admin:'Administrador', mesero:'Mesero', viewer:'Solo lectura' }

const MODULOS = [
  { key:'resultados',   label:'Resultados' },
  { key:'comanda',      label:'Comanda POS' },
  { key:'kds',          label:'KDS Cocina' },
  { key:'gastos',       label:'Gastos' },
  { key:'cierre',       label:'Cierre del día' },
  { key:'conciliacion', label:'Conciliación' },
  { key:'rendimiento',  label:'Rendimiento' },
  { key:'tiempos',      label:'Tiempos cocina' },
  { key:'almacen',      label:'Almacén' },
  { key:'balance',      label:'Balance General' },
  { key:'crm',          label:'CRM Clientes' },
  { key:'nps',          label:'NPS y Encuestas' },
  { key:'ventas',       label:'Historial ventas' },
  { key:'productos',    label:'Precios' },
  { key:'admin',        label:'Administración' },
  { key:'exportar',     label:'Exportar datos' },
]

async function callAdminFn(body) {
  const { data: { session } } = await sb.auth.getSession()
  const token = session?.access_token
  const res = await fetch(ADMIN_FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  })
  return { res, data: await res.json() }
}

export function AdminUsuarios() {
  const [usuarios,     setUsuarios]     = useState([])
  const [loading,      setLoading]      = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [msg,          setMsg]          = useState(null)
  const [tab,          setTab]          = useState('lista')
  const [form,         setForm]         = useState({ email:'', password:'', rol:'mesero' })
  const [expandedUser, setExpandedUser] = useState(null)

  const loadUsuarios = async () => {
    setLoading(true)
    try {
      const { res, data } = await callAdminFn({ action: 'list' })
      if (!res.ok) throw new Error(data.error || 'Error al cargar usuarios')
      const users = data.users || []
      const { data: roles } = await sb.from('user_roles').select('user_id, role, dias_permitidos')
      const roleMap = {}
      const diasMap = {}
      ;(roles||[]).forEach(r => { roleMap[r.user_id] = r.role; diasMap[r.user_id] = r.dias_permitidos || [] })
      setUsuarios(users.map(u => ({
        ...u,
        role: roleMap[u.id] || 'mesero',
        dias_permitidos: diasMap[u.id] || [],
        modulos_permitidos: u.app_metadata?.modulos_permitidos || null,
      })))
    } catch(e) { setMsg({ ok:false, text:e.message }) }
    setLoading(false)
  }

  useEffect(()=>{ loadUsuarios() }, [])

  const crearUsuario = async () => {
    if (!form.email || !form.password) return setMsg({ ok:false, text:'Email y contraseña son obligatorios' })
    if (form.password.length < 6) return setMsg({ ok:false, text:'La contraseña debe tener al menos 6 caracteres' })
    setSaving(true)
    try {
      const { res, data: user } = await callAdminFn({
        action: 'create',
        userData: { email: form.email, password: form.password, email_confirm: true }
      })
      if (!res.ok) throw new Error(user.msg || user.message || user.error || 'Error al crear usuario')
      await sb.from('user_roles').insert({ user_id: user.id, role: form.rol, nombre: ROLE_LABEL[form.rol] })
      setMsg({ ok:true, text:`Usuario ${form.email} creado con rol ${ROLE_LABEL[form.rol]}` })
      setForm({ email:'', password:'', rol:'mesero' })
      setTab('lista')
      loadUsuarios()
    } catch(e) { setMsg({ ok:false, text:e.message }) }
    setSaving(false)
    setTimeout(()=>setMsg(null), 4000)
  }

  const cambiarRol = async (userId, nuevoRol) => {
    setUsuarios(prev => prev.map(u => u.id===userId ? {...u, role:nuevoRol} : u))
    const { error } = await sb.from('user_roles')
      .upsert({ user_id: userId, role: nuevoRol, nombre: ROLE_LABEL[nuevoRol] }, { onConflict: 'user_id' })
    if (error) {
      setMsg({ ok:false, text:'Error: '+error.message })
      loadUsuarios()
    } else {
      setMsg({ ok:true, text:'Rol actualizado' })
      setTimeout(()=>setMsg(null), 2000)
    }
  }

  const cambiarDias = async (userId, dia) => {
    const usuario = usuarios.find(u => u.id === userId)
    if (!usuario) return
    const diasActuales = usuario.dias_permitidos || []
    const nuevoDias = diasActuales.includes(dia)
      ? diasActuales.filter(d => d !== dia)
      : [...diasActuales, dia].sort((a,b)=>a-b)
    setUsuarios(prev => prev.map(u => u.id===userId ? {...u, dias_permitidos:nuevoDias} : u))
    const { error } = await sb.from('user_roles')
      .update({ dias_permitidos: nuevoDias.length>0 ? nuevoDias : null })
      .eq('user_id', userId)
    if (error) {
      setMsg({ ok:false, text:'Error: '+error.message })
      loadUsuarios()
    } else {
      setMsg({ ok:true, text:'Días actualizados' })
      setTimeout(()=>setMsg(null), 2000)
    }
  }

  const cambiarModulos = async (userId, modKey) => {
    const usuario = usuarios.find(u => u.id === userId)
    if (!usuario) return
    const actuales = usuario.modulos_permitidos || null
    const todos = MODULOS.map(m => m.key)
    const base = actuales || todos
    const nuevos = base.includes(modKey) ? base.filter(m => m !== modKey) : [...base, modKey]
    const final = nuevos.length === todos.length ? null : nuevos
    setUsuarios(prev => prev.map(u => u.id===userId ? {...u, modulos_permitidos:final} : u))
    const { res } = await callAdminFn({ action:'update_modulos', userId, userData:{ modulos_permitidos: final } })
    if (!res.ok) {
      setMsg({ ok:false, text:'Error al actualizar módulos' })
      loadUsuarios()
    } else {
      setMsg({ ok:true, text:'Acceso a módulos actualizado' })
      setTimeout(()=>setMsg(null), 2000)
    }
  }

  const cambiarPassword = async (userId, email) => {
    const nuevaPwd = prompt(`Nueva contraseña para ${email} (mínimo 6 caracteres):`)
    if (!nuevaPwd) return
    if (nuevaPwd.length < 6) { setMsg({ ok:false, text:'Contraseña debe tener al menos 6 caracteres' }); return }
    if (!confirm(`¿Cambiar contraseña de ${email}?\n\nNueva: ${nuevaPwd}\n\nGuárdala bien, no podrá recuperarse.`)) return
    try {
      const { res } = await callAdminFn({ action: 'update_password', userId, userData: { password: nuevaPwd } })
      if (res.ok) {
        setMsg({ ok:true, text:`Contraseña actualizada para ${email}` })
      } else {
        setMsg({ ok:false, text:'Error al actualizar contraseña' })
      }
    } catch(e) { setMsg({ ok:false, text:e.message }) }
    setTimeout(()=>setMsg(null), 5000)
  }

  const eliminarUsuario = async (userId, email) => {
    if (!confirm(`¿Eliminar usuario ${email}? Esta acción no se puede deshacer.`)) return
    const { res } = await callAdminFn({ action: 'delete', userId })
    if (res.ok) {
      await sb.from('user_roles').delete().eq('user_id', userId)
      loadUsuarios()
    }
  }

  const ROLE_COLOR = { admin:'#1D9E75', mesero:'#378ADD', viewer:'#888780', 'sin rol':'#E24B4A' }

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
        <div className="period-sw">
          <button className={`psw-btn${tab==='lista'?' active':''}`} onClick={()=>setTab('lista')}>Usuarios</button>
          <button className={`psw-btn${tab==='nuevo'?' active':''}`} onClick={()=>setTab('nuevo')}>+ Nuevo usuario</button>
        </div>
      </div>

      {msg && <div style={{padding:'9px 14px',borderRadius:'var(--r-md)',marginBottom:12,background:msg.ok?'#EAF3DE':'#FCEBEB',color:msg.ok?'#3B6D11':'#A32D2D',fontSize:12,fontWeight:500}}>{msg.text}</div>}

      {tab==='nuevo' && (
        <div className="card" style={{maxWidth:420}}>
          <div className="ch"><div className="ct">Crear nuevo usuario</div></div>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div>
              <label style={{fontSize:11,color:'var(--text2)',display:'block',marginBottom:4}}>Email</label>
              <input className="form-input" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="usuario@chilakileando.com" style={{width:'100%'}}/>
            </div>
            <div>
              <label style={{fontSize:11,color:'var(--text2)',display:'block',marginBottom:4}}>Contraseña (mínimo 6 caracteres)</label>
              <input className="form-input" type="password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder="••••••••" style={{width:'100%'}}/>
            </div>
            <div>
              <label style={{fontSize:11,color:'var(--text2)',display:'block',marginBottom:4}}>Rol</label>
              <select className="form-input" value={form.rol} onChange={e=>setForm(f=>({...f,rol:e.target.value}))} style={{width:'100%'}}>
                {ROLES.map(r=><option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
              <div style={{fontSize:10,color:'var(--text3)',marginTop:4}}>
                Admin: acceso total · Mesero: comanda y gastos · Solo lectura: dashboards y análisis
              </div>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={crearUsuario} disabled={saving} style={{flex:1,padding:9,borderRadius:'var(--r-md)',background:'var(--accent)',color:'#fff',border:'none',cursor:'pointer',fontSize:13,fontWeight:600}}>
                {saving?'Creando...':'Crear usuario'}
              </button>
              <button onClick={()=>setTab('lista')} style={{padding:'9px 16px',borderRadius:'var(--r-md)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:13}}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {tab==='lista' && (
        <div className="card">
          <div className="ch"><div className="ct">Usuarios del sistema</div>
            <div style={{fontSize:11,color:'var(--text2)'}}>{usuarios.length} usuarios</div>
          </div>
          {loading?<div className="loading-screen" style={{height:100}}><div className="spinner"/></div>
          :<table className="tbl">
            <thead><tr><th>Email</th><th>Rol</th><th>Días permitidos (mesero)</th><th>Módulos</th><th>Creado</th><th></th></tr></thead>
            <tbody>
              {usuarios.map(u=>{
                const modsActivos = u.modulos_permitidos || MODULOS.map(m=>m.key)
                const todosMods = modsActivos.length === MODULOS.length
                return (
                <React.Fragment key={u.id}>
                <tr>
                  <td style={{fontSize:12,fontWeight:500}}>{u.email}</td>
                  <td>
                    <select value={ROLES.includes(u.role)?u.role:'mesero'} onChange={e=>cambiarRol(u.id,e.target.value)}
                      style={{fontSize:11,padding:'2px 6px',borderRadius:'var(--r-sm)',border:`1px solid ${ROLE_COLOR[u.role]||'var(--border-md)'}`,background:'transparent',color:ROLE_COLOR[u.role]||'var(--text)',cursor:'pointer'}}>
                      {ROLES.map(r=><option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </td>
                  <td>
                    {u.role==='mesero' ? (
                      <div style={{display:'flex',gap:3}}>
                        {[
                          {n:1,l:'L'},{n:2,l:'M'},{n:3,l:'X'},{n:4,l:'J'},{n:5,l:'V'},{n:6,l:'S'},{n:0,l:'D'}
                        ].map(d => {
                          const activo = (u.dias_permitidos||[]).includes(d.n)
                          return (
                            <button key={d.n} onClick={()=>cambiarDias(u.id,d.n)} title={`Día ${d.n}`}
                              style={{width:24,height:24,borderRadius:'50%',border:'1px solid '+(activo?'#1D9E75':'var(--border-md)'),
                                background:activo?'#1D9E75':'transparent',color:activo?'#fff':'var(--text2)',
                                cursor:'pointer',fontSize:10,fontWeight:600,padding:0}}>
                              {d.l}
                            </button>
                          )
                        })}
                        <span style={{fontSize:9,color:'var(--text3)',marginLeft:6,alignSelf:'center'}}>
                          {(u.dias_permitidos||[]).length===0?'todos':''}
                        </span>
                      </div>
                    ) : <span style={{fontSize:10,color:'var(--text3)'}}>—</span>}
                  </td>
                  <td>
                    <button onClick={()=>setExpandedUser(expandedUser===u.id ? null : u.id)}
                      style={{fontSize:11,padding:'2px 8px',borderRadius:'var(--r-sm)',
                        border:`1px solid ${todosMods?'var(--border-md)':'#EF9F27'}`,
                        color:todosMods?'var(--text2)':'#EF9F27',background:'transparent',cursor:'pointer'}}>
                      {todosMods ? 'Todos' : `${modsActivos.length}/${MODULOS.length}`} {expandedUser===u.id?'▲':'▼'}
                    </button>
                  </td>
                  <td style={{fontSize:11,color:'var(--text3)'}}>{u.created_at?new Date(u.created_at).toLocaleDateString('es-MX'):'-'}</td>
                  <td>
                    <div style={{display:'flex',gap:4}}>
                      <button onClick={()=>cambiarPassword(u.id,u.email)}
                        style={{fontSize:11,padding:'2px 8px',borderRadius:'var(--r-sm)',border:'0.5px solid #EF9F27',color:'#EF9F27',background:'transparent',cursor:'pointer'}}>
                        🔑 Pwd
                      </button>
                      <button onClick={()=>eliminarUsuario(u.id,u.email)}
                        style={{fontSize:11,padding:'2px 8px',borderRadius:'var(--r-sm)',border:'0.5px solid #E24B4A',color:'#E24B4A',background:'transparent',cursor:'pointer'}}>
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedUser===u.id && (
                  <tr>
                    <td colSpan={6} style={{padding:'12px 16px',background:'var(--bg2)',borderTop:'1px solid var(--border-md)'}}>
                      <div style={{fontSize:11,color:'var(--text2)',marginBottom:8,fontWeight:600}}>
                        Módulos accesibles para {u.email}
                        <span style={{fontWeight:400,marginLeft:8,color:'var(--text3)'}}>
                          (sin paloma = sin acceso)
                        </span>
                      </div>
                      <div style={{display:'flex',flexWrap:'wrap',gap:'6px 18px'}}>
                        {MODULOS.map(m => {
                          const activo = modsActivos.includes(m.key)
                          return (
                            <label key={m.key} style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer',fontSize:12}}>
                              <input type="checkbox" checked={activo} onChange={()=>cambiarModulos(u.id,m.key)}
                                style={{cursor:'pointer',accentColor:'#1D9E75'}}/>
                              {m.label}
                            </label>
                          )
                        })}
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
                )
              })}
            </tbody>
          </table>}
        </div>
      )}
    </div>
  )
}

// ── RECIBOS DE SOCIOS ─────────────────────────────────────────
const fmtM  = v => '$' + Math.round(v).toLocaleString('es-MX')
const fmtMes= (ym) => { const [y,m] = ym.split('-'); return new Date(+y,+m-1,1).toLocaleDateString('es-MX',{month:'long',year:'numeric'}) }

const SOCIOS_DEFAULT = [
  { id:'Socio 1', nombre:'Guillermo Reyes A.', alias:'Memo',   color:'#378ADD', pct:60 },
  { id:'Socio 2', nombre:'Monica Valdez L.',   alias:'Monica', color:'#D4537E', pct:40 },
]
const COLORS_POOL = ['#378ADD','#D4537E','#1D9E75','#EF9F27','#7F77DD','#D85A30']

const loadSociosLS = () => {
  try { const s = JSON.parse(localStorage.getItem('erp_socios_cfg')); return s?.length ? s : SOCIOS_DEFAULT }
  catch { return SOCIOS_DEFAULT }
}

const extraerSocio = (concepto, socios) => {
  const c = (concepto||'').toLowerCase()
  for (const s of (socios||SOCIOS_DEFAULT)) {
    const aliases = [s.alias?.toLowerCase(), s.id?.toLowerCase(), s.nombre?.split(' ')[0]?.toLowerCase()].filter(Boolean)
    if (aliases.some(a => c.includes(a))) return s.id
  }
  return null
}

// ── Gráfico de cascada (waterfall) en SVG ──────────────────────
function WaterfallChart({ ventas, costos, gastosOp, pagoGanancias, utilidad, config }) {
  // 5 barras: Ingresos | -Costos | -GastosOp(sin pago) | -PagoGanancias | =Utilidad
  const gastosOpSinPago = Math.max(gastosOp - pagoGanancias, 0)
  const NBARS = 5
  const VW = 640, VH = 220
  const LABEL_H = 32
  const TOP_PAD  = 36   // espacio para valor + signo encima de la barra
  const CHART_H  = VH - LABEL_H - TOP_PAD
  const PAD_L = 14, GAP = 10
  const BAR_W = Math.floor((VW - PAD_L * 2 - GAP * (NBARS - 1)) / NBARS)
  const baseline = TOP_PAD + CHART_H

  // Escala: la barra más alta = ventas (ingresos)
  const maxVal = Math.max(ventas, 1)
  const scale  = CHART_H / maxVal

  const bloques = [
    { label:'Ingresos',      val: ventas,           color:'#1D9E75', tipo:'float' },
    { label:'Costos',        val:-costos,           color:'#E24B4A', tipo:'float' },
    { label:'Gastos Op.',    val:-gastosOpSinPago,  color:'#EF9F27', tipo:'float' },
    { label:'Pago ganancias',val:-pagoGanancias,    color:'#7F66CC', tipo:'float' },
    { label:'Utilidad',      val: utilidad,         color: utilidad>=0?'#1D9E75':'#E24B4A', tipo:'total' },
  ]

  let running = 0
  const bars = bloques.map((b, i) => {
    const x = PAD_L + i * (BAR_W + GAP)
    let top, barH, connectorY
    if (b.tipo === 'total') {
      const h = Math.max(Math.abs(b.val) * scale, 3)
      top   = b.val >= 0 ? baseline - h : baseline
      barH  = h
      connectorY = null
      running = b.val
    } else {
      const from = running
      const to   = running + b.val
      const yFrom = baseline - from * scale
      const yTo   = baseline - to   * scale
      top    = Math.min(yFrom, yTo)
      barH   = Math.max(Math.abs(yFrom - yTo), 3)
      connectorY = baseline - to * scale   // nivel de aterrizaje → inicio siguiente
      running = to
    }
    return { ...b, x, top, barH, connectorY }
  })

  return (
    <svg width="100%" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet"
      style={{fontFamily:'Arial,sans-serif',display:'block'}}>
      {/* Línea base */}
      <line x1={PAD_L} y1={baseline} x2={VW-PAD_L} y2={baseline} stroke="#ccc" strokeWidth={1}/>

      {bars.map((b, i) => {
        const cx      = b.x + BAR_W / 2
        const isTotal = b.tipo === 'total'
        const sign    = b.val > 0 ? '+' : (b.val < 0 ? '−' : '')
        const dispVal = fmtM(Math.abs(b.val))
        return (
          <g key={b.label}>
            {/* Barra */}
            <rect x={b.x} y={b.top} width={BAR_W} height={b.barH}
              fill={b.color} rx={4} opacity={isTotal ? 1 : 0.78}/>
            {/* Signo separado (pequeño) + valor encima */}
            <text x={cx} y={b.top - 3} textAnchor="middle" fontSize={9.5} fill={b.color} fontWeight={700}>
              {sign}{dispVal}
            </text>
            {/* Etiqueta debajo */}
            <text x={cx} y={baseline + LABEL_H - 6} textAnchor="middle" fontSize={8.5} fill={isTotal?'#333':'#666'} fontWeight={isTotal?700:400}>
              {b.label}
            </text>
            {/* Conector punteado horizontal al siguiente bar */}
            {b.connectorY != null && i < bars.length - 1 && (
              <line
                x1={b.x + BAR_W} y1={b.connectorY}
                x2={b.x + BAR_W + GAP} y2={b.connectorY}
                stroke="#bbb" strokeWidth={1} strokeDasharray="3,2"/>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function ReciboCanvas({ socio, mes, pagos, reciboRef, socios, mesData }) {
  const config  = (socios||SOCIOS_DEFAULT).find(s=>s.id===socio) || { nombre:socio, color:'#378ADD', pct:0 }
  const pagoMes = pagos.find(p=>p.mes===mes)
  const acum    = pagos.filter(p=>p.mes<=mes).reduce((s,p)=>s+p.monto,0)
  const maxVal  = Math.max(...pagos.map(p=>p.monto), 1)
  const mesLabel= mes ? fmtMes(mes) : '—'
  const now     = new Date().toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'})
  const md      = mesData || {}

  return (
    <div ref={reciboRef} style={{
      width:680, background:'#fff', color:'#1a1a1a', fontFamily:'Georgia, serif',
      padding:'40px 48px', boxSizing:'border-box', border:'1px solid #e0e0e0',
    }}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:28,paddingBottom:16,borderBottom:'2px solid #1a1a1a'}}>
        <div>
          <div style={{fontSize:22,fontWeight:700,letterSpacing:1,color:'#1a1a1a'}}>CHILAKILEANDO</div>
          <div style={{fontSize:10,color:'#666',letterSpacing:2,marginTop:2}}>RECIBO DE PAGO DE GANANCIAS</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:11,color:'#666'}}>Fecha de emisión</div>
          <div style={{fontSize:12,fontWeight:600}}>{now}</div>
          <div style={{marginTop:6,fontSize:10,color:'#999'}}>Folio: {(mes||'').replace('-','')+'-'+config.nombre.toUpperCase().slice(0,3)}</div>
        </div>
      </div>

      {/* Socio info */}
      <div style={{display:'flex',gap:40,marginBottom:20}}>
        <div style={{flex:1}}>
          <div style={{fontSize:10,color:'#999',letterSpacing:1,marginBottom:4}}>RECEPTOR</div>
          <div style={{fontSize:18,fontWeight:700,color:config.color}}>{config.nombre}</div>
          <div style={{fontSize:11,color:'#666',marginTop:2}}>{config.id} · Chilakileando S.A. · {config.pct}% de ganancias</div>
        </div>
        <div style={{flex:1,textAlign:'right'}}>
          <div style={{fontSize:10,color:'#999',letterSpacing:1,marginBottom:4}}>PERÍODO</div>
          <div style={{fontSize:15,fontWeight:600,textTransform:'capitalize'}}>{mesLabel}</div>
        </div>
      </div>

      {/* Montos principales */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:20}}>
        <div style={{background:'#f8f8f8',borderRadius:8,padding:'18px 20px',borderLeft:`4px solid ${config.color}`}}>
          <div style={{fontSize:10,color:'#999',letterSpacing:1,marginBottom:6}}>MONTO RECIBIDO ESTE MES</div>
          <div style={{fontSize:28,fontWeight:700,color:config.color}}>{pagoMes ? fmtM(pagoMes.monto) : '—'}</div>
          {pagoMes?.concepto && <div style={{fontSize:10,color:'#888',marginTop:4}}>{pagoMes.concepto}</div>}
        </div>
        <div style={{background:'#f8f8f8',borderRadius:8,padding:'18px 20px',borderLeft:'4px solid #1a1a1a'}}>
          <div style={{fontSize:10,color:'#999',letterSpacing:1,marginBottom:6}}>ACUMULADO HISTÓRICO RECIBIDO</div>
          <div style={{fontSize:28,fontWeight:700,color:'#1a1a1a'}}>{fmtM(acum)}</div>
          <div style={{fontSize:10,color:'#888',marginTop:4}}>{pagos.filter(p=>p.mes<=mes).length} pagos registrados</div>
        </div>
      </div>

      {/* Cascada del mes */}
      {md.ventas > 0 && (
        <div style={{marginBottom:20}}>
          <div style={{fontSize:10,color:'#999',letterSpacing:1,marginBottom:8}}>RESULTADOS DEL MES — {mesLabel.toUpperCase()}</div>
          <div style={{background:'#fafafa',borderRadius:8,padding:'16px 20px'}}>
            {(() => {
              const pg = md.pagoGananciasTotal || 0
              const gastosOpSinPago = Math.max(md.gastosOp - pg, 0)
              return (<>
                <WaterfallChart
                  ventas={md.ventas} costos={md.costos} gastosOp={md.gastosOp}
                  pagoGanancias={pg} utilidad={md.utilidad} config={config}/>
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'6px 16px',marginTop:12,fontSize:10}}>
                  {[
                    {l:'Ingresos',       v: md.ventas,        c:'#1D9E75'},
                    {l:'Costos',         v:-md.costos,        c:'#E24B4A'},
                    {l:'Gastos Op.',     v:-gastosOpSinPago,  c:'#EF9F27'},
                    {l:'Pago ganancias', v:-pg,               c:'#7F66CC'},
                    {l:'Utilidad',       v: md.utilidad,      c:md.utilidad>=0?'#1D9E75':'#E24B4A'},
                  ].map(r=>(
                    <div key={r.l} style={{display:'flex',justifyContent:'space-between',gap:4}}>
                      <span style={{color:'#888'}}>{r.l}</span>
                      <strong style={{color:r.c}}>{r.v>0?'+':''}{fmtM(r.v)}</strong>
                    </div>
                  ))}
                </div>
              </>)
            })()}
          </div>
        </div>
      )}

      {/* Tabla de pagos históricos */}
      {pagos.length > 0 && (
        <div style={{marginBottom:20}}>
          <div style={{fontSize:10,color:'#999',letterSpacing:1,marginBottom:10}}>HISTORIAL DE PAGOS</div>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
            <thead>
              <tr style={{borderBottom:'1.5px solid #1a1a1a'}}>
                <th style={{textAlign:'left',padding:'4px 8px',fontWeight:600,color:'#666'}}>Mes</th>
                <th style={{textAlign:'right',padding:'4px 8px',fontWeight:600,color:'#666'}}>Monto</th>
                <th style={{textAlign:'right',padding:'4px 8px',fontWeight:600,color:'#666'}}>Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {[...pagos].filter(p=>p.mes<=mes).reverse().map((p) => {
                const acumRow = pagos.filter(x=>x.mes<=p.mes).reduce((s,x)=>s+x.monto,0)
                return (
                  <tr key={p.mes} style={{borderBottom:'0.5px solid #eee',background:p.mes===mes?config.color+'11':''}}>
                    <td style={{padding:'5px 8px',textTransform:'capitalize',fontWeight:p.mes===mes?700:400}}>{fmtMes(p.mes)}</td>
                    <td style={{padding:'5px 8px',textAlign:'right',fontWeight:p.mes===mes?700:400,color:p.mes===mes?config.color:'inherit'}}>{fmtM(p.monto)}</td>
                    <td style={{padding:'5px 8px',textAlign:'right',color:'#666'}}>{fmtM(acumRow)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Gráfico de barras histórico */}
      {pagos.length > 0 && (
        <div style={{marginBottom:20}}>
          <div style={{fontSize:10,color:'#999',letterSpacing:1,marginBottom:10}}>PAGOS HISTÓRICOS AL SOCIO</div>
          <svg width="100%" viewBox={`0 0 ${Math.max(pagos.length*52+20,300)} 120`} style={{overflow:'visible'}}>
            {pagos.map((p,i) => {
              const barH = Math.round((p.monto / maxVal) * 80)
              const x    = i * 52 + 10
              const isSel = p.mes === mes
              return (
                <g key={p.mes}>
                  <rect x={x} y={100-barH} width={36} height={barH} fill={isSel?config.color:config.color+'55'} rx={3}/>
                  <text x={x+18} y={115} textAnchor="middle" fontSize={8} fill="#999">
                    {p.mes.slice(2,4)}/{p.mes.slice(5,7)}
                  </text>
                  <text x={x+18} y={96-barH} textAnchor="middle" fontSize={8} fill={isSel?config.color:'#666'} fontWeight={isSel?700:400}>
                    {fmtM(p.monto).replace('$','')}
                  </text>
                </g>
              )
            })}
            <line x1="10" y1="100" x2={pagos.length*52+10} y2="100" stroke="#ddd" strokeWidth="1"/>
          </svg>
        </div>
      )}

      {/* Footer */}
      <div style={{marginTop:8,paddingTop:16,borderTop:'1px solid #ddd',display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
        <div style={{fontSize:10,color:'#999'}}>
          Este documento es un comprobante interno de distribución de ganancias.<br/>
          Chilakileando · {new Date().getFullYear()}
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{width:160,borderTop:'1px solid #1a1a1a',paddingTop:6,fontSize:10,color:'#666',textAlign:'center'}}>
            Firma de conformidad
          </div>
        </div>
      </div>
    </div>
  )
}

export function AdminRecibos() {
  const [pagosAll,  setPagosAll]  = useState([])
  const [socios,    setSocios]    = useState(loadSociosLS)
  const [socio,     setSocio]     = useState(socios[0]?.id || 'Socio 1')
  const [mes,       setMes]       = useState('')
  const [mesData,   setMesData]   = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [generando, setGenerando] = useState(false)
  const [editSocios,setEditSocios]= useState(false)
  const reciboRef = useRef(null)

  // Persistir socios en localStorage
  useEffect(() => {
    try { localStorage.setItem('erp_socios_cfg', JSON.stringify(socios)) } catch {}
  }, [socios])

  useEffect(() => {
    const load = async () => {
      const { data } = await sb.from('gastos')
        .select('fecha,monto,concepto,metodo_pago,categoria_gasto')
        .ilike('categoria_gasto','%PAGO DE GANANCIAS%')
        .order('fecha', { ascending: true })
      setPagosAll(data||[])
      setLoading(false)
    }
    load()
  }, [])

  // Cargar datos financieros del mes — misma lógica que Resultados
  useEffect(() => {
    if (!mes) { setMesData(null); return }
    const load = async () => {
      const [yr, mo] = mes.split('-').map(Number)
      const ini = mes+'-01'
      const fin = `${mes}-${String(new Date(yr,mo,0).getDate()).padStart(2,'0')}`

      // fetchKpiPeriod da ventas/gastos iguales a Resultados
      const [kpi, kpiAcum, { data: gRows }, { data: pagGanRows }] = await Promise.all([
        fetchKpiPeriod('rango', new Date(), ini, fin),
        fetchKpiAcum(ini, fin),
        sb.from('gastos').select('monto,categoria_gasto').gte('fecha',ini).lte('fecha',fin),
        // Total pagado a TODOS los socios ese mes (para saldo plataformas)
        sb.from('gastos').select('monto').gte('fecha',ini).lte('fecha',fin)
          .ilike('categoria_gasto','%PAGO DE GANANCIAS%'),
      ])

      const ventas      = Math.round(kpi.ventas)
      const gastosTotal = Math.round(kpi.gastos)
      const ajustesCaja = Math.round(kpiAcum.ajEfvo + kpiAcum.ajTc + kpiAcum.ajPlat)
      const vGratis     = kpiAcum.gImporte || 0
      // Misma fórmula que Resultados
      const utilidad    = Math.round(ventas - gastosTotal - ajustesCaja - vGratis)

      // Split costos vs gastosOp para las barras del waterfall
      const costos = (gRows||[])
        .filter(r=>(r.categoria_gasto||'').toUpperCase().includes('COSTO'))
        .reduce((s,r)=>s+(r.monto||0),0)
      const gastosOp = Math.max(gastosTotal - Math.round(costos), 0)

      const pagoGananciasTotal = Math.round((pagGanRows||[]).reduce((s,r)=>s+(r.monto||0),0))

      setMesData({ ventas, costos: Math.round(costos), gastosOp, gastosTotal, ajustesCaja, vGratis, utilidad, pagoGananciasTotal })
    }
    load()
  }, [mes])

  const pagosSocio = React.useMemo(() => {
    const filtrados = (pagosAll||[]).filter(g => extraerSocio(g.concepto, socios) === socio)
    const byMes = {}
    filtrados.forEach(g => {
      const m = (g.fecha||'').slice(0,7)
      if (!byMes[m]) byMes[m] = { mes:m, monto:0, concepto:g.concepto }
      byMes[m].monto += (g.monto||0)
    })
    return Object.values(byMes).sort((a,b)=>a.mes.localeCompare(b.mes))
  }, [pagosAll, socio, socios])

  useEffect(() => {
    if (pagosSocio.length > 0) setMes(pagosSocio[pagosSocio.length-1].mes)
    else setMes('')
  }, [socio, pagosSocio.length])

  const descargarPDF = async () => {
    if (!reciboRef.current) return
    setGenerando(true)
    try {
      const { default: html2canvas } = await import('html2canvas')
      const { jsPDF }                = await import('jspdf')
      const canvas  = await html2canvas(reciboRef.current, { scale:2, useCORS:true, backgroundColor:'#ffffff' })
      const imgData = canvas.toDataURL('image/png')
      // Página de tamaño exacto al contenido — sin cortes, sin página en blanco
      const A4_W_MM = 210
      const pdfH_MM = (canvas.height * A4_W_MM) / canvas.width
      const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:[A4_W_MM, pdfH_MM] })
      pdf.addImage(imgData, 'PNG', 0, 0, A4_W_MM, pdfH_MM)
      const cfg = socios.find(s=>s.id===socio)||{nombre:socio}
      pdf.save(`Recibo-${cfg.alias||cfg.nombre}-${mes}.pdf`)
    } catch(e) { alert('Error al generar PDF: '+e.message) }
    setGenerando(false)
  }

  const config   = socios.find(s=>s.id===socio) || { nombre:socio, color:'#378ADD', pct:0 }
  const sumPct   = socios.reduce((s,x)=>s+(x.pct||0),0)

  const agregarSocio = () => {
    const nextN = socios.length+1
    setSocios(prev=>[...prev, {
      id:`Socio ${nextN}`, nombre:`Nuevo Socio ${nextN}`, alias:`Socio${nextN}`,
      color: COLORS_POOL[nextN % COLORS_POOL.length], pct:0
    }])
  }

  return (
    <div>
      {/* Panel de configuración de socios */}
      <div className="card" style={{marginBottom:12}}>
        <div className="ch">
          <div className="ct">Configuración de socios y % de ganancias</div>
          <button onClick={()=>setEditSocios(e=>!e)}
            style={{fontSize:11,padding:'3px 10px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',color:'var(--text2)'}}>
            {editSocios?'Cerrar':'Editar'}
          </button>
        </div>
        {!editSocios ? (
          <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
            {socios.map(s=>(
              <div key={s.id} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',borderRadius:'var(--r-sm)',border:`1.5px solid ${s.color}`,fontSize:12}}>
                <span style={{color:s.color,fontWeight:700}}>{s.alias}</span>
                <span style={{color:'var(--text3)'}}>·</span>
                <span style={{color:'var(--text2)'}}>{s.nombre}</span>
                <span style={{color:'var(--text3)'}}>·</span>
                <span style={{color:s.color,fontWeight:700}}>{s.pct}%</span>
              </div>
            ))}
            <div style={{fontSize:11,color:sumPct===100?'#1D9E75':'#E24B4A',alignSelf:'center',fontWeight:600}}>
              Total: {sumPct}% {sumPct!==100?'⚠ debe sumar 100%':'✓'}
            </div>
          </div>
        ) : (
          <div>
            {socios.map((s,i)=>(
              <div key={s.id} style={{display:'flex',gap:8,alignItems:'center',marginBottom:8,flexWrap:'wrap'}}>
                <input value={s.alias} onChange={e=>setSocios(p=>p.map((x,j)=>j===i?{...x,alias:e.target.value}:x))}
                  placeholder="Alias" className="form-input" style={{width:80,fontSize:11,padding:'4px 6px'}}/>
                <input value={s.nombre} onChange={e=>setSocios(p=>p.map((x,j)=>j===i?{...x,nombre:e.target.value}:x))}
                  placeholder="Nombre completo" className="form-input" style={{flex:1,minWidth:160,fontSize:11,padding:'4px 6px'}}/>
                <input value={s.id} onChange={e=>setSocios(p=>p.map((x,j)=>j===i?{...x,id:e.target.value}:x))}
                  placeholder="ID (ej: Socio 1)" className="form-input" style={{width:90,fontSize:11,padding:'4px 6px'}}/>
                <input type="number" min={0} max={100} value={s.pct} onChange={e=>setSocios(p=>p.map((x,j)=>j===i?{...x,pct:+e.target.value}:x))}
                  className="form-input" style={{width:60,fontSize:11,padding:'4px 6px'}}/>
                <span style={{fontSize:11,color:'var(--text3)'}}>%</span>
                <input value={s.color} type="color" onChange={e=>setSocios(p=>p.map((x,j)=>j===i?{...x,color:e.target.value}:x))}
                  style={{width:28,height:28,border:'none',cursor:'pointer',borderRadius:4,padding:0}}/>
                {socios.length>1 && (
                  <button onClick={()=>setSocios(p=>p.filter((_,j)=>j!==i))}
                    style={{fontSize:11,color:'#E24B4A',background:'transparent',border:'0.5px solid #E24B4A',borderRadius:'var(--r-sm)',padding:'2px 6px',cursor:'pointer'}}>
                    ✕
                  </button>
                )}
              </div>
            ))}
            <div style={{display:'flex',gap:10,alignItems:'center',marginTop:8}}>
              <button onClick={agregarSocio}
                style={{fontSize:12,padding:'5px 12px',borderRadius:'var(--r-sm)',border:'1px dashed var(--border-md)',background:'transparent',cursor:'pointer',color:'var(--text2)'}}>
                + Agregar socio
              </button>
              <span style={{fontSize:11,color:sumPct===100?'#1D9E75':'#E24B4A',fontWeight:600}}>
                Total: {sumPct}% {sumPct!==100?'⚠':'✓'}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{marginBottom:16}}>
        <div className="ch"><div className="ct">Generar recibo</div></div>

        <div style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'flex-end',marginBottom:16}}>
          <div>
            <label style={{fontSize:11,color:'var(--text2)',display:'block',marginBottom:4}}>Socio</label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {socios.map(s=>(
                <button key={s.id} onClick={()=>setSocio(s.id)}
                  style={{padding:'6px 18px',borderRadius:'var(--r-md)',fontSize:12,fontWeight:600,cursor:'pointer',
                    border:`2px solid ${s.color}`,
                    background:socio===s.id?s.color:'transparent',
                    color:socio===s.id?'#fff':s.color}}>
                  {s.alias}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{fontSize:11,color:'var(--text2)',display:'block',marginBottom:4}}>Mes del recibo</label>
            <select className="form-input" value={mes} onChange={e=>setMes(e.target.value)} style={{minWidth:180}}>
              {pagosSocio.length===0 && <option value=''>Sin pagos registrados</option>}
              {[...pagosSocio].reverse().map(p=>(
                <option key={p.mes} value={p.mes}>{fmtMes(p.mes)} — {fmtM(p.monto)}</option>
              ))}
            </select>
          </div>
          <button onClick={descargarPDF} disabled={generando||!mes}
            style={{padding:'8px 20px',borderRadius:'var(--r-md)',border:'none',
              background:mes?config.color:'var(--border)',color:'#fff',cursor:mes?'pointer':'default',
              fontSize:13,fontWeight:600,whiteSpace:'nowrap'}}>
            {generando?'Generando...':'⬇ Descargar PDF'}
          </button>
        </div>

        {pagosSocio.length>0 && (
          <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:4}}>
            <div style={{background:'var(--bg2)',borderRadius:'var(--r-sm)',padding:'8px 14px',fontSize:12}}>
              <span style={{color:'var(--text3)'}}>Total pagado a {config.alias||config.nombre}: </span>
              <strong style={{color:config.color}}>{fmtM(pagosSocio.reduce((s,p)=>s+p.monto,0))}</strong>
            </div>
            <div style={{background:'var(--bg2)',borderRadius:'var(--r-sm)',padding:'8px 14px',fontSize:12}}>
              <span style={{color:'var(--text3)'}}>Pagos: </span>
              <strong>{pagosSocio.length} meses</strong>
            </div>
            {mes && mesData && (
              <div style={{background:'var(--bg2)',borderRadius:'var(--r-sm)',padding:'8px 14px',fontSize:12}}>
                <span style={{color:'var(--text3)'}}>Utilidad del mes: </span>
                <strong style={{color:mesData.utilidad>=0?'#1D9E75':'#E24B4A'}}>{fmtM(mesData.utilidad)}</strong>
                <span style={{color:'var(--text3)',marginLeft:8}}>→ {config.pct}% = </span>
                <strong style={{color:config.color}}>{fmtM(mesData.utilidad*(config.pct/100))}</strong>
              </div>
            )}
          </div>
        )}

        {loading && <div className="loading-screen" style={{height:80}}><div className="spinner"/></div>}
        {!loading && pagosSocio.length===0 && (
          <div style={{fontSize:12,color:'var(--text3)',padding:'16px 0'}}>
            No hay pagos registrados para {config.alias||config.nombre}. Regístralos en Gastos con categoría "PAGO DE GANANCIAS" e incluye "{config.alias}" en el concepto.
          </div>
        )}
      </div>

      {mes && pagosSocio.length>0 && (
        <div className="card">
          <div className="ch">
            <div className="ct">Vista previa — {config.alias||config.nombre} · {fmtMes(mes)}</div>
            <div style={{fontSize:11,color:'var(--text3)'}}>El PDF se genera a partir de esta vista</div>
          </div>
          <div style={{overflowX:'auto'}}>
            <ReciboCanvas socio={socio} mes={mes} pagos={pagosSocio} reciboRef={reciboRef} socios={socios} mesData={mesData}/>
          </div>
        </div>
      )}
    </div>
  )
}

// ── BACKUP ────────────────────────────────────────────────────
async function fetchAllPages(table, select) {
  const PAGE = 1000; let all=[], idx=0, done=false
  while (!done) {
    const { data } = await sb.from(table).select(select).order('fecha',{ascending:true}).range(idx,idx+PAGE-1)
    all = all.concat(data||[])
    if (!data||data.length<PAGE) done=true; else idx+=PAGE
  }
  return all
}

export function AdminBackup() {
  const [loading,   setLoading]   = useState(false)
  const [msg,       setMsg]       = useState(null)
  const [ultimoBK,  setUltimoBK]  = useState(null)

  useEffect(()=>{
    const u = localStorage.getItem('ultimo_backup')
    if (u) setUltimoBK(u)
  },[])

  const generarBackup = async () => {
    setLoading(true); setMsg(null)
    try {
      const [ventas, ventasCat, gastos, inventario, produccion, cierres, productos] = await Promise.all([
        fetchAllPages('ventas','id,fecha,producto,categoria,canal,metodo_pago,unidades,importe,cliente'),
        fetchAllPages('ventas_cat','fecha,categoria,importe,unidades'),
        fetchAllPages('gastos','id,fecha,concepto,categoria_gasto,proveedor,monto,metodo_pago,notas'),
        fetchAllPages('inventario_diario','fecha,producto,tipo,cantidad_inicial,cantidad_producida,cantidad_vendida,cantidad_final'),
        fetchAllPages('produccion','fecha,guiso,tipo,cantidad_litros,destino,notas'),
        fetchAllPages('cierres_dia','fecha,sys_total,sys_tc,sys_plat,gastos_total,dif_efvo,dif_tc,cerrado_por,notas'),
        sb.from('productos').select('codigo,nombre,precio_base,precio_extra,costo_unitario,activo,familias(nombre)').then(r=>r.data||[]),
      ])

      const wb = XLSX.utils.book_new()
      const fecha = new Date().toISOString().slice(0,10)

      // Resumen
      const totV = ventas.reduce((s,r)=>s+(r.importe||0),0)
      const totG = gastos.reduce((s,r)=>s+(r.monto||0),0)
      const ws0 = XLSX.utils.aoa_to_sheet([
        ['Backup Chilakileando ERP',''],
        ['Generado',new Date().toLocaleString('es-MX')],
        ['Total ventas',Math.round(totV)],
        ['Total gastos',Math.round(totG)],
        ['Utilidad',Math.round(totV-totG)],
        ['Registros ventas',ventas.length],
        ['Registros gastos',gastos.length],
      ])
      XLSX.utils.book_append_sheet(wb, ws0, 'Resumen')

      // Ventas
      if (ventas.length) {
        const ws = XLSX.utils.json_to_sheet(ventas.map(r=>({
          Fecha:r.fecha, Producto:r.producto, Categoria:r.categoria,
          Canal:r.canal, Pago:r.metodo_pago, Uds:r.unidades, Importe:r.importe, Cliente:r.cliente||''
        })))
        XLSX.utils.book_append_sheet(wb, ws, 'Ventas')
      }

      // Ventas por categoría
      if (ventasCat.length) {
        const ws = XLSX.utils.json_to_sheet(ventasCat.map(r=>({
          Fecha:r.fecha, Categoria:r.categoria, Importe:r.importe, Unidades:r.unidades
        })))
        XLSX.utils.book_append_sheet(wb, ws, 'Ventas por categoria')
      }

      // Gastos
      if (gastos.length) {
        const ws = XLSX.utils.json_to_sheet(gastos.map(r=>({
          Fecha:r.fecha, Concepto:r.concepto, Categoria:r.categoria_gasto,
          Proveedor:r.proveedor||'', Monto:r.monto, Pago:r.metodo_pago||'', Notas:r.notas||''
        })))
        XLSX.utils.book_append_sheet(wb, ws, 'Gastos')
      }

      // Inventario
      if (inventario.length) {
        const ws = XLSX.utils.json_to_sheet(inventario.map(r=>({
          Fecha:r.fecha, Producto:r.producto, Tipo:r.tipo,
          Inicial:r.cantidad_inicial, Producido:r.cantidad_producida,
          Vendido:r.cantidad_vendida, Final:r.cantidad_final
        })))
        XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
      }

      // Produccion
      if (produccion.length) {
        const ws = XLSX.utils.json_to_sheet(produccion.map(r=>({
          Fecha:r.fecha, Producto:r.guiso, Tipo:r.tipo,
          Litros:r.cantidad_litros, Destino:r.destino, Notas:r.notas||''
        })))
        XLSX.utils.book_append_sheet(wb, ws, 'Produccion')
      }

      // Cierres
      if (cierres.length) {
        const ws = XLSX.utils.json_to_sheet(cierres.map(r=>({
          Fecha:r.fecha, Ventas:r.sys_total, Gastos:r.gastos_total,
          Utilidad:(r.sys_total||0)-(r.gastos_total||0),
          'Dif Efvo':r.dif_efvo||0, 'Dif TC':r.dif_tc||0,
          'Cerrado por':r.cerrado_por||'', Notas:r.notas||''
        })))
        XLSX.utils.book_append_sheet(wb, ws, 'Cierres')
      }

      // Precios
      if (productos.length) {
        const ws = XLSX.utils.json_to_sheet(productos.map(r=>({
          Codigo:r.codigo||'', Nombre:r.nombre, Familia:r.familias?.nombre||'',
          Precio:r.precio_base, 'Guiso extra':r.precio_extra||0,
          Costo:r.costo_unitario||0, Activo:r.activo?'Sí':'No'
        })))
        XLSX.utils.book_append_sheet(wb, ws, 'Precios')
      }

      XLSX.writeFile(wb, `Chilakileando-Backup-${fecha}.xlsx`)
      const ts = new Date().toLocaleString('es-MX')
      localStorage.setItem('ultimo_backup', ts)
      setUltimoBK(ts)
      setMsg({ ok:true, text:`Backup descargado — ${wb.SheetNames.length} hojas · ${ventas.length} ventas · ${gastos.length} gastos` })
    } catch(e) { setMsg({ ok:false, text:'Error: '+e.message }) }
    setLoading(false)
    setTimeout(()=>setMsg(null), 5000)
  }

  return (
    <div>
      {msg && <div style={{padding:'9px 14px',borderRadius:'var(--r-md)',marginBottom:12,
        background:msg.ok?'#EAF3DE':'#FCEBEB',color:msg.ok?'#3B6D11':'#A32D2D',fontSize:12}}>{msg.text}</div>}

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        {/* BACKUP MANUAL */}
        <div className="card">
          <div className="ch"><div className="ct">Backup manual</div></div>
          <div style={{fontSize:12,color:'var(--text2)',marginBottom:16,lineHeight:1.6}}>
            Descarga un archivo Excel completo con todas las tablas del sistema:
            ventas, gastos, inventario, producción, cierres y precios.
          </div>
          {ultimoBK && (
            <div style={{fontSize:11,color:'var(--text3)',marginBottom:12,padding:'6px 10px',background:'var(--bg)',borderRadius:'var(--r-sm)'}}>
              Último backup: {ultimoBK}
            </div>
          )}
          <button onClick={generarBackup} disabled={loading}
            style={{width:'100%',padding:12,borderRadius:'var(--r-md)',border:'none',
              background:loading?'var(--border)':'var(--accent)',color:loading?'var(--text3)':'#fff',
              cursor:loading?'not-allowed':'pointer',fontSize:13,fontWeight:600}}>
            {loading?'⏳ Generando backup...':'⬇ Descargar backup completo'}
          </button>
        </div>

        {/* BACKUP AUTOMÁTICO */}
        <div className="card">
          <div className="ch"><div className="ct">Backup automático semanal</div></div>
          <div style={{fontSize:12,color:'var(--text2)',marginBottom:12,lineHeight:1.6}}>
            Se envía automáticamente cada lunes a las 6:00 AM al correo:
          </div>
          <div style={{padding:'8px 12px',background:'var(--bg)',borderRadius:'var(--r-md)',marginBottom:12,fontSize:12,fontWeight:600}}>
            gordinfladasmx@gmail.com
          </div>
          <div style={{fontSize:11,color:'var(--text3)',marginBottom:16,lineHeight:1.5}}>
            El backup incluye todos los datos hasta el domingo anterior.
            Configurado vía Supabase Edge Functions + pg_cron.
          </div>
          <div style={{padding:'10px 12px',background:'#EAF3DE',borderRadius:'var(--r-md)',fontSize:11,color:'#3B6D11'}}>
            ✓ Activo — próximo envío: lunes {(() => {
              const d = new Date(); const day = d.getDay()
              const diff = day===1?7:((1+7-day)%7)||7
              d.setDate(d.getDate()+diff)
              return d.toLocaleDateString('es-MX',{day:'numeric',month:'long'})
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── ADMIN COMISIONES ─────────────────────────────────────────
function AdminComisiones() {
  const [comisiones, setComisiones] = useState([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(null)
  const [msg,        setMsg]        = useState(null)

  useEffect(() => {
    sb.from('config_comisiones').select('*').order('id')
      .then(({ data }) => { setComisiones(data||[]); setLoading(false) })
  }, [])

  const actualizar = async (id, porcentaje) => {
    setSaving(id)
    const { error } = await sb.from('config_comisiones')
      .update({ porcentaje: parseFloat(porcentaje)||0, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) setMsg({ ok:false, text:'Error: '+error.message })
    else {
      setComisiones(prev => prev.map(c => c.id===id ? {...c, porcentaje:parseFloat(porcentaje)||0} : c))
      setMsg({ ok:true, text:'Comisión actualizada' })
      setTimeout(()=>setMsg(null), 3000)
    }
    setSaving(null)
  }

  if (loading) return <div className="loading-screen" style={{height:200}}><div className="spinner"/></div>

  return (
    <div>
      <div style={{marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:600}}>Parametrización de comisiones</div>
        <div style={{fontSize:11,color:'var(--text2)',marginTop:2}}>
          Estos valores se usan en el cálculo de rentabilidad por canal y en el cobro de comandas.
        </div>
      </div>
      {msg && <div style={{padding:'8px 14px',borderRadius:'var(--r-md)',marginBottom:12,
        background:msg.ok?'#EAF3DE':'#FCEBEB',color:msg.ok?'#3B6D11':'#A32D2D',fontSize:12}}>{msg.text}</div>}
      <div className="card">
        <table className="tbl">
          <thead>
            <tr><th>Canal / Concepto</th><th className="num">% actual</th><th className="num" style={{width:180}}>Nuevo %</th><th></th></tr>
          </thead>
          <tbody>
            {comisiones.map(c => {
              const [val, setVal] = [c._val, v => setComisiones(prev => prev.map(x => x.id===c.id?{...x,_val:v}:x))]
              const inputVal = c._val !== undefined ? c._val : c.porcentaje
              return (
                <tr key={c.id}>
                  <td style={{fontWeight:500}}>{c.label}</td>
                  <td className="num">
                    <span style={{padding:'2px 10px',borderRadius:99,fontSize:11,
                      background:c.porcentaje>0?'#FCEBEB':'#EAF3DE',
                      color:c.porcentaje>0?'#A32D2D':'#3B6D11',fontWeight:600}}>
                      {c.porcentaje}%
                    </span>
                  </td>
                  <td className="num">
                    <input type="number" min="0" max="100" step="0.1"
                      defaultValue={c.porcentaje}
                      onChange={e => setComisiones(prev => prev.map(x => x.id===c.id?{...x,_val:e.target.value}:x))}
                      style={{width:100,padding:'4px 8px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',
                        fontSize:12,textAlign:'right',background:'var(--surface)',color:'var(--text1)'}}/>
                    <span style={{fontSize:11,color:'var(--text2)',marginLeft:4}}>%</span>
                  </td>
                  <td>
                    <button onClick={()=>actualizar(c.id, c._val!==undefined?c._val:c.porcentaje)}
                      disabled={saving===c.id}
                      style={{padding:'4px 12px',borderRadius:'var(--r-sm)',border:'none',
                        background:'var(--accent)',color:'#fff',cursor:'pointer',fontSize:11,fontWeight:600}}>
                      {saving===c.id?'…':'Guardar'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{marginTop:12,padding:'10px 14px',borderRadius:'var(--r-md)',background:'#EAF3DE',fontSize:11,color:'#3B6D11',lineHeight:1.7}}>
        <strong>Los cambios aplican inmediatamente</strong> en:<br/>
        • Gráficas de rentabilidad por categoría y canal<br/>
        • Cálculo de neto al cobrar comandas con tarjeta<br/>
        • Registro automático de comisiones como gastos
      </div>
    </div>
  )
}
// ── HORARIOS DE TRABAJO ───────────────────────────────────────
export function HorariosAdmin() {
  const [horarios, setHorarios] = React.useState([])
  const [saving,   setSaving]   = React.useState(null)
  const [msg,      setMsg]      = React.useState(null)
  const [cierreHoy, setCierreHoy] = React.useState(null)
  const [motivoCierre, setMotivoCierre] = React.useState('')
  const [loadingCierre, setLoadingCierre] = React.useState(false)

  const hoyStr = new Date().toISOString().slice(0,10)

  const cargarCierreHoy = () => {
    sb.from('cierres_emergencia').select('*').eq('fecha', hoyStr).maybeSingle().then(({ data }) => {
      setCierreHoy(data)
    })
  }

  const DIAS_DEFAULT = [
    { dia:0, dia_nombre:'Domingo',   activo:true,  hora_inicio:'08:00', hora_fin:'13:00' },
    { dia:1, dia_nombre:'Lunes',     activo:false, hora_inicio:'08:00', hora_fin:'13:00' },
    { dia:2, dia_nombre:'Martes',    activo:true,  hora_inicio:'08:00', hora_fin:'13:00' },
    { dia:3, dia_nombre:'Miércoles', activo:true,  hora_inicio:'08:00', hora_fin:'13:00' },
    { dia:4, dia_nombre:'Jueves',    activo:true,  hora_inicio:'08:00', hora_fin:'13:00' },
    { dia:5, dia_nombre:'Viernes',   activo:true,  hora_inicio:'08:00', hora_fin:'13:00' },
    { dia:6, dia_nombre:'Sábado',    activo:true,  hora_inicio:'08:00', hora_fin:'13:00' },
  ]

  React.useEffect(() => {
    sb.from('horarios').select('*').order('dia').then(({ data }) => {
      if (data && data.length > 0) {
        // Merge con defaults para asegurar que los 7 días siempre aparecen
        const merged = DIAS_DEFAULT.map(def => {
          const row = data.find(r => r.dia === def.dia)
          return row ? { ...def, ...row } : def
        })
        setHorarios(merged)
      } else {
        setHorarios(DIAS_DEFAULT)
      }
    })
    cargarCierreHoy()
  }, [])

  const cerrarHoy = async () => {
    if (!confirm('Vas a cerrar el menu publico hoy. Los clientes veran un aviso de cerrado. Continuar?')) return
    setLoadingCierre(true)
    const { error } = await sb.from('cierres_emergencia').insert({
      fecha: hoyStr,
      motivo: motivoCierre || 'Cerrado por hoy',
      creado_por: 'admin'
    })
    if (error) setMsg({ ok:false, text:'Error: '+error.message })
    else { setMsg({ ok:true, text:'Cierre activado. Menu publico bloqueado.' }); cargarCierreHoy() }
    setLoadingCierre(false)
    setTimeout(()=>setMsg(null), 4000)
  }

  const reabrirHoy = async () => {
    if (!confirm('Quitar el cierre de emergencia y reabrir el menu?')) return
    setLoadingCierre(true)
    const { error } = await sb.from('cierres_emergencia').delete().eq('fecha', hoyStr)
    if (error) setMsg({ ok:false, text:'Error: '+error.message })
    else { setMsg({ ok:true, text:'Menu reabierto.' }); setCierreHoy(null); setMotivoCierre('') }
    setLoadingCierre(false)
    setTimeout(()=>setMsg(null), 4000)
  }

  const guardar = async (h) => {
    setSaving(h.dia)
    try {
      const payload = { dia: h.dia, dia_nombre: h.dia_nombre, activo: h.activo, hora_inicio: h.hora_inicio, hora_fin: h.hora_fin }
      const { error } = await sb.from('horarios').upsert(payload, { onConflict: 'dia' })
      if (error) throw error
      setMsg({ ok:true, text:`${h.dia_nombre} guardado ✓` })
    } catch(e) { setMsg({ ok:false, text:'Error: '+e.message }) }
    setSaving(null)
    setTimeout(()=>setMsg(null), 3000)
  }

  const update = (dia, field, val) => {
    setHorarios(prev => prev.map(h => h.dia===dia ? {...h, [field]:val} : h))
  }

  return (
    <div>
      <div style={{marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:600}}>Horarios de trabajo</div>
        <div style={{fontSize:11,color:'var(--text2)',marginTop:2}}>
          Fuera de estos horarios, los meseros no podran acceder al sistema y el menu publico se mostrara como cerrado.
        </div>
      </div>

      <div style={{background: cierreHoy ? '#FCEBEB' : '#FFF8E1', borderRadius:'var(--r-md)', padding:16, marginBottom:16, border:'1px solid '+(cierreHoy?'#E63946':'#F4A261')}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
          <span style={{fontSize:18}}>{cierreHoy ? '🔒' : '🚨'}</span>
          <div style={{fontSize:13,fontWeight:700,color: cierreHoy ? '#A32D2D' : '#8B6914'}}>
            {cierreHoy ? 'Menu publico CERRADO HOY' : 'Cierre de emergencia'}
          </div>
        </div>
        {cierreHoy ? (
          <div>
            <div style={{fontSize:12,color:'var(--text2)',marginBottom:10,lineHeight:1.5}}>
              Motivo: <b>{cierreHoy.motivo}</b><br/>
              Activado: {new Date(cierreHoy.creado_en).toLocaleString('es-MX')}
            </div>
            <button onClick={reabrirHoy} disabled={loadingCierre}
              style={{padding:'8px 16px',borderRadius:'var(--r-sm)',border:'none',background:'#1D9E75',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>
              {loadingCierre?'...':'Reabrir menu'}
            </button>
          </div>
        ) : (
          <div>
            <div style={{fontSize:11,color:'var(--text2)',marginBottom:8,lineHeight:1.5}}>
              Cierra el menu publico inmediatamente (independiente del horario regular). Util para emergencias, capacitaciones, dias festivos no programados, etc.
            </div>
            <input type="text" value={motivoCierre} onChange={e=>setMotivoCierre(e.target.value)}
              placeholder="Motivo (opcional). Ej: Cerrado por capacitacion"
              style={{width:'100%',padding:'8px 12px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',fontSize:12,marginBottom:8,background:'var(--surface)'}}/>
            <button onClick={cerrarHoy} disabled={loadingCierre}
              style={{padding:'8px 16px',borderRadius:'var(--r-sm)',border:'none',background:'#E63946',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>
              {loadingCierre?'...':'Cerrar hoy'}
            </button>
          </div>
        )}
      </div>
      {msg && <div style={{padding:'8px 14px',borderRadius:'var(--r-md)',marginBottom:12,
        background:msg.ok?'#EAF3DE':'#FCEBEB',color:msg.ok?'#3B6D11':'#A32D2D',fontSize:12}}>{msg.text}</div>}
      <div className="card">
        <table className="tbl">
          <thead>
            <tr><th>Día</th><th>Abierto</th><th>Apertura</th><th>Cierre</th><th></th></tr>
          </thead>
          <tbody>
            {horarios.map(h => (
              <tr key={h.dia}>
                <td style={{fontWeight:500}}>{h.dia_nombre}</td>
                <td>
                  <input type="checkbox" checked={h.activo}
                    onChange={e=>update(h.dia,'activo',e.target.checked)}
                    style={{width:16,height:16,cursor:'pointer'}}/>
                </td>
                <td>
                  <input type="time" value={h.hora_inicio} disabled={!h.activo}
                    onChange={e=>update(h.dia,'hora_inicio',e.target.value)}
                    style={{padding:'4px 8px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',
                      fontSize:12,background:'var(--surface)',color:'var(--text1)',opacity:h.activo?1:0.4}}/>
                </td>
                <td>
                  <input type="time" value={h.hora_fin} disabled={!h.activo}
                    onChange={e=>update(h.dia,'hora_fin',e.target.value)}
                    style={{padding:'4px 8px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',
                      fontSize:12,background:'var(--surface)',color:'var(--text1)',opacity:h.activo?1:0.4}}/>
                </td>
                <td>
                  <button onClick={()=>guardar(h)} disabled={saving===h.dia}
                    style={{padding:'4px 12px',borderRadius:'var(--r-sm)',border:'none',
                      background:'var(--accent)',color:'#fff',cursor:'pointer',fontSize:11,fontWeight:600}}>
                    {saving===h.dia?'…':'Guardar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}


