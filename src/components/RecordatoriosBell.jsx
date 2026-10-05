import React, { useState, useEffect, useRef } from 'react'
import { sb } from '../lib/supabase.js'

// Reproducir beep
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const tones = [880, 1100, 1320]
    tones.forEach((freq, i) => {
      setTimeout(() => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.value = freq
        osc.type = 'sine'
        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2)
        osc.start()
        osc.stop(ctx.currentTime + 0.2)
      }, i * 200)
    })
  } catch(e) {}
}

const calcularSiguiente = (fecha, recurrencia) => {
  const next = new Date(fecha)
  if (recurrencia === 'diaria') next.setDate(next.getDate() + 1)
  else if (recurrencia === 'semanal') next.setDate(next.getDate() + 7)
  else if (recurrencia === 'mensual') next.setMonth(next.getMonth() + 1)
  else return null
  return next.toISOString()
}

export default function RecordatoriosBell({ role, user }) {
  const [recordatorios, setRecordatorios] = useState([])
  const [abierto, setAbierto] = useState(false)
  const yaSonadosRef = useRef(new Set())

  // Cargar recordatorios pendientes
  const cargar = async () => {
    const { data } = await sb.from('recordatorios')
      .select('*')
      .eq('completado', false)
      .order('fecha_hora', { ascending: true })
    setRecordatorios(data || [])

    // Detectar nuevos recordatorios activos (fecha vencida) que no han sonado
    const ahora = new Date()
    const nuevosActivos = (data || []).filter(r => 
      new Date(r.fecha_hora) <= ahora && !yaSonadosRef.current.has(r.id)
    )
    if (nuevosActivos.length > 0) {
      beep()
      nuevosActivos.forEach(r => yaSonadosRef.current.add(r.id))
    }
  }

  useEffect(() => {
    cargar()
    // Refrescar cada 60 segundos
    const interval = setInterval(cargar, 60000)
    return () => clearInterval(interval)
  }, [])

  const marcarRealizada = async (rec) => {
    if (role !== 'admin') return
    // Marcar como completado
    await sb.from('recordatorios').update({
      completado: true,
      completado_at: new Date().toISOString(),
      completado_por: user?.id
    }).eq('id', rec.id)

    // Si tiene recurrencia, crear el siguiente
    if (rec.recurrencia) {
      const siguiente = calcularSiguiente(rec.fecha_hora, rec.recurrencia)
      if (siguiente) {
        await sb.from('recordatorios').insert({
          texto: rec.texto,
          fecha_hora: siguiente,
          recurrencia: rec.recurrencia,
          created_by: user?.id
        })
      }
    }
    cargar()
  }

  const ahora = new Date()
  const activos = recordatorios.filter(r => new Date(r.fecha_hora) <= ahora)
  const futuros = recordatorios.filter(r => new Date(r.fecha_hora) > ahora)
  const cantidadActivos = activos.length
  const colorBell = cantidadActivos > 0 ? '#E24B4A' : 'var(--text3)'

  const fmtFecha = (iso) => {
    const d = new Date(iso)
    return d.toLocaleString('es-MX', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
  }

  return (
    <div style={{position:'relative'}}>
      <button onClick={()=>setAbierto(!abierto)}
        style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:colorBell,position:'relative',padding:'2px 4px',
          animation: cantidadActivos > 0 ? 'pulse 1.5s infinite' : 'none'}}>
        🔔
        {cantidadActivos > 0 && (
          <span style={{position:'absolute',top:-2,right:-2,background:'#E24B4A',color:'#fff',
            borderRadius:'50%',width:18,height:18,fontSize:10,fontWeight:700,
            display:'flex',alignItems:'center',justifyContent:'center'}}>
            {cantidadActivos}
          </span>
        )}
      </button>

      {abierto && (
        <>
          <div onClick={()=>setAbierto(false)} 
            style={{position:'fixed',inset:0,zIndex:200}}/>
          <div style={{position:'absolute',top:32,right:0,width:340,maxHeight:480,overflowY:'auto',
            background:'var(--surface)',border:'0.5px solid var(--border-md)',borderRadius:'var(--r-md)',
            boxShadow:'0 8px 24px rgba(0,0,0,0.15)',zIndex:201,padding:12}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:10,paddingBottom:8,borderBottom:'1px solid var(--border-md)'}}>
              Recordatorios pendientes
            </div>

            {/* Activos (vencidos) */}
            {activos.length > 0 && (
              <div style={{marginBottom:14}}>
                <div style={{fontSize:10,fontWeight:700,color:'#E24B4A',textTransform:'uppercase',marginBottom:6}}>
                  ⚠️ Pendientes ({activos.length})
                </div>
                {activos.map(r => (
                  <div key={r.id} style={{padding:10,background:'#FCEBEB',borderRadius:'var(--r-sm)',
                    marginBottom:6,border:'1px solid #E24B4A'}}>
                    <div style={{fontSize:12,fontWeight:500,color:'#222',marginBottom:4}}>{r.texto}</div>
                    <div style={{fontSize:10,color:'#A32D2D',marginBottom:6}}>
                      📅 {fmtFecha(r.fecha_hora)}
                      {r.recurrencia && <span style={{marginLeft:6}}>🔁 {r.recurrencia}</span>}
                    </div>
                    {role === 'admin' && (
                      <button onClick={()=>marcarRealizada(r)}
                        style={{padding:'4px 10px',borderRadius:'var(--r-sm)',background:'#1D9E75',
                          color:'#fff',border:'none',cursor:'pointer',fontSize:11,fontWeight:600}}>
                        ✓ Marcar realizada
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Futuros */}
            {futuros.length > 0 && (
              <div>
                <div style={{fontSize:10,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',marginBottom:6}}>
                  Próximos ({futuros.length})
                </div>
                {futuros.slice(0, 10).map(r => (
                  <div key={r.id} style={{padding:8,background:'var(--bg)',borderRadius:'var(--r-sm)',
                    marginBottom:5,border:'1px solid var(--border-md)'}}>
                    <div style={{fontSize:11,fontWeight:500,marginBottom:3}}>{r.texto}</div>
                    <div style={{fontSize:10,color:'var(--text3)'}}>
                      📅 {fmtFecha(r.fecha_hora)}
                      {r.recurrencia && <span style={{marginLeft:6}}>🔁 {r.recurrencia}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {recordatorios.length === 0 && (
              <div style={{textAlign:'center',padding:20,fontSize:11,color:'var(--text3)'}}>
                No hay recordatorios pendientes
              </div>
            )}

            {role === 'admin' && (
              <div style={{borderTop:'1px solid var(--border-md)',marginTop:10,paddingTop:8,fontSize:10,color:'var(--text3)',textAlign:'center'}}>
                Crea nuevos desde Administración → Recordatorios
              </div>
            )}
          </div>
        </>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
      `}</style>
    </div>
  )
}
