import { useState } from 'react'
import { Link } from 'react-router-dom'
import { sb } from '../lib/supabase'
import {
  money, fotoUrl, waNumber, getAdminPass, reciboTexto, fechaCorta,
  WA_TIENDA, EMAIL_TIENDA, DIAS_PREORDEN,
} from '../lib/store'
import '../styles/Carrito.css'

function Recibo({ r, cliente, onNuevo }) {
  const texto = reciboTexto(r, cliente)
  const waCliente = waNumber(cliente.whatsapp)
  const normales = r.items.filter((i) => !i.preorden)
  const pre = r.items.filter((i) => i.preorden)
  const fila = (i) => (
    <tr key={i.id + String(i.preorden)}>
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
            <h2>Recibo {r.numero_pedido}</h2>
            <p>{fechaCorta(new Date().toISOString().slice(0, 10))}</p>
          </div>
        </div>
        <p><strong>Cliente:</strong> {cliente.nombre} | {cliente.email}{cliente.whatsapp ? ` | ${cliente.whatsapp}` : ''}</p>

        {normales.length > 0 && (
          <>
            <h3>Disponibles (entrega inmediata)</h3>
            <table><thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Importe</th></tr></thead><tbody>{normales.map(fila)}</tbody></table>
          </>
        )}
        {pre.length > 0 && (
          <>
            <h3>Por encargo (llega en ~{DIAS_PREORDEN} días, aprox. {fechaCorta(r.entrega_estimada)})</h3>
            <table><thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Importe</th></tr></thead><tbody>{pre.map(fila)}</tbody></table>
          </>
        )}

        <div className="recibo-totales">
          <div><span>Subtotal</span><span>{money(r.subtotal)}</span></div>
          {r.descuento > 0 && <div><span>Descuento</span><span>-{money(r.descuento)}</span></div>}
          <div className="grande"><span>Total</span><span>{money(r.total)}</span></div>
          {r.tiene_preorden && (
            <>
              <div><span>Anticipo para apartar el encargo</span><span>{money(r.anticipo)}</span></div>
              <div><span>Saldo a la entrega</span><span>{money(r.total - r.anticipo)}</span></div>
            </>
          )}
        </div>
        {r.tiene_preorden && (
          <p className="recibo-nota">
            Tu encargo queda apartado al recibir el anticipo. Nos pondremos en contacto contigo por WhatsApp
            para indicarte cómo pagarlo.
          </p>
        )}
      </div>

      <div className="recibo-acciones">
        {waCliente && (
          <a className="btn-wa" target="_blank" rel="noreferrer"
            href={`https://wa.me/${waCliente}?text=${encodeURIComponent(texto)}`}>
            Enviar recibo por WhatsApp
          </a>
        )}
        <a className="btn-mail"
          href={`mailto:${cliente.email}?subject=${encodeURIComponent('Recibo Lessa ' + r.numero_pedido)}&body=${encodeURIComponent(texto.replace(/\*/g, ''))}`}>
          Enviar recibo por correo
        </a>
        <button className="btn-secundario" onClick={() => window.print()}>Imprimir / guardar PDF</button>
        <a className="btn-secundario" target="_blank" rel="noreferrer"
          href={`https://wa.me/${WA_TIENDA}?text=${encodeURIComponent(texto)}`}>
          Avisar a Lessa por WhatsApp
        </a>
        <Link className="btn-secundario" to="/catalogo" onClick={onNuevo}>Seguir comprando</Link>
      </div>
    </div>
  )
}

export default function Carrito({ items, onUpdateQuantity, onRemove, onClear }) {
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [notas, setNotas] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [recibo, setRecibo] = useState(null)
  const [descuentoTipo, setDescuentoTipo] = useState('monto')
  const [descuentoValor, setDescuentoValor] = useState('')

  const adminPass = getAdminPass()
  const normales = items.filter((i) => !i.preorden)
  const pre = items.filter((i) => i.preorden)
  const subtotal = items.reduce((s, i) => s + i.precio * i.cantidad, 0)
  const subPre = pre.reduce((s, i) => s + i.precio * i.cantidad, 0)
  const valor = parseFloat(descuentoValor) || 0
  const descuento = !adminPass ? 0
    : descuentoTipo === 'monto' ? Math.min(valor, subtotal) : subtotal * Math.min(valor, 100) / 100
  const total = Math.max(0, subtotal - descuento)
  const anticipo = pre.length && subtotal ? Math.round(subPre * (total / subtotal) * 50) / 100 : 0

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
      p_desc_tipo: descuentoTipo,
      p_desc_valor: adminPass ? valor : 0,
      p_admin_pass: adminPass,
    })
    setEnviando(false)
    if (err) {
      setError(err.message.includes('inventario') || err.message.includes('Sin ')
        ? err.message + '. Ajusta tu carrito e intenta de nuevo.'
        : 'No se pudo registrar el pedido: ' + err.message)
      return
    }
    setRecibo({ r: data, cliente: { nombre: nombre.trim(), email: email.trim(), whatsapp: whatsapp.trim() } })
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
      <img src={fotoUrl(item.sku)} alt={item.nombre} onError={(e) => { e.currentTarget.src = '/logo.png' }} />
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

            {adminPass && (
              <div className="descuento-box">
                <label>Descuento (modo vendedor)</label>
                <div className="descuento-fila">
                  <div className="segmento">
                    <button type="button" className={descuentoTipo === 'monto' ? 'on' : ''} onClick={() => setDescuentoTipo('monto')}>$</button>
                    <button type="button" className={descuentoTipo === 'porcentaje' ? 'on' : ''} onClick={() => setDescuentoTipo('porcentaje')}>%</button>
                  </div>
                  <input type="number" min="0" step="0.01" value={descuentoValor} placeholder="0"
                    onChange={(e) => setDescuentoValor(e.target.value)} />
                </div>
              </div>
            )}

            {descuento > 0 && (
              <div className="subtotal" style={{ color: '#2e7d4f' }}><span>Descuento:</span><span>-{money(descuento)}</span></div>
            )}
            <div className="total"><span>Total:</span><span>{money(total)}</span></div>
            {pre.length > 0 && (
              <div className="aviso-anticipo">
                Incluye productos por encargo. Anticipo para apartarlos: <strong>{money(anticipo)}</strong>.
                Saldo a la entrega: {money(total - anticipo)}.
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
              <label>Notas adicionales</label>
              <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows="3" />
            </div>
            {error && <p className="error-msg">{error}</p>}
            <button type="submit" className="btn-submit" disabled={enviando}>
              {enviando ? 'Procesando...' : pre.length ? 'Confirmar y generar recibo de anticipo' : 'Confirmar pedido'}
            </button>
            <p className="legal">Contacto: <a href={`mailto:${EMAIL_TIENDA}`}>{EMAIL_TIENDA}</a></p>
          </form>
        </div>
      </div>
    </div>
  )
}
