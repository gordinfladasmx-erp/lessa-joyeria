import React, { useState, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { sb } from './lib/supabase.js'
import RecordatoriosBell from './components/RecordatoriosBell.jsx'
import ListaComprasBell  from './components/ListaComprasBell.jsx'
import AsistenteChat     from './components/AsistenteChat.jsx'
import { fetchAllMovimientos, calcStock } from './utils/stockUtils.js'

// Carga diferida: cada página se descarga solo cuando el usuario la visita por primera vez
const Resultados       = lazy(() => import('./pages/Resultados.jsx'))
const Ventas           = lazy(() => import('./pages/Ventas.jsx'))
const Tiempos          = lazy(() => import('./pages/Tiempos.jsx'))
const Rendimiento      = lazy(() => import('./pages/Rendimiento.jsx'))
const NPS              = lazy(() => import('./pages/NPS.jsx'))
const Gastos           = lazy(() => import('./pages/Gastos.jsx'))
const Comanda          = lazy(() => import('./pages/Comanda.jsx'))
const KDS              = lazy(() => import('./pages/KDS.jsx'))
const CierreDia        = lazy(() => import('./pages/CierreDia.jsx'))
const MaestroProductos = lazy(() => import('./pages/MaestroProductos.jsx'))
const Almacen          = lazy(() => import('./pages/Almacen.jsx'))
const Balance          = lazy(() => import('./pages/Balance.jsx'))
const CRM              = lazy(() => import('./pages/CRM.jsx'))
const Exportar         = lazy(() => import('./pages/Exportar.jsx'))
const AdminPage        = lazy(() => import('./pages/Admin.jsx'))
const HorariosAdmin    = lazy(() => import('./pages/Admin.jsx').then(m => ({ default: m.HorariosAdmin })))
const Conciliacion     = lazy(() => import('./pages/Conciliacion.jsx'))
const AdminInsumos     = lazy(() => import('./pages/AdminInsumos.jsx'))

// Spinner mientras carga una página
function PageLoader() {
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh'}}>
      <div className="spinner"/>
    </div>
  )
}

const ALL_NAV = [
  { id: '/',           label: 'Resultados',      color: '#378ADD', roles: ['admin','mesero','viewer'], mod: 'resultados' },
  { id: '/comanda',    label: 'Comanda POS',      color: '#1D9E75', roles: ['admin','mesero','viewer'], mod: 'comanda' },
  { id: '/kds',        label: 'KDS Cocina',       color: '#EF9F27', roles: ['admin','mesero','viewer'], mod: 'kds' },
  { id: '/gastos',     label: 'Gastos',           color: '#E24B4A', roles: ['admin','mesero','viewer'], mod: 'gastos' },
  { id: '/cierre',     label: 'Cierre del día',   color: '#EF9F27', roles: ['admin','mesero','viewer'], mod: 'cierre' },
  { section: 'Análisis' },
  { id: '/conciliacion',  label: 'Conciliación',     color: '#EF9F27', roles: ['admin','viewer'], mod: 'conciliacion' },
  { id: '/rendimiento',   label: 'Rendimiento',      color: '#D4537E', roles: ['admin','viewer'], mod: 'rendimiento' },
  { id: '/tiempos',    label: 'Tiempos cocina',   color: '#EF9F27', roles: ['admin','viewer'], mod: 'tiempos' },
  { id: '/balance',    label: 'Balance General',  color: '#1D9E75', roles: ['admin'], mod: 'balance' },
  { section: 'Clientes' },
  { id: '/crm',        label: 'CRM Clientes',     color: '#D4537E', roles: ['admin','viewer'], mod: 'crm' },
  { id: '/nps',        label: 'NPS y Encuestas',  color: '#1D9E75', roles: ['admin','viewer'], mod: 'nps' },
  { section: 'Ventas' },
  { id: '/ventas',     label: 'Historial ventas', color: '#EF9F27', roles: ['admin','viewer'], mod: 'ventas' },
  { section: 'Admin' },
  { id: '/productos',  label: 'Precios',          color: '#888780', roles: ['admin','viewer'], mod: 'productos' },
  { id: '/insumos',   label: 'Insumos',           color: '#D85A30', roles: ['admin','viewer'], mod: 'insumos' },
  { id: '/almacen',   label: 'Almacén',           color: '#D85A30', roles: ['admin','mesero','viewer'], mod: 'almacen' },
  { id: '/admin',      label: 'Administración',   color: '#E24B4A', roles: ['admin'], mod: 'admin' },
  { id: '/exportar',   label: 'Exportar datos',   color: '#1D9E75', roles: ['admin'], mod: 'exportar' },
]

const TITLES = {
  '/':'Resultados','/comanda':'Comanda POS','/kds':'KDS Cocina','/gastos':'Gastos','/cierre':'Cierre del dia',
  '/produccion':'Produccion','/inventario':'Inventario','/almacen':'Almacén','/crm':'CRM Clientes','/balance':'Balance General',
  '/conciliacion':'Conciliación P&L vs Cierre','/ventas':'Historial de ventas','/tiempos':'Tiempos de cocina','/rendimiento':'Rendimiento de productos','/nps':'NPS y Encuestas',
  '/productos':'Maestro de Precios','/insumos':'Insumos y Compras','/exportar':'Exportar datos','/admin':'Administracion',
}

const ROLE_LABEL = { admin:'Administrador', mesero:'Mesero', viewer:'Solo lectura' }
const ROLE_COLOR = { admin:'#1D9E75', mesero:'#378ADD', viewer:'#888780' }

const LS_ASISTENTE_ON = 'asistente_chat_on'

export default function App({ role, user, onLogout, diasPermitidos, modulosPermitidos }) {
  const [navOpen,      setNavOpen]      = useState(false)
  const [fueraHorario, setFueraHorario] = useState(false)
  const [horarioCargado, setHorarioCargado] = useState(role !== 'mesero')
  const [asistenteOn, setAsistenteOn] = useState(() => {
    try { return localStorage.getItem(LS_ASISTENTE_ON) !== 'off' } catch { return true }
  })
  const toggleAsistente = () => {
    setAsistenteOn(v => {
      const next = !v
      try { localStorage.setItem(LS_ASISTENTE_ON, next ? 'on' : 'off') } catch {}
      return next
    })
  }

  // Verificar horario para meseros
  useEffect(() => {
    if (role !== 'mesero') return
    const verificar = async () => {
      try {
        const { data } = await sb.from('horarios').select('*').order('dia')
        if (!data || data.length === 0) { setHorarioCargado(true); return }
        const ahora = new Date()
        const dia = ahora.getDay()
        const horario = data.find(h => h.dia === dia)
        // Verificar si el usuario tiene días específicos permitidos
      if (diasPermitidos && diasPermitidos.length > 0) {
        if (!diasPermitidos.includes(dia)) { setFueraHorario(true); setHorarioCargado(true); return }
      }
      if (!horario || !horario.activo) { setFueraHorario(true); setHorarioCargado(true); return }
        const [hIni, mIni] = horario.hora_inicio.split(':').map(Number)
        const [hFin, mFin] = horario.hora_fin.split(':').map(Number)
        const minActual = ahora.getHours() * 60 + ahora.getMinutes()
        const minIni = hIni * 60 + mIni
        const minFin = hFin * 60 + mFin
        setFueraHorario(minActual < minIni || minActual > minFin)
      } catch(e) { console.error('Error horarios:', e) }
      setHorarioCargado(true)
    }
    verificar()
    const iv = setInterval(verificar, 60000) // revisar cada minuto
    return () => clearInterval(iv)
  }, [role])
  const nav = useNavigate()
  const loc = useLocation()
  const canMod = (mod) => !modulosPermitidos || modulosPermitidos.includes(mod)
  const items = ALL_NAV.filter(item => item.section || (item.roles.includes(role) && canMod(item.mod)))
  const [backupModal, setBackupModal] = useState(false)
  const [backupLoading, setBackupLoading] = useState(false)
  const [badges, setBadges] = useState({ insumos: 0, almacen: 0 })

  // Calcular badges de stock crítico cada 5 minutos
  useEffect(() => {
    if (!['admin','viewer'].includes(role)) return
    const calcBadges = async () => {
      try {
        const [{ data: ins }, movs] = await Promise.all([
          sb.from('insumos').select('stock_actual,stock_minimo').gt('stock_minimo', 0),
          fetchAllMovimientos(),
        ])
        // Insumos críticos: stock_actual <= stock_minimo
        const criticos = (ins||[]).filter(i => (i.stock_actual||0) <= (i.stock_minimo||0)).length
        // Almacén crítico: productos con stock calculado <= 3
        const stockAlm = calcStock(movs).filter(s => s.cantidad <= 3).length
        setBadges({ insumos: criticos, almacen: stockAlm })
      } catch(e) {}
    }
    calcBadges()
    const iv = setInterval(calcBadges, 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [role])

  // Mostrar recordatorio de backup los lunes (solo admin)
  useEffect(() => {
    if (role !== 'admin') return
    const hoy = new Date()
    const esLunes = hoy.getDay() === 1
    const semanaKey = `backup_${hoy.getFullYear()}_${Math.floor((hoy - new Date(hoy.getFullYear(),0,1))/604800000)}`
    const yaVisto = localStorage.getItem(semanaKey)
    if (esLunes && !yaVisto) {
      setTimeout(() => setBackupModal(true), 2000)
    }
  }, [role])

  const hacerBackup = async () => {
    setBackupLoading(true)
    try {
      const PAGE = 1000
      const fetchAll = async (tabla, cols) => {
        let all=[], idx=0, done=false
        while (!done) {
          const { data } = await sb.from(tabla).select(cols).order('fecha',{ascending:true}).range(idx,idx+PAGE-1)
          all=all.concat(data||[]); if(!data||data.length<PAGE) done=true; else idx+=PAGE
        }
        return all
      }
      const [ventas,gastos,inventario,produccion,cierres,productos] = await Promise.all([
        fetchAll('ventas','fecha,producto,categoria,canal,metodo_pago,unidades,importe,cliente'),
        fetchAll('gastos','fecha,concepto,categoria_gasto,proveedor,monto,metodo_pago,notas'),
        fetchAll('inventario_diario','fecha,producto,tipo,cantidad_inicial,cantidad_producida,cantidad_vendida,cantidad_final'),
        fetchAll('produccion','fecha,guiso,tipo,cantidad_litros,destino'),
        fetchAll('cierres_dia','fecha,sys_total,gastos_total,dif_efvo,dif_tc,cerrado_por,notas'),
        sb.from('productos').select('codigo,nombre,precio_base,precio_extra,costo_unitario,activo,familias(nombre)').then(r=>r.data||[]),
      ])
      const wb = XLSX.utils.book_new()
      const fecha = new Date().toISOString().slice(0,10)
      const totV = ventas.reduce((s,r)=>s+(r.importe||0),0)
      const totG = gastos.reduce((s,r)=>s+(r.monto||0),0)
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['Backup Chilakileando ERP',''],
        ['Generado',new Date().toLocaleString('es-MX')],
        ['Total ventas',Math.round(totV)],['Total gastos',Math.round(totG)],
        ['Utilidad',Math.round(totV-totG)],['Registros ventas',ventas.length],['Registros gastos',gastos.length],
      ]), 'Resumen')
      const hoja = (data, cols, nombre) => { if(data.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.map(r=>Object.fromEntries(cols.map(c=>[c,r[c]??r[c.split('.')[0]]??''])))), nombre) }
      hoja(ventas,['fecha','producto','categoria','canal','metodo_pago','unidades','importe','cliente'],'Ventas')
      hoja(gastos,['fecha','concepto','categoria_gasto','proveedor','monto','metodo_pago','notas'],'Gastos')
      hoja(inventario,['fecha','producto','tipo','cantidad_inicial','cantidad_producida','cantidad_vendida','cantidad_final'],'Inventario')
      hoja(produccion,['fecha','guiso','tipo','cantidad_litros','destino'],'Produccion')
      hoja(cierres,['fecha','sys_total','gastos_total','dif_efvo','dif_tc','cerrado_por','notas'],'Cierres')
      if(productos.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(productos.map(r=>({
        Codigo:r.codigo||'',Nombre:r.nombre,Familia:r.familias?.nombre||'',
        Precio:r.precio_base,'Guiso extra':r.precio_extra||0,Costo:r.costo_unitario||0
      }))), 'Precios')
      XLSX.writeFile(wb, `Chilakileando-Backup-${fecha}.xlsx`)
      // Marcar semana como completada
      const hoyD = new Date()
      const semanaKey = `backup_${hoyD.getFullYear()}_${Math.floor((hoyD - new Date(hoyD.getFullYear(),0,1))/604800000)}`
      localStorage.setItem(semanaKey, '1')
      setBackupModal(false)
    } catch(e) { console.error(e) }
    setBackupLoading(false)
  }

  // Pantalla cargando horario
  if (role === 'mesero' && !horarioCargado) {
    return (
      <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div className="spinner"/>
      </div>
    )
  }

  // Pantalla fuera de horario
  if (role === 'mesero' && fueraHorario) {
    const ahora = new Date()
    return (
      <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',
        background:'var(--bg)',flexDirection:'column',gap:16,padding:24,textAlign:'center'}}>
        <div style={{fontSize:48}}>🔒</div>
        <div style={{fontSize:20,fontWeight:700,color:'var(--text)'}}>Fuera de horario</div>
        <div style={{fontSize:14,color:'var(--text2)',maxWidth:300}}>
          El sistema no está disponible en este momento.<br/>
          Horario de atención: Martes a Domingo, 8:00 AM - 2:00 PM
        </div>
        <div style={{fontSize:12,color:'var(--text3)'}}>
          {ahora.toLocaleTimeString('es-MX', {hour:'2-digit',minute:'2-digit'})}
        </div>
        <button onClick={onLogout}
          style={{padding:'8px 20px',borderRadius:'var(--r-md)',border:'0.5px solid var(--border-md)',
            background:'transparent',cursor:'pointer',fontSize:13,color:'var(--text2)'}}>
          Cerrar sesión
        </button>
      </div>
    )
  }

  return (
    <div className="shell">
      {/* RECORDATORIO BACKUP */}
      {backupModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
          <div style={{background:'var(--surface)',borderRadius:'var(--r-lg)',padding:28,width:380,border:'0.5px solid var(--border-md)',textAlign:'center'}}>
            <div style={{fontSize:32,marginBottom:8}}>💾</div>
            <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>Backup semanal</div>
            <div style={{fontSize:13,color:'var(--text2)',marginBottom:20,lineHeight:1.6}}>
              Es lunes — hora de hacer el backup semanal del ERP. Se descargará un Excel con todos los datos del sistema.
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>{
                const hoyD=new Date()
                const semanaKey=`backup_${hoyD.getFullYear()}_${Math.floor((hoyD-new Date(hoyD.getFullYear(),0,1))/604800000)}`
                localStorage.setItem(semanaKey,'1')
                setBackupModal(false)
              }} style={{flex:1,padding:10,borderRadius:'var(--r-md)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:13,color:'var(--text2)'}}>
                Recordar después
              </button>
              <button onClick={hacerBackup} disabled={backupLoading}
                style={{flex:2,padding:10,borderRadius:'var(--r-md)',border:'none',background:'#1D9E75',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600}}>
                {backupLoading?'⏳ Generando...':'⬇ Descargar backup'}
              </button>
            </div>
          </div>
        </div>
      )}
      <aside className={`sidebar${navOpen?' open':''}`}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px 0'}}>
          <div/>
          <button onClick={()=>setNavOpen(false)}
            style={{display:'none',background:'none',border:'none',fontSize:22,cursor:'pointer',color:'var(--text2)',lineHeight:1}}
            className="hamburger">✕</button>
        </div>
        <div className="sb-logo">
          <img src="/logo.png" alt="Chilakileando" style={{width:56,height:56,borderRadius:'50%',objectFit:'cover',marginBottom:6,border:'2px solid var(--border)'}}/>
          <div className="sb-brand">Chilakileando</div>
          <div className="sb-sub">ERP en vivo</div>
        </div>
        {items.map((item,i) => {
          const badge = item.id==='/insumos' ? badges.insumos : item.id==='/almacen' ? badges.almacen : 0
          return item.section
            ? <div key={i} className="sb-section">{item.section}</div>
            : <div key={item.id}
                className={`sb-item${loc.pathname===item.id?' active':''}`}
                onClick={()=>{ nav(item.id); setNavOpen(false) }}
                style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span style={{display:'flex',alignItems:'center',gap:6}}>
                  <span className="sb-dot" style={{background:item.color}}/>
                  {item.label}
                </span>
                {badge > 0 && (
                  <span style={{background:'#E24B4A',color:'#fff',borderRadius:99,fontSize:10,fontWeight:700,
                    minWidth:18,height:18,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 5px',flexShrink:0}}>
                    {badge}
                  </span>
                )}
              </div>
        })}
        <div style={{marginTop:'auto',padding:'12px 14px',borderTop:'0.5px solid var(--border-md)'}}>
          <div style={{fontSize:11,color:'var(--text3)',marginBottom:4}}>{user.email}</div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={{fontSize:11,fontWeight:500,color:ROLE_COLOR[role]}}>{ROLE_LABEL[role]}</span>
            <button onClick={onLogout} style={{fontSize:11,color:'var(--text3)',background:'none',border:'none',cursor:'pointer'}}>Salir</button>
          </div>
          <div style={{marginTop:10,paddingTop:8,borderTop:'0.5px solid var(--border)',fontSize:9,color:'var(--text3)',lineHeight:1.6}}>
            Diseñado y desarrollado por<br/>
            <span style={{fontWeight:600,color:'var(--text2)'}}>BP&S Analytics</span><br/>
            Guillermo Reyes<br/>
            greyes@bpst.me<br/>
            www.bpst.me<br/>
            Derechos Reservados © {new Date().getFullYear()}
          </div>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <button className="hamburger" onClick={()=>setNavOpen(true)}
              style={{display:'none',background:'none',border:'none',fontSize:22,cursor:'pointer',color:'var(--text2)',lineHeight:1,padding:'0 4px'}}>
              ☰
            </button>
            <div className="tb-title">{TITLES[loc.pathname]||'Chilakileando ERP'}</div>
          </div>
          <div className="tb-right" style={{display:'flex',alignItems:'center',gap:12}}>
            {['admin','viewer'].includes(role) && <ListaComprasBell />}
            <RecordatoriosBell role={role} user={user} />
            {['admin','mesero','viewer'].includes(role) && (
              <button onClick={toggleAsistente} title={asistenteOn ? 'Apagar asistente de datos' : 'Prender asistente de datos'}
                style={{
                  display:'flex',alignItems:'center',gap:5,padding:'4px 9px',borderRadius:99,
                  border:`1px solid ${asistenteOn?'#378ADD44':'var(--border-md)'}`,
                  background:asistenteOn?'#378ADD15':'transparent',
                  color:asistenteOn?'#378ADD':'var(--text3)',
                  fontSize:11,fontWeight:600,cursor:'pointer',
                }}>
                🤖 {asistenteOn ? 'ON' : 'OFF'}
              </button>
            )}
            <span style={{fontSize:11,color:'var(--text3)'}}>
              {new Date().toLocaleDateString('es-MX',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}
            </span>
          </div>
        </div>
        <div className="content">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {canMod('resultados') && <Route path="/"            element={<Resultados />} />}
              {['admin','mesero','viewer'].includes(role) && canMod('comanda') && <Route path="/comanda"    element={<Comanda role={role}/>} />}
              {['admin','mesero','viewer'].includes(role) && canMod('kds') && <Route path="/kds" element={<KDS />} />}
              {['admin','mesero','viewer'].includes(role) && canMod('gastos') && <Route path="/gastos"     element={<Gastos role={role==='demo'?'viewer':role}/>} />}
              {['admin','mesero','viewer'].includes(role) && canMod('cierre') && <Route path="/cierre"     element={<CierreDia role={role==='demo'?'viewer':role}/>} />}
              {['admin','mesero','viewer'].includes(role) && canMod('almacen') && <Route path="/almacen" element={<Almacen role={role}/>} />}
              {['admin','viewer'].includes(role) && canMod('conciliacion') && <Route path="/conciliacion" element={<Conciliacion />} />}
              {['admin','viewer'].includes(role) && canMod('ventas') && <Route path="/ventas"     element={<Ventas role={role==='demo'?'viewer':role}/>} />}
              {['admin','viewer'].includes(role) && canMod('tiempos') && <Route path="/tiempos"       element={<Tiempos />} />}
              {['admin','viewer'].includes(role) && canMod('rendimiento') && <Route path="/rendimiento"   element={<Rendimiento />} />}
              {['admin','viewer'].includes(role) && canMod('nps') && <Route path="/nps"           element={<NPS />} />}
              {['admin','viewer'].includes(role) && canMod('productos') && <Route path="/productos"  element={<MaestroProductos role={role==='demo'?'viewer':role}/>} />}
              {['admin','viewer'].includes(role) && canMod('insumos') && <Route path="/insumos" element={<AdminInsumos />} />}
              {['admin','viewer'].includes(role) && canMod('crm') && <Route path="/crm" element={<CRM role={role}/>} />}
              {role === 'admin' && canMod('balance') && <Route path="/balance" element={<Balance />} />}
              {role==='admin' && canMod('exportar') && <Route path="/exportar" element={<Exportar />} />}
              {role==='admin' && canMod('admin') && <Route path="/admin"      element={<AdminPage user={user}/>} />}
              {role==='admin' && <Route path="/horarios"   element={<HorariosAdmin />} />}
            </Routes>
          </Suspense>
        </div>
      </div>
      {['admin','mesero','viewer'].includes(role) && asistenteOn && <AsistenteChat />}
    </div>
  )
}
