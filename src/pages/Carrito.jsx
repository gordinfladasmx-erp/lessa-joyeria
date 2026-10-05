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
  const [descuentoTipo, setDescuentoTipo] = useState('monto')
  const [descuentoValor, setDescuentoValor] = useState(0)

  const subtotal = items.reduce((sum, item) => sum + item.precio * item.cantidad, 0)
  const descuentoCalculado = descuentoTipo === 'monto'
    ? parseFloat(descuentoValor) || 0
    : (subtotal * (parseFloat(descuentoValor) || 0) / 100)
  const total = Math.max(0, subtotal - descuentoCalculado)

  const handleCheckout = async (e) => {
    e.preventDefault()
    if (!nombre || !email) {
      alert('Por favor completa nombre y email')
      return
    }

    setEnviando(true)
    try {
      const itemsConDescuento = items.map(item => ({
        ...item,
        descuento_aplicado: descuentoTipo,
        valor_descuento: descuentoValor
      }))

      const pedido = {
        numero_pedido: `LESSA-${Date.now()}`,
        nombre_cliente: nombre,
        email_cliente: email,
        whatsapp: whatsapp,
        items: itemsConDescuento,
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
    const itemsText = items.map(i => `${i.nombre} x${i.cantidad} - $${i.precio.toFixed(2)}`).join('\n')
    const descuentoText = descuentoCalculado > 0
      ? `\nDescuento (${descuentoTipo === 'monto' ? '$' : '%'}${descuentoValor}): -$${descuentoCalculado.toFixed(2)}`
      : ''
    const whatsappMsg = `Hola! Me gustaría confirmar mi pedido:\n\n${itemsText}${descuentoText}\n\nTotal: $${total.toFixed(2)}`
    const emailMsg = `Pedido de ${nombre}:\n\n${itemsText}${descuentoText}\n\nTotal: $${total.toFixed(2)}`

    return (
      <div className="carrito success">
        <div className="success-message">
          <div className="icon">✓</div>
          <h2>¡Pedido recibido!</h2>
          <p>Te contactaremos pronto</p>
          <div style={{marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center'}}>
            <a
              href={`https://wa.me/524493876360?text=${encodeURIComponent(whatsappMsg)}`}
              target="_blank"
              rel="noreferrer"
              style={{padding: '0.75rem 1.5rem', background: '#25D366', color: 'white', borderRadius: '4px', textDecoration: 'none'}}
            >
              Enviar por WhatsApp
            </a>
            <a
              href={`mailto:alessandra.reyes04@gmail.com?subject=Pedido Lessa&body=${encodeURIComponent(emailMsg)}`}
              style={{padding: '0.75rem 1.5rem', background: '#007BFF', color: 'white', borderRadius: '4px', textDecoration: 'none'}}
            >
              Enviar por Email
            </a>
          </div>
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

            <div style={{padding: '1rem', background: '#f9f9f9', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #e8c4d6'}}>
              <label style={{display: 'block', fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem', fontWeight: '600'}}>Aplicar descuento</label>
              <div style={{display: 'flex', gap: '0.5rem'}}>
                <select
                  value={descuentoTipo}
                  onChange={(e) => setDescuentoTipo(e.target.value)}
                  style={{padding: '0.5rem 0.75rem', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.9rem'}}
                >
                  <option value="monto">Monto ($)</option>
                  <option value="porcentaje">Porcentaje (%)</option>
                </select>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={descuentoValor}
                  onChange={(e) => setDescuentoValor(e.target.value)}
                  placeholder="0"
                  style={{padding: '0.5rem 0.75rem', border: '1px solid #ddd', borderRadius: '4px', flex: 1, fontSize: '0.9rem'}}
                />
              </div>
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
