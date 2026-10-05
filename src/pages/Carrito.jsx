import { useState } from 'react'
import { sb } from '../lib/supabase'
import '../styles/Carrito.css'

export default function Carrito({ items, onUpdateQuantity, onRemove }) {
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [notas, setNotas] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [exito, setExito] = useState(false)
  const [descuentoMonto, setDescuentoMonto] = useState(0)
  const [descuentoPorcentaje, setDescuentoPorcentaje] = useState(0)

  const subtotal = items.reduce((sum, item) => sum + item.precio * item.cantidad, 0)
  const descuentoCalculado = descuentoMonto || (subtotal * descuentoPorcentaje / 100)
  const total = Math.max(0, subtotal - descuentoCalculado)

  const handleCheckout = async (e) => {
    e.preventDefault()
    if (!nombre || !email) {
      alert('Por favor completa nombre y email')
      return
    }

    setEnviando(true)
    try {
      const pedido = {
        numero_pedido: `LESSA-${Date.now()}`,
        nombre_cliente: nombre,
        email_cliente: email,
        whatsapp: whatsapp,
        items: items,
        subtotal: subtotal,
        descuento: descuentoCalculado,
        total: total,
        estado: 'pendiente',
        notas: notas,
      }

      const { error } = await sb.from('pedidos').insert([pedido])
      if (error) throw error

      setExito(true)
      setTimeout(() => {
        setExito(false)
        setNombre('')
        setEmail('')
        setWhatsapp('')
        setNotas('')
        localStorage.removeItem('lessa_cart')
        window.location.href = '/'
      }, 2000)
    } catch (e) {
      console.error('Error:', e)
      alert('Error al procesar pedido: ' + e.message)
    } finally {
      setEnviando(false)
    }
  }

  if (items.length === 0 && !exito) {
    return (
      <div className="carrito">
        <h1>Carrito vacío</h1>
        <p>No hay productos en tu carrito</p>
        <a href="/catalogo" className="btn-primary">
          Volver al catálogo
        </a>
      </div>
    )
  }

  if (exito) {
    return (
      <div className="carrito success">
        <div className="success-message">
          <div className="icon">✓</div>
          <h2>¡Pedido recibido!</h2>
          <p>Te contactaremos pronto por WhatsApp o email</p>
        </div>
      </div>
    )
  }

  return (
    <div className="carrito">
      <h1>Tu carrito</h1>

      <div className="carrito-content">
        <div className="carrito-items">
          {items.map((item) => (
            <div key={item.id} className="carrito-item">
              {item.foto_url && (
                <img src={item.foto_url} alt={item.nombre} />
              )}
              <div className="item-info">
                <h3>{item.nombre}</h3>
                <p className="precio">${item.precio.toFixed(2)}</p>
              </div>
              <div className="item-quantity">
                <button onClick={() => onUpdateQuantity(item.id, item.cantidad - 1)}>
                  −
                </button>
                <input
                  type="number"
                  value={item.cantidad}
                  onChange={(e) =>
                    onUpdateQuantity(item.id, parseInt(e.target.value) || 1)
                  }
                />
                <button onClick={() => onUpdateQuantity(item.id, item.cantidad + 1)}>
                  +
                </button>
              </div>
              <div className="item-subtotal">
                ${(item.precio * item.cantidad).toFixed(2)}
              </div>
              <button
                className="btn-remove"
                onClick={() => onRemove(item.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="carrito-checkout">
          <div className="resumen">
            <h2>Resumen</h2>
            <div className="subtotal">
              <span>Subtotal:</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            {descuentoCalculado > 0 && (
              <div className="subtotal" style={{color: '#28a745'}}>
                <span>Descuento:</span>
                <span>-${descuentoCalculado.toFixed(2)}</span>
              </div>
            )}
            <div className="total">
              <span>Total:</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>

          <form onSubmit={handleCheckout}>
            <div className="form-group">
              <label>Nombre *</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Email *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>WhatsApp</label>
              <input
                type="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Descuento en monto ($)</label>
              <input
                type="number"
                value={descuentoMonto}
                onChange={(e) => {
                  setDescuentoMonto(parseFloat(e.target.value) || 0)
                  setDescuentoPorcentaje(0)
                }}
                step="0.01"
                min="0"
              />
            </div>

            <div className="form-group">
              <label>O descuento en porcentaje (%)</label>
              <input
                type="number"
                value={descuentoPorcentaje}
                onChange={(e) => {
                  setDescuentoPorcentaje(parseFloat(e.target.value) || 0)
                  setDescuentoMonto(0)
                }}
                step="0.01"
                min="0"
                max="100"
              />
            </div>

            <div className="form-group">
              <label>Notas adicionales</label>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows="3"
              />
            </div>

            <button
              type="submit"
              className="btn-submit"
              disabled={enviando || items.length === 0}
            >
              {enviando ? 'Procesando...' : 'Confirmar pedido'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
