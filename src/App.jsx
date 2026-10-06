import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Landing from './pages/Landing'
import Catalogo from './pages/Catalogo'
import Carrito from './pages/Carrito'
import Admin from './pages/Admin'
import { sb } from './lib/supabase'
import { WA_TIENDA, EMAIL_TIENDA, getAdminPass, setAdminPass, mensajeError } from './lib/store'
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
  const [adminPass, setPass] = useState(getAdminPass)
  const [loginAbierto, setLoginAbierto] = useState(false)
  const [loginInput, setLoginInput] = useState('')
  const [loginError, setLoginError] = useState('')

  const login = async (e) => {
    e.preventDefault()
    const { data, error } = await sb.rpc('admin_check', { p_pass: loginInput })
    if (error) return setLoginError(mensajeError(error))
    if (!data) return setLoginError('Contraseña incorrecta')
    setAdminPass(loginInput)
    setPass(loginInput)
    setLoginAbierto(false)
    setLoginInput('')
    setLoginError('')
  }

  const logout = () => {
    setAdminPass('')
    setPass('')
  }

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
        {adminPass && <div className="barra-edicion">Modo edición activo: ajusta el inventario con + y − en el catálogo. Pulsa Salir al terminar.</div>}
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
            {adminPass ? (
              <>
                <Link to="/admin" className="admin-link">Panel</Link>
                <button className="admin-link salir" onClick={logout}>Salir</button>
              </>
            ) : (
              <button className="admin-link" onClick={() => setLoginAbierto(true)}>Ingresar</button>
            )}
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/catalogo" element={<Catalogo cart={cart} onAddToCart={addToCart} adminPass={adminPass} />} />
          <Route
            path="/carrito"
            element={
              <Carrito
                items={cart}
                onUpdateQuantity={updateQuantity}
                onRemove={removeFromCart}
                onClear={clearCart}
                adminPass={adminPass}
              />
            }
          />
          <Route path="/admin" element={<Admin adminPass={adminPass} onLogin={() => setLoginAbierto(true)} />} />
        </Routes>

        {loginAbierto && (
          <div className="modal-fondo" onClick={() => setLoginAbierto(false)}>
            <form className="modal login-modal" onClick={(e) => e.stopPropagation()} onSubmit={login}>
              <img src="/logo.png" alt="Lessa" />
              <h2>Acceso del personal</h2>
              <input type="password" placeholder="Contraseña" value={loginInput} autoFocus
                onChange={(e) => setLoginInput(e.target.value)} />
              {loginError && <p className="error-msg">{loginError}</p>}
              <div className="modal-botones">
                <button type="submit" className="btn-primary">Entrar</button>
                <button type="button" className="btn-secundario" onClick={() => setLoginAbierto(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        )}

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
