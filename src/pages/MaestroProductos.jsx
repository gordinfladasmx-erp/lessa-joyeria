import React, { useState, useEffect } from 'react'
import { sb } from '../lib/supabase.js'

const fmtM = v => '$'+parseFloat(v||0).toLocaleString('es-MX',{minimumFractionDigits:2})

export default function MaestroProductos({ role }) {
  const [productos, setProductos] = useState([])
  const [familias,  setFamilias]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState('lista')
  const [filtro,    setFiltro]    = useState('')
  const [famFiltro, setFamFiltro] = useState('')
  const [editId,    setEditId]    = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [form,      setForm]      = useState({ nombre:'', codigo:'', familia_id:'', precio_base:0, precio_extra:0, precio_porcion:0, costo_unitario:0, activo:true })
  const [msg,       setMsg]       = useState('')
  const [editRow,   setEditRow]   = useState(null)  // id del producto editándose inline
  const [editVals,  setEditVals]  = useState({})    // valores en edición

  const load = async () => {
    setLoading(true)
    const [{ data:prods }, { data:fams }] = await Promise.all([
      sb.from('productos').select('*, familias(nombre,color,activa)').order('familia_id').order('nombre'),
      sb.from('familias').select('id,nombre,color,activa').order('nombre'),
    ])
    setProductos(prods||[])
    setFamilias(fams||[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const startEdit = (p) => {
    setEditRow(p.id)
    setEditVals({ nombre:p.nombre, codigo:p.codigo||'', familia_id:p.familia_id,
      precio_base:p.precio_base||0, precio_extra:p.precio_extra||0,
      precio_porcion:p.precio_porcion||0, costo_unitario:p.costo_unitario||0, activo:p.activo })
  }

  const saveInline = async (id) => {
    setSaving(true)
    const payload = {
      nombre: editVals.nombre?.trim() || '',
      codigo: editVals.codigo?.trim() || null,
      familia_id: editVals.familia_id,
      precio_base: parseFloat(editVals.precio_base) || 0,
      precio_extra: parseFloat(editVals.precio_extra) || 0,
      precio_porcion: parseFloat(editVals.precio_porcion) || 0,
      costo_unitario: parseFloat(editVals.costo_unitario) || 0,
      activo: editVals.activo,
    }
    const { error } = await sb.from('productos').update(payload).eq('id', id)
    if (error) { setSaving(false); setMsg('Error al guardar: ' + error.message); return }
    setProductos(prev => prev.map(p => {
      if (p.id !== id) return p
      const fam = familias.find(f=>f.id===payload.familia_id)
      return { ...p, ...payload, familias: fam ? { nombre:fam.nombre, color:fam.color, activa:fam.activa } : p.familias }
    }))
    setEditRow(null)
    setSaving(false)
    setMsg('Guardado')
    setTimeout(() => setMsg(''), 2000)
  }

  const reset = () => {
    setEditId(null)
    setForm({ nombre:'', codigo:'', familia_id:familias[0]?.id||'', precio_base:0, precio_extra:0, precio_porcion:0, costo_unitario:0, activo:true })
    setMsg('')
    setTab('lista')
  }

  const save = async () => {
    if (!form.nombre.trim()) return setMsg('El nombre es obligatorio')
    if (!form.familia_id) return setMsg('Selecciona una familia')
    setSaving(true)
    const payload = {
      nombre: form.nombre.trim(),
      codigo: form.codigo.trim()||null,
      familia_id: form.familia_id,
      precio_base: parseFloat(form.precio_base)||0,
      precio_porcion: parseFloat(form.precio_porcion)||0,
      precio_extra: parseFloat(form.precio_extra)||0,
      costo_unitario: parseFloat(form.costo_unitario)||0,
      activo: form.activo
    }
    if (editId) {
      await sb.from('productos').update(payload).eq('id', editId)
      setMsg('Producto actualizado')
    } else {
      await sb.from('productos').insert(payload)
      setMsg('Producto creado')
    }
    setSaving(false)
    await load()
    setTimeout(() => { reset() }, 1500)
  }

  const toggleActivo = async (p) => {
    await sb.from('productos').update({ activo: !p.activo }).eq('id', p.id)
    load()
  }

  const toggleFamiliaActiva = async (f) => {
    await sb.from('familias').update({ activa: !f.activa }).eq('id', f.id)
    load()
  }

  const filtered = productos.filter(p =>
    (!famFiltro || p.familia_id === famFiltro) &&
    (!filtro || p.nombre.toLowerCase().includes(filtro.toLowerCase()))
  )

  const byFam = filtered.reduce((acc,p) => {
    const fam = p.familias?.nombre || 'Sin familia'
    const color = p.familias?.color || '#888'
    const activa = p.familias ? p.familias.activa !== false : true
    const famId = p.familia_id
    if (!acc[fam]) acc[fam] = { color, activa, famId, items:[] }
    acc[fam].items.push(p)
    return acc
  }, {})

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
        <div className="period-sw">
          <button className={`psw-btn${tab==='lista'?' active':''}`} onClick={reset}>Lista</button>
          {role!=='viewer' && <button className={`psw-btn${tab==='nuevo'?' active':''}`} onClick={()=>{
            setEditId(null)
            setForm({ nombre:'', codigo:'', familia_id:familias[0]?.id||'', precio_base:0, precio_extra:0, precio_porcion:0, costo_unitario:0, activo:true })
            setMsg(''); setTab('nuevo')
          }}>
            {editId?'Editar':'+ Nuevo producto'}
          </button>}
        </div>
        {tab==='lista' && (
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <input className="form-input" placeholder="Buscar..." value={filtro} onChange={e=>setFiltro(e.target.value)} style={{width:150}}/>
            <select className="form-input" value={famFiltro} onChange={e=>setFamFiltro(e.target.value)} style={{width:160}}>
              <option value="">Todas las familias</option>
              {familias.map(f=><option key={f.id} value={f.id}>{f.nombre}</option>)}
            </select>
          </div>
        )}
      </div>

      {msg && <div style={{background:msg.includes('Error')?'#E24B4A':'#1D9E75',color:'#fff',padding:'8px 14px',borderRadius:'var(--r-md)',marginBottom:12,fontSize:12}}>{msg}</div>}

      {tab==='nuevo' && (
        <div className="card" style={{maxWidth:500}}>
          <div className="ch"><div className="ct">{editId?'Editar producto':'Nuevo producto'}</div></div>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <div>
                <label style={{fontSize:11,color:'var(--text2)',display:'block',marginBottom:4}}>Nombre</label>
                <input className="form-input" value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} placeholder="Ej: Chilakiles Naturales" style={{width:'100%'}}/>
              </div>
              <div>
                <label style={{fontSize:11,color:'var(--text2)',display:'block',marginBottom:4}}>Código</label>
                <input className="form-input" value={form.codigo} onChange={e=>setForm(f=>({...f,codigo:e.target.value}))} placeholder="Ej: CHI-01" style={{width:'100%'}}/>
              </div>
            </div>
            <div>
              <label style={{fontSize:11,color:'var(--text2)',display:'block',marginBottom:4}}>Familia</label>
              <select className="form-input" value={form.familia_id} onChange={e=>setForm(f=>({...f,familia_id:e.target.value}))} style={{width:'100%'}}>
                <option value="">Seleccionar...</option>
                {familias.map(f=><option key={f.id} value={f.id}>{f.nombre}</option>)}
              </select>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10}}>
              <div>
                <label style={{fontSize:11,color:'var(--text2)',display:'block',marginBottom:4}}>Precio venta ($)</label>
                <input type="number" className="form-input" value={form.precio_base} onChange={e=>setForm(f=>({...f,precio_base:e.target.value}))} style={{width:'100%'}} min="0"/>
              </div>
              <div>
                <label style={{fontSize:11,color:'var(--text2)',display:'block',marginBottom:4}}>Guiso extra ($)</label>
                <input type="number" className="form-input" value={form.precio_extra} onChange={e=>setForm(f=>({...f,precio_extra:e.target.value}))} style={{width:'100%'}} min="0" placeholder="0 = no aplica"/>
              </div>
              <div>
                <label style={{fontSize:11,color:'var(--text2)',display:'block',marginBottom:4}}>Porción ($)</label>
                <input type="number" className="form-input" value={form.precio_porcion} onChange={e=>setForm(f=>({...f,precio_porcion:e.target.value}))} style={{width:'100%'}} min="0" placeholder="0 = no aplica"/>
              </div>
              <div>
                <label style={{fontSize:11,color:'var(--text2)',display:'block',marginBottom:4}}>Costo ($)</label>
                <input type="number" className="form-input" value={form.costo_unitario} onChange={e=>setForm(f=>({...f,costo_unitario:e.target.value}))} style={{width:'100%'}} min="0"/>
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <input type="checkbox" id="activo" checked={form.activo} onChange={e=>setForm(f=>({...f,activo:e.target.checked}))}/>
              <label htmlFor="activo" style={{fontSize:12}}>Activo (aparece en comanda)</label>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={save} disabled={saving} style={{flex:1,padding:9,borderRadius:'var(--r-md)',background:'var(--accent)',color:'#fff',border:'none',cursor:'pointer',fontSize:13,fontWeight:600}}>
                {saving?'Guardando…':editId?'Guardar cambios':'Crear producto'}
              </button>
              <button onClick={reset} style={{padding:'9px 16px',borderRadius:'var(--r-md)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:13}}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {tab==='lista' && (
        loading ? <div className="loading-screen"><div className="spinner"/></div>
        : Object.entries(byFam).map(([fam, {color, activa, famId, items}]) => (
          <div key={fam} className="card" style={{marginBottom:10,opacity:activa?1:0.65}}>
            <div className="ch">
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{width:10,height:10,borderRadius:'50%',background:color,display:'inline-block'}}/>
                <div className="ct">{fam}</div>
                <span style={{fontSize:10,padding:'2px 7px',borderRadius:99,
                  background:activa?'#1D9E7522':'#E24B4A22',color:activa?'#1D9E75':'#E24B4A'}}>
                  {activa?'Activa':'Oculta'}
                </span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:11,color:'var(--text3)'}}>{items.length} productos</span>
                {role!=='viewer' && famId && (
                  <button onClick={()=>toggleFamiliaActiva({id:famId,activa})}
                    style={{fontSize:11,padding:'2px 10px',borderRadius:'var(--r-sm)',border:'none',
                      background:activa?'#E24B4A':'#1D9E75',color:'#fff',cursor:'pointer',fontWeight:600}}>
                    {activa?'Ocultar':'Mostrar'}
                  </button>
                )}
              </div>
            </div>
            <table className="tbl">
              <thead><tr><th>Código</th><th>Producto</th><th>Familia</th><th className="num">Precio</th><th className="num">Guiso extra</th><th className="num">Porción</th><th className="num">Costo</th><th className="num">Margen</th><th className="num">Estado</th><th></th></tr></thead>
              <tbody>
                {items.map(p=>{
                  const editing = editRow === p.id
                  const margen = editing
                    ? (parseFloat(editVals.precio_base)>0 ? Math.round((parseFloat(editVals.precio_base)-(parseFloat(editVals.costo_unitario)||0))/parseFloat(editVals.precio_base)*100) : 0)
                    : (p.precio_base>0 ? Math.round((p.precio_base-(p.costo_unitario||0))/p.precio_base*100) : 0)
                  const inp = (field, w=70) => (
                    <input type="number" value={editVals[field]} min="0"
                      onChange={e=>setEditVals(v=>({...v,[field]:e.target.value}))}
                      style={{width:w,fontSize:12,borderRadius:5,border:'1.5px solid var(--accent)',padding:'2px 5px',textAlign:'right'}}/>
                  )
                  return (
                    <tr key={p.id} style={{opacity:editing?1:p.activo?1:0.4, background:editing?'var(--accent)06':undefined}}>
                      <td style={{fontSize:10,color:'var(--text3)'}}>
                        {editing
                          ? <input value={editVals.codigo} onChange={e=>setEditVals(v=>({...v,codigo:e.target.value}))}
                              style={{width:70,fontSize:11,borderRadius:5,border:'1.5px solid var(--accent)',padding:'2px 5px'}}/>
                          : p.codigo||'—'}
                      </td>
                      <td style={{fontWeight:500,fontSize:13}}>
                        {editing
                          ? <input value={editVals.nombre} onChange={e=>setEditVals(v=>({...v,nombre:e.target.value}))}
                              style={{width:160,fontSize:12,borderRadius:5,border:'1.5px solid var(--accent)',padding:'2px 5px'}}/>
                          : p.nombre}
                      </td>
                      <td style={{fontSize:11}}>
                        {editing
                          ? <select value={editVals.familia_id} onChange={e=>setEditVals(v=>({...v,familia_id:e.target.value}))}
                              style={{fontSize:11,borderRadius:5,border:'1.5px solid var(--accent)',padding:'2px 4px'}}>
                              {familias.map(f=><option key={f.id} value={f.id}>{f.nombre}</option>)}
                            </select>
                          : <span style={{fontSize:10,padding:'1px 7px',borderRadius:99,background:color+'22',color}}>{p.familias?.nombre||'—'}</span>}
                      </td>
                      <td className="num">{editing ? inp('precio_base',65) : fmtM(p.precio_base)}</td>
                      <td className="num">{editing ? inp('precio_extra',65) : (p.precio_extra>0?fmtM(p.precio_extra):'—')}</td>
                      <td className="num">{editing ? inp('precio_porcion',65) : (p.precio_porcion>0?fmtM(p.precio_porcion):'—')}</td>
                      <td className="num">{editing ? inp('costo_unitario',65) : (p.costo_unitario>0?fmtM(p.costo_unitario):'—')}</td>
                      <td className="num" style={{color:margen>=30?'#1D9E75':margen>=15?'#EF9F27':'#E24B4A'}}>{(editing?parseFloat(editVals.costo_unitario):p.costo_unitario)>0?margen+'%':'—'}</td>
                      <td className="num">
                        {editing
                          ? <select value={editVals.activo} onChange={e=>setEditVals(v=>({...v,activo:e.target.value==='true'}))}
                              style={{fontSize:11,borderRadius:5,border:'1.5px solid var(--accent)',padding:'2px 4px'}}>
                              <option value="true">Activo</option>
                              <option value="false">Inactivo</option>
                            </select>
                          : <span style={{fontSize:10,padding:'2px 7px',borderRadius:99,background:p.activo?'#1D9E7522':'var(--border)',color:p.activo?'#1D9E75':'var(--text3)'}}>
                              {p.activo?'Activo':'Inactivo'}
                            </span>}
                      </td>
                      <td style={{textAlign:'right',whiteSpace:'nowrap'}}>
                        {role!=='viewer' && (editing ? (
                          <span style={{display:'flex',gap:4,justifyContent:'flex-end'}}>
                            <button onClick={()=>saveInline(p.id)} disabled={saving}
                              style={{fontSize:11,padding:'3px 10px',borderRadius:'var(--r-sm)',border:'none',background:'#1D9E75',color:'#fff',cursor:'pointer',fontWeight:600}}>
                              {saving?'…':'Guardar'}
                            </button>
                            <button onClick={()=>setEditRow(null)} disabled={saving}
                              style={{fontSize:11,padding:'3px 8px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer'}}>
                              ✕
                            </button>
                          </span>
                        ) : (
                          <>
                            <button onClick={()=>startEdit(p)} style={{marginRight:4,fontSize:11,padding:'2px 8px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer'}}>✏️ Editar</button>
                            <button onClick={()=>toggleActivo(p)} style={{fontSize:11,padding:'2px 8px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',color:'var(--text3)'}}>
                              {p.activo?'Desactivar':'Activar'}
                            </button>
                          </>
                        ))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))
      )}

      {tab==='lista' && !loading && filtered.length===0 && (
        <div className="card" style={{textAlign:'center',padding:'40px 0',color:'var(--text3)'}}>
          No hay productos registrados.
        </div>
      )}
    </div>
  )
}
