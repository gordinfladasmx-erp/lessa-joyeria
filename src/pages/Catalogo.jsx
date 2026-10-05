import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'
import '../styles/Catalogo.css'

export default function Catalogo({ onAddToCart }) {
  const [productos, setProductos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filtrados, setFiltrados] = useState([])

  useEffect(() => {
    cargarDatos()
  }, [])

  useEffect(() => {
    filtrarProductos()
  }, [productos, selectedCategory])

  const cargarDatos = async () => {
    try {
      const [{ data: cats }] = await Promise.all([
        sb.from('categorias').select('*'),
      ])

      // Supabase limita a 1000 por query, paginar
      const [{ data: prods1 }, { data: prods2 }] = await Promise.all([
        sb.from('productos').select('*').eq('activo', true).limit(1000),
        sb.from('productos').select('*').eq('activo', true).limit(1000).range(1000, 1999),
      ])
      const prods = [...(prods1 || []), ...(prods2 || [])]

      setCategorias(cats || [])
      setProductos(prods)
    } catch (e) {
      console.error('Error cargando datos:', e)
    } finally {
      setLoading(false)
    }
  }

  const filtrarProductos = () => {
    if (!selectedCategory) {
      setFiltrados(productos)
    } else {
      setFiltrados(
        productos.filter((p) => p.categoria_id === selectedCategory)
      )
    }
  }

  if (loading) {
    return <div className="catalogo"><p>Cargando...</p></div>
  }

  return (
    <div className="catalogo">
      <h1>Catálogo</h1>

      <div className="categorias">
        <button
          className={`cat-btn ${!selectedCategory ? 'active' : ''}`}
          onClick={() => setSelectedCategory(null)}
        >
          Todas ({productos.length})
        </button>
        {categorias.map((cat) => (
          <button
            key={cat.id}
            className={`cat-btn ${selectedCategory === cat.id ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat.id)}
          >
            {cat.nombre} (
            {productos.filter((p) => p.categoria_id === cat.id).length})
          </button>
        ))}
      </div>

      <div className="grid-productos">
        {filtrados.length === 0 ? (
          <p>No hay productos en esta categoría</p>
        ) : (
          filtrados.map((prod) => (
            <div key={prod.id} className="producto-card">
              {prod.foto_url ? (
                <img src={prod.foto_url} alt={prod.nombre} />
              ) : (
                <div className="foto-placeholder">📷</div>
              )}
              <h3>{prod.nombre}</h3>
              <p className="precio">${prod.precio.toFixed(2)}</p>
              <button
                className="btn-carrito"
                onClick={() => onAddToCart(prod)}
              >
                Agregar al carrito
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
