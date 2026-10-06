import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BotonAmpliar } from '../components/Foto'
import { sb } from '../lib/supabase'
import {
  money, fotoUrl, waNumber, reciboTexto, pedidoParaLessa, fechaCorta, mensajeError,
  WA_TIENDA, WA_TIENDA_VISIBLE, EMAIL_TIENDA, CLABE, DIAS_PREORDEN, DIAS_APARTADO, PCT_ANTICIPO,
} from '../lib/store'
import '../styles/Carrito.css'

function Recibo({ r, cliente, onNuevo }) {
  const texto = reciboTexto(r, cliente)
  const textoLessa = pedidoParaLessa(r, cliente)
  const todoMostrador = r.pedidos.every((p) => p.mostrador)
  const waCliente = waNumber(cliente.whatsapp)
  const fila = (i) => (
    <tr key={i.id}>
      <td>{i.nombre}</td>
      <td className="num">{i.cantidad}</td>
      <td className="num">{money(i.precio)}</td>
      <td className="num">{money(i.precio * i.cantidad)}</td>
    </tr>
  )

  return (
    <div className="carrito recibo-pagina">
      <div className="recibo" id="recibo">
        <div className="recibo-cabecera">
          <img src="/logo.png" alt="Lessa" />
          <div>
            <h2>{r.pedidos.some((p) => p.mostrador) ? 'Recibo de venta' : r.pedidos.every((p) => p.validado) ? 'Recibo de reserva' : 'Pedido recibido'}</h2>
            <p>{fechaCorta(new Date().toISOString())}</p>
          </div>
        </div>
        <p><strong>Cliente:</strong> {cliente.nombre} | {cliente.email}{cliente.whatsapp ? ` | ${cliente.whatsapp}` : ''}</p>

        {r.pedidos.map((p) => (
          <div key={p.id} className="recibo-bloque">
            <h3>
              {p.tipo === 'encargo'
                ? `Encargo ${p.numero_pedido}: llega en ~${DIAS_PREORDEN} días (aprox. ${fechaCorta(p.entrega_estimada)})`
                : `${p.mostrador ? 'Venta' : 'Apartado'} ${p.numero_pedido}`}
            </h3>
            <table>
              <thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Importe</th></tr></thead>
              <tbody>{p.items.map(fila)}</tbody>
            </table>
            <div className="recibo-totales">
              {p.descuento > 0 && <div><span>Descuento</span><span>-{money(p.descuento)}</span></div>}
              <div className="grande"><span>Total</span><span>{money(p.total)}</span></div>
              {p.mostrador ? <div><span>Pagado</span><span>{money(p.total)}</span></div> : (
                <>
                  <div><span>{p.validado ? 'Reserva a pagar' : 'Reserva estimada'}</span><span>{money(p.anticipo)}</span></div>
                  <div><span>Saldo a la entrega</span><span>{money(p.total - p.anticipo)}</span></div>
                </>
              )}
            </div>
            {!p.mostrador && (
              <p className="recibo-nota">
                {p.tipo === 'apartado'
                  ? `Tus piezas quedan apartadas ${DIAS_APARTADO} días a partir de que confirmemos el pago de la reserva. Si no se recogen y pagan en ese plazo, el apartado se cancela.`
                  : 'Pediremos tu producto al proveedor en cuanto confirmemos el pago de la reserva.'}
              </p>
            )}
          </div>
        ))}
        <div className="recibo-totales"><div className="grande"><span>Total general</span><span>{money(r.total)}</span></div></div>
        {cliente.solicitud && <p className="recibo-nota"><strong>Tu solicitud de descuento / código:</strong> {cliente.solicitud}</p>}
        {cliente.entrega === 'envio' && <p className="recibo-nota"><strong>Envío local a:</strong> {cliente.direccion}. Lessa confirmará el costo.</p>}
        {r.pedidos.some((p) => !p.validado && !p.mostrador) ? (
          <p className="recibo-nota">
            Lessa revisará tu pedido (descuento, envío y fecha de entrega) y te confirmará por WhatsApp el valor final
            y cómo pagar la reserva. Por favor no hagas ninguna transferencia hasta recibir esa confirmación.
          </p>
        ) : !r.pedidos.every((p) => p.mostrador) && (
          <p className="recibo-nota">
            Para confirmar tu reserva, transfiere el monto de la reserva a la CLABE <strong>{CLABE}</strong> y envía tu
            comprobante por WhatsApp al {WA_TIENDA_VISIBLE} indicando tu número de recibo.
          </p>
        )}
      </div>

      {!todoMostrador && (
        <div className="aviso-enviar">
          <strong>Paso final:</strong> pulsa el botón verde para enviar tu pedido a Lessa por WhatsApp
          (<strong>{WA_TIENDA_VISIBLE}</strong>). Sin ese envío, Lessa no lo recibe.
        </div>
      )}
      <div className="recibo-acciones">
        {!todoMostrador ? (
          <a className="btn-wa btn-grande" target="_blank" rel="noreferrer"
            href={`https://wa.me/${WA_TIENDA}?text=${encodeURIComponent(textoLessa)}`}>
            Enviar mi pedido a Lessa por WhatsApp
          </a>
        ) : waCliente && (
          <a className="btn-wa" target="_blank" rel="noreferrer"
            href={`https://wa.me/${waCliente}?text=${encodeURIComponent(texto)}`}>
            Enviar recibo al cliente por WhatsApp
          </a>
        )}
        <button className="btn-secundario" onClick={() => window.print()}>Imprimir / guardar PDF</button>
        <Link className="btn-secundario" to="/catalogo" onClick={onNuevo}>Seguir comprando</Link>
      </div>
    </div>
  )
}

export default function Carrito({ items, onUpdateQuantity, onRemove, onClear, adminPass }) {
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [notas, setNotas] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [recibo, setRecibo] = useState(null)
  const [descuentoTipo, setDescuentoTipo] = useState('monto')
  const [descuentoValor, setDescuentoValor] = useState('')
  const [modo, setModo] = useState('apartado')
  const [mostrador, setMostrador] = useState(false)
  const [solicitud, setSolicitud] = useState('')
  const [entrega, setEntrega] = useState('recoger')
  const [direccion, setDireccion] = useState('')
  const [verCodigo, setVerCodigo] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [codigoOk, setCodigoOk] = useState(false)
  const [codigoMsg, setCodigoMsg] = useState('')

  const normales = items.filter((i) => !i.preorden)
  const pre = items.filter((i) => i.preorden)
  const subtotal = items.reduce((s, i) => s + i.precio * i.cantidad, 0)
  const subPre = pre.reduce((s, i) => s + i.precio * i.cantidad, 0)
  const valor = parseFloat(descuentoValor) || 0
  const claveAut = adminPass || (codigoOk ? codigo : '')
  const autorizado = !!claveAut
  const descuento = !autorizado ? 0
    : descuentoTipo === 'monto' ? Math.min(valor, subtotal) : subtotal * Math.min(valor, 100) / 100
  const total = Math.max(0, subtotal - descuento)
  const factor = subtotal ? total / subtotal : 1
  const totNorm = (subtotal - subPre) * factor
  const totPre = subPre * factor
  const frac = modo === 'total' ? 1 : PCT_ANTICIPO / 100
  const anticipoNorm = mostrador ? 0 : Math.round(totNorm * frac * 100) / 100
  const anticipoPre = Math.round(totPre * frac * 100) / 100

  const validarCodigo = async () => {
    setCodigoMsg('')
    const { data, error: err } = await sb.rpc('admin_check', { p_pass: codigo })
    if (err) return setCodigoMsg(mensajeError(err))
    setCodigoOk(!!data)
    setCodigoMsg(data ? 'Código válido: ya puedes aplicar el descuento autorizado.' : 'Código incorrecto')
  }

  const handleCheckout = async (e) => {
    e.preventDefault()
    setError('')
    setEnviando(true)
    const { data, error: err } = await sb.rpc('crear_pedido', {
      p_nombre: nombre.trim(),
      p_email: email.trim(),
      p_whatsapp: whatsapp.trim(),
      p_notas: notas,
      p_items: items.map((i) => ({ id: i.id, sku: i.sku, cantidad: i.cantidad, preorden: i.preorden })),
      p_modo: modo,
      p_desc_tipo: descuentoTipo,
      p_desc_valor: autorizado ? valor : 0,
      p_admin_pass: claveAut,
      p_venta_mostrador: autorizado && mostrador,
      p_solicitud: solicitud.trim(),
      p_entrega: entrega,
      p_direccion: entrega === 'envio' ? direccion.trim() : '',
    })
    setEnviando(false)
    if (err) {
      setError(err.message.includes('inventario') || err.message.includes('Sin ')
        ? err.message + '. Ajusta tu carrito e intenta de nuevo.'
        : 'No se pudo registrar el pedido: ' + mensajeError(err))
      return
    }
    setRecibo({ r: data, cliente: { nombre: nombre.trim(), email: email.trim(), whatsapp: whatsapp.trim(), solicitud: solicitud.trim(), entrega, direccion: direccion.trim(), notas: notas.trim() } })
    onClear()
  }

  if (recibo) return <Recibo r={recibo.r} cliente={recibo.cliente} onNuevo={() => setRecibo(null)} />

  if (items.length === 0) {
    return (
      <div className="carrito">
        <h1>Carrito vacío</h1>
        <p>No hay productos en tu carrito</p>
        <Link to="/catalogo" className="btn-primary">Ir al catálogo</Link>
      </div>
    )
  }

  const renderItem = (item) => (
    <div key={item.key} className="carrito-item">
      <div className="cart-foto">
        <img src={fotoUrl(item.sku)} alt={item.nombre} onError={(e) => { e.currentTarget.src = '/logo.png' }} />
        <BotonAmpliar sku={item.sku} nombre={item.nombre} chico />
      </div>
      <div className="item-info">
        <h3>{item.nombre}</h3>
        <p className="precio">{money(item.precio)}</p>
        {item.preorden && <p className="tag-encargo">Por encargo, llega en ~{DIAS_PREORDEN} días</p>}
      </div>
      <div className="item-quantity">
        <button type="button" onClick={() => onUpdateQuantity(item.key, item.cantidad - 1)}>−</button>
        <input type="number" value={item.cantidad}
          onChange={(e) => onUpdateQuantity(item.key, parseInt(e.target.value) || 1)} />
        <button type="button" disabled={!item.preorden && item.cantidad >= item.stock}
          onClick={() => onUpdateQuantity(item.key, item.cantidad + 1)}>+</button>
      </div>
      <div className="item-subtotal">{money(item.precio * item.cantidad)}</div>
      <button type="button" className="btn-remove" onClick={() => onRemove(item.key)}>✕</button>
    </div>
  )

  return (
    <div className="carrito">
      <h1>Tu carrito</h1>
      <div className="carrito-content">
        <div>
          {normales.length > 0 && (
            <div className="carrito-items">
              <h3 className="grupo-titulo">Disponibles, entrega inmediata</h3>
              {normales.map(renderItem)}
            </div>
          )}
          {pre.length > 0 && (
            <div className="carrito-items" style={{ marginTop: '1rem' }}>
              <h3 className="grupo-titulo">Por encargo, llegan en ~{DIAS_PREORDEN} días</h3>
              {pre.map(renderItem)}
            </div>
          )}
        </div>

        <div className="carrito-checkout">
          <div className="resumen">
            <h2>Resumen</h2>
            <div className="subtotal"><span>Subtotal:</span><span>{money(subtotal)}</span></div>

            <div className="descuento-box">
              <label>Descuento o código promocional</label>
              {!autorizado ? (
                <>
                  <textarea rows="2" value={solicitud} onChange={(e) => setSolicitud(e.target.value)}
                    placeholder="Escribe tu código promocional o solicita un descuento. Lessa lo revisa y te confirma el valor final." />
                  {!verCodigo ? (
                    <button type="button" className="link-btn" onClick={() => setVerCodigo(true)}>Tengo un código de autorización de Lessa</button>
                  ) : (
                    <div className="descuento-fila" style={{ marginTop: '0.5rem' }}>
                      <input type="password" value={codigo} placeholder="Código de autorización"
                        onChange={(e) => { setCodigo(e.target.value); setCodigoOk(false) }} />
                      <button type="button" className="btn-validar" onClick={validarCodigo}>Validar</button>
                    </div>
                  )}
                  {codigoMsg && <p className={codigoOk ? 'ok-msg' : 'error-msg'}>{codigoMsg}</p>}
                </>
              ) : (
                <>
                  <p className="ok-msg" style={{ marginTop: 0 }}>Descuento autorizado</p>
                  <div className="descuento-fila">
                    <div className="segmento">
                      <button type="button" className={descuentoTipo === 'monto' ? 'on' : ''} onClick={() => setDescuentoTipo('monto')}>$</button>
                      <button type="button" className={descuentoTipo === 'porcentaje' ? 'on' : ''} onClick={() => setDescuentoTipo('porcentaje')}>%</button>
                    </div>
                    <input type="number" min="0" step="0.01" value={descuentoValor} placeholder="0"
                      onChange={(e) => setDescuentoValor(e.target.value)} />
                  </div>
                  {normales.length > 0 && (
                    <label className="check-mostrador">
                      <input type="checkbox" checked={mostrador} onChange={(e) => setMostrador(e.target.checked)} />
                      Venta en mostrador: cobrada y entregada ahora
                    </label>
                  )}
                </>
              )}
            </div>

            {descuento > 0 && (
              <div className="subtotal" style={{ color: '#2e7d4f' }}><span>Descuento:</span><span>-{money(descuento)}</span></div>
            )}
            {entrega === 'envio' && <div className="subtotal"><span>Envío local:</span><span>lo confirma Lessa</span></div>}
            <div className="total"><span>{autorizado ? 'Total:' : 'Total estimado:'}</span><span>{money(total)}</span></div>
            {!autorizado && <p className="legal" style={{ textAlign: 'left', marginTop: '0.4rem' }}>Lessa valida tu pedido y confirma el valor final y la fecha de entrega.</p>}
            {!mostrador && (
              <div className="modo-pago">
                <label><input type="radio" checked={modo === 'apartado'} onChange={() => setModo('apartado')} />
                  Reservar con {PCT_ANTICIPO}% ahora</label>
                <label><input type="radio" checked={modo === 'total'} onChange={() => setModo('total')} />
                  Pagar el total</label>
              </div>
            )}
            {!mostrador && normales.length > 0 && (
              <div className="aviso-anticipo">
                <strong>Apartado:</strong> reserva de {money(anticipoNorm)}. Al confirmar el pago, tus piezas se guardan {DIAS_APARTADO} días.
                Si no se recogen y pagan en ese plazo, se cancela y regresan al inventario.
              </div>
            )}
            {pre.length > 0 && (
              <div className="aviso-anticipo">
                <strong>Encargo:</strong> reserva de {money(anticipoPre)}. Llega en ~{DIAS_PREORDEN} días desde que lo pedimos al proveedor.
              </div>
            )}
          </div>

          <form onSubmit={handleCheckout}>
            <div className="form-group">
              <label>Nombre *</label>
              <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Email *</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>WhatsApp * (10 dígitos)</label>
              <input type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Entrega</label>
              <div className="modo-pago" style={{ marginTop: 0 }}>
                <label><input type="radio" checked={entrega === 'recoger'} onChange={() => setEntrega('recoger')} /> Recoger</label>
                <label><input type="radio" checked={entrega === 'envio'} onChange={() => setEntrega('envio')} /> Envío local (el costo lo confirma Lessa)</label>
              </div>
              {entrega === 'envio' && (
                <textarea rows="2" required value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Dirección de entrega" style={{ marginTop: '0.5rem' }} />
              )}
            </div>
            <div className="form-group">
              <label>Notas adicionales</label>
              <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows="3" />
            </div>
            {error && <p className="error-msg">{error}</p>}
            <button type="submit" className="btn-submit" disabled={enviando}>
              {enviando ? 'Procesando...' : autorizado && mostrador ? 'Registrar venta' : 'Enviar pedido a Lessa'}
            </button>
            <p className="legal">Contacto: <a href={`mailto:${EMAIL_TIENDA}`}>{EMAIL_TIENDA}</a></p>
          </form>
        </div>
      </div>
    </div>
  )
}
