import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { sb } from '../lib/supabase'
import { money, fechaCorta, waNumber, mensajeError, DIAS_APARTADO } from '../lib/store'
import '../styles/Admin.css'

const TABS = [
  ['pendientes', 'Pendientes de entrega'],
  ['proveedor', 'Por pedir al proveedor'],
  ['historial', 'Historial'],
  ['nuevo', 'Nuevo producto'],
]

export default function Admin({ adminPass, onLogin }) {
  const [tab, setTab] = useState('pendientes')

  if (!adminPass) {
    return (
      <div className="admin-login">
        <img src="/logo.png" alt="Lessa" />
        <h1>Panel del personal</h1>
        <button onClick={onLogin}>Ingresar</button>
      </div>
    )
  }

  return (
    <div className="admin">
      <h1>Panel</h1>
      <p className="admin-nota">
        El inventario se ajusta directamente en el <Link to="/catalogo">catálogo</Link> con + y −.
        Al salir, esos botones desaparecen.
      </p>
      <div className="admin-tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {tab === 'pendientes' && <Pendientes pass={adminPass} />}
      {tab === 'proveedor' && <Proveedor pass={adminPass} />}
      {tab === 'historial' && <Historial pass={adminPass} />}
      {tab === 'nuevo' && <Nuevo pass={adminPass} />}
    </div>
  )
}

function usePedidos(pass) {
  const [pedidos, setPedidos] = useState([])
  const [proveedor, setProveedor] = useState([])
  const [msg, setMsg] = useState('')
  const cargar = useCallback(async () => {
    const [a, b] = await Promise.all([
      sb.rpc('admin_listar_pedidos', { p_pass: pass }),
      sb.rpc('admin_listar_proveedor', { p_pass: pass }),
    ])
    if (a.error) setMsg(mensajeError(a.error))
    else if (b.error) setMsg(mensajeError(b.error))
    else { setPedidos(a.data || []); setProveedor(b.data || []); setMsg('') }
  }, [pass])
  useEffect(() => { cargar() }, [cargar])
  const llamar = async (fn, args, ok) => {
    const { error } = await sb.rpc(fn, { p_pass: pass, ...args })
    if (error) setMsg(mensajeError(error))
    else { setMsg(ok || ''); cargar() }
  }
  return { pedidos, proveedor, msg, llamar }
}

const ESTADOS = {
  por_confirmar: 'Esperando pago de reserva',
  confirmado: 'Reserva pagada',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}

function Cliente({ p }) {
  return (
    <p className="pedido-cliente">
      <strong>{p.nombre_cliente}</strong> | Tel: {p.whatsapp || 'sin teléfono'} | {p.email_cliente}
      {p.whatsapp && <> | <a target="_blank" rel="noreferrer" href={`https://wa.me/${waNumber(p.whatsapp)}`}>WhatsApp</a></>}
    </p>
  )
}

function Dinero({ p }) {
  const saldo = Number(p.total) - Number(p.pagado)
  return (
    <div className="pedido-dinero">
      <span>Total: <strong>{money(p.total)}</strong></span>
      <span>Reserva requerida: {money(p.anticipo_requerido)}</span>
      <span>Pagado: {money(p.pagado)}</span>
      {p.estado !== 'cancelado' && (
        <span className={saldo > 0 ? 'por-cobrar' : 'ok'}>{saldo > 0 ? `Por cobrar: ${money(saldo)}` : 'Pagado completo'}</span>
      )}
    </div>
  )
}

function Items({ p }) {
  return (
    <ul>
      {p.items.map((i, k) => <li key={k}>{i.cantidad} x {i.nombre} ({i.sku})</li>)}
    </ul>
  )
}

function Pendientes({ pass }) {
  const { pedidos, msg, llamar } = usePedidos(pass)
  const lista = pedidos.filter((p) => ['por_confirmar', 'confirmado'].includes(p.estado))
  const grupos = [
    ['Esperando pago de la reserva', lista.filter((p) => p.estado === 'por_confirmar')],
    ['Apartados vigentes (pieza guardada)', lista.filter((p) => p.estado === 'confirmado' && p.tipo === 'apartado')],
    ['Encargos con reserva pagada', lista.filter((p) => p.estado === 'confirmado' && p.tipo === 'encargo')],
  ]

  const pago = (p) => {
    const falta = Math.max(0, Number(p.anticipo_requerido) - Number(p.pagado))
    const v = window.prompt(`¿Cuánto pagó ${p.nombre_cliente}? (reserva pendiente: ${money(falta)})`, falta || '')
    const n = parseFloat(v)
    if (v !== null && n > 0) llamar('admin_registrar_pago', { p_id: p.id, p_monto: n, p_nota: '' }, 'Pago registrado')
  }

  return (
    <div>
      {msg && <p className="admin-nota">{msg}</p>}
      {lista.length === 0 && <p>No hay pedidos pendientes.</p>}
      {grupos.map(([titulo, arr]) => arr.length > 0 && (
        <section key={titulo}>
          <h2>{titulo} ({arr.length})</h2>
          {arr.map((p) => {
            const dias = p.limite_apartado ? Math.ceil((new Date(p.limite_apartado) - new Date()) / 86400000) : null
            return (
              <div className="pedido-card" key={p.id}>
                <div className="pedido-cab">
                  <strong>{p.numero_pedido}</strong>
                  <span>{fechaCorta(p.created_at)}</span>
                  <span className={`pill ${p.estado}`}>{ESTADOS[p.estado]}</span>
                  <span className="pill encargo">{p.tipo}</span>
                  {p.tipo === 'encargo' && p.estado === 'confirmado' && (
                    <span className="pill encargo">
                      {p.proveedor_estado === 'por_pedir' ? 'por pedir al proveedor' : p.proveedor_estado === 'pedido' ? 'pedido al proveedor' : 'ya llegó'}
                    </span>
                  )}
                  {dias !== null && <span className={`pill ${dias <= 3 ? 'cancelado' : ''}`}>vence {fechaCorta(p.limite_apartado)} ({dias} día{dias === 1 ? '' : 's'})</span>}
                </div>
                <Cliente p={p} />
                <Items p={p} />
                <Dinero p={p} />
                {p.notas && <p className="pedido-notas">Notas: {p.notas}</p>}
                <div className="pedido-acciones">
                  <button onClick={() => pago(p)}>{p.estado === 'por_confirmar' ? 'Confirmar pago de reserva' : 'Registrar pago'}</button>
                  {p.estado === 'confirmado' && (
                    <button className="verde"
                      disabled={p.tipo === 'encargo' && p.proveedor_estado !== 'recibido'}
                      title={p.tipo === 'encargo' && p.proveedor_estado !== 'recibido' ? 'Primero debe llegar del proveedor' : ''}
                      onClick={() => llamar('admin_entregar', { p_id: p.id, p_cobrar_saldo: true }, 'Venta cerrada')}>
                      Cobrar saldo y entregar
                    </button>
                  )}
                  <button className="rojo" onClick={() => { if (window.confirm('¿Cancelar este pedido?' + (p.tipo === 'apartado' ? ' Las piezas regresan al inventario.' : ''))) llamar('admin_cancelar', { p_id: p.id }, 'Pedido cancelado') }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}

function Proveedor({ pass }) {
  const { pedidos, proveedor, msg, llamar } = usePedidos(pass)
  const porPedir = pedidos.filter((p) => p.tipo === 'encargo' && p.estado === 'confirmado' && p.proveedor_estado === 'por_pedir')
  const enEspera = pedidos.filter((p) => p.tipo === 'encargo' && p.estado === 'por_confirmar')
  const enCamino = proveedor.filter((x) => x.estado === 'pedido')

  const resumen = {}
  porPedir.forEach((p) => p.items.forEach((i) => {
    resumen[i.sku] = resumen[i.sku] || { sku: i.sku, nombre: i.nombre, cantidad: 0, clientes: [] }
    resumen[i.sku].cantidad += i.cantidad
    resumen[i.sku].clientes.push(p.nombre_cliente)
  }))
  const lista = Object.values(resumen).sort((a, b) => a.sku.localeCompare(b.sku))

  const copiar = async () => {
    const t = 'Pedido a proveedor Lessa\n' + lista.map((i) => `${i.cantidad} x ${i.sku} - ${i.nombre}`).join('\n')
    try { await navigator.clipboard.writeText(t); alert('Lista copiada') } catch { alert(t) }
  }

  return (
    <div>
      {msg && <p className="admin-nota">{msg}</p>}
      <h2>Lista por pedir al proveedor</h2>
      <p className="admin-nota">Solo aparecen encargos con la reserva ya pagada.</p>
      {lista.length === 0 ? <p>No hay nada por pedir.</p> : (
        <>
          <div className="tabla-scroll">
            <table className="admin-tabla">
              <thead><tr><th>Código</th><th>Producto</th><th>Cant.</th><th>Clientes</th></tr></thead>
              <tbody>{lista.map((i) => (
                <tr key={i.sku}><td>{i.sku}</td><td>{i.nombre}</td><td><strong>{i.cantidad}</strong></td><td>{i.clientes.join(', ')}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="pedido-acciones">
            <button onClick={copiar}>Copiar lista</button>
            <button className="verde" onClick={() => llamar('admin_pedir_proveedor', {}, 'Pedido al proveedor registrado')}>
              Ya hice el pedido al proveedor
            </button>
          </div>
        </>
      )}

      <h2 style={{ marginTop: '2rem' }}>Pedidos al proveedor en camino</h2>
      {enCamino.length === 0 ? <p>Nada en camino.</p> : enCamino.map((x) => (
        <div className="pedido-card" key={x.id}>
          <div className="pedido-cab"><strong>Pedido #{x.id}</strong><span>{fechaCorta(x.created_at)}</span></div>
          <ul>{x.items.map((i) => <li key={i.sku}>{i.cantidad} x {i.nombre} ({i.sku})</li>)}</ul>
          <div className="pedido-acciones">
            <button className="verde" onClick={() => llamar('admin_recibir_proveedor', { p_id: x.id }, 'Marcado como recibido')}>
              Ya llegó este pedido
            </button>
          </div>
        </div>
      ))}

      {enEspera.length > 0 && (
        <>
          <h2 style={{ marginTop: '2rem' }}>Encargos esperando pago de reserva</h2>
          <p className="admin-nota">Aún no se piden al proveedor. Confírmalos en "Pendientes de entrega".</p>
          <ul>{enEspera.map((p) => <li key={p.id}>{p.numero_pedido}: {p.nombre_cliente}, {p.items.map((i) => `${i.cantidad} x ${i.sku}`).join(', ')}</li>)}</ul>
        </>
      )}
    </div>
  )
}

const MOTIVOS = { vencido: 'Anulada: no se recogió en 15 días', sin_pago: 'Cancelada: no pagó la reserva', manual: 'Cancelada manualmente' }

function Historial({ pass }) {
  const { pedidos, proveedor, msg } = usePedidos(pass)
  const [ver, setVer] = useState('ventas')

  const vistas = {
    ventas: pedidos.filter((p) => p.estado === 'entregado'),
    reservas: pedidos.filter((p) => p.estado !== 'cancelado' && p.pagos?.[0]?.nota !== 'Venta en mostrador'),
    cancelaciones: pedidos.filter((p) => p.estado === 'cancelado'),
  }
  const totalVentas = vistas.ventas.reduce((s, p) => s + Number(p.total), 0)

  return (
    <div>
      {msg && <p className="admin-nota">{msg}</p>}
      <div className="admin-subtabs">
        {[['ventas', 'Ventas'], ['reservas', 'Reservas y apartados'], ['cancelaciones', 'Cancelaciones y anuladas'], ['proveedor', 'Pedidos al proveedor']].map(([k, l]) => (
          <button key={k} className={ver === k ? 'on' : ''} onClick={() => setVer(k)}>{l}</button>
        ))}
      </div>

      {ver === 'ventas' && <p className="admin-nota">{vistas.ventas.length} venta(s) cerradas por {money(totalVentas)}</p>}

      {ver === 'proveedor' ? (
        proveedor.length === 0 ? <p>Aún no hay pedidos al proveedor.</p> : proveedor.map((x) => (
          <div className="pedido-card" key={x.id}>
            <div className="pedido-cab">
              <strong>Pedido #{x.id}</strong><span>{fechaCorta(x.created_at)}</span>
              <span className={`pill ${x.estado === 'recibido' ? 'entregado' : 'pendiente'}`}>
                {x.estado === 'recibido' ? `Recibido ${fechaCorta(x.recibido_at)}` : 'En camino'}
              </span>
            </div>
            <ul>{x.items.map((i) => <li key={i.sku}>{i.cantidad} x {i.nombre} ({i.sku})</li>)}</ul>
          </div>
        ))
      ) : (
        <>
          {vistas[ver].length === 0 && <p>No hay registros.</p>}
          {vistas[ver].map((p) => (
            <div className="pedido-card" key={p.id}>
              <div className="pedido-cab">
                <strong>{p.numero_pedido}</strong><span>{fechaCorta(p.created_at)}</span>
                <span className={`pill ${p.estado}`}>{ESTADOS[p.estado]}</span>
                <span className="pill encargo">{p.tipo}</span>
                {p.estado === 'cancelado' && <span className="pill cancelado">{MOTIVOS[p.motivo_cancelacion] || 'Cancelada'}</span>}
                {p.estado === 'entregado' && <span>Cerrada {fechaCorta(p.entregado_at)}</span>}
              </div>
              <Cliente p={p} />
              <Items p={p} />
              <Dinero p={p} />
              {p.estado === 'cancelado' && Number(p.pagado) > 0 && (
                <p className="admin-error">Ya había pagado {money(p.pagado)}: pendiente de devolver o reasignar.</p>
              )}
              {p.pagos?.length > 0 && (
                <p className="pedido-notas">Pagos: {p.pagos.map((x) => `${money(x.monto)} (${fechaCorta(x.fecha)})`).join(', ')}</p>
              )}
            </div>
          ))}
        </>
      )}
      <p className="pedido-notas" style={{ marginTop: '1rem' }}>Los apartados se guardan {DIAS_APARTADO} días desde que se confirma la reserva.</p>
    </div>
  )
}

function Nuevo({ pass }) {
  const [cats, setCats] = useState([])
  const vacio = { nombre: '', sku: '', precio: '', categoria: '', stock: '0' }
  const [f, setF] = useState(vacio)
  const [msg, setMsg] = useState('')
  useEffect(() => { sb.from('categorias').select('*').order('nombre').then(({ data }) => setCats(data || [])) }, [])

  const guardar = async (e) => {
    e.preventDefault()
    const { error } = await sb.rpc('admin_agregar_producto', {
      p_pass: pass, p_nombre: f.nombre.trim(), p_sku: f.sku.trim(), p_precio: parseFloat(f.precio),
      p_categoria_id: parseInt(f.categoria), p_stock: parseInt(f.stock) || 0,
    })
    if (error) setMsg('Error: ' + (error.message.includes('duplicate') ? 'ese código ya existe' : mensajeError(error)))
    else { setMsg('Producto agregado. Su foto debe llamarse CÓDIGO.jpg dentro de public/fotos.'); setF(vacio) }
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
