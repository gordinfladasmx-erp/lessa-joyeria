import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { sb } from '../lib/supabase'
import TarjetasDestacadas from '../components/TarjetasDestacadas'
import '../styles/Landing.css'

const EN_INICIO = 20

function Destacados({ cart, onAddToCart, onRemove, adminPass }) {
  const [prods, setProds] = useState([])
  const [total, setTotal] = useState(0)
  const [cargado, setCargado] = useState(false)

  useEffect(() => {
    sb.from('productos').select('*', { count: 'exact' }).eq('activo', true).eq('destacado', true)
      .order('stock', { ascending: false }).order('sku').limit(EN_INICIO)
      .then(({ data, count }) => { setProds(data || []); setTotal(count || (data || []).length); setCargado(true) })
  }, [])

  if (!cargado || (prods.length === 0 && !adminPass)) return null
  const restantes = total - prods.length
  return (
    <section className="destacados">
      <div className="destacados-cab">
        <h2><span className="estrella-titulo">★</span> Productos destacados</h2>
        <Link to="/destacados" className="ver-todo">Ver todos los destacados</Link>
      </div>
      {adminPass && <p className="admin-nota-landing">Modo edición: pulsa la estrella de una tarjeta para quitarla de destacados. Para agregar más, marca la estrella en el catálogo.</p>}
      {prods.length === 0 ? <p>Aún no hay productos destacados.</p> : (
        <TarjetasDestacadas prods={prods} cart={cart} onAddToCart={onAddToCart} onRemove={onRemove} adminPass={adminPass}
          onQuitar={(id) => { setProds((ps) => ps.filter((x) => x.id !== id)); setTotal((t) => t - 1) }} />
      )}
      {restantes > 0 && (
        <div className="ver-mas-dest">
          <Link to="/destacados" className="btn-dest-grande">Ver más destacados ({restantes} más) →</Link>
        </div>
      )}
    </section>
  )
}

export default function Landing({ cart, onAddToCart, onRemove, adminPass }) {
  return (
    <div className="landing">
      <div className="hero">
        <div className="hero-content">
          <h1 className="marca" aria-label="Lessa Joyería">
            <img src="/lessa-wordmark.png" alt="" className="marca-lessa" />
            <span className="marca-joyeria">joyería</span>
          </h1>
          <p>El arte de lucir accesorios de calidad</p>
          <Link to="/catalogo" className="btn-primary">
            Ver catálogo
          </Link>
        </div>
      </div>

      <Destacados cart={cart} onAddToCart={onAddToCart} onRemove={onRemove} adminPass={adminPass} />

      <div className="features">
        <div className="feature">
          <div className="icon">✦</div>
          <h3>Diseños exclusivos</h3>
          <p>Colecciones únicas e innovadoras</p>
        </div>
        <div className="feature">
          <div className="icon">💎</div>
          <h3>Calidad garantizada</h3>
          <p>Materiales premium certificados</p>
        </div>
        <div className="feature">
          <div className="icon">🚚</div>
          <h3>Envío rápido</h3>
          <p>Envíos locales y a toda la república</p>
        </div>
      </div>

      <div className="contact-section compacto">
        <a href="https://wa.me/524493876360" className="icono-contacto wa" target="_blank" rel="noreferrer" aria-label="WhatsApp" title="WhatsApp">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
        </a>
        <a href="mailto:alessandra.reyes04@gmail.com" className="icono-contacto mail" aria-label="Correo" title="Correo">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 7l9 6 9-6" />
          </svg>
        </a>
      </div>

    </div>
  )
}
