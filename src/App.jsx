import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Landing from './pages/Landing'
import Catalogo from './pages/Catalogo'
import Carrito from './pages/Carrito'
import Admin from './pages/Admin'
import './App.css'

export default function App() {
  const [cartCount, setCartCount] = useState(0)
  const [cart, setCart] = useState([])

  useEffect(() => {
    const saved = localStorage.getItem('lessa_cart')
    if (saved) {
      const items = JSON.parse(saved)
      setCart(items)
      setCartCount(items.reduce((sum, item) => sum + item.cantidad, 0))
    }
  }, [])

  const addToCart = (producto) => {
    const existing = cart.find(item => item.id === producto.id)
    let newCart
    if (existing) {
      newCart = cart.map(item =>
        item.id === producto.id
          ? { ...item, cantidad: item.cantidad + 1 }
          : item
      )
    } else {
      newCart = [...cart, { ...producto, cantidad: 1 }]
    }
    setCart(newCart)
    setCartCount(newCart.reduce((sum, item) => sum + item.cantidad, 0))
    localStorage.setItem('lessa_cart', JSON.stringify(newCart))
  }

  const removeFromCart = (id) => {
    const newCart = cart.filter(item => item.id !== id)
    setCart(newCart)
    setCartCount(newCart.reduce((sum, item) => sum + item.cantidad, 0))
    localStorage.setItem('lessa_cart', JSON.stringify(newCart))
  }

  const updateQuantity = (id, cantidad) => {
    if (cantidad <= 0) {
      removeFromCart(id)
      return
    }
    const newCart = cart.map(item =>
      item.id === id ? { ...item, cantidad } : item
    )
    setCart(newCart)
    setCartCount(newCart.reduce((sum, item) => sum + item.cantidad, 0))
    localStorage.setItem('lessa_cart', JSON.stringify(newCart))
  }

  return (
    <BrowserRouter>
      <div className="app">
        <nav className="navbar">
          <Link to="/" className="logo">
            <img src="/logo.png" alt="Lessa" style={{height: '40px', marginRight: '10px'}} />
            Lessa Joyería
          </Link>
          <div className="nav-links">
            <Link to="/">Inicio</Link>
            <Link to="/catalogo">Catálogo</Link>
            <Link to="/carrito" className="cart-link">
              🛒 Carrito ({cartCount})
            </Link>
            <Link to="/admin" style={{fontSize: '0.9rem', color: '#999'}}>
              ⚙️ Admin
            </Link>
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<Landing />} />
          <Route
            path="/catalogo"
            element={<Catalogo onAddToCart={addToCart} />}
          />
          <Route
            path="/carrito"
            element={
              <Carrito
                items={cart}
                onUpdateQuantity={updateQuantity}
                onRemove={removeFromCart}
              />
            }
          />
          <Route path="/admin" element={<Admin />} />
        </Routes>

        <footer className="footer">
          <p>
            Lessa Joyería © 2025 | Contacto:{' '}
            <a href="mailto:alessandra.reyes04@gmail.com">
              alessandra.reyes04@gmail.com
            </a>{' '}
            | WhatsApp:{' '}
            <a href="https://wa.me/524493876360">+52 449 387 6360</a>
          </p>
        </footer>
      </div>
    </BrowserRouter>
  )
}
