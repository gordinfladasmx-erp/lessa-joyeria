import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { sb } from '../lib/supabase'
import Foto from '../components/Foto'
import Estrella from '../components/Estrella'
import { money } from '../lib/store'
import '../styles/Landing.css'

function Destacados({ onAddToCart, adminPass }) {
  const [prods, setProds] = useState([])
  const [cargado, setCargado] = useState(false)
  const [aviso, setAviso] = useState({})

  useEffect(() => {
    sb.from('productos').select('*').eq('activo', true).eq('destacado', true)
      .order('stock', { ascending: false }).order('sku').limit(300)
      .then(({ data }) => { setProds(data || []); setCargado(true) })
  }, [])

  const agregar = (p) => {
    const msg = onAddToCart(p, false)
    setAviso((a) => ({ ...a, [p.id]: msg || '✓ Agregado' }))
    setTimeout(() => setAviso((a) => ({ ...a, [p.id]: '' })), 1800)
  }

  if (!cargado || (prods.length === 0 && !adminPass)) return null
  return (
    <section className="destacados">
      <div className="destacados-cab">
        <h2><span className="estrella-titulo">★</span> Productos destacados</h2>
        <Link to="/catalogo" className="ver-todo">Ver todo el catálogo</Link>
      </div>
      {adminPass && <p className="admin-nota-landing">Modo edición: pulsa la estrella de una tarjeta para quitarla de destacados. Para agregar más, marca la estrella en el catálogo.</p>}
      {prods.length === 0 ? <p>Aún no hay productos destacados.</p> : (
        <div className="grid-destacados">
          {prods.map((p) => {
            const agotado = !(p.stock > 0)
            return (
              <div key={p.id} className={`dest-card ${agotado ? 'agotado' : ''}`}>
                <div className="dest-foto">
                  <Foto sku={p.sku} nombre={p.nombre} />
                  {adminPass
                    ? <Estrella producto={p} pass={adminPass} onCambio={(id, v) => !v && setProds((ps) => ps.filter((x) => x.id !== id))} />
                    : <span className="badge-dest" title="Destacado">★</span>}
                  {agotado && <span className="badge-agotado">Agotado</span>}
                </div>
                <h3>{p.nombre}</h3>
                <p className="dest-precio">{money(p.precio)}</p>
                {agotado ? (
                  <Link to="/catalogo" className="btn-dest ver">Ver en catálogo</Link>
                ) : (
                  <button className="btn-dest" onClick={() => agregar(p)}>{aviso[p.id] || 'Agregar'}</button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default function Landing({ onAddToCart, adminPass }) {
  return (
    <div className="landing">
      <div className="hero">
        <div className="hero-content">
          <h1 className="marca" aria-label="Lessa Joyería">
            <img src="/lessa-wordmark.png" alt="" className="marca-lessa" />
            <span className="marca-joyeria">joyería</span>
          </h1>
          <p>Joyería de calidad para momentos especiales</p>
          <Link to="/catalogo" className="btn-primary">
            Ver catálogo
          </Link>
        </div>
      </div>

      <Destacados onAddToCart={onAddToCart} adminPass={adminPass} />

      <div className="features">
        <div className="feature">
          <div className="icon">✦</div>
          <h3>Diseños exclusivos</h3>
          <p>Colecciones únicas en acero y plata</p>
        </div>
        <div className="feature">
          <div className="icon">💎</div>
          <h3>Calidad garantizada</h3>
          <p>Materiales premium certificados</p>
        </div>
        <div className="feature">
          <div className="icon">🚚</div>
          <h3>Envío rápido</h3>
          <p>Entrega en 24-48 horas</p>
        </div>
      </div>

      <div className="contact-section" style={{marginBottom: '3rem'}}>
        <h2>¿Preguntas?</h2>
        <p>Contactanos por WhatsApp o email</p>
        <div className="contact-buttons">
          <a href="https://wa.me/524493876360" className="btn-whatsapp">
            💬 WhatsApp
          </a>
          <a href="mailto:alessandra.reyes04@gmail.com" className="btn-email">
            ✉ Email
          </a>
        </div>
      </div>

      <div style={{textAlign: 'center', padding: '2rem', borderTop: '1px solid #ddd'}}>
        <Link to="/admin" style={{color: '#999', textDecoration: 'none', fontSize: '0.9rem'}}>Administración</Link>
      </div>
    </div>
  )
}
