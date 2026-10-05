import React, { useState, useEffect, useCallback } from 'react'
import { sb } from '../lib/supabase.js'

// Productos del menú agrupados por familia
const FAMILIAS = {
  'Los Chilakiles': [
    { codigo:'CHI-01', nombre:'Naturales' },
    { codigo:'CHI-02', nombre:'Gratinados' },
    { codigo:'CHI-03', nombre:'Rellenos' },
    { codigo:'CHI-04', nombre:'Botijones' },
    { codigo:'CHI-05', nombre:'Migakiles' },
    { codigo:'CHI-06', nombre:'Suizos' },
    { codigo:'CHI-07', nombre:'Crudakiles' },
    { codigo:'CHI-08', nombre:'Crudakiles Rellenos' },
    { codigo:'CHI-09', nombre:'Kostrakiles' },
  ],
  'Huevos y Crokantes': [
    { codigo:'HUE-01', nombre:'Omelette' },
    { codigo:'HUE-02', nombre:'Revueltos' },
    { codigo:'HUE-03', nombre:'Estrellados' },
    { codigo:'HUE-04', nombre:'Huevos Rellenos' },
  ],
  'Los Dorados': [
    { codigo:'DOR-01', nombre:'Kekas' },
    { codigo:'DOR-02', nombre:'Sopes' },
  ],
  'Del Comal': [
    { codigo:'COM-01', nombre:'Gorditas' },
    { codigo:'COM-02', nombre:'Tacos' },
    { codigo:'COM-03', nombre:'Quesadillas' },
    { codigo:'COM-04', nombre:'Volcanes' },
    { codigo:'COM-05', nombre:'Sincronizadas' },
  ],
  'Enfrijoladas': [
    { codigo:'ENF-01', nombre:'Enfrijoladas' },
  ],
  'Emparedados': [
    { codigo:'EMP-01', nombre:'Croissant Relleno' },
    { codigo:'EMP-02', nombre:'Sandwich Natural' },
    { codigo:'EMP-03', nombre:'Sandwich Montecristo' },
  ],
  'Guisos Extras': [
    { codigo:'POR-01', nombre:'Porcion Arroz' },
    { codigo:'POR-02', nombre:'Porcion Frijolitos de la Casa' },
    { codigo:'POR-03', nombre:'Porcion Mole de la Casa' },
    { codigo:'POR-04', nombre:'Porcion Picadillo' },
    { codigo:'POR-05', nombre:'Porcion Deshebrada a la Mexicana' },
    { codigo:'POR-06', nombre:'Porcion Nopales' },
    { codigo:'POR-07', nombre:'Porcion Huevo' },
    { codigo:'POR-08', nombre:'Porcion Bistec' },
    { codigo:'POR-09', nombre:'Porcion Trocito de la Casa' },
    { codigo:'POR-10', nombre:'Porcion Papas' },
    { codigo:'POR-11', nombre:'Porcion Rajas Poblanas' },
    { codigo:'POR-12', nombre:'Porcion Chicharron Duro' },
    { codigo:'POR-13', nombre:'Porcion Prensado de la Casa' },
  ],
  '1/2 Litros': [
    { codigo:'LIT-01', nombre:'Arroz 1/2L' },
    { codigo:'LIT-02', nombre:'Frijolitos de la Casa 1/2L' },
    { codigo:'LIT-03', nombre:'Mole de la Casa 1/2L' },
    { codigo:'LIT-04', nombre:'Picadillo 1/2L' },
    { codigo:'LIT-05', nombre:'Deshebrada a la Mexicana 1/2L' },
    { codigo:'LIT-06', nombre:'Nopales 1/2L' },
    { codigo:'LIT-07', nombre:'Huevo 1/2L' },
    { codigo:'LIT-08', nombre:'Bistec 1/2L' },
    { codigo:'LIT-09', nombre:'Trocito de la Casa 1/2L' },
    { codigo:'LIT-10', nombre:'Papas 1/2L' },
    { codigo:'LIT-11', nombre:'Rajas Poblanas 1/2L' },
    { codigo:'LIT-12', nombre:'Chicharron Duro 1/2L' },
    { codigo:'LIT-13', nombre:'Prensado de la Casa 1/2L' },
  ],
}

const CATEGORIAS = ['Bases', 'Guisos', 'Toppings', 'Salsas', 'Insumos']
const CAT_COLOR  = { Bases:'#BA7517', Guisos:'#E24B4A', Toppings:'#1D9E75', Salsas:'#7F77DD', Insumos:'#378ADD' }
const UNIDADES   = ['g', 'kg', 'bolsa', 'ml', 'l', 'pieza']
const TIPOS_RECETA = [
  { val:'fijo',  label:'Fijo (siempre)' },
  { val:'guiso', label:'Por guiso (variable)' },
  { val:'salsa', label:'Por salsa (variable)' },
]

const fmtNum = (n, u) => { const v = parseFloat(n)||0; return `${v%1===0?v:v.toFixed(2)} ${u}` }
const semaforo = (stock, min) => stock<=0 ? '#E24B4A' : stock<=min ? '#EF9F27' : '#1D9E75'

// ─── CATÁLOGO (inline edit) ─────────────────────────────────────────────────
function CatalogoTab() {
  const [insumos, setInsumos]   = useState([])
  const [filtroCat, setFiltro]  = useState('Todos')
  const [editRow, setEditRow]   = useState(null)   // { id, nombre, unidad, stock_actual, stock_minimo, categoria }
  const [newRow, setNewRow]     = useState(null)   // mismo shape, null = no hay fila nueva
  const [msg, setMsg]           = useState(null)
  const [movRapido, setMovRapido] = useState(null) // { id, nombre, unidad, tipo:'compra'|'ajuste', cantidad:'', nota:'' }

  const cargar = useCallback(async () => {
    const { data } = await sb.from('insumos').select('*').order('nombre')
    setInsumos(data || [])
  }, [])
  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    const ch = sb.channel('insumos-catalogo-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'insumos' }, () => cargar())
      .subscribe()
    return () => { sb.removeChannel(ch) }
  }, [cargar])

  const flash = (ok, text) => { setMsg({ok,text}); setTimeout(()=>setMsg(null),2500) }

  const guardarEdicion = async () => {
    if (!editRow?.nombre?.trim()) return
    const { error } = await sb.from('insumos').update({
      nombre:      editRow.nombre.trim(),
      unidad:      editRow.unidad,
      categoria:   editRow.categoria,
      stock_actual:parseFloat(editRow.stock_actual)||0,
      stock_minimo:parseFloat(editRow.stock_minimo)||0,
      updated_at:  new Date().toISOString(),
    }).eq('id', editRow.id)
    if (error) { flash(false, error.message); return }
    setEditRow(null)
    flash(true, 'Guardado')
    cargar()
  }

  const toggleActivo = async (ins) => {
    await sb.from('insumos').update({ activo: !ins.activo, updated_at: new Date().toISOString() }).eq('id', ins.id)
    cargar()
  }

  const guardarNuevo = async () => {
    if (!newRow?.nombre?.trim()) return
    const { error } = await sb.from('insumos').insert({
      nombre:      newRow.nombre.trim(),
      unidad:      newRow.unidad,
      categoria:   newRow.categoria,
      stock_actual:parseFloat(newRow.stock_actual)||0,
      stock_minimo:parseFloat(newRow.stock_minimo)||0,
    })
    if (error) { flash(false, error.message); return }
    setNewRow(null)
    flash(true, 'Insumo agregado')
    cargar()
  }

  const eliminar = async (id) => {
    if (!confirm('¿Eliminar este insumo?')) return
    await sb.from('insumos').delete().eq('id', id)
    cargar()
  }

  const guardarMovRapido = async () => {
    if (!movRapido || !movRapido.cantidad) return
    const cant = parseFloat(movRapido.cantidad)
    if (isNaN(cant) || cant <= 0) return
    const ins = insumos.find(i => i.id === movRapido.id)
    if (!ins) return
    const delta = movRapido.tipo === 'compra' ? Math.abs(cant) : -Math.abs(cant)
    await sb.from('insumos_movimientos').insert({ insumo_id: movRapido.id, cantidad: delta, tipo: movRapido.tipo, nota: movRapido.nota || null })
    await sb.from('insumos').update({ stock_actual: Math.max(0, (ins.stock_actual||0) + delta), updated_at: new Date().toISOString() }).eq('id', movRapido.id)
    flash(true, `${movRapido.tipo === 'compra' ? '+' : '-'}${cant} ${movRapido.unidad} en "${movRapido.nombre}"`)
    setMovRapido(null)
    cargar()
  }

  const [mostrarInactivos, setMostrarInactivos] = useState(false)

  const [catsPausadas, setCatsPausadas] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ins_cats_pausadas')||'[]') } catch { return [] }
  })
  const toggleCatPausada = (cat) => {
    setCatsPausadas(prev => {
      const next = prev.includes(cat) ? prev.filter(c=>c!==cat) : [...prev, cat]
      try { localStorage.setItem('ins_cats_pausadas', JSON.stringify(next)) } catch {}
      return next
    })
  }

  const filtrados = (filtroCat==='Todos' ? insumos : insumos.filter(i=>i.categoria===filtroCat))
    .filter(i => mostrarInactivos || i.activo !== false)

  const inpSt = { padding:'3px 6px', border:'1px solid var(--accent)', borderRadius:4, fontSize:11, background:'var(--bg)', color:'var(--text1)', width:'100%' }

  const renderFila = (ins) => {
    const isEdit = editRow?.id === ins.id
    const color  = semaforo(ins.stock_actual, ins.stock_minimo)
    const catColor = CAT_COLOR[ins.categoria] || '#888'
    if (isEdit) return (
      <tr key={ins.id} style={{ borderBottom:'1px solid var(--border)', background:'var(--accent)08' }}>
        <td style={{padding:'5px 6px'}}><input value={editRow.nombre} onChange={e=>setEditRow(r=>({...r,nombre:e.target.value}))} style={inpSt}/></td>
        <td style={{padding:'5px 6px'}}>
          <select value={editRow.categoria} onChange={e=>setEditRow(r=>({...r,categoria:e.target.value}))} style={{...inpSt,width:90}}>
            {CATEGORIAS.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </td>
        <td style={{padding:'5px 6px'}}>
          <select value={editRow.unidad} onChange={e=>setEditRow(r=>({...r,unidad:e.target.value}))} style={{...inpSt,width:60}}>
            {UNIDADES.map(u=><option key={u} value={u}>{u}</option>)}
          </select>
        </td>
        <td style={{padding:'5px 6px'}}><input type="number" value={editRow.stock_actual} onChange={e=>setEditRow(r=>({...r,stock_actual:e.target.value}))} style={{...inpSt,width:70}}/></td>
        <td style={{padding:'5px 6px'}}><input type="number" value={editRow.stock_minimo} onChange={e=>setEditRow(r=>({...r,stock_minimo:e.target.value}))} style={{...inpSt,width:70}}/></td>
        <td style={{padding:'5px 6px'}}>
          <div style={{display:'flex',gap:4}}>
            <button onClick={guardarEdicion} style={{padding:'3px 10px',borderRadius:4,border:'none',background:'var(--accent)',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer'}}>✓</button>
            <button onClick={()=>setEditRow(null)} style={{padding:'3px 8px',borderRadius:4,border:'1px solid var(--border-md)',background:'transparent',color:'var(--text2)',fontSize:11,cursor:'pointer'}}>✕</button>
          </div>
        </td>
      </tr>
    )
    const inactivo = ins.activo === false
    const isMov = movRapido?.id === ins.id
    if (isMov) return (
      <tr key={ins.id} style={{ borderBottom:'1px solid var(--border)', background:'#1D9E7508' }}>
        <td colSpan={3} style={{padding:'6px 8px',fontWeight:600,fontSize:12}}>{ins.nombre} <span style={{fontWeight:400,color:'var(--text3)',fontSize:11}}>— ajustar stock</span></td>
        <td style={{padding:'6px 8px'}}>
          <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
            <select value={movRapido.tipo} onChange={e=>setMovRapido(m=>({...m,tipo:e.target.value}))}
              style={{padding:'3px 6px',border:'1px solid var(--border-md)',borderRadius:4,fontSize:11,background:'var(--bg)',color:'var(--text1)'}}>
              <option value='compra'>📦 Compra (suma)</option>
              <option value='ajuste'>📉 Ajuste (resta)</option>
            </select>
            <input type="number" placeholder="Cantidad" value={movRapido.cantidad} onChange={e=>setMovRapido(m=>({...m,cantidad:e.target.value}))}
              style={{width:80,padding:'3px 6px',border:'1px solid var(--border-md)',borderRadius:4,fontSize:11,background:'var(--bg)',color:'var(--text1)'}}/>
            <span style={{fontSize:11,color:'var(--text3)'}}>{ins.unidad}</span>
            <input placeholder="Nota (opcional)" value={movRapido.nota} onChange={e=>setMovRapido(m=>({...m,nota:e.target.value}))}
              style={{width:130,padding:'3px 6px',border:'1px solid var(--border-md)',borderRadius:4,fontSize:11,background:'var(--bg)',color:'var(--text1)'}}/>
          </div>
        </td>
        <td colSpan={2} style={{padding:'6px 8px'}}>
          <div style={{display:'flex',gap:4}}>
            <button onClick={guardarMovRapido} style={{padding:'4px 14px',borderRadius:4,border:'none',background:'var(--accent)',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer'}}>✓ Guardar</button>
            <button onClick={()=>setMovRapido(null)} style={{padding:'4px 10px',borderRadius:4,border:'1px solid var(--border-md)',background:'transparent',color:'var(--text2)',fontSize:11,cursor:'pointer'}}>✕</button>
          </div>
        </td>
      </tr>
    )
    return (
      <tr key={ins.id} style={{ borderBottom:'1px solid var(--border)', opacity: inactivo ? 0.45 : 1 }}>
        <td style={{padding:'7px 8px',fontWeight:600}}>
          {ins.nombre}
          {inactivo && <span style={{marginLeft:6,fontSize:9,padding:'1px 5px',borderRadius:99,background:'#88878022',color:'var(--text3)',fontWeight:600}}>inactivo</span>}
        </td>
        <td style={{padding:'7px 8px'}}>
          <span style={{fontSize:10,padding:'2px 7px',borderRadius:99,background:catColor+'22',color:catColor,fontWeight:600}}>{ins.categoria||'—'}</span>
        </td>
        <td style={{padding:'7px 8px',color:'var(--text3)'}}>{ins.unidad}</td>
        <td style={{padding:'7px 8px',fontWeight:700,color}}>{fmtNum(ins.stock_actual,ins.unidad)}</td>
        <td style={{padding:'7px 8px',color:'var(--text3)'}}>{fmtNum(ins.stock_minimo,ins.unidad)}</td>
        <td style={{padding:'7px 8px'}}>
          <div style={{display:'flex',gap:4}}>
            <button onClick={()=>setMovRapido({id:ins.id,nombre:ins.nombre,unidad:ins.unidad,tipo:'compra',cantidad:'',nota:''})}
              title="Registrar movimiento de stock"
              style={{fontSize:11,padding:'3px 8px',borderRadius:4,border:'none',background:'#1D9E7522',color:'#1D9E75',cursor:'pointer'}}>📦</button>
            <button onClick={()=>setEditRow({...ins})} style={{fontSize:11,padding:'3px 8px',borderRadius:4,border:'1px solid var(--border-md)',background:'transparent',cursor:'pointer',color:'var(--text2)'}}>✏️</button>
            <button onClick={()=>toggleActivo(ins)} title={inactivo?'Activar':'Desactivar temporalmente'}
              style={{fontSize:11,padding:'3px 8px',borderRadius:4,border:'none',background:inactivo?'#1D9E7522':'#EF9F2722',color:inactivo?'#1D9E75':'#EF9F27',cursor:'pointer'}}>
              {inactivo?'▶':'⏸'}
            </button>
            <button onClick={()=>eliminar(ins.id)} style={{fontSize:11,padding:'3px 8px',borderRadius:4,border:'none',background:'#E24B4A22',color:'#E24B4A',cursor:'pointer'}}>✕</button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div>
      {/* Filtros */}
      <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
        <button onClick={()=>setFiltro('Todos')} style={{padding:'4px 12px',borderRadius:99,fontSize:11,fontWeight:600,cursor:'pointer',border:`1.5px solid ${filtroCat==='Todos'?'#378ADD':'var(--border-md)'}`,background:filtroCat==='Todos'?'#378ADD22':'transparent',color:filtroCat==='Todos'?'#378ADD':'var(--text2)'}}>
          Todos <span style={{fontWeight:400,opacity:.7}}>({insumos.length})</span>
        </button>
        {CATEGORIAS.map(cat=>{
          const color=CAT_COLOR[cat]||'#378ADD'
          const sel=filtroCat===cat
          const pausada=catsPausadas.includes(cat)
          const cnt=insumos.filter(i=>i.categoria===cat).length
          return (
            <div key={cat} style={{display:'flex',alignItems:'center',gap:0,borderRadius:99,border:`1.5px solid ${pausada?'#EF9F27':sel?color:'var(--border-md)'}`,background:pausada?'#EF9F2715':sel?color+'22':'transparent',overflow:'hidden'}}>
              <button onClick={()=>setFiltro(cat)} style={{padding:'4px 10px',border:'none',background:'transparent',color:pausada?'#EF9F27':sel?color:'var(--text2)',fontSize:11,fontWeight:600,cursor:'pointer'}}>
                {pausada&&'⏸ '}{cat} <span style={{fontWeight:400,opacity:.7}}>({cnt})</span>
              </button>
              <button onClick={()=>toggleCatPausada(cat)} title={pausada?'Reactivar categoría':'Pausar toda la categoría'}
                style={{padding:'4px 7px 4px 2px',border:'none',background:'transparent',cursor:'pointer',fontSize:11,color:pausada?'#EF9F27':'var(--text3)',lineHeight:1}}>
                {pausada?'▶':'⏸'}
              </button>
            </div>
          )
        })}
        {catsPausadas.length > 0 && (
          <span style={{fontSize:10,color:'#EF9F27',fontWeight:600}}>⚠ {catsPausadas.length} categoría{catsPausadas.length>1?'s':''} pausada{catsPausadas.length>1?'s':''}</span>
        )}
        <button onClick={()=>setMostrarInactivos(v=>!v)}
          style={{padding:'4px 12px',borderRadius:99,fontSize:11,fontWeight:600,cursor:'pointer',border:`1.5px solid ${mostrarInactivos?'#EF9F27':'var(--border-md)'}`,background:mostrarInactivos?'#EF9F2722':'transparent',color:mostrarInactivos?'#EF9F27':'var(--text3)'}}>
          {mostrarInactivos?'Ocultar inactivos':'Ver inactivos'}
        </button>
        <button onClick={()=>setNewRow({nombre:'',unidad:'g',categoria:'Guisos',stock_actual:'',stock_minimo:''})}
          style={{marginLeft:'auto',padding:'5px 14px',borderRadius:'var(--r-md)',border:'none',background:'var(--accent)',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer'}}>
          + Agregar
        </button>
        {msg && <span style={{fontSize:11,color:msg.ok?'#1D9E75':'#E24B4A'}}>{msg.text}</span>}
      </div>

      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
        <thead>
          <tr style={{borderBottom:'2px solid var(--border)'}}>
            {['Insumo','Cat.','Unidad','Stock actual','Alerta ≤',''].map(h=>(
              <th key={h} style={{padding:'5px 8px',textAlign:'left',fontSize:11,color:'var(--text3)',fontWeight:600}}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Fila nueva */}
          {newRow && (
            <tr style={{borderBottom:'1px solid var(--border)',background:'#1D9E7508'}}>
              <td style={{padding:'5px 6px'}}><input placeholder="Nombre del insumo" value={newRow.nombre} onChange={e=>setNewRow(r=>({...r,nombre:e.target.value}))} style={inpSt} autoFocus/></td>
              <td style={{padding:'5px 6px'}}>
                <select value={newRow.categoria} onChange={e=>setNewRow(r=>({...r,categoria:e.target.value}))} style={{...inpSt,width:90}}>
                  {CATEGORIAS.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </td>
              <td style={{padding:'5px 6px'}}>
                <select value={newRow.unidad} onChange={e=>setNewRow(r=>({...r,unidad:e.target.value}))} style={{...inpSt,width:60}}>
                  {UNIDADES.map(u=><option key={u} value={u}>{u}</option>)}
                </select>
              </td>
              <td style={{padding:'5px 6px'}}><input type="number" placeholder="0" value={newRow.stock_actual} onChange={e=>setNewRow(r=>({...r,stock_actual:e.target.value}))} style={{...inpSt,width:70}}/></td>
              <td style={{padding:'5px 6px'}}><input type="number" placeholder="0" value={newRow.stock_minimo} onChange={e=>setNewRow(r=>({...r,stock_minimo:e.target.value}))} style={{...inpSt,width:70}}/></td>
              <td style={{padding:'5px 6px'}}>
                <div style={{display:'flex',gap:4}}>
                  <button onClick={guardarNuevo} style={{padding:'3px 10px',borderRadius:4,border:'none',background:'#1D9E75',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer'}}>✓</button>
                  <button onClick={()=>setNewRow(null)} style={{padding:'3px 8px',borderRadius:4,border:'1px solid var(--border-md)',background:'transparent',color:'var(--text2)',fontSize:11,cursor:'pointer'}}>✕</button>
                </div>
              </td>
            </tr>
          )}
          {filtrados.map(renderFila)}
          {!filtrados.length && !newRow && (
            <tr><td colSpan={6} style={{padding:24,textAlign:'center',color:'var(--text3)',fontSize:12}}>
              {insumos.length ? 'Sin insumos en esta categoría.' : 'Sin insumos. Haz clic en + Agregar.'}
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ─── RECETAS (por familia) ──────────────────────────────────────────────────
// Slots fijos del editor de recetas
const SLOTS_DEF = [
  { key:'base',    icon:'🫓', label:'Base',    tipo:'fijo',    hint:'Totopos, Masa…',        unitHint:'' },
  { key:'guiso',   icon:'🍲', label:'Guiso',   tipo:'guiso',   hint:'Porción por guiso',      unitHint:'g' },
  { key:'salsa',   icon:'🌶️', label:'Salsa',   tipo:'salsa',   hint:'Porción por salsa',      unitHint:'ml' },
  { key:'topping', icon:'🧀', label:'Topping', tipo:'topping', hint:'Porción por topping',    unitHint:'g' },
]
const emptySlots = () => ({ base:{ insumo_id:'', cantidad:'' }, guiso:{ cantidad:'' }, salsa:{ cantidad:'' }, topping:{ cantidad:'' } })

function RecetasTab() {
  const [insumos, setInsumos] = useState([])
  const [recetas, setRecetas] = useState([])
  const [famSel,  setFamSel]  = useState(null)
  const [panel,   setPanel]   = useState('ver')      // 'ver' | 'base' | 'extra'
  const [checks,  setChecks]  = useState({})
  const [slots,   setSlots]   = useState(emptySlots())
  const [newExtra, setNE]     = useState({ codigo:'', insumo_id:'', cantidad:'' })
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState(null)

  // Familias visibles = todas menos las pausadas desde Disponibilidad
  const famsPausadas = (() => { try { return JSON.parse(localStorage.getItem('menu_familias_pausadas')||'[]') } catch { return [] } })()
  const FAMILIAS_VISIBLES = Object.fromEntries(Object.entries(FAMILIAS).filter(([k]) => !famsPausadas.includes(k)))

  const cargar = useCallback(async () => {
    const [{ data: ins }, { data: rec }] = await Promise.all([
      sb.from('insumos').select('id,nombre,unidad,categoria').order('nombre'),
      sb.from('recetas').select('*'),
    ])
    setInsumos(ins || [])
    setRecetas(rec || [])
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const flash = (ok, text) => { setMsg({ok,text}); setTimeout(()=>setMsg(null),3000) }
  const insumoById = Object.fromEntries((insumos||[]).map(i=>[i.id,i]))
  const baseIds    = (insumos||[]).filter(i=>i.categoria==='Bases').map(i=>i.id)

  const codFamilia = famSel ? (FAMILIAS_VISIBLES[famSel]||[]).map(p=>p.codigo) : []
  const famColors  = { 'Los Chilakiles':'#E24B4A','Huevos y Crokantes':'#D85A30','Los Dorados':'#D85A30','Del Comal':'#BA7517','Enfrijoladas':'#BA3B3B','Emparedados':'#2D9E6A','Guisos Extras':'#8B6914','1/2 Litros':'#D4A017' }

  const recsFamilia = recetas.filter(r=>codFamilia.includes(r.producto_codigo))

  // Agrupar receta actual por producto
  const recetaPorProd = {}
  recsFamilia.forEach(r => {
    if (!recetaPorProd[r.producto_codigo]) recetaPorProd[r.producto_codigo] = []
    recetaPorProd[r.producto_codigo].push(r)
  })

  const abrirFamilia = (fam) => {
    setFamSel(fam)
    setPanel('ver')
    const codigos = FAMILIAS_VISIBLES[fam].map(p=>p.codigo)
    const ch = {}; codigos.forEach(c=>{ ch[c]=true }); setChecks(ch)
    setMsg(null)
    // Pre-cargar slots desde receta existente (primer producto)
    const recs = recetas.filter(r=>codigos.includes(r.producto_codigo))
    const s = emptySlots()
    recs.forEach(r => {
      if (r.tipo==='guiso')        s.guiso.cantidad   = String(r.cantidad)
      else if (r.tipo==='salsa')   s.salsa.cantidad   = String(r.cantidad)
      else if (r.tipo==='topping') s.topping.cantidad = String(r.cantidad)
      else if (r.tipo==='fijo' && baseIds.includes(r.insumo_id)) {
        s.base.insumo_id = r.insumo_id; s.base.cantidad = String(r.cantidad)
      }
    })
    setSlots(s)
    setNE({ codigo: codigos[0]||'', insumo_id:'', cantidad:'' })
  }

  const setSlot = (key, field, val) => setSlots(prev=>({ ...prev, [key]:{ ...prev[key], [field]:val } }))

  // Guardar base común → SOLO borra filas de base (no extras por producto) para los checked
  const guardarBase = async () => {
    const selCodigos = Object.entries(checks).filter(([,v])=>v).map(([k])=>k)
    if (!selCodigos.length) return
    const rows = []
    const s = slots
    if (s.base.insumo_id && s.base.cantidad)   rows.push({ tipo:'fijo',    insumo_id:s.base.insumo_id,  cantidad:parseFloat(s.base.cantidad) })
    if (s.guiso.cantidad)                       rows.push({ tipo:'guiso',   insumo_id:null,              cantidad:parseFloat(s.guiso.cantidad) })
    if (s.salsa.cantidad)                       rows.push({ tipo:'salsa',   insumo_id:null,              cantidad:parseFloat(s.salsa.cantidad) })
    if (s.topping.cantidad)                     rows.push({ tipo:'topping', insumo_id:null,              cantidad:parseFloat(s.topping.cantidad) })
    if (!rows.length) { flash(false,'Define al menos un componente'); return }
    setSaving(true)
    try {
      // Borrar solo filas de tipo base/guiso/salsa/topping (no los extras fijos por producto)
      for (const codigo of selCodigos) {
        await sb.from('recetas').delete().eq('producto_codigo', codigo).eq('tipo','guiso')
        await sb.from('recetas').delete().eq('producto_codigo', codigo).eq('tipo','salsa')
        await sb.from('recetas').delete().eq('producto_codigo', codigo).eq('tipo','topping')
        // Borrar solo fijos que son bases
        const existentes = recetas.filter(r=>r.producto_codigo===codigo && r.tipo==='fijo' && baseIds.includes(r.insumo_id))
        for (const r of existentes) await sb.from('recetas').delete().eq('id', r.id)
      }
      const inserts = selCodigos.flatMap(codigo => rows.map(r=>({ producto_codigo:codigo, ...r })))
      const { error } = await sb.from('recetas').insert(inserts)
      if (error) { flash(false, error.message); setSaving(false); return }
      flash(true, `✓ Base guardada para ${selCodigos.length} producto(s)`)
      cargar()
    } catch(e) { flash(false, e.message) }
    setSaving(false)
  }

  // Agregar extra a un producto específico
  const agregarExtra = async () => {
    const { codigo, insumo_id, cantidad } = newExtra
    if (!codigo || !insumo_id || !cantidad) return
    setSaving(true)
    const { error } = await sb.from('recetas').insert({ producto_codigo:codigo, insumo_id, cantidad:parseFloat(cantidad), tipo:'fijo' })
    if (error) flash(false, error.message)
    else { flash(true,'✓ Extra agregado'); setNE(n=>({...n, insumo_id:'', cantidad:''})); cargar() }
    setSaving(false)
  }

  // Borrar una fila de receta por ID
  const borrarFila = async (id) => {
    await sb.from('recetas').delete().eq('id', id)
    cargar()
  }

  const borrarTodoFamilia = async () => {
    if (!confirm('¿Borrar toda la receta de esta familia?')) return
    await sb.from('recetas').delete().in('producto_codigo', codFamilia)
    setSlots(emptySlots()); cargar()
  }

  const insumosBase  = insumos.filter(i=>i.categoria==='Bases')
  const insumosExtra = insumos.filter(i=>i.categoria!=='Bases')
  const color        = famColors[famSel]||'var(--accent)'
  const tieneReceta  = recsFamilia.length > 0

  const chipIng = (r) => {
    const ins = insumoById[r.insumo_id]
    const label = r.tipo==='guiso'?'Guiso':r.tipo==='salsa'?'Salsa':r.tipo==='topping'?'Topping':ins?.nombre||'?'
    const col = r.tipo==='guiso'?'#E24B4A':r.tipo==='salsa'?'#D85A30':r.tipo==='topping'?'#1D9E75':'#378ADD'
    return <span key={r.id} style={{display:'inline-flex',alignItems:'center',gap:3,fontSize:10,padding:'2px 7px',borderRadius:99,background:col+'18',color:col,border:`1px solid ${col}33`,marginRight:4,marginBottom:2}}>
      {label} {r.cantidad}{ins?.unidad||''}
      <button onClick={()=>borrarFila(r.id)} style={{border:'none',background:'none',color:col,cursor:'pointer',fontSize:10,padding:'0 0 0 2px',lineHeight:1}}>×</button>
    </span>
  }

  const tabStyle = (active) => ({
    padding:'5px 14px', borderRadius:'var(--r-md)', fontSize:11, fontWeight:600, cursor:'pointer',
    border:`1px solid ${active?color:'var(--border-md)'}`,
    background: active?color+'18':'transparent', color: active?color:'var(--text2)'
  })

  return (
    <div style={{display:'flex',gap:16,alignItems:'flex-start'}}>

      {/* Panel izq: familias */}
      <div style={{width:175,flexShrink:0}}>
        <div style={{fontSize:11,fontWeight:700,color:'var(--text3)',marginBottom:8,textTransform:'uppercase',letterSpacing:.5}}>Familia</div>
        {Object.keys(FAMILIAS_VISIBLES).map(fam=>{
          const fc=famColors[fam]||'#888'
          const tieneR=recetas.some(r=>FAMILIAS_VISIBLES[fam].map(p=>p.codigo).includes(r.producto_codigo))
          return <button key={fam} onClick={()=>abrirFamilia(fam)}
            style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',padding:'8px 10px',marginBottom:4,borderRadius:'var(--r-md)',border:`1.5px solid ${famSel===fam?fc:'var(--border-md)'}`,background:famSel===fam?fc+'18':'transparent',color:famSel===fam?fc:'var(--text2)',fontSize:12,fontWeight:600,cursor:'pointer',textAlign:'left'}}>
            <span>{fam}</span>
            {tieneR&&<span style={{fontSize:9,padding:'1px 5px',borderRadius:99,background:fc+'22',color:fc}}>✓</span>}
          </button>
        })}
      </div>

      {/* Panel der */}
      {!famSel ? (
        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',height:200,color:'var(--text3)',fontSize:13}}>
          Selecciona una familia
        </div>
      ) : (
        <div style={{flex:1,minWidth:0}}>

          {/* Header */}
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,flexWrap:'wrap'}}>
            <div style={{fontSize:14,fontWeight:700,color}}>{famSel}</div>
            {tieneReceta && <span style={{fontSize:10,padding:'2px 7px',borderRadius:99,background:'#1D9E7522',color:'#1D9E75',fontWeight:600}}>✓ Con receta</span>}
            <div style={{display:'flex',gap:4,marginLeft:'auto'}}>
              <button style={tabStyle(panel==='ver')}   onClick={()=>setPanel('ver')}>👁 Ver receta</button>
              <button style={tabStyle(panel==='base')}  onClick={()=>setPanel('base')}>🫓 Base común</button>
              <button style={tabStyle(panel==='extra')} onClick={()=>setPanel('extra')}>➕ Extra por producto</button>
              {tieneReceta && <button onClick={borrarTodoFamilia} style={{fontSize:10,padding:'4px 8px',borderRadius:4,border:'none',background:'#E24B4A18',color:'#E24B4A',cursor:'pointer'}}>🗑 Borrar todo</button>}
            </div>
            {msg && <span style={{fontSize:12,color:msg.ok?'#1D9E75':'#E24B4A',fontWeight:600}}>{msg.text}</span>}
          </div>

          {/* ── VER ─────────────────────────────── */}
          {panel==='ver' && (
            <div>
              {!tieneReceta && <div style={{color:'var(--text3)',fontSize:12,fontStyle:'italic',padding:16}}>Sin receta configurada. Usa "Base común" para empezar.</div>}
              {(FAMILIAS_VISIBLES[famSel]||[]).map(prod=>{
                const rows = recetaPorProd[prod.codigo]||[]
                return (
                  <div key={prod.codigo} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                    <div style={{minWidth:130,fontSize:12,fontWeight:600,paddingTop:3}}>{prod.nombre}</div>
                    <div style={{flex:1,flexWrap:'wrap',display:'flex'}}>
                      {rows.length ? rows.map(r=>chipIng(r)) : <span style={{fontSize:11,color:'var(--text3)',fontStyle:'italic'}}>Sin ingredientes</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── BASE COMÚN ──────────────────────── */}
          {panel==='base' && (
            <div>
              <div style={{fontSize:11,color:'var(--text3)',marginBottom:12}}>
                Define la receta que se aplica a todos los productos seleccionados. Los ingredientes extra por producto no se tocarán.
              </div>
              {/* Slots */}
              <div style={{background:'var(--surface)',borderRadius:'var(--r-md)',border:'1px solid var(--border)',overflow:'hidden',marginBottom:12}}>
                <div style={{padding:'7px 14px',background:'var(--border)',fontSize:10,fontWeight:700,color:'var(--text3)',display:'grid',gridTemplateColumns:'90px 1fr 90px 60px',gap:8}}>
                  <span>Componente</span><span>Insumo</span><span style={{textAlign:'right'}}>Cantidad</span><span>Unidad</span>
                </div>
                {SLOTS_DEF.map(sl=>{
                  const sv=slots[sl.key]; const ins=sl.tipo==='fijo'?insumoById[sv.insumo_id]:null
                  return (
                    <div key={sl.key} style={{display:'grid',gridTemplateColumns:'90px 1fr 90px 60px',gap:8,padding:'9px 14px',borderBottom:'1px solid var(--border)',alignItems:'center'}}>
                      <div style={{display:'flex',alignItems:'center',gap:5}}>
                        <span>{sl.icon}</span><span style={{fontSize:11,fontWeight:600}}>{sl.label}</span>
                      </div>
                      {sl.tipo==='fijo' ? (
                        <select value={sv.insumo_id} onChange={e=>setSlot(sl.key,'insumo_id',e.target.value)} style={{...inpSt,width:'100%'}}>
                          <option value=''>— Sin base —</option>
                          {insumosBase.map(i=><option key={i.id} value={i.id}>{i.nombre}</option>)}
                        </select>
                      ) : (
                        <span style={{fontSize:11,color:'var(--text3)',fontStyle:'italic'}}>{sl.hint}</span>
                      )}
                      <input type="number" value={sv.cantidad} onChange={e=>setSlot(sl.key,'cantidad',e.target.value)} placeholder="—" style={{...inpSt,textAlign:'right',width:'100%'}}/>
                      <span style={{fontSize:11,color:'var(--text3)'}}>{sl.tipo==='fijo'?(ins?.unidad||''):sl.unitHint}</span>
                    </div>
                  )
                })}
              </div>
              {/* Checkboxes */}
              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:600,color:'var(--text2)',marginBottom:6,display:'flex',alignItems:'center',gap:8}}>
                  Aplica a
                  <button onClick={()=>{ const ch={}; FAMILIAS_VISIBLES[famSel].forEach(p=>{ch[p.codigo]=true}); setChecks(ch) }} style={{fontSize:10,padding:'1px 8px',borderRadius:99,border:'1px solid var(--border-md)',background:'transparent',color:'var(--text3)',cursor:'pointer'}}>todos</button>
                  <button onClick={()=>setChecks({})} style={{fontSize:10,padding:'1px 8px',borderRadius:99,border:'1px solid var(--border-md)',background:'transparent',color:'var(--text3)',cursor:'pointer'}}>ninguno</button>
                </div>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {(FAMILIAS_VISIBLES[famSel]||[]).map(p=>(
                    <label key={p.codigo} style={{display:'flex',alignItems:'center',gap:4,padding:'4px 11px',borderRadius:99,border:`1px solid ${checks[p.codigo]?color:'var(--border-md)'}`,background:checks[p.codigo]?color+'15':'transparent',cursor:'pointer',fontSize:11,fontWeight:500,userSelect:'none'}}>
                      <input type="checkbox" checked={!!checks[p.codigo]} onChange={e=>setChecks(c=>({...c,[p.codigo]:e.target.checked}))} style={{accentColor:color}}/>
                      {p.nombre}
                    </label>
                  ))}
                </div>
              </div>
              <button onClick={guardarBase} disabled={saving} style={{padding:'9px 22px',borderRadius:'var(--r-md)',border:'none',background:color,color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                {saving?'Guardando…':'💾 Guardar base'}
              </button>
            </div>
          )}

          {/* ── EXTRA POR PRODUCTO ───────────────── */}
          {panel==='extra' && (
            <div>
              <div style={{fontSize:11,color:'var(--text3)',marginBottom:12}}>
                Agrega un ingrediente fijo a un producto específico sin afectar al resto de la familia.
              </div>
              <div style={{display:'flex',gap:8,alignItems:'flex-end',flexWrap:'wrap',marginBottom:16,background:'var(--surface)',padding:12,borderRadius:'var(--r-md)',border:'1px solid var(--border)'}}>
                <div>
                  <div style={{fontSize:10,color:'var(--text3)',marginBottom:2}}>Producto</div>
                  <select value={newExtra.codigo} onChange={e=>setNE(n=>({...n,codigo:e.target.value}))} style={{...inpSt,minWidth:130}}>
                    <option value=''>— Producto —</option>
                    {(FAMILIAS_VISIBLES[famSel]||[]).map(p=><option key={p.codigo} value={p.codigo}>{p.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{fontSize:10,color:'var(--text3)',marginBottom:2}}>Insumo extra</div>
                  <select value={newExtra.insumo_id} onChange={e=>setNE(n=>({...n,insumo_id:e.target.value}))} style={{...inpSt,minWidth:160}}>
                    <option value=''>— Insumo —</option>
                    {CATEGORIAS.filter(c=>c!=='Bases').map(cat=>{
                      const g=insumosExtra.filter(x=>x.categoria===cat); if(!g.length) return null
                      return <optgroup key={cat} label={cat}>{g.map(x=><option key={x.id} value={x.id}>{x.nombre} ({x.unidad})</option>)}</optgroup>
                    })}
                  </select>
                </div>
                <div>
                  <div style={{fontSize:10,color:'var(--text3)',marginBottom:2}}>Cantidad</div>
                  <input type="number" value={newExtra.cantidad} onChange={e=>setNE(n=>({...n,cantidad:e.target.value}))} placeholder="0" style={{...inpSt,width:70,textAlign:'right'}}/>
                </div>
                <button onClick={agregarExtra} disabled={saving} style={{padding:'7px 16px',borderRadius:'var(--r-md)',border:'none',background:color,color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer'}}>
                  + Añadir
                </button>
              </div>

              {/* Extras actuales por producto */}
              <div style={{fontSize:11,fontWeight:600,color:'var(--text2)',marginBottom:8}}>Extras configurados</div>
              {(FAMILIAS_VISIBLES[famSel]||[]).map(prod=>{
                const extras = (recetaPorProd[prod.codigo]||[]).filter(r=>r.tipo==='fijo' && !baseIds.includes(r.insumo_id))
                if (!extras.length) return null
                return (
                  <div key={prod.codigo} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'6px 0',borderBottom:'1px solid var(--border)'}}>
                    <div style={{minWidth:130,fontSize:12,fontWeight:600,paddingTop:3}}>{prod.nombre}</div>
                    <div>{extras.map(r=>chipIng(r))}</div>
                  </div>
                )
              })}
              {!(FAMILIAS_VISIBLES[famSel]||[]).some(p=>(recetaPorProd[p.codigo]||[]).some(r=>r.tipo==='fijo'&&!baseIds.includes(r.insumo_id))) &&
                <div style={{fontSize:11,color:'var(--text3)',fontStyle:'italic'}}>Sin extras configurados.</div>
              }
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── STOCK ──────────────────────────────────────────────────────────────────
function StockTab() {
  const [insumos, setInsumos]   = useState([])
  const [movimientos, setMovs]  = useState([])
  const [movForm, setMovForm]   = useState({ insumo_id:'', cantidad:'', tipo:'compra', nota:'' })
  const [msg, setMsg]           = useState(null)

  const cargar = useCallback(async () => {
    const [{ data: ins }, { data: movs }] = await Promise.all([
      sb.from('insumos').select('*').order('nombre'),
      sb.from('insumos_movimientos').select('*').order('created_at',{ascending:false}).limit(50),
    ])
    setInsumos(ins||[])
    setMovs(movs||[])
  }, [])
  useEffect(()=>{ cargar() },[cargar])

  useEffect(() => {
    const ch = sb.channel('insumos-stock-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'insumos' }, () => cargar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'insumos_movimientos' }, () => cargar())
      .subscribe()
    return () => { sb.removeChannel(ch) }
  }, [cargar])

  const registrar = async () => {
    if (!movForm.insumo_id || !movForm.cantidad) return
    const ins = insumos.find(i=>i.id===movForm.insumo_id)
    if (!ins) return
    const delta = movForm.tipo==='compra' ? Math.abs(parseFloat(movForm.cantidad)) : -Math.abs(parseFloat(movForm.cantidad))
    await sb.from('insumos_movimientos').insert({ insumo_id:movForm.insumo_id, cantidad:delta, tipo:movForm.tipo, nota:movForm.nota||null })
    await sb.from('insumos').update({ stock_actual:Math.max(0,(ins.stock_actual||0)+delta), updated_at:new Date().toISOString() }).eq('id',movForm.insumo_id)
    setMovForm({ insumo_id:'', cantidad:'', tipo:'compra', nota:'' })
    setMsg({ok:true,text:'Registrado'}); setTimeout(()=>setMsg(null),2000)
    cargar()
  }

  const alertas = insumos.filter(i=>i.stock_actual<=i.stock_minimo)

  return (
    <div>
      {alertas.length>0 && (
        <div style={{background:'#EF9F2715',border:'1px solid #EF9F2766',borderRadius:'var(--r-md)',padding:'10px 14px',marginBottom:14}}>
          <div style={{fontSize:12,fontWeight:700,color:'#EF9F27',marginBottom:6}}>⚠️ Insumos bajo mínimo</div>
          {alertas.map(i=>(
            <div key={i.id} style={{fontSize:12,color:i.stock_actual<=0?'#E24B4A':'#EF9F27',display:'flex',gap:8}}>
              <span>• {i.nombre}</span>
              <span style={{fontWeight:700}}>Stock: {fmtNum(i.stock_actual,i.unidad)}</span>
              <span style={{color:'var(--text3)'}}>/ mín. {fmtNum(i.stock_minimo,i.unidad)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{background:'var(--surface)',borderRadius:'var(--r-md)',padding:14,marginBottom:14,border:'1px solid var(--border)'}}>
        <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>📦 Registrar movimiento</div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'flex-end'}}>
          <div>
            <div style={{fontSize:10,color:'var(--text3)',marginBottom:2}}>Insumo</div>
            <select value={movForm.insumo_id} onChange={e=>setMovForm(f=>({...f,insumo_id:e.target.value}))} style={{...inpSt,minWidth:180}}>
              <option value=''>— Selecciona —</option>
              {CATEGORIAS.map(cat=>{
                const g=insumos.filter(i=>i.categoria===cat); if(!g.length) return null
                return <optgroup key={cat} label={cat}>{g.map(i=><option key={i.id} value={i.id}>{i.nombre}</option>)}</optgroup>
              })}
            </select>
          </div>
          <div>
            <div style={{fontSize:10,color:'var(--text3)',marginBottom:2}}>Tipo</div>
            <select value={movForm.tipo} onChange={e=>setMovForm(f=>({...f,tipo:e.target.value}))} style={inpSt}>
              <option value='compra'>Compra (suma)</option>
              <option value='ajuste'>Ajuste (resta)</option>
            </select>
          </div>
          <div>
            <div style={{fontSize:10,color:'var(--text3)',marginBottom:2}}>Cantidad</div>
            <input type="number" value={movForm.cantidad} onChange={e=>setMovForm(f=>({...f,cantidad:e.target.value}))} placeholder="0" style={{...inpSt,width:80}}/>
          </div>
          <div>
            <div style={{fontSize:10,color:'var(--text3)',marginBottom:2}}>Nota</div>
            <input value={movForm.nota} onChange={e=>setMovForm(f=>({...f,nota:e.target.value}))} placeholder="Proveedor..." style={{...inpSt,minWidth:160}}/>
          </div>
          <button onClick={registrar} style={{padding:'7px 16px',borderRadius:'var(--r-md)',border:'none',background:'var(--accent)',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>Registrar</button>
          {msg && <span style={{fontSize:11,color:'#1D9E75'}}>{msg.text}</span>}
        </div>
      </div>

      <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>Estado actual</div>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,marginBottom:20}}>
        <thead><tr style={{borderBottom:'2px solid var(--border)'}}>
          {['Insumo','Cat.','Unidad','Stock','Mínimo','Estado'].map(h=>(
            <th key={h} style={{padding:'5px 8px',textAlign:'left',fontSize:11,color:'var(--text3)',fontWeight:600}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {insumos.map(ins=>{
            const color=semaforo(ins.stock_actual,ins.stock_minimo)
            const catColor=CAT_COLOR[ins.categoria]||'#888'
            return <tr key={ins.id} style={{borderBottom:'1px solid var(--border)',background:ins.stock_actual<=ins.stock_minimo?color+'08':'transparent'}}>
              <td style={{padding:'6px 8px',fontWeight:600}}>{ins.nombre}</td>
              <td style={{padding:'6px 8px'}}><span style={{fontSize:10,padding:'1px 6px',borderRadius:99,background:catColor+'22',color:catColor}}>{ins.categoria}</span></td>
              <td style={{padding:'6px 8px',color:'var(--text3)'}}>{ins.unidad}</td>
              <td style={{padding:'6px 8px',fontWeight:700,color}}>{fmtNum(ins.stock_actual,ins.unidad)}</td>
              <td style={{padding:'6px 8px',color:'var(--text3)'}}>{fmtNum(ins.stock_minimo,ins.unidad)}</td>
              <td style={{padding:'6px 8px'}}><span style={{fontSize:10,padding:'2px 8px',borderRadius:99,background:color+'22',color}}>{ins.stock_actual<=0?'🔴 Sin stock':ins.stock_actual<=ins.stock_minimo?'🟡 Bajo':'🟢 OK'}</span></td>
            </tr>
          })}
        </tbody>
      </table>

      <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>Últimos movimientos</div>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
        <thead><tr style={{borderBottom:'2px solid var(--border)'}}>
          {['Fecha','Insumo','Tipo','Cantidad','Nota'].map(h=>(
            <th key={h} style={{padding:'4px 8px',textAlign:'left',fontSize:11,color:'var(--text3)',fontWeight:600}}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {movimientos.map(m=>{
            const ins=insumos.find(i=>i.id===m.insumo_id)
            return <tr key={m.id} style={{borderBottom:'1px solid var(--border)'}}>
              <td style={{padding:'5px 8px',color:'var(--text3)'}}>{new Date(m.created_at).toLocaleDateString('es-MX',{day:'2-digit',month:'short'})} {new Date(m.created_at).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}</td>
              <td style={{padding:'5px 8px',fontWeight:600}}>{ins?.nombre||'—'}</td>
              <td style={{padding:'5px 8px'}}><span style={{fontSize:10,padding:'1px 6px',borderRadius:99,background:m.tipo==='venta'?'#E24B4A22':m.tipo==='compra'?'#1D9E7522':'#EF9F2722',color:m.tipo==='venta'?'#E24B4A':m.tipo==='compra'?'#1D9E75':'#EF9F27'}}>{m.tipo==='venta'?'🍽 Venta':m.tipo==='compra'?'📦 Compra':'⚙️ Ajuste'}</span></td>
              <td style={{padding:'5px 8px',fontWeight:700,color:m.cantidad<0?'#E24B4A':'#1D9E75'}}>{m.cantidad>0?'+':''}{m.cantidad} {ins?.unidad||''}</td>
              <td style={{padding:'5px 8px',color:'var(--text3)'}}>{m.nota||(m.comanda_id?`#${m.comanda_id.slice(-4).toUpperCase()}`:'—')}</td>
            </tr>
          })}
          {!movimientos.length && <tr><td colSpan={5} style={{padding:16,textAlign:'center',color:'var(--text3)'}}>Sin movimientos</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ─── PLANEACIÓN ─────────────────────────────────────────────────────────────
function PlaneacionTab() {
  const [datos,   setDatos]   = useState(null)
  const [dias,    setDias]    = useState(7)
  const [loading, setLoading] = useState(false)

  const calcular = useCallback(async () => {
    setLoading(true)
    try {
      const desde = new Date(); desde.setDate(desde.getDate()-dias)
      const desdeStr = desde.toISOString().slice(0,10)
      // IMPORTANTE: comandas_activas se limpia sola pocos segundos despues de cobrar
      // (ver loadComandas en Comanda.jsx) — el historial real y persistente vive en `ventas`.
      const [{ data: ventas }, { data: productos }, { data: insumos }, { data: recetas }] = await Promise.all([
        sb.from('ventas').select('producto,categoria,unidades,fecha').gte('fecha',desdeStr),
        sb.from('productos').select('codigo,nombre,familias(nombre)'),
        sb.from('insumos').select('*').order('nombre'),
        sb.from('recetas').select('*'),
      ])
      const normStr = s=>(s||'').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g,'')
      const ALIAS_GUISO = { 'huevo estrellado':'Huevo','claras de huevo':'Huevo' }
      const ALIAS_SALSA = { 'diabla':'La Suegra','la suegra + diabla':'La Suegra' }
      const resolveG = n => { const a=ALIAS_GUISO[normStr(n)]; return a?[a]:[n] }
      const resolveS = n => { const a=ALIAS_SALSA[normStr(n)]; return a?[a]:[n] }
      const insumoByNombre={}; (insumos||[]).forEach(i=>{insumoByNombre[normStr(i.nombre)]=i})
      const codigoByNombre={}; (productos||[]).forEach(p=>{codigoByNombre[normStr(p.nombre)]=p.codigo})
      // Catalogos por familia (Guisos/Salsas/Toppings) — para clasificar correctamente
      // cada token de texto y no aplicar la cantidad de "salsa" a un guiso, etc.
      const nombresPorFam = fam => new Set((productos||[]).filter(p=>p.familias?.nombre===fam).map(p=>normStr(p.nombre)))
      const NOMBRES_GUISO   = nombresPorFam('Guisos')
      const NOMBRES_SALSA   = nombresPorFam('Salsas')
      const NOMBRES_TOPPING = nombresPorFam('Toppings')
      const consumo={}
      const sumar=(nombre,cant)=>{ const i=insumoByNombre[normStr(nombre)]; if(i) consumo[i.id]=(consumo[i.id]||0)+cant }
      // `ventas.producto` guarda "Nombre (seg1 | seg2 | ...)" — reconstruye las selecciones
      // (guiso/salsa/topping/extra) desde el texto ya que no se persiste el _config estructurado
      const parseTokens = producto => {
        const m = producto.match(/\(([^)]*)\)\s*$/)
        if (!m) return []
        return m[1].split('|').flatMap(seg => seg.split(',')).map(t =>
          t.trim().replace(/\s*\(\+\$\d+(\.\d+)?\)\s*$/,'').replace(/\s*\+\$\d+(\.\d+)?\s*$/,'')
        ).filter(Boolean)
      }
      for (const v of (ventas||[])) {
        const qty = v.unidades || 1
        const nombreBase = (v.producto||'').split(' (')[0].trim()
        const codigo = codigoByNombre[normStr(nombreBase)]
        if (!codigo) continue
        const tokens = parseTokens(v.producto||'')
        // Clasificar cada token segun el catalogo real (evita aplicar cantidad de salsa a un guiso)
        const tGuiso   = tokens.filter(t=>NOMBRES_GUISO.has(normStr(t)))
        const tSalsa   = tokens.filter(t=>NOMBRES_SALSA.has(normStr(t)))
        const tTopping = tokens.filter(t=>NOMBRES_TOPPING.has(normStr(t)))
        const recs = (recetas||[]).filter(r=>r.producto_codigo===codigo)
        for (const r of recs) {
          if (r.tipo==='fijo') { if(r.insumo_id) consumo[r.insumo_id]=(consumo[r.insumo_id]||0)+r.cantidad*qty }
          else if (r.tipo==='guiso')   tGuiso.forEach(t=>resolveG(t).forEach(n=>sumar(n,r.cantidad*qty)))
          else if (r.tipo==='salsa')   tSalsa.forEach(t=>resolveS(t).forEach(n=>sumar(n,r.cantidad*qty)))
          else if (r.tipo==='topping') tTopping.forEach(t=>sumar(t,r.cantidad*qty))
        }
      }
      const resultado=(insumos||[]).map(i=>{
        const consumido=consumo[i.id]||0; const diario=consumido/dias; const proy=Math.ceil(diario*7)
        return {...i,consumido,diario,proyectado7:proy,faltante:Math.max(0,proy-(i.stock_actual||0))}
      }).filter(i=>i.consumido>0||i.stock_actual>0||i.stock_minimo>0)
        .sort((a,b)=>(b.faltante>0?1:0)-(a.faltante>0?1:0)||b.faltante-a.faltante)
      setDatos(resultado)
    } catch(e) { console.error(e) }
    setLoading(false)
  },[dias])
  useEffect(()=>{ calcular() },[calcular])

  const compras=(datos||[]).filter(d=>d.faltante>0)
  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
        <div style={{fontSize:13,fontWeight:700}}>📊 Proyección semanal</div>
        <div style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'var(--text2)'}}>
          Últimas <select value={dias} onChange={e=>setDias(Number(e.target.value))} style={{...inpSt,width:80,padding:'3px 6px'}}><option value={7}>7 días</option><option value={14}>14 días</option><option value={30}>30 días</option></select>
        </div>
        <button onClick={calcular} disabled={loading} style={{padding:'5px 12px',borderRadius:'var(--r-md)',border:'1px solid var(--border-md)',background:'transparent',color:'var(--text2)',fontSize:12,cursor:'pointer'}}>{loading?'⟳':'↺'}</button>
      </div>
      {compras.length>0 && (
        <div style={{background:'#1D9E7510',border:'1px solid #1D9E7544',borderRadius:'var(--r-md)',padding:'12px 16px',marginBottom:14}}>
          <div style={{fontSize:12,fontWeight:700,color:'#1D9E75',marginBottom:8}}>🛒 Lista de compras (próxima semana)</div>
          {compras.map(d=>(
            <div key={d.id} style={{display:'flex',gap:12,fontSize:12,marginBottom:3}}>
              <span style={{minWidth:160,fontWeight:600}}>{d.nombre}</span>
              <span style={{color:'#E24B4A',fontWeight:700}}>Comprar: {d.faltante.toFixed(1)} {d.unidad}</span>
              <span style={{color:'var(--text3)'}}>Stock: {fmtNum(d.stock_actual,d.unidad)} · Necesitas: {d.proyectado7} {d.unidad}</span>
            </div>
          ))}
        </div>
      )}
      {datos!==null && (
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead><tr style={{borderBottom:'2px solid var(--border)'}}>
            {['Insumo',`Consumido (${dias}d)`,'Prom/día','Proyección 7d','Stock actual','A comprar'].map(h=>(
              <th key={h} style={{padding:'5px 8px',textAlign:'left',fontSize:11,color:'var(--text3)',fontWeight:600}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {datos.map(d=>(
              <tr key={d.id} style={{borderBottom:'1px solid var(--border)',background:d.faltante>0?'#E24B4A08':'transparent'}}>
                <td style={{padding:'6px 8px',fontWeight:600}}>{d.nombre}</td>
                <td style={{padding:'6px 8px',color:'var(--text2)'}}>{d.consumido.toFixed(1)} {d.unidad}</td>
                <td style={{padding:'6px 8px',color:'var(--text2)'}}>{d.diario.toFixed(1)} {d.unidad}</td>
                <td style={{padding:'6px 8px',fontWeight:600}}>{d.proyectado7} {d.unidad}</td>
                <td style={{padding:'6px 8px',fontWeight:600,color:semaforo(d.stock_actual,d.stock_minimo)}}>{fmtNum(d.stock_actual,d.unidad)}</td>
                <td style={{padding:'6px 8px',fontWeight:700,color:d.faltante>0?'#E24B4A':'#1D9E75'}}>{d.faltante>0?`${d.faltante.toFixed(1)} ${d.unidad}`:'✓ Suficiente'}</td>
              </tr>
            ))}
            {!datos.length && <tr><td colSpan={6} style={{padding:24,textAlign:'center',color:'var(--text3)',fontSize:12}}>Sin datos de consumo en este período.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── DISPONIBILIDAD ──────────────────────────────────────────────────────────
const LS_FAMS = 'menu_familias_pausadas'
const LS_PRODS = 'menu_productos_pausados'
const lsGetArr = k => { try { return JSON.parse(localStorage.getItem(k)||'[]') } catch { return [] } }
const lsSetArr = (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

function DisponibilidadTab() {
  const [famsPausadas,  setFamsPausadas]  = useState(() => lsGetArr(LS_FAMS))
  const [prodsPausados, setProdsPausados] = useState(() => lsGetArr(LS_PRODS))

  const toggleFam = (fam) => {
    setFamsPausadas(prev => {
      const next = prev.includes(fam) ? prev.filter(f=>f!==fam) : [...prev, fam]
      lsSetArr(LS_FAMS, next); return next
    })
  }
  const toggleProd = (codigo) => {
    setProdsPausados(prev => {
      const next = prev.includes(codigo) ? prev.filter(c=>c!==codigo) : [...prev, codigo]
      lsSetArr(LS_PRODS, next); return next
    })
  }
  const reactivarTodo = () => {
    setFamsPausadas([]); setProdsPausados([])
    lsSetArr(LS_FAMS, []); lsSetArr(LS_PRODS, [])
  }

  const famColors = { 'Los Chilakiles':'#E24B4A','Huevos y Crokantes':'#D85A30','Los Dorados':'#D85A30','Del Comal':'#BA7517','Enfrijoladas':'#BA3B3B','Emparedados':'#2D9E6A','Guisos Extras':'#8B6914','1/2 Litros':'#D4A017' }
  const totalPausados = famsPausadas.length + prodsPausados.length

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:700,color:'var(--text1)'}}>📴 Disponibilidad del menú</div>
        <div style={{fontSize:11,color:'var(--text3)'}}>Pausa familias o productos individuales — no aparecen en el carrito ni en proyecciones</div>
        {totalPausados > 0 && (
          <button onClick={reactivarTodo}
            style={{marginLeft:'auto',padding:'5px 14px',borderRadius:'var(--r-md)',border:'1.5px solid #1D9E75',background:'#1D9E7518',color:'#1D9E75',fontSize:11,fontWeight:700,cursor:'pointer'}}>
            ▶ Reactivar todo ({totalPausados})
          </button>
        )}
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {Object.entries(FAMILIAS).map(([fam, productos]) => {
          const color    = famColors[fam] || '#888'
          const famPaus  = famsPausadas.includes(fam)
          const prodPaus = productos.filter(p => prodsPausados.includes(p.codigo))
          const algunPaus = famPaus || prodPaus.length > 0

          return (
            <div key={fam} style={{borderRadius:'var(--r-md)',border:`1.5px solid ${famPaus?'#E24B4A':algunPaus?'#EF9F27':color+'44'}`,overflow:'hidden',opacity:famPaus?0.7:1}}>
              {/* Header de familia */}
              <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:famPaus?'#E24B4A10':algunPaus?'#EF9F2710':color+'10'}}>
                <span style={{width:10,height:10,borderRadius:'50%',background:famPaus?'#E24B4A':color,flexShrink:0}}/>
                <span style={{fontSize:13,fontWeight:700,color:famPaus?'#E24B4A':color,flex:1}}>{fam}</span>
                {famPaus && <span style={{fontSize:10,padding:'2px 8px',borderRadius:99,background:'#E24B4A22',color:'#E24B4A',fontWeight:700}}>PAUSADA</span>}
                {!famPaus && prodPaus.length > 0 && <span style={{fontSize:10,padding:'2px 8px',borderRadius:99,background:'#EF9F2722',color:'#EF9F27',fontWeight:700}}>{prodPaus.length} pausado{prodPaus.length>1?'s':''}</span>}
                <button onClick={() => toggleFam(fam)}
                  style={{padding:'5px 14px',borderRadius:'var(--r-sm)',border:`1.5px solid ${famPaus?'#1D9E75':'#E24B4A'}`,background:'transparent',color:famPaus?'#1D9E75':'#E24B4A',fontSize:11,fontWeight:700,cursor:'pointer'}}>
                  {famPaus ? '▶ Reactivar familia' : '⏸ Pausar familia'}
                </button>
              </div>

              {/* Productos individuales */}
              {!famPaus && (
                <div style={{display:'flex',flexWrap:'wrap',gap:6,padding:'10px 14px',borderTop:`1px solid ${color}22`}}>
                  {productos.map(p => {
                    const pausado = prodsPausados.includes(p.codigo)
                    return (
                      <button key={p.codigo} onClick={() => toggleProd(p.codigo)}
                        style={{display:'flex',alignItems:'center',gap:5,padding:'5px 12px',borderRadius:99,cursor:'pointer',fontSize:11,fontWeight:600,
                          border:`1.5px solid ${pausado?'#E24B4A':color+'55'}`,
                          background:pausado?'#E24B4A15':'transparent',
                          color:pausado?'#E24B4A':color+'cc'}}>
                        <span style={{width:7,height:7,borderRadius:'50%',background:pausado?'#E24B4A':color,flexShrink:0}}/>
                        {p.nombre}
                        <span style={{fontSize:10,opacity:.7,marginLeft:2}}>{pausado?'⏸':'✓'}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── ESTILOS ─────────────────────────────────────────────────────────────────
const inpSt = { padding:'6px 8px', borderRadius:'var(--r-sm)', border:'1px solid var(--border-md)', background:'var(--bg)', color:'var(--text1)', fontSize:12, boxSizing:'border-box' }

// ─── MÓDULO PRINCIPAL ────────────────────────────────────────────────────────
const SUBTABS = [
  { id:'catalogo',       label:'📋 Catálogo' },
  { id:'disponibilidad', label:'📴 Disponibilidad' },
  { id:'recetas',        label:'🍽 Recetas' },
  { id:'planeacion',     label:'📊 Planeación' },
]

export default function AdminInsumos() {
  const [subtab, setSubtab] = useState('catalogo')

  // Badge de familias/productos pausados
  const [totalPausados, setTotalPausados] = useState(0)
  useEffect(() => {
    const calc = () => setTotalPausados(lsGetArr(LS_FAMS).length + lsGetArr(LS_PRODS).length)
    calc()
    const iv = setInterval(calc, 5000)
    return () => clearInterval(iv)
  }, [])

  return (
    <div>
      <div style={{display:'flex',gap:6,marginBottom:16,borderBottom:'1px solid var(--border)',paddingBottom:10,flexWrap:'wrap'}}>
        {SUBTABS.map(t=>{
          const isDisp = t.id==='disponibilidad'
          return (
            <button key={t.id} onClick={()=>setSubtab(t.id)}
              style={{display:'flex',alignItems:'center',gap:5,padding:'6px 16px',borderRadius:'var(--r-md)',fontSize:12,fontWeight:600,cursor:'pointer',
                border:`1.5px solid ${subtab===t.id?'var(--accent)':'var(--border-md)'}`,
                background:subtab===t.id?'var(--accent)22':'transparent',
                color:subtab===t.id?'var(--accent)':'var(--text2)'}}>
              {t.label}
              {isDisp && totalPausados > 0 && (
                <span style={{background:'#E24B4A',color:'#fff',borderRadius:99,fontSize:9,fontWeight:700,padding:'1px 5px',minWidth:16,textAlign:'center'}}>
                  {totalPausados}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {subtab==='catalogo'       && <CatalogoTab/>}
      {subtab==='disponibilidad' && <DisponibilidadTab/>}
      {subtab==='recetas'        && <RecetasTab/>}
      {subtab==='planeacion'     && <PlaneacionTab/>}
    </div>
  )
}
