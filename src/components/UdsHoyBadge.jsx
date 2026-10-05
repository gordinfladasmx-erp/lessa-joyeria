import React, { useState, useEffect, useCallback } from 'react'
import { sb } from '../lib/supabase.js'
import { fetchProyeccionDia } from '../lib/analytics.js'

const fmtM  = v => '$' + Math.round(v || 0).toLocaleString('es-MX')
const fmtK  = v => Math.abs(v) >= 1000
  ? (v < 0 ? '-$' : '$') + (Math.abs(v) / 1000).toFixed(1) + 'k'
  : fmtM(v)
const hoy   = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

const DIAS      = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const DIAS_FULL = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
const fmtFechaCorta = iso => {
  const d = new Date(iso + 'T12:00')
  return `${DIAS[d.getDay()]} ${d.getDate()} ${['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][d.getMonth()]}`
}

function prevSameDays(n = 3) {
  const base = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(base)
    d.setDate(base.getDate() - 7 * (i + 1))
    return d.toISOString().slice(0, 10)
  })
}

const fmtISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

// Fecha de referencia (hoy + offset dias)
const fechaConOffset = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return d }

// Misma fecha (mes/dia) N anios atras de una fecha de referencia dada
const mismaFechaAnioAtras = (fechaRef, n) =>
  new Date(fechaRef.getFullYear() - n, fechaRef.getMonth(), fechaRef.getDate())

const LS_POS = 'udsHoyBadge_pos' // {right, bottom} en px, guardado por dispositivo
const LS_META_CELEBRADA = 'udsHoyBadge_metaCelebrada' // fecha (YYYY-MM-DD) en que ya se mostro el popup

export default function UdsHoyBadge({ floating = true }) {
  const [uds,     setUds]     = useState(0)
  const [total,   setTotal]   = useState(0)
  const [hist,    setHist]    = useState([])
  const [proy,    setProy]    = useState([])   // proyecciones: hoy + mañana + pasado
  const [pulse,   setPulse]   = useState(false)
  const [expand,  setExpand]  = useState(false)
  const [loadingP,setLoadingP]= useState(false)
  const [pagos,   setPagos]   = useState(null) // {efvo,tarj,plat} en %
  const [mostrarMeta, setMostrarMeta] = useState(false)

  // ── Arrastrar el widget flotante ──
  const [pos, setPos] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_POS)) || { right:18, bottom:18 } } catch { return { right:18, bottom:18 } }
  })
  const dragRef = React.useRef({ dragging:false, moved:false, startX:0, startY:0, startRight:18, startBottom:18 })

  const clampPos = (right, bottom) => ({
    right:  Math.min(Math.max(right,  4), window.innerWidth  - 40),
    bottom: Math.min(Math.max(bottom, 4), window.innerHeight - 40),
  })

  const onDragStart = (e) => {
    const p = e.touches ? e.touches[0] : e
    dragRef.current = { dragging:true, moved:false, startX:p.clientX, startY:p.clientY, startRight:pos.right, startBottom:pos.bottom }
  }
  const onDragMove = (e) => {
    if (!dragRef.current.dragging) return
    const p = e.touches ? e.touches[0] : e
    const dx = p.clientX - dragRef.current.startX
    const dy = p.clientY - dragRef.current.startY
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragRef.current.moved = true
    if (dragRef.current.moved) {
      e.preventDefault()
      setPos(clampPos(dragRef.current.startRight - dx, dragRef.current.startBottom - dy))
    }
  }
  const onDragEnd = () => {
    if (dragRef.current.dragging && dragRef.current.moved) {
      setPos(p => { try { localStorage.setItem(LS_POS, JSON.stringify(p)) } catch {} ; return p })
    }
    dragRef.current.dragging = false
    // Dejar "moved" en true un instante mas para que el click que sigue al mouseup
    // (si lo hay) se suprima, luego resetear para no bloquear taps futuros del boton
    setTimeout(() => { dragRef.current.moved = false }, 0)
  }
  useEffect(() => {
    window.addEventListener('mousemove', onDragMove)
    window.addEventListener('mouseup', onDragEnd)
    window.addEventListener('touchmove', onDragMove, { passive:false })
    window.addEventListener('touchend', onDragEnd)
    return () => {
      window.removeEventListener('mousemove', onDragMove)
      window.removeEventListener('mouseup', onDragEnd)
      window.removeEventListener('touchmove', onDragMove)
      window.removeEventListener('touchend', onDragEnd)
    }
  }, [pos])

  const PLATAFORMAS = ['Uber','Uber Chilakiles','DiDi','DiDi Chilakiles','Rappi','Ola']

  const load = useCallback(async () => {
    const today = hoy()
    const prev  = prevSameDays(3)
    const [todayRes, ...prevRes] = await Promise.all([
      sb.from('ventas').select('unidades,importe,metodo_pago,canal').eq('fecha', today),
      ...prev.map(f => sb.from('ventas').select('unidades,importe').eq('fecha', f)),
    ])
    const agg = data => ({
      uds:   Math.round((data||[]).reduce((s,v) => s + (v.unidades||0), 0)),
      total: Math.round((data||[]).reduce((s,v) => s + (parseFloat(v.importe)||0), 0)),
    })
    const t = agg(todayRes.data)
    setUds(t.uds)
    setTotal(t.total)
    setHist(prev.map((f, i) => ({ fecha: f, ...agg(prevRes[i].data) })))

    // Breakdown por método de pago de hoy
    const rows = todayRes.data || []
    const totHoy = rows.reduce((s,v)=>s+(parseFloat(v.importe)||0),0)
    if (totHoy > 0) {
      let efvo=0, tarj=0, plat=0
      rows.forEach(v => {
        const imp = parseFloat(v.importe)||0
        const canal = v.canal||''; const mp = v.metodo_pago||''
        if (PLATAFORMAS.some(p=>canal.includes(p))) plat+=imp
        else if (mp==='Tarjeta'||mp==='Transferencia'||canal==='Tarjeta'||canal==='Transferencia') tarj+=imp
        else efvo+=imp
      })
      setPagos({
        efvo: Math.round(efvo/totHoy*100),
        tarj: Math.round(tarj/totHoy*100),
        plat: Math.round(plat/totHoy*100),
      })
    } else {
      setPagos(null)
    }

    setPulse(true)
    setTimeout(() => setPulse(false), 600)
  }, [])

  // Carga la proyección una vez (no necesita actualizarse cada minuto)
  const loadProy = useCallback(async () => {
    setLoadingP(true)
    try {
      const p = await fetchProyeccionDia(3)  // hoy + mañana + pasado mañana
      setProy(p)
    } catch(e) { console.warn('fetchProyeccionDia', e) }
    setLoadingP(false)
  }, [])

  // Misma fecha exacta de los 3 años anteriores — fecha de referencia elegible con ◀ ▶
  const [refOffset, setRefOffset] = useState(0) // dias respecto a hoy
  const fechaRef    = fechaConOffset(refOffset)
  const fechaRefISO = fmtISO(fechaRef)
  const [refActual, setRefActual] = useState(null) // {uds,total} del año actual en fechaRef
  const [histAnios, setHistAnios] = useState([])
  const loadHistAnios = useCallback(async () => {
    const fechas = [0, 1, 2, 3].map(n => {
      const d = mismaFechaAnioAtras(fechaRef, n)
      return { anio: d.getFullYear(), fecha: fmtISO(d) }
    })
    const results = await Promise.all(
      fechas.map(f => sb.from('ventas').select('unidades,importe').eq('fecha', f.fecha))
    )
    const datos = fechas.map((f, i) => {
      const rows = results[i].data || []
      return {
        anio: f.anio,
        fecha: f.fecha,
        uds:   Math.round(rows.reduce((s, v) => s + (v.unidades || 0), 0)),
        total: Math.round(rows.reduce((s, v) => s + (parseFloat(v.importe) || 0), 0)),
      }
    })
    setRefActual(datos[0])
    setHistAnios(datos.slice(1))
  }, [fechaRefISO])

  useEffect(() => {
    load()
    loadProy()
    const iv = setInterval(load, 60000)
    const chName = `uds-hoy-badge-${floating ? 'float' : 'inline'}`
    const ch = sb.channel(chName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ventas' }, load)
      .subscribe()
    return () => { clearInterval(iv); sb.removeChannel(ch) }
  }, [load, loadProy])

  useEffect(() => { loadHistAnios() }, [loadHistAnios])

  const pct      = (base, ref) => ref > 0 ? Math.round((base - ref) / ref * 100) : null
  const trend    = p => p === null ? '—' : p > 0 ? `↑ +${p}%` : p < 0 ? `↓ ${p}%` : '= 0%'
  const trendClr = p => p === null ? 'var(--text3)' : p > 0 ? '#1D9E75' : p < 0 ? '#E24B4A' : 'var(--text3)'

  // Proyección de hoy (primer elemento de proy)
  const proyHoy = proy[0]?.proj
  const proyPct = proyHoy && proyHoy.importe > 0
    ? Math.min(Math.round(total / proyHoy.importe * 100), 100)
    : null

  // Popup de celebracion al llegar a la meta de unidades del dia — solo una vez por dia
  useEffect(() => {
    if (!floating) return
    const metaUds = proyHoy?.unidades
    if (!metaUds || metaUds <= 0) return
    if (uds < metaUds) return
    let yaCelebrada
    try { yaCelebrada = localStorage.getItem(LS_META_CELEBRADA) } catch { yaCelebrada = null }
    if (yaCelebrada === hoy()) return
    setMostrarMeta(true)
    try { localStorage.setItem(LS_META_CELEBRADA, hoy()) } catch {}
  }, [uds, proyHoy, floating])

  /* ── INLINE (KDS) ───────────────────────────────── */
  if (!floating) {
    return (
      <div className="mc" title="Unidades y ventas acumuladas de hoy">
        <div className="mc-label">🍽️ Uds hoy</div>
        <div className="mc-value" style={{
          color: '#1D9E75', fontSize: 28,
          transition: 'transform 0.3s ease',
          transform: pulse ? 'scale(1.1)' : 'scale(1)',
        }}>
          {uds}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#378ADD', marginTop: 2 }}>
          {fmtM(total)}
        </div>
        {pagos && (
          <div style={{ display:'flex', gap:4, marginTop:4, flexWrap:'wrap', justifyContent:'center' }}>
            {pagos.efvo > 0 && <span style={{fontSize:9,fontWeight:700,color:'#1D9E75',background:'#1D9E7515',borderRadius:99,padding:'1px 5px'}}>💵{pagos.efvo}%</span>}
            {pagos.tarj > 0 && <span style={{fontSize:9,fontWeight:700,color:'#378ADD',background:'#378ADD15',borderRadius:99,padding:'1px 5px'}}>💳{pagos.tarj}%</span>}
            {pagos.plat > 0 && <span style={{fontSize:9,fontWeight:700,color:'#EF9F27',background:'#EF9F2715',borderRadius:99,padding:'1px 5px'}}>📱{pagos.plat}%</span>}
          </div>
        )}
        {histAnios.length > 0 && (
          <div style={{ marginTop:6, paddingTop:5, borderTop:'0.5px solid var(--border)' }}>
            <div style={{ fontSize:8, color:'var(--text3)', fontWeight:700, textTransform:'uppercase', letterSpacing:0.4, marginBottom:2 }}>
              Misma fecha · años ant.
            </div>
            <div style={{ display:'flex', gap:6, justifyContent:'center' }}>
              {histAnios.map(h => (
                <div key={h.anio} style={{ textAlign:'center' }}>
                  <div style={{ fontSize:8, color:'var(--text3)', fontWeight:600 }}>{h.anio}</div>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--text1)' }}>{h.uds}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ── FLOTANTE (Comanda) ─────────────────────────── */
  const promedio = hist.length
    ? Math.round(hist.reduce((s, h) => s + h.uds, 0) / hist.length)
    : null
  const promedioTotal = hist.length
    ? Math.round(hist.reduce((s, h) => s + h.total, 0) / hist.length)
    : null

  return (
    <>
      {/* ── POPUP META DEL DIA ALCANZADA ── */}
      {mostrarMeta && (
        <div style={{
          position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,0.6)',
          display:'flex', alignItems:'center', justifyContent:'center', padding:20,
        }} onClick={()=>setMostrarMeta(false)}>
          <div onClick={e=>e.stopPropagation()} style={{
            background:'var(--surface)', borderRadius:'var(--r-lg)', padding:'36px 32px',
            width:360, maxWidth:'100%', textAlign:'center',
            border:'2px solid #1D9E75', boxShadow:'0 12px 48px rgba(0,0,0,0.35)',
          }}>
            <img src="/logo.png" alt="Chilakileando" style={{ width:90, height:90, borderRadius:'50%', objectFit:'cover', marginBottom:16, border:'3px solid #1D9E75' }}/>
            <div style={{ fontSize:26, fontWeight:800, color:'#1D9E75', marginBottom:10, lineHeight:1.2 }}>
              FELICIDADES!!!!
            </div>
            <div style={{ fontSize:14, fontWeight:600, color:'var(--text1)', marginBottom:4 }}>
              Por hoy vamos bien, sigamos adelante!!!!
            </div>
            <div style={{ fontSize:12, color:'var(--text3)', marginTop:10 }}>
              Meta de {proyHoy?.unidades} uds alcanzada · llevas {uds} uds hoy
            </div>
            <button onClick={()=>setMostrarMeta(false)} style={{
              marginTop:18, padding:'9px 22px', borderRadius:'var(--r-md)', border:'none',
              background:'#1D9E75', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer',
            }}>
              Vamos por más!
            </button>
          </div>
        </div>
      )}

    <div style={{
      position:   'fixed',
      bottom:     pos.bottom,
      right:      pos.right,
      zIndex:     90,
      display:    'flex',
      alignItems: 'flex-end',
      gap:        10,
      pointerEvents: 'none', // el contenedor NO capta clics — solo sus hijos visibles (evita bloquear la UI de atras con su bounding box invisible)
    }}>

      {/* ── PANEL EXPANDIDO — aparece a la IZQUIERDA ── */}
      <div style={{
        background:    'var(--surface)',
        border:        '1.5px solid #1D9E7533',
        borderRadius:  'var(--r-lg)',
        boxShadow:     '0 6px 24px rgba(0,0,0,0.14)',
        overflow:      'hidden',
        maxWidth:      expand ? 300 : 0,
        opacity:       expand ? 1 : 0,
        transition:    'max-width 0.3s ease, opacity 0.25s ease',
        pointerEvents: expand ? 'auto' : 'none',
        alignSelf:     'flex-end',
        minWidth:      0,
        flexShrink:    0,
      }}>
        <div style={{ width: 288, padding: '12px 14px' }}>

          {/* ── SECCIÓN: PROYECCIONES ── */}
          <div style={{
            fontSize: 10, fontWeight: 700, color: 'var(--text3)',
            textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
          }}>
            Proyección histórica
          </div>

          {loadingP ? (
            <div style={{fontSize:10,color:'var(--text3)',paddingBottom:8}}>Calculando…</div>
          ) : proy.length > 0 ? (
            <div style={{marginBottom:12}}>
              {proy.map((p, i) => {
                const esHoy    = i === 0
                const label    = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : 'Pasado'
                const dowLabel = DIAS_FULL[p.dow]
                const pr       = p.proj
                // Para hoy: comparar con acumulado actual
                const avance   = esHoy && pr ? Math.min(Math.round(total / pr.importe * 100), 999) : null
                return (
                  <div key={p.fecha} style={{
                    padding:      '7px 10px',
                    borderRadius: 'var(--r-md)',
                    background:   esHoy ? '#1D9E7511' : 'var(--bg)',
                    border:       `0.5px solid ${esHoy ? '#1D9E7533' : 'var(--border)'}`,
                    marginBottom: 5,
                  }}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom: pr ? 4 : 0}}>
                      <div style={{display:'flex',gap:5,alignItems:'center'}}>
                        <span style={{fontSize:11,fontWeight:700,color:esHoy?'#1D9E75':'var(--text2)'}}>
                          {label}
                        </span>
                        <span style={{fontSize:9,color:'var(--text3)',fontWeight:600}}>
                          {dowLabel} {fmtFechaCorta(p.fecha).split(' ').slice(1).join(' ')}
                        </span>
                      </div>
                      {pr && (
                        <div style={{display:'flex',gap:8,alignItems:'center'}}>
                          <span style={{fontSize:12,fontWeight:700,color:esHoy?'#1D9E75':'var(--text2)'}}>
                            {pr.unidades} uds
                          </span>
                          <span style={{fontSize:11,fontWeight:700,color:'#378ADD'}}>
                            {fmtK(pr.importe)}
                          </span>
                        </div>
                      )}
                      {!pr && <span style={{fontSize:10,color:'var(--text3)'}}>sin datos</span>}
                    </div>
                    {/* Barra de progreso solo para hoy */}
                    {esHoy && pr && avance !== null && (
                      <div style={{display:'flex',alignItems:'center',gap:6,marginTop:3}}>
                        <div style={{flex:1,height:4,borderRadius:99,background:'var(--border)',overflow:'hidden'}}>
                          <div style={{
                            width: Math.min(avance,100)+'%', height:'100%',
                            background: avance>=100?'#378ADD':'#1D9E75',
                            borderRadius:99, transition:'width 0.4s ease',
                          }}/>
                        </div>
                        <span style={{fontSize:9,color:avance>=100?'#378ADD':'#1D9E75',fontWeight:700,minWidth:30}}>
                          {avance}%
                        </span>
                      </div>
                    )}
                    {esHoy && pr && (
                      <div style={{marginTop:2,fontSize:9,color:'var(--text3)'}}>
                        Actual: {uds} uds · {fmtK(total)}
                        {pr.cagrFactor !== 0 && <> · CAGR: {pr.cagrFactor>0?'+':''}{pr.cagrFactor}%</>}
                      </div>
                    )}
                    {esHoy && pagos && (
                      <div style={{display:'flex',gap:5,marginTop:4,flexWrap:'wrap'}}>
                        {pagos.efvo > 0 && <span style={{fontSize:9,fontWeight:700,color:'#1D9E75',background:'#1D9E7515',borderRadius:99,padding:'1px 6px'}}>💵 Efvo {pagos.efvo}%</span>}
                        {pagos.tarj > 0 && <span style={{fontSize:9,fontWeight:700,color:'#378ADD',background:'#378ADD15',borderRadius:99,padding:'1px 6px'}}>💳 Tarj {pagos.tarj}%</span>}
                        {pagos.plat > 0 && <span style={{fontSize:9,fontWeight:700,color:'#EF9F27',background:'#EF9F2715',borderRadius:99,padding:'1px 6px'}}>📱 Plat {pagos.plat}%</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : null}

          {/* ── SECCIÓN: HISTORIAL MISMO DÍA ── */}
          <div style={{
            fontSize: 10, fontWeight: 700, color: 'var(--text3)',
            textTransform: 'uppercase', letterSpacing: 0.5,
            marginBottom: 8, marginTop: 4,
            borderTop: '0.5px solid var(--border)', paddingTop: 10,
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span>Mismo día · sem. anteriores</span>
            <span style={{color:'#1D9E75',fontSize:9}}>{DIAS[new Date().getDay()]}</span>
          </div>

          {hist.map((h, i) => {
            const p = pct(uds, h.uds)
            return (
              <div key={h.fecha} style={{
                display:      'flex',
                alignItems:   'center',
                gap:          8,
                padding:      '5px 0',
                borderBottom: i < hist.length - 1 ? '0.5px solid var(--border)' : 'none',
              }}>
                <div style={{
                  fontSize: 9, fontWeight: 700, color: 'var(--text3)',
                  minWidth: 22, textAlign: 'center',
                  background: 'var(--bg)', borderRadius: 4, padding: '2px 4px',
                }}>
                  S−{i + 1}
                </div>
                <div style={{flex:1, fontSize:10, color:'var(--text2)'}}>
                  {fmtFechaCorta(h.fecha)}
                </div>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text1)',minWidth:28,textAlign:'right'}}>
                  {h.uds}
                </div>
                <div style={{fontSize:10,fontWeight:600,color:'#378ADD',minWidth:40,textAlign:'right'}}>
                  {fmtK(h.total)}
                </div>
                <div style={{fontSize:10,fontWeight:700,color:trendClr(p),minWidth:44,textAlign:'right'}}>
                  {trend(p)}
                </div>
              </div>
            )
          })}

          {/* Promedio */}
          {promedio !== null && (
            <div style={{
              marginTop: 8, paddingTop: 7,
              borderTop: '0.5px solid var(--border-md)',
              display: 'flex', justifyContent: 'space-between',
              fontSize: 10, color: 'var(--text3)',
            }}>
              <span>Prom. 3 semanas</span>
              <div style={{display:'flex',gap:8}}>
                <span style={{fontWeight:700,color:'var(--text2)'}}>{promedio} uds</span>
                <span style={{fontWeight:700,color:'#378ADD'}}>{fmtK(promedioTotal)}</span>
              </div>
            </div>
          )}

          {/* ── SECCIÓN: MISMA FECHA, AÑOS ANTERIORES ── */}
          <div style={{ marginTop:8, paddingTop:10, borderTop:'0.5px solid var(--border)' }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: 'var(--text3)',
              textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
            }}>
              Misma fecha · años anteriores
            </div>

            {/* Selector de fecha de referencia */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginBottom:8 }}>
              <button onClick={()=>setRefOffset(o=>o-1)}
                style={{ width:24, height:24, borderRadius:'50%', border:'1px solid var(--border-md)', background:'var(--bg)', color:'var(--text2)', cursor:'pointer', fontSize:13, fontWeight:700, lineHeight:1 }}>
                −
              </button>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--text1)', minWidth:90, textAlign:'center' }}>
                {fmtFechaCorta(fechaRefISO)}
                {refOffset !== 0 && (
                  <button onClick={()=>setRefOffset(0)} title="Volver a hoy"
                    style={{ display:'block', margin:'2px auto 0', border:'none', background:'transparent', color:'#378ADD', fontSize:9, cursor:'pointer', padding:0 }}>
                    volver a hoy
                  </button>
                )}
              </div>
              <button onClick={()=>setRefOffset(o=>o+1)}
                style={{ width:24, height:24, borderRadius:'50%', border:'1px solid var(--border-md)', background:'var(--bg)', color:'var(--text2)', cursor:'pointer', fontSize:13, fontWeight:700, lineHeight:1 }}>
                +
              </button>
            </div>

            {refActual && (
              <div style={{ fontSize:9, color:'var(--text3)', textAlign:'center', marginBottom:6 }}>
                Este año ({refActual.anio}): <strong style={{color:'var(--text2)'}}>{refActual.uds} uds</strong> · {fmtK(refActual.total)}
              </div>
            )}

            {histAnios.map(h => {
              const p = refActual ? pct(refActual.uds, h.uds) : null
              return (
                <div key={h.anio} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
                }}>
                  <div style={{
                    fontSize: 9, fontWeight: 700, color: '#1D9E75',
                    minWidth: 32, textAlign: 'center',
                    background: '#1D9E7515', borderRadius: 4, padding: '2px 4px',
                  }}>
                    {h.anio}
                  </div>
                  <div style={{flex:1, fontSize:10, color:'var(--text2)'}}>
                    {fmtFechaCorta(h.fecha)}
                  </div>
                  <div style={{fontSize:11,fontWeight:700,color:'var(--text1)',minWidth:28,textAlign:'right'}}>
                    {h.uds}
                  </div>
                  <div style={{fontSize:10,fontWeight:600,color:'#378ADD',minWidth:40,textAlign:'right'}}>
                    {fmtK(h.total)}
                  </div>
                  <div style={{fontSize:10,fontWeight:700,color:trendClr(p),minWidth:44,textAlign:'right'}}>
                    {trend(p)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── BADGE PRINCIPAL — siempre visible ── */}
      <div style={{
        background:   'var(--surface)',
        border:       `1.5px solid ${pulse ? '#1D9E75' : '#1D9E7544'}`,
        borderRadius: 'var(--r-lg)',
        boxShadow:    '0 4px 20px rgba(0,0,0,0.15)',
        overflow:     'hidden',
        transition:   'border-color 0.4s ease',
        minWidth:     100,
        flexShrink:   0,
        pointerEvents:'auto',
      }}>
        {/* Mango de arrastre */}
        <div
          onMouseDown={onDragStart}
          onTouchStart={onDragStart}
          title="Arrastrar para mover"
          style={{
            textAlign:'center', fontSize:11, color:'var(--text3)', cursor:'grab',
            padding:'3px 0 0', userSelect:'none', touchAction:'none', lineHeight:1,
          }}>
          ⠿
        </div>
        {/* Datos de hoy */}
        <div style={{padding:'6px 14px 10px', textAlign:'center'}}>
          <div style={{fontSize:18,lineHeight:1,marginBottom:4}}>🍽️</div>
          <div style={{
            fontSize: 26, fontWeight: 800, color: '#1D9E75', lineHeight: 1,
            transition: 'transform 0.3s ease',
            transform: pulse ? 'scale(1.15)' : 'scale(1)',
          }}>
            {uds}
          </div>
          <div style={{
            fontSize: 9, color: 'var(--text3)', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 3,
          }}>
            uds hoy
          </div>
          <div style={{fontSize:12,fontWeight:700,color:'#378ADD',marginTop:4}}>
            {fmtK(total)}
          </div>
          {/* Mini barra de progreso vs proyección */}
          {proyPct !== null && (
            <div style={{marginTop:6}}>
              <div style={{height:3,borderRadius:99,background:'var(--border)',overflow:'hidden'}}>
                <div style={{
                  width: Math.min(proyPct,100)+'%', height:'100%',
                  background: proyPct>=100?'#378ADD':'#1D9E75', borderRadius:99,
                }}/>
              </div>
              <div style={{fontSize:9,color:'var(--text3)',marginTop:2}}>
                {proyPct}% proy.
              </div>
            </div>
          )}
        </div>

        {/* Botón toggle */}
        <button
          onClick={() => { if (!dragRef.current.moved) setExpand(e => !e) }}
          style={{
            width: '100%', padding: '5px 0',
            border: 'none', borderTop: '0.5px solid var(--border-md)',
            background: expand ? '#1D9E7511' : 'transparent',
            cursor: 'pointer', fontSize: 10, fontWeight: 600,
            color: expand ? '#1D9E75' : 'var(--text3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 4, transition: 'background 0.2s',
          }}
        >
          {expand ? '✕ cerrar' : '📅 ver proyección'}
        </button>
      </div>
    </div>
    </>
  )
}
