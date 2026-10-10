import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { sb } from '../lib/supabase'
import { money, fechaCorta, waNumber, mensajeError, mensajeConfirmacion, DIAS_APARTADO, servicioPorId } from '../lib/store'
import Reportes from './Reportes'
import { MARCA } from '../config'
import Estrella from '../components/Estrella'
import { pdfPedidoProveedor } from '../lib/pdfProveedor'
import '../styles/Admin.css'

const TABS = [
  ['pendientes', 'Pendientes de entrega'],
  ['proveedor', 'Pedidos a proveedor'],
  ['inventario', 'Inventario actual'],
  ['historial', 'Historial'],
  ['reportes', 'Reportes'],
  ['nuevo', 'Nuevo producto'],
]

export default function Admin({ adminPass, onLogin }) {
  const [tab, setTab] = useState('pendientes')

  if (!adminPass) {
    return (
      <div className="admin-login">
        <img src={MARCA.logo} alt={MARCA.nombreCorto} />
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
      {tab === 'inventario' && <InventarioActual pass={adminPass} />}
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
    setMsg(c.error ? 'Para editar líneas del proveedor falta ejecutar el SQL de instalación (instalar.sql) en Supabase.' : '')
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
  return { pedidos, proveedor, lineas, msg, llamar, borrar, cargar, setMsg }
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
                  {p.tipo === 'encargo' && <span className={`pill ${p.urgente ? 'cancelado' : 'entregado'}`}>{p.urgente ? 'URGENTE (15 días, con envío)' : 'normal (~30 días, sin envío)'}</span>}
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
                {p.urgente && servicioPorId(p.servicio_envio) && (
                  <p className="solicitud">El cliente eligió envío urgente: <strong>{servicioPorId(p.servicio_envio).nombre}</strong>, de {servicioPorId(p.servicio_envio).rango} ({servicioPorId(p.servicio_envio).tiempo}). Fija el costo exacto en "Envío local ($)" al validar.</p>
                )}
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

const COSTO_PCT = 0.5

function InventarioActual({ pass }) {
  const [prods, setProds] = useState([])
  const [cats, setCats] = useState([])
  const [cargando, setCargando] = useState(true)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [conAgotados, setConAgotados] = useState(false)
  const [tocados, setTocados] = useState({})
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    (async () => {
      const r = (a, b) => sb.from('productos').select('id,sku,nombre,precio,stock,categoria_id,activo,destacado').eq('activo', true).order('sku').range(a, b)
      const [c, p1, p2, p3] = await Promise.all([sb.from('categorias').select('*').order('nombre'), r(0, 999), r(1000, 1999), r(2000, 2999)])
      setCats(c.data || [])
      setProds([...(p1.data || []), ...(p2.data || []), ...(p3.data || [])])
      setCargando(false)
    })()
  }, [])

  const nomCat = Object.fromEntries(cats.map((c) => [c.id, c.nombre]))
  const term = q.trim().toLowerCase()
  const filas = prods
    .filter((p) => (conAgotados || Number(p.stock) > 0 || tocados[p.id]) && (!cat || String(p.categoria_id) === cat) &&
      (!term || p.sku.toLowerCase().includes(term) || p.nombre.toLowerCase().includes(term)))
    .map((p) => ({ ...p, categoria: nomCat[p.categoria_id] || 'Sin categoría', costo: p.precio * COSTO_PCT, valor: p.precio * COSTO_PCT * Number(p.stock) }))
    .sort((a, b) => a.categoria.localeCompare(b.categoria) || a.sku.localeCompare(b.sku))
  const ajustar = async (f, delta, fijo = null) => {
    const { data, error } = await sb.rpc('admin_adjust_stock', { p_pass: pass, p_id: f.id, p_delta: delta, p_set: fijo })
    if (error) return setAviso('No se pudo guardar: ' + mensajeError(error))
    setAviso('')
    setTocados((t) => ({ ...t, [f.id]: true }))
    setProds((ps) => ps.map((x) => (x.id === f.id ? { ...x, stock: data } : x)))
  }
  const ocultar = async (f) => {
    if (!window.confirm(`¿Ocultar ${f.nombre} de la tienda? Dejará de verse para los clientes; puedes volver a mostrarlo desde el catálogo ("Ver productos ocultos").`)) return
    const { error } = await sb.rpc('admin_set_activo', { p_pass: pass, p_id: f.id, p_valor: false })
    if (error) return setAviso('No se pudo ocultar: ' + mensajeError(error))
    setProds((ps) => ps.filter((x) => x.id !== f.id))
  }
  const piezas = filas.reduce((s, f) => s + Number(f.stock), 0)
  const valorCosto = filas.reduce((s, f) => s + f.valor, 0)
  const valorVenta = filas.reduce((s, f) => s + f.precio * Number(f.stock), 0)

  const csv = () => {
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`
    const lineas = [['Categoría', 'Producto', 'Código', 'Precio', 'Costo', 'Cantidad', 'Valor del inventario'].join(',')]
    filas.forEach((f) => lineas.push([f.categoria, f.nombre, f.sku, f.precio.toFixed(2), f.costo.toFixed(2), f.stock, f.valor.toFixed(2)].map(esc).join(',')))
    lineas.push(['TOTAL', '', '', '', '', piezas, valorCosto.toFixed(2)].map(esc).join(','))
    const blob = new Blob(['\ufeff' + lineas.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `inventario-${MARCA.archivoPrefijo}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  if (cargando) return <p>Cargando inventario...</p>
  return (
    <div>
      <div className="kpis">
        <div className="kpi"><span className="kpi-t">Piezas en existencia</span><strong>{piezas}</strong><small>{filas.length} producto(s)</small></div>
        <div className="kpi"><span className="kpi-t">Valor del inventario (a costo)</span><strong>{money(valorCosto)}</strong></div>
        <div className="kpi"><span className="kpi-t">Valor a precio de venta</span><strong>{money(valorVenta)}</strong></div>
      </div>
      <p className="admin-nota">Costo = 50% del precio de venta. Valor del inventario = costo x cantidad. Ajusta la cantidad de cada línea con + y −, o escribe el número. Para sumar un producto agotado activa "Incluir productos agotados".</p>
      {aviso && <p className="admin-error">{aviso}</p>}
      <div className="admin-busqueda">
        <input placeholder="Buscar por código o producto..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="select-cat">
          <option value="">Todas las categorías</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <button type="button" onClick={csv} disabled={filas.length === 0}>Descargar CSV</button>
      </div>
      <label className="solo-disp">
        <input type="checkbox" checked={conAgotados} onChange={(e) => setConAgotados(e.target.checked)} /> Incluir productos agotados
      </label>
      {filas.length === 0 ? <p>No hay productos con existencia.</p> : (
        <div className="tabla-scroll">
          <table className="admin-tabla">
            <thead><tr><th>Categoría</th><th>Producto</th><th>Código</th><th className="der">Precio</th><th className="der">Costo</th><th className="der">Cantidad</th><th className="der">Valor del inventario</th><th>Destacado</th><th>Ocultar</th></tr></thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id}>
                  <td>{f.categoria}</td><td>{f.nombre}</td><td>{f.sku}</td>
                  <td className="der">{money(f.precio)}</td><td className="der">{money(f.costo)}</td>
                  <td className="der">
                    <div className="stepper">
                      <button onClick={() => ajustar(f, -1)} disabled={Number(f.stock) <= 0}>−</button>
                      <input type="number" min="0" value={f.stock}
                        onChange={(e) => setProds(prods.map((x) => (x.id === f.id ? { ...x, stock: e.target.value } : x)))}
                        onBlur={(e) => ajustar(f, 0, Math.max(0, parseInt(e.target.value) || 0))} />
                      <button onClick={() => ajustar(f, 1)}>+</button>
                    </div>
                  </td>
                  <td className="der">{money(f.valor)}</td>
                  <td className="celda-estrella"><Estrella producto={f} pass={pass} onCambio={(id, v) => setProds((ps) => ps.map((x) => (x.id === id ? { ...x, destacado: v } : x)))} /></td>
                  <td className="celda-estrella"><button className="btn-ocultar-fila" title="Ocultar de la tienda" onClick={() => ocultar(f)}>Ocultar</button></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan="5"><strong>TOTAL</strong></td><td className="der"><strong>{piezas}</strong></td><td className="der"><strong>{money(valorCosto)}</strong></td><td></td><td></td></tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

function Cotejo({ lote, pass, onCerrar, recargar }) {
  const [rec, setRec] = useState(() => Object.fromEntries(lote.items.map((i) => [i.sku, String(i.recibido ?? i.cantidad)])))
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const cerrado = lote.estado === 'recibido'

  const destino = (i, n) => {
    const cust = Math.max(Number(i.cantidad) - Number(i.manual || 0), 0)
    const alloc = Math.min(n, cust)
    return { alloc, inv: n - alloc }
  }

  const confirmar = async (i) => {
    const n = parseInt(rec[i.sku])
    if (isNaN(n) || n < 0) return setMsg('Escribe la cantidad recibida (0 si no llegó).')
    setOcupado(true)
    const { data, error } = await sb.rpc('admin_confirmar_recepcion', { p_pass: pass, p_batch_id: lote.id, p_sku: i.sku, p_recibido: n })
    setOcupado(false)
    if (error) return setMsg(mensajeError(error))
    setMsg(`${i.sku}: ${data.al_inventario} pieza(s) sumadas al inventario, ${data.para_clientes} separadas para clientes.${data.cerrado ? ' Pedido cerrado.' : ''}`)
    recargar()
  }

  const confirmarTodas = async () => {
    setOcupado(true)
    for (const i of lote.items.filter((x) => !x.confirmado)) {
      const n = parseInt(rec[i.sku])
      if (isNaN(n) || n < 0) { setMsg(`Revisa la cantidad de ${i.sku}`); break }
      const { error } = await sb.rpc('admin_confirmar_recepcion', { p_pass: pass, p_batch_id: lote.id, p_sku: i.sku, p_recibido: n })
      if (error) { setMsg(mensajeError(error)); break }
      setMsg('Líneas confirmadas e inventario actualizado.')
    }
    setOcupado(false)
    recargar()
  }

  const cerrarForzado = async () => {
    if (!window.confirm('¿Cerrar este pedido? Lo que no hayas confirmado se considera no recibido y lo de clientes vuelve a la lista por pedir.')) return
    const { error } = await sb.rpc('admin_cerrar_pedido_proveedor', { p_pass: pass, p_batch_id: lote.id })
    if (error) return setMsg(mensajeError(error))
    recargar()
  }

  const pendientes = lote.items.filter((i) => !i.confirmado)
  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal modal-ancho" onClick={(e) => e.stopPropagation()}>
        <h2>Cotejar pedido #{lote.id}</h2>
        <p className="admin-nota">
          Captura lo que realmente llegó y confirma cada línea. Al confirmar, el inventario se actualiza al momento:
          lo que corresponde a encargos de clientes se separa para ellos y el resto entra al inventario.
        </p>
        <div className="tabla-scroll">
          <table className="admin-tabla">
            <thead><tr><th>Código</th><th>Producto</th><th>Pedido</th><th>Recibido</th><th>Destino</th><th></th></tr></thead>
            <tbody>
              {lote.items.map((i) => {
                const n = parseInt(rec[i.sku]); const ok = !isNaN(n)
                const d = ok ? destino(i, n) : { alloc: 0, inv: 0 }
                const dif = ok ? n - Number(i.cantidad) : 0
                const fila = i.confirmado ? destino(i, Number(i.recibido)) : d
                return (
                  <tr key={i.sku} className={i.confirmado ? 'fila-ok' : ''}>
                    <td>{i.sku}</td><td>{i.nombre}</td><td><strong>{i.cantidad}</strong></td>
                    <td>
                      {i.confirmado ? <strong>{i.recibido}</strong> : (
                        <input type="number" min="0" value={rec[i.sku]} className="input-cotejo"
                          onChange={(e) => setRec({ ...rec, [i.sku]: e.target.value })} />
                      )}
                      {!i.confirmado && dif !== 0 && <small className={dif < 0 ? 'por-cobrar' : 'ok'}> {dif < 0 ? `faltan ${-dif}` : `sobran ${dif}`}</small>}
                    </td>
                    <td className="destino">{fila.alloc > 0 && <span>Clientes: {fila.alloc}</span>}{fila.inv > 0 && <span>Inventario: +{fila.inv}</span>}</td>
                    <td>{i.confirmado ? <span className="pill entregado">Confirmado</span> : (
                      <button className="verde" disabled={ocupado || cerrado} onClick={() => confirmar(i)}>Confirmar</button>
                    )}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {msg && <p className="admin-nota">{msg}</p>}
        {cerrado && <p className="ok-msg">Pedido cerrado. Lo que faltó de encargos de clientes regresó a la lista por pedir.</p>}
        <div className="pedido-acciones">
          {!cerrado && pendientes.length > 0 && <button className="verde" disabled={ocupado} onClick={confirmarTodas}>Confirmar todas las pendientes</button>}
          {!cerrado && <button className="rojo" onClick={cerrarForzado}>Cerrar sin confirmar lo demás</button>}
          <button onClick={onCerrar}>{cerrado ? 'Listo' : 'Cerrar ventana'}</button>
        </div>
      </div>
    </div>
  )
}

function Proveedor({ pass }) {
  const { pedidos, proveedor, lineas, msg, llamar, cargar } = usePedidos(pass)
  const [cotejando, setCotejando] = useState(null)
  const [vista, setVista] = useState('normal')
  const [conPendientes, setConPendientes] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [nuevo, setNuevo] = useState({ sku: '', cantidad: '1', nota: '' })

  const urgenteVista = vista === 'urgente'
  const todosEncargos = pedidos.filter((p) => p.tipo === 'encargo' && !['pedido', 'recibido'].includes(p.proveedor_estado) && !['cancelado', 'entregado'].includes(p.estado))
  const nUrgentes = todosEncargos.filter((p) => p.urgente).length
  const nNormales = todosEncargos.filter((p) => !p.urgente).length + lineas.length
  const encargos = todosEncargos.filter((p) => !!p.urgente === urgenteVista)
  const lineasVista = urgenteVista ? [] : lineas
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
    ...lineasVista.map((l) => ({ sku: l.sku, nombre: l.nombre, cantidad: l.cantidad })),
  ])

  const pdf = async (lista, titulo) => {
    setGenerando(true)
    try { await pdfPedidoProveedor(lista, titulo) } finally { setGenerando(false) }
  }
  const copiar = async () => {
    const t = `Pedido a proveedor ${MARCA.nombreCorto}\n` + paraPdf.map((i) => `${i.cantidad} x ${i.sku} - ${i.nombre}`).join('\n')
    try { await navigator.clipboard.writeText(t); alert('Lista copiada') } catch { alert(t) }
  }
  const agregar = async (e) => {
    e.preventDefault()
    await llamar('admin_agregar_linea_proveedor', { p_sku: nuevo.sku.trim(), p_cantidad: parseInt(nuevo.cantidad) || 0, p_nota: nuevo.nota }, 'Pieza agregada a la lista')
    setNuevo({ sku: '', cantidad: '1', nota: '' })
  }
  const hayAlgo = filasCli.length > 0 || lineasVista.length > 0

  return (
    <div>
      {msg && <p className="admin-nota">{msg}</p>}
      <h2>Pedidos a proveedor: lista por pedir</h2>
      <div className="admin-subtabs">
        <button className={vista === 'normal' ? 'on' : ''} onClick={() => setVista('normal')}>Siguiente pedido normal ({nNormales})</button>
        <button className={vista === 'urgente' ? 'on urgente' : 'urgente'} onClick={() => setVista('urgente')}>Urgentes, pedir ya ({nUrgentes})</button>
      </div>
      <p className="admin-nota">
        {urgenteVista
          ? 'Encargos que el cliente quiere en máximo 15 días (con envío). Se piden de inmediato, aparte del pedido normal.'
          : 'Encargos que esperan al siguiente pedido normal (~30 días, sin costo de envío) y piezas de reposición.'}
      </p>
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
                  <td>{p.nombre_cliente} <span className={`pill ${listo ? 'entregado' : 'pendiente'}`}>{listo ? 'reserva pagada' : 'falta reserva'}</span>{p.urgente && servicioPorId(p.servicio_envio) && <span className="pill cancelado">{servicioPorId(p.servicio_envio).nombre.split(' (')[0]}</span>}</td>
                  <td>
                    <LineaEditable cantidad={i.cantidad}
                      onGuardar={(n) => llamar('admin_editar_item_pedido', { p_id: p.id, p_idx: idx, p_cantidad: n }, 'Cantidad actualizada y total del pedido recalculado')}
                      onQuitar={() => { if (window.confirm(`¿Quitar ${i.nombre} del pedido de ${p.nombre_cliente}? Se recalcula el total de su pedido.`)) llamar('admin_editar_item_pedido', { p_id: p.id, p_idx: idx, p_cantidad: 0 }, 'Línea quitada') }} />
                  </td>
                </tr>
              ))}
              {lineasVista.map((l) => (
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
            <button className="verde" disabled={listos.length === 0 && lineasVista.length === 0}
              onClick={() => llamar('admin_pedir_proveedor', { p_urgente: urgenteVista }, urgenteVista ? 'Pedido urgente registrado' : 'Pedido al proveedor registrado')}>
              {urgenteVista ? 'Ya hice el pedido urgente' : 'Ya hice el pedido al proveedor'}
            </button>
          </div>
          <p className="pedido-notas">El pedido incluye los encargos con reserva pagada ({listos.length}){urgenteVista ? '' : ` y las piezas de reposición (${lineasVista.length})`}.</p>
        </>
      )}

      <h2 style={{ marginTop: '2rem' }}>Pedidos al proveedor en camino</h2>
      {enCamino.length === 0 ? <p>Nada en camino.</p> : enCamino.map((x) => (
        <div className="pedido-card" key={x.id}>
          <div className="pedido-cab"><strong>Pedido #{x.id}</strong><span>{fechaCorta(x.created_at)}</span>{x.urgente && <span className="pill cancelado">URGENTE</span>}</div>
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
            <button className="verde" onClick={() => setCotejando(x.id)}>Ya llegó: cotejar y recibir</button>
          </div>
        </div>
      ))}
      {cotejando && proveedor.find((x) => x.id === cotejando) && (
        <Cotejo lote={proveedor.find((x) => x.id === cotejando)} pass={pass} onCerrar={() => setCotejando(null)} recargar={cargar} />
      )}
    </div>
  )
}

const MOTIVOS = { vencido: 'Anulada: no se recogió en 15 días', sin_pago: 'Cancelada: no pagó la reserva', manual: 'Cancelada manualmente' }

const ESTADO_VENTA = { entregado: 'Cerrada', confirmado: 'Reserva pagada', por_confirmar: 'Por pagar reserva', cancelado: 'Cancelada' }

function fechaVenta(p) { return new Date(p.entregado_at || p.created_at) }
const ymd = (d) => new Date(d).toISOString().slice(0, 10)

function FormVenta({ pass, onGuardada, onCancelar }) {
  const hoy = ymd(new Date())
  const [fecha, setFecha] = useState(hoy)
  const [cliente, setCliente] = useState('')
  const [telefono, setTelefono] = useState('')
  const [lineas, setLineas] = useState([])
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState([])
  const [tipo, setTipo] = useState('monto')
  const [valor, setValor] = useState('')
  const [notas, setNotas] = useState('')
  const [forzar, setForzar] = useState(false)
  const [msg, setMsg] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    const t = q.trim().replace(/[,()]/g, ' ')
    if (t.length < 2) { setResultados([]); return }
    const h = setTimeout(async () => {
      const { data } = await sb.from('productos').select('id,sku,nombre,precio,stock').eq('activo', true)
        .or(`sku.ilike.%${t}%,nombre.ilike.%${t}%`).order('stock', { ascending: false }).limit(8)
      setResultados(data || [])
    }, 250)
    return () => clearTimeout(h)
  }, [q])

  const agregar = (p) => {
    setLineas((ls) => ls.find((l) => l.id === p.id)
      ? ls.map((l) => (l.id === p.id ? { ...l, cantidad: l.cantidad + 1 } : l))
      : [...ls, { id: p.id, sku: p.sku, nombre: p.nombre, precio: String(p.precio), cantidad: 1, stock: p.stock }])
    setQ(''); setResultados([])
  }
  const cambiar = (id, campo, v) => setLineas((ls) => ls.map((l) => (l.id === id ? { ...l, [campo]: v } : l)))
  const quitar = (id) => setLineas((ls) => ls.filter((l) => l.id !== id))

  const subtotal = lineas.reduce((s, l) => s + (parseFloat(l.precio) || 0) * (parseInt(l.cantidad) || 0), 0)
  const v = parseFloat(valor) || 0
  const descuento = tipo === 'porcentaje' ? subtotal * Math.min(v, 100) / 100 : Math.min(v, subtotal)
  const total = subtotal - descuento

  const guardar = async (e) => {
    e.preventDefault()
    if (lineas.length === 0) return setMsg('Agrega al menos un producto.')
    setGuardando(true); setMsg('')
    const { data, error } = await sb.rpc('admin_registrar_venta', {
      p_pass: pass, p_fecha: fecha, p_cliente: cliente, p_telefono: telefono,
      p_items: lineas.map((l) => ({ id: l.id, cantidad: parseInt(l.cantidad) || 1, precio: parseFloat(l.precio) || 0 })),
      p_desc_tipo: tipo, p_desc_valor: v, p_notas: notas, p_forzar: forzar,
    })
    setGuardando(false)
    if (error) return setMsg(/schema cache|Could not find/i.test(error.message) ? 'Falta ejecutar el SQL de instalación (instalar.sql) en Supabase.' : error.message)
    onGuardada(data)
  }

  return (
    <form className="form-venta" onSubmit={guardar}>
      <h3>Registrar venta manual</h3>
      <div className="form-venta-grid">
        <label>Fecha<input type="date" required value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} /></label>
        <label>Cliente<input placeholder="Nombre del cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} /></label>
        <label>Teléfono<input type="tel" placeholder="Opcional" value={telefono} onChange={(e) => setTelefono(e.target.value)} /></label>
      </div>

      <label className="form-venta-busca">Productos
        <input placeholder="Busca por código o nombre y elige..." value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {resultados.length > 0 && (
        <ul className="resultados-venta">
          {resultados.map((p) => (
            <li key={p.id}><button type="button" onClick={() => agregar(p)}>
              <strong>{p.sku}</strong> {p.nombre} <span>{money(p.precio)} | existencia: {p.stock}</span>
            </button></li>
          ))}
        </ul>
      )}

      {lineas.length > 0 && (
        <div className="tabla-scroll">
          <table className="admin-tabla">
            <thead><tr><th>Producto</th><th>Cantidad</th><th>Precio c/u</th><th className="der">Importe</th><th></th></tr></thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.id}>
                  <td>{l.nombre}<br /><small>{l.sku} | existencia: {l.stock}</small></td>
                  <td><input type="number" min="1" value={l.cantidad} className="input-cotejo" onChange={(e) => cambiar(l.id, 'cantidad', e.target.value)} /></td>
                  <td><input type="number" min="0" step="0.01" value={l.precio} className="input-cotejo ancho" onChange={(e) => cambiar(l.id, 'precio', e.target.value)} /></td>
                  <td className="der">{money((parseFloat(l.precio) || 0) * (parseInt(l.cantidad) || 0))}</td>
                  <td><button type="button" className="btn-ocultar-fila" onClick={() => quitar(l.id)}>Quitar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="form-venta-grid">
        <label>Descuento
          <span className="descuento-fila">
            <span className="segmento">
              <button type="button" className={tipo === 'monto' ? 'on' : ''} onClick={() => setTipo('monto')}>$</button>
              <button type="button" className={tipo === 'porcentaje' ? 'on' : ''} onClick={() => setTipo('porcentaje')}>%</button>
            </span>
            <input type="number" min="0" step="0.01" value={valor} placeholder="0" onChange={(e) => setValor(e.target.value)} />
          </span>
        </label>
        <label>Notas<input placeholder="Opcional" value={notas} onChange={(e) => setNotas(e.target.value)} /></label>
      </div>

      <div className="venta-totales">
        <span>Subtotal: <strong>{money(subtotal)}</strong></span>
        <span>Descuento: <strong>-{money(descuento)}</strong></span>
        <span className="grande">Total: <strong>{money(total)}</strong></span>
      </div>

      <label className="solo-disp">
        <input type="checkbox" checked={forzar} onChange={(e) => setForzar(e.target.checked)} />
        Registrar aunque el sistema marque menos existencia (el inventario queda en 0)
      </label>
      <p className="admin-nota">Al guardar, las piezas se descuentan del inventario y la venta cuenta en los reportes con la fecha elegida.</p>
      {msg && <p className="admin-error">{msg}</p>}
      <div className="pedido-acciones">
        <button type="submit" className="verde" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar venta'}</button>
        <button type="button" onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  )
}

function RegistroVentas({ pedidos, pass, cargar, borrar }) {
  const [form, setForm] = useState(false)
  const [origen, setOrigen] = useState('todas')
  const [estado, setEstado] = useState('cerradas')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [aviso, setAviso] = useState('')

  const filas = pedidos
    .filter((p) => p.estado !== 'cancelado')
    .filter((p) => (origen === 'todas' ? true : origen === 'manual' ? p.tipo === 'venta' : p.tipo !== 'venta'))
    .filter((p) => (estado === 'cerradas' ? p.estado === 'entregado' : estado === 'proceso' ? p.estado !== 'entregado' : true))
    .filter((p) => {
      const d = ymd(fechaVenta(p))
      return (!desde || d >= desde) && (!hasta || d <= hasta)
    })
    .sort((a, b) => fechaVenta(b) - fechaVenta(a))
  const sum = (f) => filas.reduce((s, p) => s + f(p), 0)
  const unidades = sum((p) => p.items.reduce((u, i) => u + i.cantidad, 0))

  const anular = async (p) => {
    if (!window.confirm(`¿Anular la venta ${p.numero_pedido}? Las piezas regresan al inventario.`)) return
    const { error } = await sb.rpc('admin_anular_venta', { p_pass: pass, p_id: p.id })
    if (error) return setAviso(mensajeError(error))
    setAviso('Venta anulada, inventario restituido'); cargar()
  }

  const csv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const l = [['Fecha', 'Folio', 'Origen', 'Estado', 'Cliente', 'Teléfono', 'Productos', 'Subtotal', 'Descuento', 'Total'].join(',')]
    filas.forEach((p) => l.push([ymd(fechaVenta(p)), p.numero_pedido, p.tipo === 'venta' ? 'Manual' : 'Página', ESTADO_VENTA[p.estado], p.nombre_cliente, p.whatsapp,
      p.items.map((i) => `${i.cantidad} x ${i.nombre}`).join(' | '), Number(p.subtotal).toFixed(2), Number(p.descuento).toFixed(2), Number(p.total).toFixed(2)].map(esc).join(',')))
    const blob = new Blob(['﻿' + l.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `ventas-${MARCA.archivoPrefijo}-${ymd(new Date())}.csv`; a.click()
  }

  return (
    <div>
      <div className="kpis">
        <div className="kpi"><span className="kpi-t">Registros</span><strong>{filas.length}</strong></div>
        <div className="kpi"><span className="kpi-t">Unidades</span><strong>{unidades}</strong></div>
        <div className="kpi"><span className="kpi-t">Subtotal</span><strong>{money(sum((p) => Number(p.subtotal)))}</strong></div>
        <div className="kpi"><span className="kpi-t">Descuentos</span><strong>{money(sum((p) => Number(p.descuento)))}</strong></div>
        <div className="kpi"><span className="kpi-t">Total</span><strong>{money(sum((p) => Number(p.total)))}</strong></div>
      </div>

      {!form && <div className="pedido-acciones" style={{ marginBottom: '1rem' }}>
        <button className="verde" onClick={() => setForm(true)}>+ Registrar venta manual</button>
        <button onClick={csv} disabled={filas.length === 0}>Descargar CSV</button>
      </div>}
      {aviso && <p className="admin-nota">{aviso}</p>}
      {form && <FormVenta pass={pass} onCancelar={() => setForm(false)}
        onGuardada={(r) => { setForm(false); setAviso(`Venta ${r.numero_pedido} registrada por ${money(r.total)}. Inventario actualizado.`); cargar() }} />}

      <div className="filtros-venta">
        <label>Origen
          <select value={origen} onChange={(e) => setOrigen(e.target.value)}>
            <option value="todas">Página y manuales</option><option value="pagina">Solo pedidos de la página</option><option value="manual">Solo ventas manuales</option>
          </select></label>
        <label>Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="cerradas">Ventas cerradas (cobradas y entregadas)</option><option value="proceso">Pedidos en proceso</option><option value="todos">Todos</option>
          </select></label>
        <label>Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
        <label>Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
      </div>

      {filas.length === 0 ? <p>No hay registros con ese filtro.</p> : (
        <div className="tabla-scroll">
          <table className="admin-tabla">
            <thead><tr><th>Fecha</th><th>Cliente</th><th>Teléfono</th><th>Productos</th><th className="der">Subtotal</th><th className="der">Descuento</th><th className="der">Total</th><th>Origen</th><th></th></tr></thead>
            <tbody>
              {filas.map((p) => (
                <tr key={p.id}>
                  <td>{fechaCorta(ymd(fechaVenta(p)))}<br /><small>{p.numero_pedido}</small></td>
                  <td>{p.nombre_cliente}</td>
                  <td>{p.whatsapp || ''}</td>
                  <td>{p.items.map((i) => `${i.cantidad} x ${i.nombre}`).join(', ')}</td>
                  <td className="der">{money(p.subtotal)}</td>
                  <td className="der">{Number(p.descuento) > 0 ? `-${money(p.descuento)}` : ''}</td>
                  <td className="der"><strong>{money(p.total)}</strong></td>
                  <td>
                    <span className={`pill ${p.tipo === 'venta' ? 'encargo' : 'entregado'}`}>{p.tipo === 'venta' ? 'Manual' : 'Página'}</span>
                    {p.estado !== 'entregado' && <span className="pill pendiente">{ESTADO_VENTA[p.estado]}</span>}
                  </td>
                  <td>
                    {p.tipo === 'venta'
                      ? <button className="btn-ocultar-fila" onClick={() => anular(p)}>Anular</button>
                      : <button className="btn-ocultar-fila" onClick={() => borrar(p)}>Borrar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Historial({ pass }) {
  const { pedidos, proveedor, msg, llamar, borrar, cargar } = usePedidos(pass)
  const [ver, setVer] = useState('ventas')

  const vistas = {
    ventas: pedidos.filter((p) => p.estado === 'entregado'),
    reservas: pedidos.filter((p) => p.estado !== 'cancelado' && p.tipo !== 'venta' && p.pagos?.[0]?.nota !== 'Venta en mostrador'),
    cancelaciones: pedidos.filter((p) => p.estado === 'cancelado'),
  }

  return (
    <div>
      {msg && <p className="admin-nota">{msg}</p>}
      <div className="admin-subtabs">
        {[['ventas', 'Registro de ventas'], ['reservas', 'Reservas y apartados'], ['cancelaciones', 'Cancelaciones y anuladas'], ['proveedor', 'Pedidos al proveedor']].map(([k, l]) => (
          <button key={k} className={ver === k ? 'on' : ''} onClick={() => setVer(k)}>{l}</button>
        ))}
      </div>


      {ver === 'ventas' ? (
        <RegistroVentas pedidos={pedidos} pass={pass} cargar={cargar} borrar={borrar} />
      ) : ver === 'proveedor' ? (
        proveedor.length === 0 ? <p>Aún no hay pedidos al proveedor.</p> : proveedor.map((x) => (
          <div className="pedido-card" key={x.id}>
            <div className="pedido-cab">
              <strong>Pedido #{x.id}</strong><span>{fechaCorta(x.created_at)}</span>
              <span className={`pill ${x.estado === 'recibido' ? 'entregado' : 'pendiente'}`}>
                {x.estado === 'recibido' ? `Recibido ${fechaCorta(x.recibido_at)}` : 'En camino'}
              </span>
            </div>
            <ul>{x.items.map((i) => <li key={i.sku}>{i.cantidad} x {i.nombre} ({i.sku}){i.confirmado ? ` | recibido: ${i.recibido}` : ''}</li>)}</ul>
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
