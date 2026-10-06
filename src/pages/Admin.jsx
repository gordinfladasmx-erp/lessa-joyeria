import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { sb } from '../lib/supabase'
import { money, fechaCorta, waNumber, mensajeError, mensajeConfirmacion, DIAS_APARTADO } from '../lib/store'
import Reportes from './Reportes'
import { pdfPedidoProveedor } from '../lib/pdfProveedor'
import '../styles/Admin.css'

const TABS = [
  ['pendientes', 'Pendientes de entrega'],
  ['proveedor', 'Pedidos a proveedor'],
  ['historial', 'Historial'],
  ['reportes', 'Reportes'],
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
      {tab === 'reportes' && <Reportes pass={adminPass} />}
      {tab === 'nuevo' && <Nuevo pass={adminPass} />}
    </div>
  )
}

function usePedidos(pass) {
  const [pedidos, setPedidos] = useState([])
  const [proveedor, setProveedor] = useState([])
  const [lineas, setLineas] = useState([])
  const [msg, setMsg] = useState('')
  const cargar = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      sb.rpc('admin_listar_pedidos', { p_pass: pass }),
      sb.rpc('admin_listar_proveedor', { p_pass: pass }),
      sb.rpc('admin_listar_proveedor_lineas', { p_pass: pass }),
    ])
    if (a.error) return setMsg(mensajeError(a.error))
    if (b.error) return setMsg(mensajeError(b.error))
    setPedidos(a.data || []); setProveedor(b.data || []); setLineas(c.data || [])
    setMsg(c.error ? 'Para editar líneas del proveedor falta ejecutar supabase_lessa_proveedor_lineas.sql en Supabase.' : '')
  }, [pass])
  useEffect(() => { cargar() }, [cargar])
  const llamar = async (fn, args, ok) => {
    const { error } = await sb.rpc(fn, { p_pass: pass, ...args })
    if (error) setMsg(mensajeError(error))
    else { setMsg(ok || ''); cargar() }
  }
  const borrar = (p) => {
    const activo = p.tipo === 'apartado' && ['por_confirmar', 'confirmado'].includes(p.estado)
    const t = `¿Borrar definitivamente ${p.numero_pedido} de ${p.nombre_cliente}? No se puede deshacer y desaparece de los reportes.` +
      (activo ? ' Las piezas apartadas regresan al inventario.' : '')
    if (window.confirm(t)) llamar('admin_borrar_pedido', { p_id: p.id }, 'Pedido borrado')
  }
  return { pedidos, proveedor, lineas, msg, llamar, borrar }
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
      {Number(p.descuento) > 0 && <span>Descuento: -{money(p.descuento)}</span>}
      {Number(p.envio) > 0 && <span>Envío: {money(p.envio)}</span>}
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

function Validar({ p, onValidar }) {
  const [tipo, setTipo] = useState('monto')
  const [valor, setValor] = useState(Number(p.descuento) > 0 ? String(p.descuento) : '')
  const [envio, setEnvio] = useState(Number(p.envio) > 0 ? String(p.envio) : '')
  const [fecha, setFecha] = useState(p.fecha_entrega || '')
  const v = parseFloat(valor) || 0
  const desc = tipo === 'porcentaje' ? Number(p.subtotal) * Math.min(v, 100) / 100 : Math.min(v, Number(p.subtotal))
  const neto = Number(p.subtotal) - desc + (parseFloat(envio) || 0)
  return (
    <div className="validar-box">
      <strong>{p.validado_at ? 'Ajustar validación' : 'Validar pedido'}</strong>
      <div className="validar-grid">
        <label>Descuento
          <span className="descuento-fila">
            <span className="segmento">
              <button type="button" className={tipo === 'monto' ? 'on' : ''} onClick={() => setTipo('monto')}>$</button>
              <button type="button" className={tipo === 'porcentaje' ? 'on' : ''} onClick={() => setTipo('porcentaje')}>%</button>
            </span>
            <input type="number" min="0" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0" />
          </span>
        </label>
        <label>Envío local ($)
          <input type="number" min="0" step="0.01" value={envio} onChange={(e) => setEnvio(e.target.value)} placeholder="0" />
        </label>
        <label>Fecha de entrega
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
      </div>
      <p className="validar-neto">Valor neto: <strong>{money(neto)}</strong> (subtotal {money(p.subtotal)})</p>
      <div className="pedido-acciones">
        <button className="verde" onClick={() => onValidar(p.id, { p_desc_tipo: tipo, p_desc_valor: v, p_envio: parseFloat(envio) || 0, p_fecha_entrega: fecha || null })}>
          {p.validado_at ? 'Guardar cambios' : 'Validar y fijar valor neto'}
        </button>
      </div>
    </div>
  )
}

function Pendientes({ pass }) {
  const { pedidos, msg, llamar, borrar } = usePedidos(pass)
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
                  {!p.validado_at && p.estado === 'por_confirmar' && <span className="pill cancelado">POR VALIDAR</span>}
                  {p.validado_at && p.estado === 'por_confirmar' && <span className="pill entregado">validado</span>}
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
                {p.descuento_solicitado && <p className="solicitud">Solicitud de descuento / código del cliente: <strong>{p.descuento_solicitado}</strong></p>}
                {p.entrega_tipo === 'envio' && <p className="pedido-notas">Envío local a: {p.direccion}</p>}
                {p.fecha_entrega && <p className="pedido-notas">Fecha de entrega: {fechaCorta(p.fecha_entrega)}</p>}
                {p.estado === 'por_confirmar' && <Validar key={p.id + String(p.total) + String(p.validado_at)} p={p} onValidar={(id, a) => llamar('admin_validar_pedido', { p_id: id, ...a }, 'Pedido validado')} />}
                {p.validado_at && (
                  <div className="pedido-acciones">
                    {p.whatsapp && <a className="btn-wa-panel" target="_blank" rel="noreferrer" href={`https://wa.me/${waNumber(p.whatsapp)}?text=${encodeURIComponent(mensajeConfirmacion(p))}`}>Enviar confirmación por WhatsApp</a>}
                    <a className="btn-wa-panel gris" href={`mailto:${p.email_cliente}?subject=${encodeURIComponent('Confirmación de tu pedido ' + p.numero_pedido)}&body=${encodeURIComponent(mensajeConfirmacion(p).replace(/\*/g, ''))}`}>Enviar por correo</a>
                  </div>
                )}
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
                  <button className="rojo" onClick={() => borrar(p)}>Borrar</button>
                </div>
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}

function LineaEditable({ cantidad, onGuardar, onQuitar, etiquetaQuitar = 'Quitar' }) {
  const [v, setV] = useState(String(cantidad))
  useEffect(() => setV(String(cantidad)), [cantidad])
  const n = parseInt(v) || 0
  const cambio = n > 0 && n !== cantidad
  return (
    <div className="linea-edit">
      <input type="number" min="1" value={v} onChange={(e) => setV(e.target.value)} />
      <button className="verde" disabled={!cambio} onClick={() => onGuardar(n)}>Guardar</button>
      <button className="rojo" onClick={onQuitar}>{etiquetaQuitar}</button>
    </div>
  )
}

function Proveedor({ pass }) {
  const { pedidos, proveedor, lineas, msg, llamar } = usePedidos(pass)
  const [conPendientes, setConPendientes] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [nuevo, setNuevo] = useState({ sku: '', cantidad: '1', nota: '' })

  const encargos = pedidos.filter((p) => p.tipo === 'encargo' && !['pedido', 'recibido'].includes(p.proveedor_estado) && !['cancelado', 'entregado'].includes(p.estado))
  const filasCli = []
  encargos.forEach((p) => p.items.forEach((i, idx) => filasCli.push({ p, idx, i, listo: p.estado === 'confirmado' })))
  const enCamino = proveedor.filter((x) => x.estado === 'pedido')
  const listos = encargos.filter((p) => p.estado === 'confirmado')

  const resumir = (arr) => {
    const m = {}
    arr.forEach(({ sku, nombre, cantidad }) => {
      m[sku] = m[sku] || { sku, nombre, cantidad: 0 }
      m[sku].cantidad += cantidad
    })
    return Object.values(m).sort((a, b) => a.sku.localeCompare(b.sku))
  }
  const paraPdf = resumir([
    ...filasCli.filter((f) => conPendientes || f.listo).map((f) => ({ sku: f.i.sku, nombre: f.i.nombre, cantidad: f.i.cantidad })),
    ...lineas.map((l) => ({ sku: l.sku, nombre: l.nombre, cantidad: l.cantidad })),
  ])

  const pdf = async (lista, titulo) => {
    setGenerando(true)
    try { await pdfPedidoProveedor(lista, titulo) } finally { setGenerando(false) }
  }
  const copiar = async () => {
    const t = 'Pedido a proveedor Lessa\n' + paraPdf.map((i) => `${i.cantidad} x ${i.sku} - ${i.nombre}`).join('\n')
    try { await navigator.clipboard.writeText(t); alert('Lista copiada') } catch { alert(t) }
  }
  const agregar = async (e) => {
    e.preventDefault()
    await llamar('admin_agregar_linea_proveedor', { p_sku: nuevo.sku.trim(), p_cantidad: parseInt(nuevo.cantidad) || 0, p_nota: nuevo.nota }, 'Pieza agregada a la lista')
    setNuevo({ sku: '', cantidad: '1', nota: '' })
  }
  const hayAlgo = filasCli.length > 0 || lineas.length > 0

  return (
    <div>
      {msg && <p className="admin-nota">{msg}</p>}
      <h2>Pedidos a proveedor: lista por pedir</h2>
      <p className="admin-nota">
        Aquí se suman los encargos de clientes y las piezas que quieras reponer para el inventario. Cada línea se puede
        cambiar de cantidad o quitar. Al marcar "Ya llegó", las piezas de reposición se suman solas al inventario.
      </p>

      {!hayAlgo ? <p>No hay nada por pedir.</p> : (
        <div className="tabla-scroll">
          <table className="admin-tabla">
            <thead><tr><th>Código</th><th>Producto</th><th>Para</th><th>Cantidad</th></tr></thead>
            <tbody>
              {filasCli.map(({ p, idx, i, listo }) => (
                <tr key={p.id + '-' + idx}>
                  <td>{i.sku}</td><td>{i.nombre}</td>
                  <td>{p.nombre_cliente} <span className={`pill ${listo ? 'entregado' : 'pendiente'}`}>{listo ? 'reserva pagada' : 'falta reserva'}</span></td>
                  <td>
                    <LineaEditable cantidad={i.cantidad}
                      onGuardar={(n) => llamar('admin_editar_item_pedido', { p_id: p.id, p_idx: idx, p_cantidad: n }, 'Cantidad actualizada y total del pedido recalculado')}
                      onQuitar={() => { if (window.confirm(`¿Quitar ${i.nombre} del pedido de ${p.nombre_cliente}? Se recalcula el total de su pedido.`)) llamar('admin_editar_item_pedido', { p_id: p.id, p_idx: idx, p_cantidad: 0 }, 'Línea quitada') }} />
                  </td>
                </tr>
              ))}
              {lineas.map((l) => (
                <tr key={'l' + l.id}>
                  <td>{l.sku}</td><td>{l.nombre}</td>
                  <td><span className="pill encargo">Reposición de inventario</span> {l.nota}</td>
                  <td>
                    <LineaEditable cantidad={l.cantidad}
                      onGuardar={(n) => llamar('admin_editar_linea_proveedor', { p_id: l.id, p_cantidad: n }, 'Cantidad actualizada')}
                      onQuitar={() => { if (window.confirm('¿Quitar esta pieza de la lista?')) llamar('admin_editar_linea_proveedor', { p_id: l.id, p_cantidad: 0 }, 'Línea quitada') }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form className="admin-form linea-nueva" onSubmit={agregar}>
        <strong>Agregar pieza para reponer inventario</strong>
        <div className="linea-nueva-fila">
          <input required placeholder="Código (SKU)" value={nuevo.sku} onChange={(e) => setNuevo({ ...nuevo, sku: e.target.value })} />
          <input required type="number" min="1" placeholder="Cantidad" value={nuevo.cantidad} onChange={(e) => setNuevo({ ...nuevo, cantidad: e.target.value })} />
          <input placeholder="Nota (opcional)" value={nuevo.nota} onChange={(e) => setNuevo({ ...nuevo, nota: e.target.value })} />
          <button type="submit">Agregar</button>
        </div>
      </form>

      {hayAlgo && (
        <>
          <label className="solo-disp" style={{ marginTop: '1rem' }}>
            <input type="checkbox" checked={conPendientes} onChange={(e) => setConPendientes(e.target.checked)} />
            Incluir en el PDF y la lista copiada los encargos que aún no pagan reserva
          </label>
          <div className="pedido-acciones">
            <button disabled={generando || paraPdf.length === 0} onClick={() => pdf(paraPdf, 'Pedido a proveedor')}>
              {generando ? 'Generando...' : 'Descargar PDF para enviar'}
            </button>
            <button disabled={paraPdf.length === 0} onClick={copiar}>Copiar lista</button>
            <button className="verde" disabled={listos.length === 0 && lineas.length === 0}
              onClick={() => llamar('admin_pedir_proveedor', {}, 'Pedido al proveedor registrado')}>
              Ya hice el pedido al proveedor
            </button>
          </div>
          <p className="pedido-notas">El pedido incluye los encargos con reserva pagada ({listos.length}) y las piezas de reposición ({lineas.length}).</p>
        </>
      )}

      <h2 style={{ marginTop: '2rem' }}>Pedidos al proveedor en camino</h2>
      {enCamino.length === 0 ? <p>Nada en camino.</p> : enCamino.map((x) => (
        <div className="pedido-card" key={x.id}>
          <div className="pedido-cab"><strong>Pedido #{x.id}</strong><span>{fechaCorta(x.created_at)}</span></div>
          <div className="tabla-scroll">
            <table className="admin-tabla">
              <thead><tr><th>Código</th><th>Producto</th><th>Detalle</th><th>Cantidad</th></tr></thead>
              <tbody>{x.items.map((i) => (
                <tr key={i.sku}>
                  <td>{i.sku}</td><td>{i.nombre}</td>
                  <td>{Number(i.manual) > 0 ? `${i.manual} para inventario` : 'para clientes'}</td>
                  <td>
                    <LineaEditable cantidad={i.cantidad}
                      onGuardar={(n) => llamar('admin_editar_proveedor_item', { p_batch_id: x.id, p_sku: i.sku, p_cantidad: n }, 'Cantidad actualizada')}
                      onQuitar={() => { if (window.confirm(`¿Quitar ${i.sku} de este pedido al proveedor?`)) llamar('admin_editar_proveedor_item', { p_batch_id: x.id, p_sku: i.sku, p_cantidad: 0 }, 'Línea quitada') }} />
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="pedido-acciones">
            <button onClick={() => pdf(x.items, `Pedido a proveedor #${x.id}`)}>Descargar PDF</button>
            <button className="verde" onClick={() => llamar('admin_recibir_proveedor', { p_id: x.id }, 'Recibido: encargos listos y reposición sumada al inventario')}>
              Ya llegó este pedido
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

const MOTIVOS = { vencido: 'Anulada: no se recogió en 15 días', sin_pago: 'Cancelada: no pagó la reserva', manual: 'Cancelada manualmente' }

function Historial({ pass }) {
  const { pedidos, proveedor, msg, llamar, borrar } = usePedidos(pass)
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
            <div className="pedido-acciones">
              <button onClick={() => pdfPedidoProveedor(x.items, `Pedido a proveedor #${x.id}`)}>Descargar PDF</button>
            </div>
          </div>
        ))
      ) : (
        <>
          {vistas[ver].length === 0 && <p>No hay registros.</p>}
          {ver === 'cancelaciones' && vistas.cancelaciones.length > 0 && (
            <div className="pedido-acciones" style={{ marginBottom: '1rem' }}>
              <button className="rojo" onClick={() => { if (window.confirm(`¿Borrar definitivamente las ${vistas.cancelaciones.length} canceladas/anuladas?`)) llamar('admin_borrar_canceladas', {}, 'Canceladas borradas') }}>
                Borrar todas las canceladas
              </button>
            </div>
          )}
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
              <div className="pedido-acciones">
                <button className="rojo" onClick={() => borrar(p)}>Borrar</button>
              </div>
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
