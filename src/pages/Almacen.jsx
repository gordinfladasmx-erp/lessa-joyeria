import React, { useState, useEffect, useCallback } from 'react'
import { sb } from '../lib/supabase.js'
import ExportBtn from '../components/ExportBtn.jsx'
import { TIPO_MOV, canonNombre, fetchAllMovimientos, calcStock } from '../utils/stockUtils.js'

const today = () => new Date().toISOString().slice(0,10)
const fmtN  = v => Math.round((v||0)*100)/100

const CATEGORIAS = ['guiso','salsa','bebida','topping','insumo','postre']
const CAT_LABEL  = { guiso:'Guisos', salsa:'Salsas', bebida:'Bebidas', topping:'Toppings', insumo:'Insumos', postre:'Postres' }
const CAT_COLOR  = { guiso:'#E24B4A', salsa:'#7F77DD', bebida:'#378ADD', topping:'#1D9E75', insumo:'#EF9F27', postre:'#6E6E73' }

const UNIDADES_POR_CAT = { guiso:'litros', salsa:'litros', bebida:'piezas', topping:'piezas', insumo:'kg', postre:'piezas' }

// Insumos no son productos vendibles → lista fija (los demás vienen del catálogo en Precios)
const INSUMOS_BASE = ['Tortillas','Tostadas','Bolillo','Aceite','Sal','Azucar','Huevo (carton)']

// Qué familias del catálogo corresponden a cada categoría de inventario
const CAT_TO_FAMILIA = {
  guiso:   ['Guisos'],
  salsa:   ['Salsas'],
  bebida:  ['Bebidas Frías','Bebidas Calientes'],
  topping: ['Toppings'],
  postre:  ['Postres'],
  insumo:  null,
}


export default function Almacen({ role }) {
  const [tab,       setTab]      = useState('inventario')
  const [fecha,     setFecha]    = useState(today())
  const [catFiltro, setCatFiltro]= useState('todos')
  const [movs,      setMovs]     = useState([])
  const [loading,   setLoading]  = useState(false)
  const [msg,       setMsg]      = useState(null)

  // Form nuevo movimiento
  const [fCat,      setFCat]     = useState('guiso')
  const [fProd,     setFProd]    = useState('')
  const [fTipo,     setFTipo]    = useState('ingreso')
  const [fCantidad, setFCantidad]= useState('')
  const [fUnidad,   setFUnidad]  = useState('litros')
  const [fNotas,    setFNotas]   = useState('')
  const [saving,    setSaving]   = useState(false)
  const [catalogo,  setCatalogo] = useState([])

  // Cargar movimientos + catálogo — últimos 90 días
  const load = useCallback(async () => {
    setLoading(true)
    const [movData, { data: prodData }] = await Promise.all([
      fetchAllMovimientos(),
      sb.from('productos').select('nombre,familias(nombre)').eq('activo', true),
    ])
    setMovs(movData)
    setCatalogo(prodData || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Realtime: recargar cuando otra tablet registra un movimiento
  useEffect(() => {
    const ch = sb.channel('almacen-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventario_maestro' }, () => load())
      .subscribe()
    return () => { sb.removeChannel(ch) }
  }, [load])

  useEffect(() => {
    setFUnidad(UNIDADES_POR_CAT[fCat] || 'litros')
    setFProd('')
  }, [fCat])

  const [deletingId,  setDeletingId]  = useState(null)
  const [editandoRow, setEditandoRow] = useState(null)
  const [savingRow,   setSavingRow]   = useState(false)

  const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k)||'[]') } catch { return [] } }
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

  // Productos individuales desactivados temporalmente
  const [inactivosAlm, setInactivosAlm] = useState(() => lsGet('alm_inactivos'))
  const [mostrarInactivosAlm, setMostrarInactivosAlm] = useState(false)
  const toggleInactivoAlm = (key) => {
    setInactivosAlm(prev => {
      const next = prev.includes(key) ? prev.filter(k=>k!==key) : [...prev, key]
      lsSet('alm_inactivos', next)
      return next
    })
  }

  // Categorías pausadas (toda la familia)
  const [catsPausadasAlm, setCatsPausadasAlm] = useState(() => lsGet('alm_cats_pausadas'))
  const toggleCatAlm = (cat) => {
    setCatsPausadasAlm(prev => {
      const next = prev.includes(cat) ? prev.filter(c=>c!==cat) : [...prev, cat]
      lsSet('alm_cats_pausadas', next)
      return next
    })
  }

  // Movimiento rápido +/- desde tabla de stock
  const [movRapido, setMovRapido] = useState(null) // { key, producto, categoria, unidad, tipo:'ingreso'|'salida_manual', cantidad:'' }
  const guardarMovRapido = async () => {
    if (!movRapido) return
    const cant = parseFloat(movRapido.cantidad)
    if (isNaN(cant) || cant <= 0) { setMsg({ ok: false, text: 'Cantidad inválida' }); return }
    setSavingRow(true)
    const { data: nuevoMov, error } = await sb.from('inventario_maestro').insert({
      fecha: today(),
      producto: movRapido.producto,
      categoria: movRapido.categoria,
      unidad: movRapido.unidad,
      tipo_movimiento: movRapido.tipo,
      cantidad: cant,
      notas: movRapido.notas || null,
    }).select().single()
    if (error) {
      setMsg({ ok: false, text: 'Error al guardar: ' + error.message })
    } else {
      if (nuevoMov) setMovs(prev => [...prev, nuevoMov])
      const label = movRapido.tipo === 'ingreso' ? 'Entrada' : 'Salida'
      setMsg({ ok: true, text: `${label} de ${cant} ${movRapido.unidad} en "${movRapido.producto}" registrada` })
      setMovRapido(null)
      setTimeout(() => setMsg(null), 4000)
    }
    setSavingRow(false)
  }

  const abrirEdicion = (s) => {
    setEditandoRow({
      key: s.producto + '|' + s.categoria,
      producto: s.producto,
      catVieja: s.categoria,
      catNueva: s.categoria,
      unidadNueva: s.unidad,
      cantidadNueva: String(fmtN(s.cantidad)),
    })
  }

  // Guardar cierre: inserta el valor real contado como tipo "cierre" (absoluto).
  // Ese registro se convierte en la base del día siguiente.
  const guardarEdicion = async (stockActual) => {
    if (!editandoRow) return
    setSavingRow(true)
    const { producto, catVieja, catNueva, unidadNueva, cantidadNueva } = editandoRow
    const cantNueva = parseFloat(cantidadNueva)
    if (isNaN(cantNueva)) { setSavingRow(false); return }

    // 1. Actualizar categoría / unidad en todos los registros si cambió
    const ids = movs.filter(m => m.producto === producto && m.categoria === catVieja).map(m => m.id)
    if (catNueva !== catVieja) {
      await sb.from('inventario_maestro').update({ categoria: catNueva, unidad: unidadNueva }).in('id', ids)
      setMovs(prev => prev.map(m => ids.includes(m.id) ? { ...m, categoria: catNueva, unidad: unidadNueva } : m))
    }

    // 2. Insertar cierre con el valor absoluto contado
    const { data: nuevoMov, error } = await sb.from('inventario_maestro').insert({
      fecha: today(),
      producto,
      categoria: catNueva,
      unidad: unidadNueva,
      tipo_movimiento: 'cierre',
      cantidad: cantNueva,
      notas: 'Cierre del día',
    }).select().single()

    if (error) {
      setMsg({ ok: false, text: 'Error al guardar cierre: ' + error.message })
      setSavingRow(false)
      return
    }
    if (nuevoMov) setMovs(prev => [...prev, nuevoMov])
    setSavingRow(false)
    setEditandoRow(null)
    setMsg({ ok: true, text: `Cierre de "${producto}" guardado — ${fmtN(cantNueva)} ${unidadNueva}` })
    setTimeout(() => setMsg(null), 4000)
  }

  const deleteMov = async (id) => {
    if (!window.confirm('¿Eliminar este movimiento?')) return
    setDeletingId(id)
    await sb.from('inventario_maestro').delete().eq('id', id)
    setMovs(prev => prev.filter(m => m.id !== id))
    setDeletingId(null)
  }

  const guardar = async () => {
    if (!fProd || !fCantidad) return setMsg({ ok: false, text: 'Completa producto y cantidad' })
    const cant = parseFloat(fCantidad)
    if (isNaN(cant) || cant <= 0) return setMsg({ ok: false, text: 'La cantidad debe ser mayor a 0' })
    setSaving(true)
    const { error } = await sb.from('inventario_maestro').insert({
      fecha,
      producto: fProd,
      categoria: fCat,
      unidad: fUnidad,
      tipo_movimiento: fTipo,
      cantidad: cant,
      notas: fNotas || null,
    })
    if (error) setMsg({ ok: false, text: error.message })
    else {
      setMsg({ ok: true, text: 'Movimiento registrado' })
      setFCantidad(''); setFNotas(''); setFProd('')
      load()
    }
    setSaving(false)
    setTimeout(() => setMsg(null), 3000)
  }

  // Stock actual (basado en último cierre + delta posterior)
  const stock = calcStock(movs)
  const stockFiltrado = (catFiltro === 'todos' ? stock : stock.filter(s => s.categoria === catFiltro))
    .filter(s => mostrarInactivosAlm || (
      !inactivosAlm.includes(s.producto+'|'+s.categoria) &&
      !catsPausadasAlm.includes(s.categoria)
    ))

  // Movimientos del día seleccionado
  const movsHoy = movs.filter(m => m.fecha === fecha)
  const movsFiltrados = catFiltro === 'todos' ? movsHoy : movsHoy.filter(m => m.categoria === catFiltro)

  // Productos disponibles para el form
  const familiasParaCat = CAT_TO_FAMILIA[fCat]
  const prodsDelCatalogo = familiasParaCat
    ? catalogo.filter(p => {
        const fn = Array.isArray(p.familias) ? p.familias[0]?.nombre : p.familias?.nombre
        return familiasParaCat.includes(fn)
      }).map(p => p.nombre)
    : INSUMOS_BASE
  const prodsRegistrados = [...new Set(movs.filter(m => m.categoria === fCat).map(m => m.producto))]
  const todosProds = [...new Set([...prodsDelCatalogo, ...prodsRegistrados])].sort()

  const esViewer = role === 'viewer'

  // Tipos que aparecen en el form (excluir legado apertura/ajuste)
  const TIPOS_FORM = ['ingreso','produccion','descongelado','venta','salida_manual']

  return (
    <div>
      {msg && (
        <div style={{
          padding: '8px 14px', borderRadius: 'var(--r-md)', marginBottom: 10,
          background: msg.ok ? '#EAF3DE' : '#FCEBEB',
          color: msg.ok ? '#3B6D11' : '#A32D2D', fontSize: 12,
        }}>{msg.text}</div>
      )}

      {/* TABS */}
      <div style={{display:'flex',gap:6,marginBottom:14,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:6}}>
          {[
            { id:'inventario', label:'📦 Stock actual' },
            { id:'registrar',  label:'➕ Registrar movimiento' },
            { id:'historial',  label:'📋 Historial' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                padding:'6px 14px', borderRadius:'var(--r-md)', fontSize:12, fontWeight:500, cursor:'pointer',
                border:`1.5px solid ${tab===t.id?'var(--accent)':'var(--border-md)'}`,
                background: tab===t.id ? 'var(--accent)22' : 'transparent',
                color: tab===t.id ? 'var(--accent)' : 'var(--text2)',
              }}>
              {t.label}
            </button>
          ))}
        </div>
        <ExportBtn titulo="Almacen" getElement={() => document.querySelector('.content')}/>
      </div>

      {/* FILTRO POR CATEGORÍA */}
      <div style={{display:'flex',gap:5,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
        <button onClick={() => setCatFiltro('todos')}
          style={{padding:'3px 12px',borderRadius:99,fontSize:11,cursor:'pointer',
            border:`1.5px solid ${catFiltro==='todos'?'var(--accent)':'var(--border-md)'}`,
            background:catFiltro==='todos'?'var(--accent)22':'transparent',
            color:catFiltro==='todos'?'var(--accent)':'var(--text2)'}}>
          Todos
        </button>
        {CATEGORIAS.map(c => {
          const col = CAT_COLOR[c]||'var(--accent)'
          const sel = catFiltro===c
          const pausada = catsPausadasAlm.includes(c)
          return (
            <div key={c} style={{display:'flex',alignItems:'center',gap:0,borderRadius:99,overflow:'hidden',
              border:`1.5px solid ${pausada?'#EF9F27':sel?col:'var(--border-md)'}`,
              background:pausada?'#EF9F2715':sel?col+'22':'transparent'}}>
              <button onClick={() => setCatFiltro(c)} style={{padding:'3px 10px',border:'none',background:'transparent',
                color:pausada?'#EF9F27':sel?col:'var(--text2)',fontSize:11,cursor:'pointer',fontWeight:500}}>
                {pausada&&'⏸ '}{CAT_LABEL[c]}
              </button>
              {!esViewer && (
                <button onClick={() => toggleCatAlm(c)} title={pausada?'Reactivar familia':'Pausar toda la familia'}
                  style={{padding:'3px 7px 3px 2px',border:'none',background:'transparent',cursor:'pointer',fontSize:11,
                    color:pausada?'#EF9F27':'var(--text3)',lineHeight:1}}>
                  {pausada?'▶':'⏸'}
                </button>
              )}
            </div>
          )
        })}
        {catsPausadasAlm.length > 0 && (
          <span style={{fontSize:10,color:'#EF9F27',fontWeight:600}}>⚠ {catsPausadasAlm.length} familia{catsPausadasAlm.length>1?'s':''} pausada{catsPausadasAlm.length>1?'s':''}</span>
        )}
        {!esViewer && (inactivosAlm.length > 0 || catsPausadasAlm.length > 0) && (
          <button onClick={() => setMostrarInactivosAlm(v=>!v)}
            style={{padding:'3px 12px',borderRadius:99,fontSize:11,cursor:'pointer',
              border:`1.5px solid ${mostrarInactivosAlm?'#EF9F27':'var(--border-md)'}`,
              background:mostrarInactivosAlm?'#EF9F2722':'transparent',
              color:mostrarInactivosAlm?'#EF9F27':'var(--text3)'}}>
            {mostrarInactivosAlm ? 'Ocultar pausados' : `Ver pausados (${inactivosAlm.length + catsPausadasAlm.length})`}
          </button>
        )}
      </div>

      {/* ── STOCK ACTUAL ── */}
      {tab==='inventario' && (
        loading
          ? <div className="loading-screen" style={{height:200}}><div className="spinner"/></div>
          : stockFiltrado.length === 0
            ? (
              <div className="card" style={{textAlign:'center',padding:'40px 0',color:'var(--text3)'}}>
                <div style={{fontSize:32,marginBottom:8}}>📦</div>
                <div style={{marginBottom:16}}>Sin stock registrado.</div>
                {!esViewer && (
                  <button onClick={() => setTab('registrar')}
                    style={{padding:'10px 20px',borderRadius:'var(--r-md)',border:'none',background:'#378ADD',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600}}>
                    ➕ Registrar primer ingreso
                  </button>
                )}
              </div>
            ) : (
              <div className="card">
                <div className="ch">
                  <div className="ct">Stock actual</div>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <span style={{fontSize:11,color:'var(--text3)'}}>{stockFiltrado.length} productos · cierre como base</span>
                    {!esViewer && (
                      <button onClick={() => setTab('registrar')}
                        style={{padding:'4px 12px',borderRadius:'var(--r-md)',border:'1.5px solid #1D9E75',background:'#1D9E7518',color:'#1D9E75',cursor:'pointer',fontSize:11,fontWeight:600}}>
                        + Ingreso / Compra
                      </button>
                    )}
                  </div>
                </div>

                <div style={{overflowX:'auto'}}>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Categoría</th>
                        <th className="num">Stock</th>
                        <th>Unidad</th>
                        <th style={{fontSize:10,color:'var(--text3)'}}>Último cierre</th>
                        {!esViewer && <th>Acciones</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {stockFiltrado
                        .sort((a,b) => a.categoria.localeCompare(b.categoria) || a.producto.localeCompare(b.producto))
                        .map(s => {
                          const editKey = s.producto + '|' + s.categoria
                          const editando = editandoRow?.key === editKey
                          return (
                            <tr key={editKey} style={{background: editando ? 'var(--accent)08' : undefined}}>
                              <td style={{fontWeight:500}}>{s.producto}</td>
                              <td>
                                {editando ? (
                                  <select value={editandoRow.catNueva} disabled={savingRow}
                                    onChange={e => setEditandoRow(r => ({
                                      ...r,
                                      catNueva: e.target.value,
                                      unidadNueva: UNIDADES_POR_CAT[e.target.value] || 'piezas',
                                    }))}
                                    style={{fontSize:11,borderRadius:6,border:'1.5px solid var(--accent)',padding:'2px 6px',width:'100%'}}>
                                    {CATEGORIAS.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
                                  </select>
                                ) : (
                                  <span style={{fontSize:10,padding:'2px 8px',borderRadius:99,background:CAT_COLOR[s.categoria]+'22',color:CAT_COLOR[s.categoria]}}>
                                    {CAT_LABEL[s.categoria] || s.categoria}
                                  </span>
                                )}
                              </td>
                              <td className="num">
                                {editando ? (
                                  <input type="number" value={editandoRow.cantidadNueva} disabled={savingRow}
                                    onChange={e => setEditandoRow(r => ({...r, cantidadNueva: e.target.value}))}
                                    style={{width:70,fontSize:13,fontWeight:700,borderRadius:6,border:'1.5px solid var(--accent)',padding:'2px 6px',textAlign:'right'}}/>
                                ) : (
                                  <span style={{
                                    fontWeight:700, fontSize:14,
                                    color: s.cantidad <= 0 ? '#E24B4A' : s.cantidad < 2 ? '#EF9F27' : '#1D9E75',
                                  }}>
                                    {fmtN(s.cantidad)}
                                  </span>
                                )}
                              </td>
                              <td style={{fontSize:11,color:'var(--text2)'}}>
                                {editando ? (
                                  <select value={editandoRow.unidadNueva} disabled={savingRow}
                                    onChange={e => setEditandoRow(r => ({...r, unidadNueva: e.target.value}))}
                                    style={{fontSize:11,borderRadius:6,border:'1.5px solid var(--accent)',padding:'2px 6px'}}>
                                    {['piezas','litros','kg','gramos','ml'].map(u => <option key={u} value={u}>{u}</option>)}
                                  </select>
                                ) : s.unidad}
                              </td>
                              <td style={{fontSize:10,color: s.tieneCierre ? 'var(--text3)' : '#EF9F27'}}>
                                {s.tieneCierre ? s.ultimoCierre : '⚠ sin cierre'}
                              </td>
                              {!esViewer && (
                                <td style={{whiteSpace:'nowrap'}}>
                                  {editando ? (
                                    <span style={{display:'flex',gap:4}}>
                                      <button onClick={() => guardarEdicion(s.cantidad)} disabled={savingRow}
                                        style={{padding:'3px 10px',borderRadius:6,border:'none',background:'#378ADD',color:'#fff',cursor:'pointer',fontSize:11,fontWeight:600}}>
                                        {savingRow ? '...' : '✓ Cerrar día'}
                                      </button>
                                      <button onClick={() => setEditandoRow(null)} disabled={savingRow}
                                        style={{padding:'3px 8px',borderRadius:6,border:'1.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:11}}>
                                        ✕
                                      </button>
                                    </span>
                                  ) : movRapido?.key === editKey ? (
                                    <span style={{display:'flex',gap:4,alignItems:'center',flexWrap:'wrap'}}>
                                      <select value={movRapido.tipo} disabled={savingRow}
                                        onChange={e => setMovRapido(r => ({...r, tipo: e.target.value}))}
                                        style={{fontSize:10,borderRadius:6,border:`1.5px solid ${movRapido.tipo==='ingreso'?'#1D9E75':'#E24B4A'}`,padding:'2px 4px',color:movRapido.tipo==='ingreso'?'#1D9E75':'#E24B4A'}}>
                                        <option value="ingreso">↑ Entrada</option>
                                        <option value="salida_manual">↓ Salida</option>
                                        <option value="produccion">↑ Producción</option>
                                        <option value="descongelado">↑ Descongelado</option>
                                        <option value="venta">↓ Venta</option>
                                      </select>
                                      <input type="number" value={movRapido.cantidad} disabled={savingRow}
                                        onChange={e => setMovRapido(r => ({...r, cantidad: e.target.value}))}
                                        placeholder="cant." min="0" step="0.5"
                                        style={{width:58,fontSize:12,fontWeight:700,borderRadius:6,border:'1.5px solid var(--accent)',padding:'2px 5px',textAlign:'right'}}/>
                                      <span style={{fontSize:10,color:'var(--text3)'}}>{s.unidad}</span>
                                      <button onClick={guardarMovRapido} disabled={savingRow}
                                        style={{padding:'3px 8px',borderRadius:6,border:'none',background:movRapido.tipo==='ingreso'||movRapido.tipo==='produccion'||movRapido.tipo==='descongelado'?'#1D9E75':'#E24B4A',color:'#fff',cursor:'pointer',fontSize:11,fontWeight:600}}>
                                        {savingRow ? '...' : '✓'}
                                      </button>
                                      <button onClick={() => setMovRapido(null)} disabled={savingRow}
                                        style={{padding:'3px 6px',borderRadius:6,border:'1.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:11}}>
                                        ✕
                                      </button>
                                    </span>
                                  ) : (
                                    <span style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                                      <button
                                        onClick={() => setMovRapido({ key: editKey, producto: s.producto, categoria: s.categoria, unidad: s.unidad, tipo: 'ingreso', cantidad: '' })}
                                        title="Registrar entrada / compra"
                                        style={{padding:'2px 8px',borderRadius:6,border:'1.5px solid #1D9E75',background:'#1D9E7518',cursor:'pointer',fontSize:11,color:'#1D9E75',fontWeight:700}}>
                                        + Entrada
                                      </button>
                                      <button
                                        onClick={() => setMovRapido({ key: editKey, producto: s.producto, categoria: s.categoria, unidad: s.unidad, tipo: 'salida_manual', cantidad: '' })}
                                        title="Registrar salida / merma"
                                        style={{padding:'2px 8px',borderRadius:6,border:'1.5px solid #E24B4A',background:'#E24B4A18',cursor:'pointer',fontSize:11,color:'#E24B4A',fontWeight:700}}>
                                        − Salida
                                      </button>
                                      <button onClick={() => abrirEdicion(s)}
                                        title="Ingresar conteo real al cierre del día"
                                        style={{padding:'2px 8px',borderRadius:6,border:'1.5px solid #378ADD',background:'#378ADD18',cursor:'pointer',fontSize:11,color:'#378ADD'}}>
                                        📋 Cierre
                                      </button>
                                      <button onClick={() => toggleInactivoAlm(editKey)}
                                        title="Desactivar temporalmente (no aparece en alertas)"
                                        style={{padding:'2px 8px',borderRadius:6,border:'none',background:'#EF9F2722',color:'#EF9F27',cursor:'pointer',fontSize:11}}>
                                        ⏸
                                      </button>
                                    </span>
                                  )}
                                </td>
                              )}
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>

                {/* Leyenda */}
                <div style={{marginTop:10,padding:'8px 12px',borderRadius:'var(--r-sm)',background:'var(--surface2)',fontSize:10,color:'var(--text3)'}}>
                  <strong style={{color:'var(--text2)'}}>Flujo diario:</strong> registra ingresos o salidas durante el día →
                  al cierre, escribe el conteo real con <strong>📋 Cierre</strong> →
                  ese valor se convierte en el inicial del día siguiente.
                  <br/>Los productos con <span style={{color:'#EF9F27'}}>⚠ sin cierre</span> aún usan el modelo acumulativo anterior.
                </div>
              </div>
            )
      )}

      {/* ── REGISTRAR MOVIMIENTO ── */}
      {tab==='registrar' && (
        esViewer ? (
          <div style={{padding:'10px 14px',borderRadius:'var(--r-md)',background:'#EAF3DE',color:'#3B6D11',fontSize:12}}>
            Modo consulta — no puedes registrar movimientos.
          </div>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            {/* FORMULARIO */}
            <div className="card">
              <div className="ch"><div className="ct">Nuevo movimiento</div></div>

              <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
                <div style={{flex:1,minWidth:140}}>
                  <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>Fecha</div>
                  <input type="date" className="form-input" value={fecha}
                    onChange={e => setFecha(e.target.value)} style={{width:'100%'}}/>
                </div>
                <div style={{flex:1,minWidth:140}}>
                  <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>Categoría</div>
                  <select className="form-input" value={fCat}
                    onChange={e => setFCat(e.target.value)} style={{width:'100%'}}>
                    {CATEGORIAS.map(c => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
                  </select>
                </div>
              </div>

              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>Producto</div>
                <select className="form-input" value={fProd}
                  onChange={e => setFProd(e.target.value)} style={{width:'100%'}}>
                  <option value="">Seleccionar...</option>
                  {todosProds.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                {fCat !== 'insumo' && todosProds.length === 0 && (
                  <div style={{fontSize:11,color:'var(--text3)',marginTop:6}}>
                    Sin productos en esta categoría — créalos desde <strong>Precios</strong>.
                  </div>
                )}
              </div>

              <div style={{display:'flex',gap:8,marginBottom:12}}>
                <div style={{flex:2}}>
                  <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>Tipo de movimiento</div>
                  <select className="form-input" value={fTipo}
                    onChange={e => setFTipo(e.target.value)} style={{width:'100%'}}>
                    {TIPOS_FORM.map(k => (
                      <option key={k} value={k}>{TIPO_MOV[k].label}</option>
                    ))}
                  </select>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>Unidad</div>
                  <select className="form-input" value={fUnidad}
                    onChange={e => setFUnidad(e.target.value)} style={{width:'100%'}}>
                    {['litros','piezas','kg','unidad','bolsa','caja'].map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>Cantidad</div>
                  <input type="number" className="form-input" value={fCantidad}
                    onChange={e => setFCantidad(e.target.value)}
                    placeholder="0" min="0" step="0.1" style={{width:'100%'}}/>
                </div>
              </div>

              {/* Indicador tipo */}
              {fTipo && (
                <div style={{
                  padding:'6px 10px', borderRadius:'var(--r-sm)', marginBottom:12, fontSize:11,
                  background: TIPO_MOV[fTipo]?.color + '18',
                  color: TIPO_MOV[fTipo]?.color,
                }}>
                  {TIPO_MOV[fTipo]?.signo > 0 ? '↑ Entrada' : '↓ Salida'} — {TIPO_MOV[fTipo]?.label}
                </div>
              )}

              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>Notas (opcional)</div>
                <input className="form-input" value={fNotas}
                  onChange={e => setFNotas(e.target.value)}
                  placeholder="Observaciones..." style={{width:'100%'}}/>
              </div>

              <button onClick={guardar} disabled={saving}
                style={{width:'100%',padding:10,borderRadius:'var(--r-md)',border:'none',
                  background:'var(--accent)',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600}}>
                {saving ? 'Guardando...' : 'Registrar movimiento'}
              </button>
            </div>

            {/* RESUMEN DEL DÍA */}
            <div className="card">
              <div className="ch">
                <div className="ct">Movimientos del día</div>
                <span style={{fontSize:11,color:'var(--text3)'}}>{fecha}</span>
              </div>
              {movsFiltrados.length === 0
                ? <div style={{textAlign:'center',padding:'20px 0',color:'var(--text3)',fontSize:12}}>Sin movimientos registrados para esta fecha</div>
                : movsFiltrados
                    .slice().sort((a,b) => (a.created_at||'') < (b.created_at||'') ? 1 : -1)
                    .map(m => {
                      const tipo = TIPO_MOV[m.tipo_movimiento]
                      const esCierre = m.tipo_movimiento === 'cierre'
                      return (
                        <div key={m.id} style={{
                          padding:'8px 0', borderBottom:'0.5px solid var(--border)',
                          display:'flex', justifyContent:'space-between', alignItems:'center',
                        }}>
                          <div>
                            <div style={{fontSize:12,fontWeight:500}}>{m.producto}</div>
                            <div style={{fontSize:10,color:'var(--text3)'}}>
                              {CAT_LABEL[m.categoria]} · {tipo?.label || m.tipo_movimiento}
                            </div>
                            {m.notas && <div style={{fontSize:10,color:'var(--text3)',fontStyle:'italic'}}>{m.notas}</div>}
                          </div>
                          <div style={{textAlign:'right'}}>
                            <div style={{fontSize:13,fontWeight:700,color: esCierre ? '#378ADD' : tipo?.signo > 0 ? '#1D9E75' : '#E24B4A'}}>
                              {esCierre ? '=' : tipo?.signo > 0 ? '+' : '-'}{fmtN(m.cantidad)} {m.unidad}
                            </div>
                            <div style={{fontSize:10,color:'var(--text3)'}}>
                              {new Date(m.created_at).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}
                            </div>
                          </div>
                        </div>
                      )
                    })
              }
            </div>
          </div>
        )
      )}

      {/* ── HISTORIAL ── */}
      {tab==='historial' && (
        <div className="card">
          <div className="ch">
            <div className="ct">Historial de movimientos</div>
            <span style={{fontSize:11,color:'var(--text3)'}}>{movs.length} registros · últimos 90 días</span>
          </div>
          <div style={{overflowX:'auto',maxHeight:500,overflowY:'auto'}}>
            <table className="tbl">
              <thead style={{position:'sticky',top:0,background:'var(--surface)'}}>
                <tr>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th>Tipo</th>
                  <th className="num">Cantidad</th>
                  <th>Unidad</th>
                  <th>Notas</th>
                  {role==='admin' && <th/>}
                </tr>
              </thead>
              <tbody>
                {(catFiltro==='todos' ? movs : movs.filter(m => m.categoria===catFiltro))
                  .slice().sort((a,b) => (a.created_at||'') < (b.created_at||'') ? 1 : -1)
                  .map(m => {
                    const tipo = TIPO_MOV[m.tipo_movimiento]
                    const esCierre = m.tipo_movimiento === 'cierre'
                    return (
                      <tr key={m.id}>
                        <td style={{fontSize:11}}>{m.fecha}</td>
                        <td style={{fontWeight:500,fontSize:12}}>{m.producto}</td>
                        <td>
                          <span style={{fontSize:10,padding:'1px 6px',borderRadius:99,
                            background:CAT_COLOR[m.categoria]+'22',color:CAT_COLOR[m.categoria]}}>
                            {CAT_LABEL[m.categoria] || m.categoria}
                          </span>
                        </td>
                        <td>
                          <span style={{fontSize:10,padding:'1px 6px',borderRadius:99,
                            background:(tipo?.color||'#888')+'22',color:tipo?.color||'#888'}}>
                            {tipo?.label || m.tipo_movimiento}
                          </span>
                        </td>
                        <td className="num" style={{fontWeight:600,
                          color: esCierre ? '#378ADD' : tipo?.signo > 0 ? '#1D9E75' : '#E24B4A'}}>
                          {esCierre ? '=' : tipo?.signo > 0 ? '+' : '-'}{fmtN(m.cantidad)}
                        </td>
                        <td style={{fontSize:11,color:'var(--text2)'}}>{m.unidad}</td>
                        <td style={{fontSize:11,color:'var(--text3)'}}>{m.notas || '—'}</td>
                        {role==='admin' && (
                          <td>
                            <button onClick={() => deleteMov(m.id)} disabled={deletingId===m.id}
                              style={{fontSize:11,color:'#E24B4A',background:'none',border:'none',cursor:'pointer',padding:'2px 6px'}}>
                              {deletingId===m.id ? '…' : '✕'}
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
