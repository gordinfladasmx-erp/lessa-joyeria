import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { sb } from '../lib/supabase'
import TarjetasDestacadas from '../components/TarjetasDestacadas'
import { fotoGrandeUrl, fotoUrl, money } from '../lib/store'
import { MARCA } from '../config'
import '../styles/Landing.css'

const EN_INICIO = 20

function Beneficios() {
  const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }
  return (
    <section className="franja" aria-label="Beneficios">
      <div className="franja-item">
        <svg width="22" height="22" viewBox="0 0 24 24" {...trazo} aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>
        <span><strong>Diseños exclusivos</strong> Colecciones únicas e innovadoras</span>
      </div>
      <div className="franja-item">
        <svg width="22" height="22" viewBox="0 0 24 24" {...trazo} aria-hidden="true"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg>
        <span><strong>Calidad garantizada</strong> Materiales premium certificados</span>
      </div>
      <div className="franja-item">
        <svg width="22" height="22" viewBox="0 0 24 24" {...trazo} aria-hidden="true"><rect x="1.5" y="6" width="13" height="10" rx="1.5" /><path d="M14.5 9.5h4l3 3v3.5h-7" /><circle cx="6" cy="18.5" r="1.7" /><circle cx="17.5" cy="18.5" r="1.7" /></svg>
        <span><strong>Envíos</strong> Locales y a toda la república</span>
      </div>
    </section>
  )
}

export default function Landing({ cart, onAddToCart, onRemove, adminPass }) {
  const [prods, setProds] = useState([])
  const [total, setTotal] = useState(0)
  const [cargado, setCargado] = useState(false)
  const [hero, setHero] = useState(null)
  const [heroError, setHeroError] = useState(false)

  useEffect(() => {
    sb.from('productos').select('*', { count: 'exact' }).eq('activo', true).eq('destacado', true)
      .order('stock', { ascending: false }).order('sku').limit(EN_INICIO)
      .then(({ data, count }) => {
        const d = data || []
        setProds(d)
        setTotal(count || d.length)
        const candidatos = d.filter((p) => p.stock > 0)
        const base = candidatos.length ? candidatos : d
        setHero(base.length ? base[Math.floor(Math.random() * base.length)] : null)
        setCargado(true)
      })
  }, [])

  const restantes = total - prods.length

  return (
    <div className="landing">
      <section className={`hero2 ${cargado && !(hero && !heroError) ? 'una-col' : ''}`}>
        <div className="hero2-texto">
          <div className="hero2-marca" role="img" aria-label={MARCA.nombre}>
            <img src={MARCA.wordmark} alt="" className={`marca-lessa ${MARCA.wordmarkMultiplicar ? 'multiplicar' : ''}`} />
            {MARCA.subtitulo && <span className="marca-joyeria">{MARCA.subtitulo}</span>}
          </div>
          <h1 className="hero2-lema">{MARCA.eslogan}</h1>
          <p className="hero2-sub">{MARCA.descripcionPortada}</p>
          <div className="hero2-botones">
            <Link to="/catalogo" className="btn-hero">Ver catálogo</Link>
            <Link to="/destacados" className="btn-hero claro">★ Destacados</Link>
          </div>
        </div>
        {hero && !heroError && (
          <div className="hero2-foto">
            <Link to="/destacados" className="hero2-marco" aria-label={`Ver destacados, por ejemplo ${hero.nombre}`}>
              <img src={fotoGrandeUrl(hero.sku)} alt={hero.nombre}
                onError={(e) => { if (e.currentTarget.src.includes('/grande/')) e.currentTarget.src = fotoUrl(hero.sku); else setHeroError(true) }} />
              <span className="hero2-pie">{hero.nombre} <b>{money(hero.precio)}</b></span>
            </Link>
          </div>
        )}
      </section>

      <Beneficios />

      {cargado && (prods.length > 0 || adminPass) && (
        <section className="destacados destacados-editorial">
          <div className="destacados-cab">
            <h2>Destacados</h2>
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
      )}
    </div>
  )
}
