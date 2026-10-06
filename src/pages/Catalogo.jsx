import { useState, useEffect, useMemo } from 'react'
import { sb } from '../lib/supabase'
import Foto from '../components/Foto'
import Estrella from '../components/Estrella'
import { money, DIAS_PREORDEN, DIAS_APARTADO, PCT_ANTICIPO } from '../lib/store'
import '../styles/Catalogo.css'

const PAGINA = 48

export default function Catalogo({ cart, onAddToCart, adminPass }) {
  const [productos, setProductos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [soloDisponibles, setSoloDisponibles] = useState(false)
  const [soloDestacados, setSoloDestacados] = useState(false)
  const [visibles, setVisibles] = useState(PAGINA)
  const [aviso, setAviso] = useState('')
  const [preorden, setPreorden] = useState(null)

  useEffect(() => {
    const cargar = async () => {
      try {
        await sb.rpc('vencer_apartados')
        const q = (from, to) =>
          sb.from('productos').select('*').eq('activo', true).order('id').range(from, to)
        const [cats, p1, p2, p3] = await Promise.all([
          sb.from('categorias').select('*').order('nombre'),
          q(0, 999),
          q(1000, 1999),
          q(2000, 2999),
        ])
        if (p1.error) throw p1.error
        setCategorias(cats.data || [])
        setProductos([...(p1.data || []), ...(p2.data || []), ...(p3.data || [])])
      } catch (e) {
        setErrorCarga('No se pudo cargar el catálogo: ' + e.message)
      } finally {
        setLoading(false)
      }
    }
    cargar()
  }, [])

  useEffect(() => setVisibles(PAGINA), [selectedCategory, searchTerm, soloDisponibles, soloDestacados])

  const filtrados = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return productos.filter(
      (p) =>
        (!selectedCategory || p.categoria_id === selectedCategory) &&
        (!soloDisponibles || p.stock > 0) &&
        (!soloDestacados || p.destacado) &&
        (!term || p.nombre?.toLowerCase().includes(term) || p.sku?.toLowerCase().includes(term))
    )
  }, [productos, selectedCategory, searchTerm, soloDisponibles, soloDestacados])

  const conteo = useMemo(() => {
    const m = {}
    productos.forEach((p) => { m[p.categoria_id] = (m[p.categoria_id] || 0) + 1 })
    return m
  }, [productos])

  const enCarrito = (id) => cart.find((i) => i.key === String(id))?.cantidad || 0

  const agregar = (p) => {
    const msg = onAddToCart(p, false)
    setAviso(msg || `Agregado: ${p.nombre}`)
    setTimeout(() => setAviso(''), 2500)
  }

  const ajustar = async (p, delta, fijo = null) => {
    const { data, error } = await sb.rpc('admin_adjust_stock', { p_pass: adminPass, p_id: p.id, p_delta: delta, p_set: fijo })
    if (error) { setAviso('No se pudo guardar: ' + error.message); return setTimeout(() => setAviso(''), 3500) }
    setProductos((ps) => ps.map((x) => (x.id === p.id ? { ...x, stock: data } : x)))
  }

  const confirmarPreorden = () => {
    onAddToCart(preorden, true)
    setAviso(`Encargo agregado: ${preorden.nombre}`)
    setPreorden(null)
    setTimeout(() => setAviso(''), 2500)
  }

  if (loading) return <div className="catalogo"><p>Cargando...</p></div>
  if (errorCarga) return <div className="catalogo"><p>{errorCarga}</p></div>

  return (
    <div className="catalogo">
      <h1>Catálogo</h1>

      <div className="search-box">
        <input
          type="text"
          placeholder="Buscar por código o nombre..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="categorias">
        <button className={`cat-btn ${!selectedCategory ? 'active' : ''}`} onClick={() => setSelectedCategory(null)}>
          Todas ({productos.length})
        </button>
        {categorias.map((cat) => (
          <button
            key={cat.id}
            className={`cat-btn ${selectedCategory === cat.id ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat.id)}
          >
            {cat.nombre} ({conteo[cat.id] || 0})
          </button>
        ))}
      </div>

      <div className="filtros-extra">
        <label className="solo-disp">
          <input type="checkbox" checked={soloDisponibles} onChange={(e) => setSoloDisponibles(e.target.checked)} />
          Mostrar solo productos disponibles
        </label>
        <label className="solo-disp solo-dest">
          <input type="checkbox" checked={soloDestacados} onChange={(e) => setSoloDestacados(e.target.checked)} />
          ★ Solo destacados
        </label>
      </div>

      {aviso && <div className="toast">{aviso}</div>}

      <div className="grid-productos">
        {filtrados.length === 0 ? (
          <p>No hay productos con ese filtro</p>
        ) : (
          filtrados.slice(0, visibles).map((prod) => {
            const agotado = !(prod.stock > 0)
            const restante = prod.stock - enCarrito(prod.id)
            return (
              <div key={prod.id} className={`producto-card ${agotado ? 'agotado' : ''}`}>
                <div className="foto-wrap">
                  <Foto sku={prod.sku} nombre={prod.nombre} />
                  {agotado && <span className="badge-agotado">Agotado</span>}
                  {adminPass
                    ? <Estrella producto={prod} pass={adminPass} onCambio={(id, v) => setProductos((ps) => ps.map((x) => (x.id === id ? { ...x, destacado: v } : x)))} />
                    : prod.destacado && <span className="badge-dest" title="Destacado">★</span>}
                </div>
                <h3>{prod.nombre}</h3>
                <p className="precio">{money(prod.precio)}</p>
                {adminPass && (
                  <div className="stock-admin">
                    <span>Existencia</span>
                    <div className="stepper">
                      <button onClick={() => ajustar(prod, -1)} disabled={prod.stock <= 0}>−</button>
                      <input type="number" min="0" value={prod.stock}
                        onChange={(e) => setProductos(productos.map((x) => (x.id === prod.id ? { ...x, stock: e.target.value } : x)))}
                        onBlur={(e) => ajustar(prod, 0, Math.max(0, parseInt(e.target.value) || 0))} />
                      <button onClick={() => ajustar(prod, 1)}>+</button>
                    </div>
                  </div>
                )}
                {agotado ? (
                  <button className="btn-carrito btn-encargo" onClick={() => setPreorden(prod)}>
                    Encargar (llega en ~{DIAS_PREORDEN} días)
                  </button>
                ) : (
                  <>
                    <p className="stock-info">{prod.stock <= 3 ? `Últimas ${prod.stock} pieza(s)` : 'Disponible'} · se puede apartar {DIAS_APARTADO} días</p>
                    <button className="btn-carrito" disabled={restante <= 0} onClick={() => agregar(prod)}>
                      {restante <= 0 ? 'Ya está todo en tu carrito' : 'Agregar al carrito'}
                    </button>
                  </>
                )}
              </div>
            )
          })
        )}
      </div>

      {filtrados.length > visibles && (
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <button className="btn-primary" onClick={() => setVisibles(visibles + PAGINA)}>
            Ver más ({filtrados.length - visibles} restantes)
          </button>
        </div>
      )}

      {preorden && (
        <div className="modal-fondo" onClick={() => setPreorden(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Producto agotado</h2>
            <p><strong>{preorden.nombre}</strong> ({money(preorden.precio)}) no está disponible por ahora.</p>
            <p>
              Podemos pedirlo a nuestro proveedor. Llega en aproximadamente <strong>{DIAS_PREORDEN} días</strong>.
              Para reservarlo se pide un anticipo del {PCT_ANTICIPO}% y el resto al entregarlo. Tu pedido queda confirmado cuando se recibe ese pago, y te enviaremos tu recibo.
            </p>
            <p>¿Quieres encargarlo?</p>
            <div className="modal-botones">
              <button className="btn-primary" onClick={confirmarPreorden}>Sí, encargarlo</button>
              <button className="btn-secundario" onClick={() => setPreorden(null)}>No, gracias</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
