import React, { useState, useEffect, useCallback } from 'react'
import { sb } from '../lib/supabase.js'
import UdsHoyBadge from '../components/UdsHoyBadge.jsx'
import { descontarInsumos } from '../lib/insumos.js'
import { descontarAlmacen } from '../lib/almacen.js'

const ESTADO_COLOR = {
  abierta: '#378ADD', en_cocina: '#EF9F27', en_preparacion: '#E8883A', lista: '#1D9E75',
  pendiente_pago: '#7F77DD', cobrada: '#888'
}
const ESTADO_LABEL = {
  abierta: 'Abierta', en_cocina: '🔥 En cocina', en_preparacion: '🍳 En preparación',
  lista: '✓ Lista', pendiente_pago: '💳 Pago pendiente', cobrada: 'Cobrada'
}
const TIPO_COLOR = { mesa: '#378ADD', llevar: '#EF9F27', plataforma: '#7F77DD' }
const TIPO_LABEL = { mesa: '🪑 Mesa', llevar: '🛍 Llevar', plataforma: '🛵 Plataforma' }

const fmtM = v => '$' + Math.round(v || 0).toLocaleString('es-MX')

// ── Escalas de texto para KDS ─────────────────────────────────
const ESCALAS = {
  normal: { nombre:16, chip:12, chipPad:'3px 10px', chipGap:5,  qty:14, header:13, tiempo:13, accion:13, cardPad:14, itemGap:10 },
  grande: { nombre:20, chip:15, chipPad:'4px 13px', chipGap:6,  qty:18, header:15, tiempo:15, accion:15, cardPad:18, itemGap:14 },
  extra:  { nombre:26, chip:18, chipPad:'5px 16px', chipGap:8,  qty:22, header:18, tiempo:18, accion:18, cardPad:22, itemGap:18 },
}

// ── Chip individual ────────────────────────────────────────────
function Chip({ label, bg, color, bold, italic, border, sz }) {
  const fontSize = sz?.chip ?? 12
  const padding  = sz?.chipPad ?? '3px 9px'
  return (
    <span style={{
      display: 'inline-block', fontSize, padding, borderRadius: 99,
      background: bg, color,
      fontWeight: bold ? 800 : 600,
      fontStyle: italic ? 'italic' : 'normal',
      border: `1.5px solid ${border || color + '66'}`,
      lineHeight: 1.3, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

// ── Descripción visual de un ítem ─────────────────────────────
function DescChips({ item, sz }) {
  const cfg = item._config
  const hasCfg = cfg && (
    cfg.guiso1?.length || cfg.guisoX?.length ||
    cfg.salsas?.length || cfg.tops?.length   ||
    cfg.extras?.length || cfg.notas          ||
    cfg.sabor || cfg.leche || cfg.mediaOrden || cfg.cafeOlla ||
    cfg.natural !== undefined
  )
  const gap = sz?.chipGap ?? 5

  if (hasCfg) return (
    <div style={{ display:'flex', flexWrap:'wrap', gap, marginTop: gap }}>
      {cfg.natural !== undefined && (
        cfg.natural
          ? <Chip sz={sz} label="🌾 NATURAL sin totopos" bg="#EAF3DE" color="#3B6D11" bold border="#1D9E7599"/>
          : <Chip sz={sz} label="🫓 CROCANTE con totopos" bg="#EBF2FC" color="#185FA5" bold border="#378ADD99"/>
      )}
      {cfg.mediaOrden && <Chip sz={sz} label="½ orden" bg="#EBF2FC" color="#185FA5"/>}
      {cfg.cafeOlla   && <Chip sz={sz} label="☕ Café" bg="#EAF3DE" color="#3B6D11"/>}
      {cfg.guiso1?.map(g => <Chip sz={sz} key={g} label={g} bg="#FFF0EB" color="#C24A1A" border="#D85A3066"/>)}
      {cfg.guisoX?.map(g => <Chip sz={sz} key={g} label={`${g} ✦`} bg="#FFF0EB" color="#C24A1A" bold border="#D85A3088"/>)}
      {cfg.salsas?.map(s => <Chip sz={sz} key={s} label={s} bg="#FCEBEB" color="#A32D2D" border="#E24B4A66"/>)}
      {cfg.tops?.map(t   => <Chip sz={sz} key={t} label={t} bg="#EAF3DE" color="#3B6D11" border="#1D9E7566"/>)}
      {cfg.sabor && <Chip sz={sz} label={cfg.sabor} bg="#EBF2FC" color="#185FA5"/>}
      {cfg.leche && <Chip sz={sz} label={cfg.leche} bg="#EBF2FC" color="#185FA5"/>}
      {cfg.extras?.map(e => <Chip sz={sz} key={e.nombre} label={`+ ${e.nombre} $${e.monto}`} bg="#EEEDFE" color="#534AB7" bold/>)}
      {cfg.notas && <Chip sz={sz} label={`📝 ${cfg.notas}`} bg="#FFF9E6" color="#8A5A00" italic border="#EF9F2766"/>}
    </div>
  )

  if (item.desc) return (
    <div style={{ display:'flex', flexWrap:'wrap', gap, marginTop: gap }}>
      {item.desc.split(' | ').filter(Boolean).map((part, i) => (
        <Chip sz={sz} key={i} label={part} bg="var(--bg)" color="var(--text2)" border="var(--border-md)"/>
      ))}
    </div>
  )
  return null
}

function tiempoTranscurrido(fecha) {
  if (!fecha) return ''
  const mins = Math.floor((Date.now() - new Date(fecha)) / 60000)
  if (mins < 1) return 'Ahora'
  if (mins < 60) return mins + ' min'
  return Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm'
}

function colorTiempo(fecha, estado) {
  if (!fecha || estado === 'lista' || estado === 'cobrada') return '#1D9E75'
  const mins = Math.floor((Date.now() - new Date(fecha)) / 60000)
  if (mins > 20) return '#E24B4A'
  if (mins > 12) return '#EF9F27'
  return '#1D9E75'
}

function ComandaCard({ comanda, onCambiarEstado, sz }) {
  const items = comanda.items || []
  const total = items.reduce((s, i) => s + (i.subtotal || 0), 0)
  const tiempoRef = comanda.enviado_cocina_at || comanda.created_at
  const ctColor = colorTiempo(tiempoRef, comanda.estado)
  const s = sz || ESCALAS.normal

  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 'var(--r-lg)',
      border: `3px solid ${ESTADO_COLOR[comanda.estado] || '#ccc'}`,
      padding: s.cardPad, marginBottom: 12,
    }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: s.cardPad * 0.7 }}>
        <div>
          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:4 }}>
            <span style={{
              fontSize: s.header, fontWeight: 800,
              color: TIPO_COLOR[comanda.tipo] || '#888',
              background: (TIPO_COLOR[comanda.tipo] || '#888') + '22',
              padding: '3px 10px', borderRadius: 99,
            }}>
              {TIPO_LABEL[comanda.tipo] || comanda.tipo}
              {comanda.tipo === 'mesa' && comanda.mesa ? ` ${comanda.mesa}` : ''}
            </span>
            {comanda.cliente && (
              <span style={{ fontSize: s.header - 2, color:'var(--text2)', fontWeight:600 }}>{comanda.cliente}</span>
            )}
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <div style={{ fontSize: s.header - 3, color:'var(--text3)', fontWeight:600 }}>
              #{comanda.id?.slice(-4).toUpperCase()}
            </div>
            {comanda.tomada_por && (
              <div style={{ fontSize: s.header - 3, fontWeight:700, color:'#378499', background:'#37849918', padding:'1px 8px', borderRadius:99 }}>
                👤 {comanda.tomada_por}
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize: s.tiempo, fontWeight:800, color: ctColor }}>
            ⏱ {tiempoTranscurrido(tiempoRef)}
          </div>
          <div style={{ fontSize: s.header - 2, color: ESTADO_COLOR[comanda.estado] || '#888', fontWeight:700 }}>
            {ESTADO_LABEL[comanda.estado] || comanda.estado}
          </div>
        </div>
      </div>

      {/* Items */}
      <div style={{ borderTop:`1.5px solid var(--border)`, paddingTop: s.itemGap * 0.7, marginBottom: s.itemGap * 0.7 }}>
        {(() => {
          const renderItem = (item, i, arr) => (
            <div key={i} style={{
              marginBottom: s.itemGap,
              paddingBottom: i < arr.length - 1 ? s.itemGap : 0,
              borderBottom: i < arr.length - 1 ? `1px solid var(--border)` : 'none',
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
                <div style={{ fontSize: s.nombre, fontWeight:800, lineHeight:1.15 }}>
                  {item.qty > 1 && (
                    <span style={{
                      color:'#fff', background:'#E24B4A',
                      borderRadius:8, padding:`2px ${s.qty * 0.4}px`,
                      fontSize: s.qty, marginRight: s.qty * 0.4,
                      fontWeight:900, display:'inline-block',
                    }}>
                      {item.qty}×
                    </span>
                  )}
                  {item.plato?.nombre || item.nombre || '—'}
                </div>
                <div style={{
                  fontSize: s.nombre - 2, fontWeight:700, flexShrink:0,
                  color: item.subtotal === 0 ? '#1D9E75' : 'var(--text1)',
                }}>
                  {item.subtotal === 0 ? 'GRATIS' : fmtM(item.subtotal)}
                </div>
              </div>
              <DescChips item={item} sz={sz}/>
            </div>
          )

          const tienePersonas = comanda.tipo === 'mesa' && items.some(i => i.persona)
          if (!tienePersonas) return items.map((item, i) => renderItem(item, i, items))
          const grupos = {}
          items.forEach(i => { const p = i.persona||1; if(!grupos[p]) grupos[p]=[]; grupos[p].push(i) })
          return Object.keys(grupos).sort((a,b)=>+a-+b).map(p => (
            <div key={p} style={{ marginBottom: s.itemGap }}>
              <div style={{ fontSize: s.header - 2, fontWeight:800, color:'#E24B4A',
                background:'var(--bg)', padding:`3px ${s.cardPad * 0.5}px`,
                borderRadius:'var(--r-sm)', marginBottom:6, display:'inline-block' }}>
                👤 P{p}
              </div>
              {grupos[p].map((item, i) => renderItem(item, i, grupos[p]))}
            </div>
          ))
        })()}
      </div>

      {/* Total + acciones */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: s.itemGap * 0.6 }}>
        <span style={{ fontSize: s.nombre - 3, color:'var(--text2)', fontWeight:600 }}>Total</span>
        <strong style={{ fontSize: s.nombre }}>{fmtM(total)}</strong>
      </div>
      <div style={{ display:'flex', gap:8 }}>
        {comanda.estado === 'abierta' && (
          <button onClick={() => onCambiarEstado(comanda.id, 'en_cocina')}
            style={{ flex:1, padding:`${s.accion * 0.55}px 0`, borderRadius:'var(--r-sm)',
              border:'none', background:'#EF9F27', color:'#fff',
              fontSize: s.accion, fontWeight:700, cursor:'pointer' }}>
            🔥 Enviar a cocina
          </button>
        )}
        {(comanda.estado === 'en_cocina' || comanda.estado === 'en_preparacion') && (
          <button onClick={() => onCambiarEstado(comanda.id, 'lista')}
            style={{ flex:1, padding:`${s.accion * 0.55}px 0`, borderRadius:'var(--r-sm)',
              border:'none', background:'#1D9E75', color:'#fff',
              fontSize: s.accion, fontWeight:700, cursor:'pointer' }}>
            ✓ Marcar lista
          </button>
        )}
        {comanda.estado === 'lista' && (
          <div style={{ flex:1, padding:`${s.accion * 0.55}px 0`, borderRadius:'var(--r-sm)',
            background:'#EAF3DE', color:'#3B6D11',
            fontSize: s.accion, fontWeight:700, textAlign:'center' }}>
            ✓ Lista para entregar
          </div>
        )}
      </div>
    </div>
  )
}

export default function KDS() {
  const [comandas, setComandas] = useState([])
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroEstado, setFiltroEstado] = useState('activas')
  const [loading, setLoading] = useState(true)
  const [, setTick] = useState(0)
  // Tamaño de fuente — persiste en localStorage
  const [escala, setEscala] = useState(
    () => localStorage.getItem('kds-escala') || 'normal'
  )
  const sz = ESCALAS[escala] || ESCALAS.normal
  const cambiarEscala = (e) => { setEscala(e); localStorage.setItem('kds-escala', e) }

  const load = useCallback(async () => {
    const { data } = await sb.from('comandas_activas')
      .select('*')
      .not('estado', 'eq', 'eliminada')
      .not('estado', 'eq', 'cobrada')
      .order('created_at', { ascending: true })
    setComandas(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Realtime
  useEffect(() => {
    const ch = sb.channel('kds-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comandas_activas' }, load)
      .subscribe()
    return () => sb.removeChannel(ch)
  }, [load])

  // Timer para actualizar tiempos
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30000)
    return () => clearInterval(t)
  }, [])

  const cambiarEstado = async (id, nuevoEstado) => {
    const updates = { estado: nuevoEstado, updated_at: new Date().toISOString() }
    if (nuevoEstado === 'en_cocina') updates.enviado_cocina_at = new Date().toISOString()
    await sb.from('comandas_activas').update(updates).eq('id', id)
    setComandas(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
    if (nuevoEstado === 'lista') {
      const comanda = comandas.find(c => c.id === id)
      if (comanda) {
        descontarInsumos(comanda).catch(() => {})
        descontarAlmacen(comanda).catch(() => {})
      }
    }
  }

  const tipos = ['todos', 'mesa', 'llevar', 'plataforma']
  const estados = ['activas', 'abierta', 'en_cocina', 'en_preparacion', 'lista']

  const filtradas = comandas.filter(c => {
    if (filtroTipo !== 'todos' && c.tipo !== filtroTipo) return false
    if (filtroEstado === 'activas') return ['abierta', 'en_cocina', 'en_preparacion', 'lista', 'pendiente_pago'].includes(c.estado)
    return c.estado === filtroEstado
  })

  // Agrupar por tipo para vista de columnas
  const porTipo = {
    mesa: filtradas.filter(c => c.tipo === 'mesa'),
    llevar: filtradas.filter(c => c.tipo === 'llevar'),
    plataforma: filtradas.filter(c => c.tipo === 'plataforma'),
  }

  const counts = {
    abierta: comandas.filter(c => c.estado === 'abierta').length,
    en_cocina: comandas.filter(c => c.estado === 'en_cocina' || c.estado === 'en_preparacion').length,
    lista: comandas.filter(c => c.estado === 'lista').length,
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div>
      {/* Badge flotante con proyección */}
      <UdsHoyBadge floating={true} />

      {/* KPIs rápidos + unidades del día */}
      <div className="metrics" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 14 }}>
        {[
          { label: 'Abiertas',  val: counts.abierta,   color: '#378ADD' },
          { label: 'En cocina', val: counts.en_cocina, color: '#EF9F27' },
          { label: 'Listas',    val: counts.lista,     color: '#1D9E75' },
        ].map(k => (
          <div key={k.label} className="mc">
            <div className="mc-label">{k.label}</div>
            <div className="mc-value" style={{ color: k.color, fontSize: 28 }}>{k.val}</div>
          </div>
        ))}
        <UdsHoyBadge floating={false} />
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {tipos.map(t => (
          <button key={t} onClick={() => setFiltroTipo(t)}
            className={`psw-btn${filtroTipo === t ? ' active' : ''}`}
            style={{ fontSize: 11 }}>
            {t === 'todos' ? 'Todos los tipos' : TIPO_LABEL[t]}
          </button>
        ))}
        <div style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
        {estados.map(e => (
          <button key={e} onClick={() => setFiltroEstado(e)}
            className={`psw-btn${filtroEstado === e ? ' active' : ''}`}
            style={{ fontSize: 11 }}>
            {e === 'activas' ? 'Todas activas' : ESTADO_LABEL[e]}
          </button>
        ))}
        {/* Control tamaño de fuente */}
        <div style={{ marginLeft:'auto', display:'flex', gap:4, alignItems:'center' }}>
          <span style={{ fontSize:11, color:'var(--text3)', marginRight:4 }}>Texto:</span>
          {[['normal','A'],['grande','A+'],['extra','A++']].map(([k, lbl]) => (
            <button key={k} onClick={() => cambiarEscala(k)}
              style={{
                padding:'3px 10px', borderRadius:99, fontSize:12, fontWeight:700,
                border: `1.5px solid ${escala===k?'#1D9E75':'var(--border-md)'}`,
                background: escala===k?'#1D9E75':'transparent',
                color: escala===k?'#fff':'var(--text2)', cursor:'pointer',
              }}>
              {lbl}
            </button>
          ))}
          <button onClick={load} style={{ marginLeft:8, padding:'3px 12px', borderRadius:99, fontSize:11, border:'0.5px solid var(--border-md)', background:'transparent', cursor:'pointer', color:'var(--text2)' }}>
            🔄
          </button>
        </div>
      </div>

      {/* Vista de columnas por tipo */}
      {filtroTipo === 'todos' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {Object.entries(porTipo).map(([tipo, items]) => (
            <div key={tipo}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                padding: '6px 12px', borderRadius: 'var(--r-md)',
                background: (TIPO_COLOR[tipo] || '#888') + '18'
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: TIPO_COLOR[tipo] }}>
                  {TIPO_LABEL[tipo]}
                </span>
                <span style={{
                  fontSize: 11, background: TIPO_COLOR[tipo], color: '#fff',
                  borderRadius: 99, padding: '1px 7px', fontWeight: 600
                }}>{items.length}</span>
              </div>
              {items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)', fontSize: 12 }}>
                  Sin comandas
                </div>
              ) : (
                items.map(c => (
                  <ComandaCard key={c.id} comanda={c} onCambiarEstado={cambiarEstado} sz={sz} />
                ))
              )}
            </div>
          ))}
        </div>
      ) : (
        <div>
          {filtradas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text3)' }}>
              Sin comandas con estos filtros
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
              {filtradas.map(c => (
                <ComandaCard key={c.id} comanda={c} onCambiarEstado={cambiarEstado} sz={sz} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
