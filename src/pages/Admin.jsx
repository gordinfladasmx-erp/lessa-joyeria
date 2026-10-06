import { useState, useEffect, useCallback } from 'react'
import { sb } from '../lib/supabase'
import { money, fechaCorta, getAdminPass, setAdminPass, waNumber } from '../lib/store'
import '../styles/Admin.css'

const TABS = [
  ['stock', 'Inventario'],
  ['pendientes', 'Pedidos pendientes de entrega'],
  ['proveedor', 'Pedidos a proveedor'],
  ['nuevo', 'Nuevo producto'],
]

export default function Admin() {
  const [pass, setPass] = useState(getAdminPass())
  const [input, setInput] = useState('')
  const [tab, setTab] = useState('pendientes')
  const [loginError, setLoginError] = useState('')

  const login = async (e) => {
    e.preventDefault()
    const { data, error } = await sb.rpc('admin_check', { p_pass: input })
    if (error) return setLoginError('Error de conexión: ' + error.message)
    if (!data) return setLoginError('Contraseña incorrecta')
    setAdminPass(input)
    setPass(input)
    setLoginError('')
  }

  const logout = () => {
    setAdminPass('')
    setPass('')
  }

  if (!pass) {
    return (
      <div className="admin-login">
        <img src="/logo.png" alt="Lessa" />
        <h1>Acceso del personal</h1>
        <form onSubmit={login}>
          <input type="password" placeholder="Contraseña" value={input} onChange={(e) => setInput(e.target.value)} autoFocus />
          <button type="submit">Ingresar</button>
        </form>
        {loginError && <p className="admin-error">{loginError}</p>}
      </div>
    )
  }

  return (
    <div className="admin">
      <div className="admin-top">
        <h1>Administración</h1>
        <button className="admin-salir" onClick={logout}>Salir</button>
      </div>
      <p className="admin-nota">Modo vendedor activo: en el carrito verás la opción de aplicar descuentos.</p>
      <div className="admin-tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {tab === 'stock' && <Inventario pass={pass} />}
      {tab === 'pendientes' && <Pendientes pass={pass} />}
      {tab === 'proveedor' && <Proveedor pass={pass} />}
      {tab === 'nuevo' && <Nuevo pass={pass} />}
    </div>
  )
}

function Inventario({ pass }) {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [soloAgotados, setSoloAgotados] = useState(false)
  const [msg, setMsg] = useState('')

  const buscar = useCallback(async () => {
    let query = sb.from('productos').select('id,sku,nombre,precio,stock').order('sku').limit(60)
    const t = q.trim().replace(/[,()]/g, ' ')
    if (t) query = query.or(`sku.ilike.%${t}%,nombre.ilike.%${t}%`)
    if (soloAgotados) query = query.eq('stock', 0)
    const { data, error } = await query
    if (error) setMsg(error.message)
    else { setRows(data); setMsg('') }
  }, [q, soloAgotados])

  useEffect(() => { buscar() }, [soloAgotados]) // eslint-disable-line react-hooks/exhaustive-deps

  const ajustar = async (p, delta, set = null) => {
    const { data, error } = await sb.rpc('admin_adjust_stock', { p_pass: pass, p_id: p.id, p_delta: delta, p_set: set })
    if (error) return setMsg('No se pudo guardar: ' + error.message)
    setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, stock: data } : r)))
    setMsg('')
  }

  return (
    <div>
      <form className="admin-busqueda" onSubmit={(e) => { e.preventDefault(); buscar() }}>
        <input placeholder="Buscar por código o nombre..." value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit">Buscar</button>
      </form>
      <label className="solo-disp">
        <input type="checkbox" checked={soloAgotados} onChange={(e) => setSoloAgotados(e.target.checked)} /> Solo agotados
      </label>
      {msg && <p className="admin-error">{msg}</p>}
      <table className="admin-tabla">
        <thead><tr><th>Código</th><th>Producto</th><th>Precio</th><th>Existencia</th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.sku}</td>
              <td>{p.nombre}</td>
              <td>{money(p.precio)}</td>
              <td>
                <div className="stepper">
                  <button onClick={() => ajustar(p, -1)}>−</button>
                  <input type="number" min="0" value={p.stock}
                    onChange={(e) => setRows(rows.map((r) => (r.id === p.id ? { ...r, stock: e.target.value } : r)))}
                    onBlur={(e) => ajustar(p, 0, Math.max(0, parseInt(e.target.value) || 0))} />
                  <button onClick={() => ajustar(p, 1)}>+</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p>Sin resultados</p>}
    </div>
  )
}

function usePedidos(pass) {
  const [pedidos, setPedidos] = useState([])
  const [msg, setMsg] = useState('')
  const cargar = useCallback(async () => {
    const { data, error } = await sb.rpc('admin_listar_pedidos', { p_pass: pass })
    if (error) setMsg(error.message)
    else { setPedidos(data || []); setMsg('') }
  }, [pass])
  useEffect(() => { cargar() }, [cargar])
  return { pedidos, msg, setMsg, cargar }
}

function Pendientes({ pass }) {
  const { pedidos, msg, setMsg, cargar } = usePedidos(pass)
  const [ver, setVer] = useState('pendientes')

  const actualizar = async (id, campos) => {
    const { error } = await sb.rpc('admin_actualizar_pedido', {
      p_pass: pass, p_id: id,
      p_estado: campos.estado ?? null, p_pagado: campos.pagado ?? null, p_proveedor_estado: campos.proveedor ?? null,
    })
    if (error) setMsg(error.message)
    else cargar()
  }

  const lista = pedidos.filter((p) =>
    ver === 'pendientes' ? !['entregado', 'cancelado'].includes(p.estado) : ['entregado', 'cancelado'].includes(p.estado))

  const registrarPago = (p) => {
    const v = window.prompt(`Total pagado hasta ahora por ${p.nombre_cliente} (total ${money(p.total)}):`, p.pagado)
    if (v !== null && !isNaN(parseFloat(v))) actualizar(p.id, { pagado: parseFloat(v) })
  }

  return (
    <div>
      <div className="admin-subtabs">
        <button className={ver === 'pendientes' ? 'on' : ''} onClick={() => setVer('pendientes')}>Pendientes de entregar</button>
        <button className={ver === 'cerrados' ? 'on' : ''} onClick={() => setVer('cerrados')}>Entregados / cancelados</button>
      </div>
      {msg && <p className="admin-error">{msg}</p>}
      {lista.length === 0 && <p>No hay pedidos en esta lista.</p>}
      {lista.map((p) => {
        const saldo = Number(p.total) - Number(p.pagado)
        return (
          <div className="pedido-card" key={p.id}>
            <div className="pedido-cab">
              <strong>{p.numero_pedido}</strong>
              <span>{fechaCorta(p.created_at.slice(0, 10))}</span>
              <span className={`pill ${p.estado}`}>{p.estado}</span>
              {p.tiene_preorden && (
                <span className="pill encargo">
                  encargo: {p.proveedor_estado === 'por_pedir' ? 'por pedir al proveedor' : p.proveedor_estado === 'pedido' ? 'pedido al proveedor' : 'recibido'}
                </span>
              )}
            </div>
            <p className="pedido-cliente">
              <strong>{p.nombre_cliente}</strong> | Tel: {p.whatsapp || 'sin teléfono'} | {p.email_cliente}
              {p.whatsapp && <> | <a target="_blank" rel="noreferrer" href={`https://wa.me/${waNumber(p.whatsapp)}`}>WhatsApp</a></>}
            </p>
            <ul>
              {p.items.map((i, k) => (
                <li key={k}>{i.cantidad} x {i.nombre} ({i.sku}) {i.preorden && <em className="tag-encargo">encargo</em>}</li>
              ))}
            </ul>
            <div className="pedido-dinero">
              <span>Total: <strong>{money(p.total)}</strong></span>
              <span>Pagado: {money(p.pagado)}</span>
              <span className={saldo > 0 ? 'por-cobrar' : 'ok'}>{saldo > 0 ? `Por cobrar: ${money(saldo)}` : 'Pagado completo'}</span>
              {p.tiene_preorden && <span>Anticipo requerido: {money(p.anticipo_requerido)}</span>}
              {p.entrega_estimada && p.tiene_preorden && <span>Entrega estimada: {fechaCorta(p.entrega_estimada)}</span>}
            </div>
            {p.notas && <p className="pedido-notas">Notas: {p.notas}</p>}
            {ver === 'pendientes' && (
              <div className="pedido-acciones">
                <button onClick={() => registrarPago(p)}>Registrar pago</button>
                {saldo > 0 && <button onClick={() => actualizar(p.id, { pagado: Number(p.total) })}>Marcar pagado completo</button>}
                {p.tiene_preorden && p.proveedor_estado === 'pedido' && (
                  <button onClick={() => actualizar(p.id, { proveedor: 'recibido' })}>Llegó del proveedor</button>
                )}
                <button className="verde" disabled={p.tiene_preorden && p.proveedor_estado !== 'recibido'}
                  title={p.tiene_preorden && p.proveedor_estado !== 'recibido' ? 'Primero debe llegar del proveedor' : ''}
                  onClick={() => actualizar(p.id, { estado: 'entregado' })}>Marcar entregado</button>
                <button className="rojo" onClick={() => { if (window.confirm('¿Cancelar este pedido? El inventario reservado se regresa.')) actualizar(p.id, { estado: 'cancelado' }) }}>Cancelar</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Proveedor({ pass }) {
  const { pedidos, msg, setMsg, cargar } = usePedidos(pass)
  const porPedir = pedidos.filter((p) => p.proveedor_estado === 'por_pedir' && p.estado !== 'cancelado')
  const enCamino = pedidos.filter((p) => p.proveedor_estado === 'pedido' && p.estado !== 'cancelado')

  const resumen = (lista) => {
    const m = {}
    lista.forEach((p) => p.items.filter((i) => i.preorden).forEach((i) => {
      m[i.sku] = m[i.sku] || { sku: i.sku, nombre: i.nombre, cantidad: 0, precio: i.precio, clientes: [] }
      m[i.sku].cantidad += i.cantidad
      m[i.sku].clientes.push(p.nombre_cliente)
    }))
    return Object.values(m).sort((a, b) => a.sku.localeCompare(b.sku))
  }
  const lista = resumen(porPedir)
  const enviado = resumen(enCamino)
  const totalPiezas = lista.reduce((s, i) => s + i.cantidad, 0)

  const copiar = async () => {
    const t = 'Pedido a proveedor Lessa\n' + lista.map((i) => `${i.cantidad} x ${i.sku} - ${i.nombre}`).join('\n')
    try { await navigator.clipboard.writeText(t); setMsg('Lista copiada') } catch { setMsg(t) }
  }

  const marcar = async () => {
    const { error } = await sb.rpc('admin_marcar_pedido_proveedor', { p_pass: pass })
    if (error) setMsg(error.message)
    else { setMsg('Marcados como pedidos al proveedor'); cargar() }
  }

  return (
    <div>
      <h2>Por pedir al proveedor</h2>
      {msg && <p className="admin-nota">{msg}</p>}
      {lista.length === 0 ? <p>No hay nada pendiente por pedir.</p> : (
        <>
          <table className="admin-tabla">
            <thead><tr><th>Código</th><th>Producto</th><th>Cantidad</th><th>Clientes</th></tr></thead>
            <tbody>{lista.map((i) => (
              <tr key={i.sku}><td>{i.sku}</td><td>{i.nombre}</td><td><strong>{i.cantidad}</strong></td><td>{i.clientes.join(', ')}</td></tr>
            ))}</tbody>
          </table>
          <p>Total: {totalPiezas} pieza(s)</p>
          <div className="pedido-acciones">
            <button onClick={copiar}>Copiar lista</button>
            <button className="verde" onClick={marcar}>Ya hice el pedido al proveedor</button>
          </div>
        </>
      )}
      <h2 style={{ marginTop: '2rem' }}>Ya pedidos, en camino</h2>
      {enviado.length === 0 ? <p>Nada en camino.</p> : (
        <table className="admin-tabla">
          <thead><tr><th>Código</th><th>Producto</th><th>Cantidad</th><th>Clientes</th></tr></thead>
          <tbody>{enviado.map((i) => (
            <tr key={i.sku}><td>{i.sku}</td><td>{i.nombre}</td><td>{i.cantidad}</td><td>{i.clientes.join(', ')}</td></tr>
          ))}</tbody>
        </table>
      )}
    </div>
  )
}

function Nuevo({ pass }) {
  const [cats, setCats] = useState([])
  const [f, setF] = useState({ nombre: '', sku: '', precio: '', categoria: '', stock: '0' })
  const [msg, setMsg] = useState('')
  useEffect(() => { sb.from('categorias').select('*').order('nombre').then(({ data }) => setCats(data || [])) }, [])

  const guardar = async (e) => {
    e.preventDefault()
    const { error } = await sb.rpc('admin_agregar_producto', {
      p_pass: pass, p_nombre: f.nombre.trim(), p_sku: f.sku.trim(), p_precio: parseFloat(f.precio),
      p_categoria_id: parseInt(f.categoria), p_stock: parseInt(f.stock) || 0,
    })
    if (error) setMsg('Error: ' + (error.message.includes('duplicate') ? 'ese código ya existe' : error.message))
    else { setMsg('Producto agregado. Para su foto, agrégala a public/fotos con el nombre del código.jpg'); setF({ nombre: '', sku: '', precio: '', categoria: '', stock: '0' }) }
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  return (
    <form className="admin-form" onSubmit={guardar}>
      <input required placeholder="Nombre" value={f.nombre} onChange={set('nombre')} />
      <input required placeholder="Código (SKU)" value={f.sku} onChange={set('sku')} />
      <input required type="number" step="0.01" min="0" placeholder="Precio" value={f.precio} onChange={set('precio')} />
      <select required value={f.categoria} onChange={set('categoria')}>
        <option value="">Categoría...</option>
        {cats.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
      <input type="number" min="0" placeholder="Existencia inicial" value={f.stock} onChange={set('stock')} />
      <button type="submit">Agregar producto</button>
      {msg && <p className="admin-nota">{msg}</p>}
    </form>
  )
}
