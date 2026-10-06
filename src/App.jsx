import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Landing from './pages/Landing'
import Catalogo from './pages/Catalogo'
import Carrito from './pages/Carrito'
import Admin from './pages/Admin'
import { WA_TIENDA, EMAIL_TIENDA } from './lib/store'
import './App.css'

const leerCarrito = () => {
  try {
    const items = JSON.parse(localStorage.getItem('lessa_cart') || '[]')
    return items.map((i) => ({ ...i, key: i.key || String(i.id), preorden: !!i.preorden }))
  } catch {
    return []
  }
}

export default function App() {
  const [cart, setCart] = useState(leerCarrito)

  useEffect(() => {
    try { localStorage.setItem('lessa_cart', JSON.stringify(cart)) } catch { /* sin storage */ }
  }, [cart])

  const cartCount = cart.reduce((s, i) => s + i.cantidad, 0)

  // Devuelve null si se agregó, o un mensaje si no se puede.
  const addToCart = (producto, preorden = false) => {
    const key = preorden ? `${producto.id}-pre` : String(producto.id)
    const existing = cart.find((i) => i.key === key)
    if (!preorden) {
      const enCarrito = existing ? existing.cantidad : 0
      if ((producto.stock || 0) <= 0) return 'Producto agotado'
      if (enCarrito >= producto.stock) return `Solo hay ${producto.stock} disponible(s) y ya los tienes en el carrito`
    }
    const item = {
      key, id: producto.id, sku: producto.sku, nombre: producto.nombre,
      precio: producto.precio, stock: producto.stock || 0, preorden,
    }
    setCart(existing
      ? cart.map((i) => (i.key === key ? { ...i, cantidad: i.cantidad + 1 } : i))
      : [...cart, { ...item, cantidad: 1 }])
    return null
  }

  const removeFromCart = (key) => setCart(cart.filter((i) => i.key !== key))

  const updateQuantity = (key, cantidad) => {
    const item = cart.find((i) => i.key === key)
    if (!item) return
    if (cantidad <= 0) return removeFromCart(key)
    const max = item.preorden ? 99 : item.stock
    setCart(cart.map((i) => (i.key === key ? { ...i, cantidad: Math.min(cantidad, max) } : i)))
  }

  const clearCart = () => setCart([])

  return (
    <BrowserRouter>
      <div className="app">
        <nav className="navbar">
          <Link to="/" className="logo">
            <img src="/logo.png" alt="Lessa Joyería" />
          </Link>
          <div className="nav-links">
            <Link to="/">Inicio</Link>
            <Link to="/catalogo">Catálogo</Link>
            <Link to="/carrito" className="cart-link">
              Carrito ({cartCount})
            </Link>
            <Link to="/admin" className="admin-link">
              Ingresar
            </Link>
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/catalogo" element={<Catalogo cart={cart} onAddToCart={addToCart} />} />
          <Route
            path="/carrito"
            element={
              <Carrito
                items={cart}
                onUpdateQuantity={updateQuantity}
                onRemove={removeFromCart}
                onClear={clearCart}
              />
            }
          />
          <Route path="/admin" element={<Admin />} />
        </Routes>

        <footer className="footer">
          <p>
            Lessa Joyería | Contacto:{' '}
            <a href={`mailto:${EMAIL_TIENDA}`}>{EMAIL_TIENDA}</a> | WhatsApp:{' '}
            <a href={`https://wa.me/${WA_TIENDA}`}>+52 449 387 6360</a>
          </p>
        </footer>
      </div>
    </BrowserRouter>
  )
}
