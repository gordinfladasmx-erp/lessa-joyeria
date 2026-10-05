import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { sb } from '../lib/supabase.js'
import { fetchAllMovimientos, calcStock } from '../utils/stockUtils.js'

export default function ListaComprasBell() {
  const [items,      setItems]      = useState([])
  const [itemsAlm,   setItemsAlm]   = useState([])
  const [abierto,    setAbierto]    = useState(false)
  const [loading,    setLoading]    = useState(false)
  const nav = useNavigate()

  const lsGet = (key) => { try { return JSON.parse(localStorage.getItem(key)||'[]') } catch { return [] } }

  const calcular = useCallback(async () => {
    setLoading(true)
    try {
      const inactivosAlm    = lsGet('alm_inactivos')
      const catsPausadasAlm = lsGet('alm_cats_pausadas')
      const catsPausadasIns = lsGet('ins_cats_pausadas')
      const menuFamsPausadas  = lsGet('menu_familias_pausadas')
      const menuProdsPausados = lsGet('menu_productos_pausados')

      const [{ data: insumos }, { data: recetas }, { data: comandas }, movs] = await Promise.all([
        sb.from('insumos').select('id,nombre,unidad,stock_actual,stock_minimo,categoria,activo').order('nombre'),
        sb.from('recetas').select('*'),
        sb.from('comandas_activas')
          .select('items')
          .in('estado', ['lista','cobrada'])
          .gte('created_at', new Date(Date.now() - 7*24*60*60*1000).toISOString()),
        fetchAllMovimientos(),
      ])

      // Almacén crítico (≤ 3 unidades) — excluir inactivos individuales y categorías pausadas
      const stockAlm = calcStock(movs)
        .filter(s =>
          !inactivosAlm.includes(s.producto+'|'+s.categoria) &&
          !catsPausadasAlm.includes(s.categoria) &&
          s.cantidad <= 3
        )
        .sort((a,b) => a.cantidad - b.cantidad)
      setItemsAlm(stockAlm)

      // Insumos activos y no en categoría pausada
      const insumosActivos = (insumos||[]).filter(i =>
        i.activo !== false && !catsPausadasIns.includes(i.categoria)
      )

      const normStr = s => (s||'').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g,'')
      const ALIAS_G = { 'huevo estrellado':'Huevo','claras de huevo':'Huevo' }
      const ALIAS_S = { 'diabla':'La Suegra','la suegra + diabla':'La Suegra' }
      const resolveG = n => { const a=ALIAS_G[normStr(n)]; return a?[a]:[n] }
      const resolveS = n => { const a=ALIAS_S[normStr(n)]; return a?[a]:[n] }

      const insumoByNombre = {}
      insumosActivos.forEach(i => { insumoByNombre[normStr(i.nombre)] = i })
      const consumo = {}
      const sumar = (nombre, cant) => {
        const i = insumoByNombre[normStr(nombre)]
        if (i) consumo[i.id] = (consumo[i.id] || 0) + cant
      }

      for (const c of (comandas||[])) {
        for (const item of (c.items||[])) {
          if (!item.plato?.codigo) continue
          const qty = item.qty || 1
          const cfg = item._config || {}
          const guisos = [...(cfg.guiso1||[]), ...(cfg.guisoX||[])]
          const salsas = cfg.salsas || []
          const tops   = cfg.tops   || []
          // Saltar productos/familias pausados del menú
          const famDelProd = Object.entries({
            'Los Chilakiles':['CHI-01','CHI-02','CHI-03','CHI-04','CHI-05','CHI-06','CHI-07','CHI-08','CHI-09'],
            'Huevos y Crokantes':['HUE-01','HUE-02','HUE-03','HUE-04'],
            'Los Dorados':['DOR-01','DOR-02','DOR-03'],
            'Del Comal':['COM-01','COM-02','COM-03','COM-04','COM-05'],
            'Enfrijoladas':['ENF-01','ENF-02','ENF-03'],
            'Emparedados':['EMP-01','EMP-02','EMP-03'],
            'Guisos Extras':['GUI-01','GUI-02','GUI-03'],
            '1/2 Litros':['LIT-01','LIT-02'],
          }).find(([,codigos]) => codigos.includes(item.plato.codigo))?.[0]
          if (menuProdsPausados.includes(item.plato.codigo)) continue
          if (famDelProd && menuFamsPausadas.includes(famDelProd)) continue

          const recs   = (recetas||[]).filter(r => r.producto_codigo === item.plato.codigo)
          for (const r of recs) {
            if      (r.tipo==='fijo')    { if (r.insumo_id) consumo[r.insumo_id] = (consumo[r.insumo_id]||0) + r.cantidad*qty }
            else if (r.tipo==='guiso')   guisos.forEach(g => resolveG(g).forEach(n => sumar(n, r.cantidad*qty)))
            else if (r.tipo==='salsa')   salsas.forEach(s => resolveS(s).forEach(n => sumar(n, r.cantidad*qty)))
            else if (r.tipo==='topping') tops.forEach(t => sumar(t, r.cantidad*qty))
          }
        }
      }

      const lista = insumosActivos.map(i => {
        const consumido7d = consumo[i.id] || 0
        const diario      = consumido7d / 7
        const necesito7d  = Math.ceil(diario * 7)
        const stock       = i.stock_actual || 0
        const minimo      = i.stock_minimo || 0

        // Necesita compra si: stock < mínimo, O proyección 7d > stock
        const faltaMin  = Math.max(0, minimo - stock)
        const faltaProy = Math.max(0, necesito7d - stock)
        const aComprar  = Math.max(faltaMin, faltaProy)

        return { ...i, consumido7d, diario, necesito7d, aComprar }
      }).filter(i => i.aComprar > 0)
        .sort((a, b) => b.aComprar - a.aComprar)

      setItems(lista)
    } catch(e) { console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => {
    calcular()
    // Recalcular cada 30 min
    const t = setInterval(calcular, 30 * 60 * 1000)
    return () => clearInterval(t)
  }, [calcular])

  const urgentes   = items.filter(i => (i.stock_actual||0) <= 0 || (i.stock_actual||0) < (i.stock_minimo||0) * 0.3)
  const totalBadge = items.length + itemsAlm.length

  const imprimirLista = () => {
    const fecha = new Date().toLocaleDateString('es-MX', { day:'numeric', month:'long', year:'numeric' })
    const lineas = items.map(i => {
      const urgente = urgentes.includes(i) ? ' ⚠️ URGENTE' : ''
      return `• ${i.nombre}: comprar ${i.aComprar.toFixed(1)} ${i.unidad}${urgente}`
    }).join('\n')
    const win = window.open('', '_blank', 'width=480,height=600')
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Lista de compras</title>
    <style>body{font-family:sans-serif;padding:24px;color:#111}h2{margin:0 0 4px}p{margin:0 0 16px;color:#666;font-size:13px}
    .item{padding:8px 0;border-bottom:1px solid #eee;display:flex;justify-content:space-between}
    .nombre{font-weight:600}.cantidad{font-weight:700;color:#E24B4A}.urg{color:#E24B4A;font-size:11px}
    .ok{color:#1D9E75}</style></head><body>
    <h2>🛒 Lista de compras — Chilakileando</h2>
    <p>${fecha}</p>
    ${items.map(i => {
      const u = urgentes.includes(i)
      return `<div class="item"><span class="nombre">${i.nombre}${u?' <span class="urg">⚠ URGENTE</span>':''}</span>
      <span class="cantidad ${u?'':'ok'}">+${i.aComprar.toFixed(1)} ${i.unidad}</span></div>`
    }).join('')}
    <p style="margin-top:16px;font-size:11px;color:#999">Basado en consumo de los últimos 7 días y stock mínimo</p>
    <script>window.onload=()=>window.print()</script></body></html>`)
    win.document.close()
  }

  const compartirWA = () => {
    const fecha = new Date().toLocaleDateString('es-MX', { day:'numeric', month:'long' })
    const urgTxt = urgentes.length ? `⚠️ *URGENTE (${urgentes.length}):*\n` + urgentes.map(i=>`  • ${i.nombre}: +${i.aComprar.toFixed(1)} ${i.unidad}`).join('\n') + '\n\n' : ''
    const restTxt = items.filter(i=>!urgentes.includes(i)).length
      ? `📋 *Esta semana:*\n` + items.filter(i=>!urgentes.includes(i)).map(i=>`  • ${i.nombre}: +${i.aComprar.toFixed(1)} ${i.unidad}`).join('\n') + '\n\n'
      : ''
    const almTxt = itemsAlm.length
      ? `📦 *Almacén crítico:*\n` + itemsAlm.map(s=>`  • ${s.producto} (${s.categoria}): ${s.cantidad} ${s.unidad}`).join('\n')
      : ''
    const msg = `🛒 *Lista de compras Chilakileando*\n📅 ${fecha}\n\n${urgTxt}${restTxt}${almTxt}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setAbierto(!abierto)}
        style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, position:'relative', padding:'2px 4px',
          color: totalBadge > 0 ? (urgentes.length > 0 || itemsAlm.some(s=>s.cantidad<=0) ? '#E24B4A' : '#EF9F27') : 'var(--text3)',
          animation: (urgentes.length > 0 || itemsAlm.some(s=>s.cantidad<=0)) ? 'pulse 1.5s infinite' : 'none' }}>
        🛒
        {totalBadge > 0 && (
          <span style={{ position:'absolute', top:-2, right:-2, background: urgentes.length > 0 ? '#E24B4A' : '#EF9F27',
            color:'#fff', borderRadius:'50%', width:18, height:18, fontSize:10, fontWeight:700,
            display:'flex', alignItems:'center', justifyContent:'center' }}>
            {totalBadge}
          </span>
        )}
      </button>

      {abierto && (
        <>
          <div onClick={() => setAbierto(false)}
            style={{ position:'fixed', inset:0, zIndex:200 }}/>
          <div style={{ position:'absolute', top:32, right:0, width:360, maxHeight:500, overflowY:'auto',
            background:'var(--surface)', border:'0.5px solid var(--border-md)', borderRadius:'var(--r-md)',
            boxShadow:'0 8px 24px rgba(0,0,0,0.15)', zIndex:201, padding:14 }}>

            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, paddingBottom:8, borderBottom:'1px solid var(--border-md)' }}>
              <div style={{ fontSize:13, fontWeight:700 }}>🛒 Lista de compras</div>
              <button onClick={() => { setAbierto(false); nav('/insumos') }}
                style={{ fontSize:10, padding:'3px 10px', borderRadius:99, border:'1px solid var(--border-md)',
                  background:'transparent', color:'var(--text2)', cursor:'pointer' }}>
                Ver Insumos →
              </button>
            </div>

            {loading && <div style={{ textAlign:'center', padding:20, fontSize:11, color:'var(--text3)' }}>Calculando…</div>}

            {!loading && items.length === 0 && itemsAlm.length === 0 && (
              <div style={{ textAlign:'center', padding:20, fontSize:12, color:'#1D9E75', fontWeight:600 }}>
                ✓ Todo el stock está suficiente
              </div>
            )}

            {!loading && urgentes.length > 0 && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#E24B4A', textTransform:'uppercase', marginBottom:6 }}>
                  ⚠️ Urgente ({urgentes.length})
                </div>
                {urgentes.map(i => (
                  <div key={i.id} style={{ padding:'7px 10px', background:'#FCEBEB', borderRadius:'var(--r-sm)',
                    marginBottom:5, border:'1px solid #E24B4A33', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:600, color:'#222' }}>{i.nombre}</div>
                      <div style={{ fontSize:10, color:'var(--text3)' }}>Stock: {i.stock_actual||0} {i.unidad} · Mín: {i.stock_minimo||0} {i.unidad}</div>
                    </div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#E24B4A', whiteSpace:'nowrap' }}>
                      +{i.aComprar.toFixed(1)} {i.unidad}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && items.filter(i => !urgentes.includes(i)).length > 0 && (
              <div>
                {urgentes.length > 0 && <div style={{ fontSize:10, fontWeight:700, color:'var(--text2)', textTransform:'uppercase', marginBottom:6 }}>
                  Comprar esta semana
                </div>}
                {items.filter(i => !urgentes.includes(i)).map(i => (
                  <div key={i.id} style={{ padding:'6px 10px', background:'var(--bg)', borderRadius:'var(--r-sm)',
                    marginBottom:4, border:'1px solid var(--border-md)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ fontSize:11, fontWeight:600 }}>{i.nombre}</div>
                      <div style={{ fontSize:10, color:'var(--text3)' }}>Stock: {i.stock_actual||0} {i.unidad} · Proyección 7d: {i.necesito7d} {i.unidad}</div>
                    </div>
                    <div style={{ fontSize:12, fontWeight:700, color:'#EF9F27', whiteSpace:'nowrap' }}>
                      +{i.aComprar.toFixed(1)} {i.unidad}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Sección Almacén */}
            {!loading && itemsAlm.length > 0 && (
              <div style={{ marginTop:12, paddingTop:10, borderTop:'1px solid var(--border-md)' }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#D85A30', textTransform:'uppercase', marginBottom:6 }}>
                  📦 Almacén crítico (≤ 3 uds)
                </div>
                {itemsAlm.map(s => (
                  <div key={s.producto+'|'+s.categoria} style={{ padding:'6px 10px', background: s.cantidad<=0?'#FCEBEB':'#FFF3E0', borderRadius:'var(--r-sm)',
                    marginBottom:4, border:`1px solid ${s.cantidad<=0?'#E24B4A33':'#D85A3033'}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ fontSize:11, fontWeight:600 }}>{s.producto}</div>
                      <div style={{ fontSize:10, color:'var(--text3)' }}>{s.categoria}</div>
                    </div>
                    <div style={{ fontSize:13, fontWeight:700, color: s.cantidad<=0?'#E24B4A':'#D85A30', whiteSpace:'nowrap' }}>
                      {s.cantidad} {s.unidad}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(items.length > 0 || itemsAlm.length > 0) && (
              <div style={{ borderTop:'1px solid var(--border-md)', marginTop:10, paddingTop:10, display:'flex', gap:6 }}>
                <button onClick={imprimirLista}
                  style={{ flex:1, padding:'7px 0', borderRadius:'var(--r-sm)', border:'1px solid var(--border-md)',
                    background:'transparent', color:'var(--text2)', cursor:'pointer', fontSize:11, fontWeight:600 }}>
                  🖨 Imprimir
                </button>
                <button onClick={compartirWA}
                  style={{ flex:1, padding:'7px 0', borderRadius:'var(--r-sm)', border:'1px solid #25D366',
                    background:'#25D36618', color:'#25D366', cursor:'pointer', fontSize:11, fontWeight:600 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="#25D366" style={{marginRight:4,verticalAlign:'middle'}}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  WhatsApp
                </button>
              </div>
            )}
            <div style={{ marginTop:8, fontSize:10, color:'var(--text3)', textAlign:'center' }}>
              Basado en consumo de los últimos 7 días y stock mínimo
            </div>
          </div>
        </>
      )}
    </div>
  )
}
