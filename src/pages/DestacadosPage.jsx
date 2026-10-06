import { useState, useEffect, useMemo } from 'react'
import { sb } from '../lib/supabase'
import TarjetasDestacadas from '../components/TarjetasDestacadas'
import '../styles/Landing.css'

const PAGINA = 60

export default function DestacadosPage({ cart, onAddToCart, onRemove, adminPass }) {
  const [prods, setProds] = useState([])
  const [cats, setCats] = useState([])
  const [cat, setCat] = useState(null)
  const [q, setQ] = useState('')
  const [cargado, setCargado] = useState(false)
  const [visibles, setVisibles] = useState(PAGINA)

  useEffect(() => {
    (async () => {
      const r = (a, b) => sb.from('productos').select('*').eq('activo', true).eq('destacado', true)
        .order('stock', { ascending: false }).order('sku').range(a, b)
      const [c, p1, p2] = await Promise.all([sb.from('categorias').select('*').order('nombre'), r(0, 999), r(1000, 1999)])
      setCats(c.data || [])
      setProds([...(p1.data || []), ...(p2.data || [])])
      setCargado(true)
    })()
  }, [])
  useEffect(() => setVisibles(PAGINA), [cat, q])

  const conteo = useMemo(() => {
    const m = {}
    prods.forEach((p) => { m[p.categoria_id] = (m[p.categoria_id] || 0) + 1 })
    return m
  }, [prods])
  const term = q.trim().toLowerCase()
  const filtrados = prods.filter((p) => (!cat || p.categoria_id === cat) &&
    (!term || p.nombre.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term)))

  return (
    <div className="destacados destacados-pagina">
      <div className="destacados-cab">
        <h1><span className="estrella-titulo">★</span> Productos destacados</h1>
        <span className="ver-todo">{prods.length} producto(s)</span>
      </div>
      {adminPass && <p className="admin-nota-landing">Modo edición: pulsa la estrella de una tarjeta para quitarla de destacados. Para agregar más, marca la estrella en el catálogo.</p>}
      {!cargado ? <p>Cargando...</p> : prods.length === 0 ? <p>Aún no hay productos destacados.</p> : (
        <>
          <input className="search-input busca-dest" placeholder="Buscar por código o nombre..." value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="categorias" style={{ marginBottom: '1rem' }}>
            <button className={`cat-btn ${!cat ? 'active' : ''}`} onClick={() => setCat(null)}>Todos ({prods.length})</button>
            {cats.filter((c) => conteo[c.id]).map((c) => (
              <button key={c.id} className={`cat-btn ${cat === c.id ? 'active' : ''}`} onClick={() => setCat(c.id)}>{c.nombre} ({conteo[c.id]})</button>
            ))}
          </div>
          {filtrados.length === 0 ? <p>No hay destacados con ese filtro.</p> : (
            <TarjetasDestacadas prods={filtrados.slice(0, visibles)} cart={cart} onAddToCart={onAddToCart} onRemove={onRemove} adminPass={adminPass}
              onQuitar={(id) => setProds((ps) => ps.filter((x) => x.id !== id))} />
          )}
          {filtrados.length > visibles && (
            <div className="ver-mas-dest">
              <button className="btn-dest-grande" onClick={() => setVisibles(visibles + PAGINA)}>Ver más ({filtrados.length - visibles} restantes)</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
