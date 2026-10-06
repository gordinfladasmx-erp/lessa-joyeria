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
    </div>
  )
}
