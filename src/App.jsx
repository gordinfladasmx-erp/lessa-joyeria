import { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Landing from './pages/Landing'
import Catalogo from './pages/Catalogo'
import DestacadosPage from './pages/DestacadosPage'
import Carrito from './pages/Carrito'
const Admin = lazy(() => import('./pages/Admin'))
import { sb } from './lib/supabase'
import { IconoWhatsApp, IconoCorreo, IconoInstagram } from './components/Iconos'
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
    const ids = cart.map((i) => i.id)
    if (!ids.length) return
    sb.from('productos').select('id,stock').in('id', ids).then(({ data, error }) => {
      if (error || !data) return
      const st = Object.fromEntries(data.map((d) => [d.id, d.stock]))
      setCart((c) => c
        .filter((i) => st[i.id] !== undefined)
        .map((i) => (i.preorden ? i : { ...i, stock: st[i.id], cantidad: Math.min(i.cantidad, st[i.id]) }))
        .filter((i) => i.cantidad > 0))
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
            <Link to="/destacados" className="nav-dest">★ Destacados</Link>
            <Link to="/carrito" className="cart-link" aria-label={`Carrito, ${cartCount} producto(s)`} title="Carrito">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2.5 3.5h2.6l2.3 11.3a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L20.5 7.5H6" />
                <circle cx="10" cy="20" r="1.4" />
                <circle cx="17" cy="20" r="1.4" />
              </svg>
              <span className="cart-count">{cartCount}</span>
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
          <Route path="/" element={<Landing cart={cart} onAddToCart={addToCart} onRemove={removeFromCart} adminPass={adminPass} />} />
          <Route path="/destacados" element={<DestacadosPage cart={cart} onAddToCart={addToCart} onRemove={removeFromCart} adminPass={adminPass} />} />
          <Route path="/catalogo" element={<Catalogo cart={cart} onAddToCart={addToCart} onRemove={removeFromCart} adminPass={adminPass} />} />
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
          <Route path="/admin" element={<Suspense fallback={<p style={{ padding: '2rem' }}>Cargando...</p>}><Admin adminPass={adminPass} onLogin={() => setLoginAbierto(true)} /></Suspense>} />
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
          <p className="footer-contactanos">Contáctanos</p>
          <div className="footer-marca">
            <span>Lessa Joyería</span>
            <span className="sep-v" aria-hidden="true"></span>
            <a href="https://www.instagram.com/lessa_joyeria" target="_blank" rel="noreferrer" aria-label="Instagram de Lessa">
              <IconoInstagram size={22} />
              @lessa_joyeria
            </a>
            <span className="sep-v" aria-hidden="true"></span>
            <span className="footer-iconos">
              <a className="ic-wa" href={`https://wa.me/${WA_TIENDA}`} target="_blank" rel="noreferrer" aria-label="WhatsApp" title="WhatsApp"><IconoWhatsApp size={20} /></a>
              <a className="ic-mail" href={`mailto:${EMAIL_TIENDA}`} aria-label="Correo" title="Correo"><IconoCorreo size={20} /></a>
            </span>
          </div>
          <div className="footer-legal">
            <span>® 2026 Lessa Joyería. Todos los derechos reservados.</span>
            <span>Powered by Aria by BP&amp;S - Anthropic IA</span>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  )
}
