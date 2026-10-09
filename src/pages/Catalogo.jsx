import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { sb } from '../lib/supabase'
import Foto from '../components/Foto'
import Estrella from '../components/Estrella'
import { money, DIAS_PREORDEN, DIAS_APARTADO, PCT_ANTICIPO } from '../lib/store'
import '../styles/Catalogo.css'

const PAGINA = 48

export default function Catalogo({ cart, onAddToCart, onRemove, adminPass }) {
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
  const [params] = useSearchParams()
  const [soloOcultos, setSoloOcultos] = useState(false)
  const [ocultos, setOcultos] = useState([])

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

  const categoriaUrl = params.get('categoria')
  useEffect(() => {
    if (!categoriaUrl || categorias.length === 0) return
    const c = categorias.find((x) => x.nombre.toLowerCase() === categoriaUrl.toLowerCase())
    if (c) setSelectedCategory(c.id)
  }, [categoriaUrl, categorias])

  useEffect(() => setVisibles(PAGINA), [selectedCategory, searchTerm, soloDisponibles, soloDestacados, soloOcultos])

  useEffect(() => {
    if (!adminPass) { setSoloOcultos(false); setOcultos([]); return }
    sb.rpc('admin_listar_ocultos', { p_pass: adminPass }).then(({ data, error }) => {
      if (error) { setAviso('Para ver los ocultos falta ejecutar supabase_lessa_ocultar.sql en Supabase.'); return setTimeout(() => setAviso(''), 5000) }
      setOcultos(data || [])
    })
  }, [adminPass])

  const cambiarVisibilidad = async (p, activo) => {
    const { error } = await sb.rpc('admin_set_activo', { p_pass: adminPass, p_id: p.id, p_valor: activo })
    if (error) { setAviso('No se pudo guardar: ' + error.message); return setTimeout(() => setAviso(''), 3500) }
    if (activo) {
      setOcultos((os) => os.filter((x) => x.id !== p.id))
      setProductos((ps) => [...ps, { ...p, activo: true }])
      setAviso(`${p.nombre} ya se muestra en la tienda`)
    } else {
      setProductos((ps) => ps.filter((x) => x.id !== p.id))
      setOcultos((os) => [...os, { ...p, activo: false }])
      setAviso(`${p.nombre} quedó OCULTO: los clientes ya no lo ven. Aquí lo sigues viendo atenuado.`)
    }
    setTimeout(() => setAviso(''), 4000)
  }

  const borrarProducto = async (p) => {
    if (!window.confirm(`¿Borrar DEFINITIVAMENTE ${p.nombre}? No se puede deshacer. El historial de ventas no se afecta.`)) return
    const { error } = await sb.rpc('admin_borrar_producto', { p_pass: adminPass, p_id: p.id })
    if (error) { setAviso(/schema cache|Could not find/i.test(error.message) ? 'Falta ejecutar supabase_lessa_borrar_productos.sql en Supabase.' : 'No se pudo borrar: ' + error.message); return setTimeout(() => setAviso(''), 5000) }
    setOcultos((os) => os.filter((x) => x.id !== p.id))
    setAviso(`${p.nombre} se borró definitivamente`)
    setTimeout(() => setAviso(''), 3000)
  }

  const borrarTodosOcultos = async () => {
    if (!window.confirm(`¿Borrar DEFINITIVAMENTE los ${ocultos.length} productos ocultos? No se puede deshacer. Revisa la lista antes de confirmar.`)) return
    const { data, error } = await sb.rpc('admin_borrar_ocultos', { p_pass: adminPass })
    if (error) { setAviso(/schema cache|Could not find/i.test(error.message) ? 'Falta ejecutar supabase_lessa_borrar_productos.sql en Supabase.' : 'No se pudo borrar: ' + error.message); return setTimeout(() => setAviso(''), 5000) }
    setOcultos([])
    setSoloOcultos(false)
    setAviso(`${data} producto(s) borrados definitivamente`)
    setTimeout(() => setAviso(''), 3500)
  }

  const lista = useMemo(
    () => (adminPass ? [...productos, ...ocultos].sort((a, b) => a.id - b.id) : productos),
    [productos, ocultos, adminPass]
  )

  const filtrados = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return lista.filter(
      (p) =>
        (!selectedCategory || p.categoria_id === selectedCategory) &&
        (!soloDisponibles || p.stock > 0) &&
        (!soloDestacados || p.destacado) &&
        (!soloOcultos || p.activo === false) &&
        (!term || p.nombre?.toLowerCase().includes(term) || p.sku?.toLowerCase().includes(term))
    )
  }, [lista, selectedCategory, searchTerm, soloDisponibles, soloDestacados, soloOcultos])

  const conteo = useMemo(() => {
    const m = {}
    lista.forEach((p) => { m[p.categoria_id] = (m[p.categoria_id] || 0) + 1 })
    return m
  }, [lista])

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
          Todas ({lista.length})
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
        {adminPass && (
          <button type="button" className={`chip-ocultos ${soloOcultos ? 'on' : ''}`} onClick={() => setSoloOcultos(!soloOcultos)}>
            {soloOcultos ? 'Mostrar todos' : `Ver solo los ocultos (${ocultos.length})`}
          </button>
        )}
        <label className="solo-disp">
          <input type="checkbox" checked={soloDisponibles} onChange={(e) => setSoloDisponibles(e.target.checked)} />
          Mostrar solo productos disponibles
        </label>
        <label className="solo-disp solo-dest">
          <input type="checkbox" checked={soloDestacados} onChange={(e) => setSoloDestacados(e.target.checked)} />
          ★ Solo destacados
        </label>
      </div>

      {adminPass && soloOcultos && ocultos.length > 0 && (
        <div className="barra-borrar">
          <span>Estás viendo solo los productos ocultos. Puedes mostrarlos de nuevo o borrarlos.</span>
          <button type="button" onClick={borrarTodosOcultos}>Borrar los {ocultos.length} ocultos</button>
        </div>
      )}

      {aviso && <div className="toast">{aviso}</div>}

      <div className="grid-productos">
        {filtrados.length === 0 ? (
          <p>No hay productos con ese filtro</p>
        ) : (
          filtrados.slice(0, visibles).map((prod) => {
            const agotado = !(prod.stock > 0)
            const n = enCarrito(prod.id)
            const nPre = cart.find((i) => i.key === `${prod.id}-pre`)?.cantidad || 0
            const restante = prod.stock - n
            const sel = n > 0 || nPre > 0
            return (
              <div key={prod.id} className={`producto-card ${agotado ? 'agotado' : ''} ${sel ? 'seleccionado' : ''} ${prod.activo === false ? 'oculto' : ''}`}>
                <div className="foto-wrap">
                  <Foto sku={prod.sku} nombre={prod.nombre} />
                  {agotado && prod.activo !== false && <span className="badge-agotado">Sobre pedido</span>}
                  {sel && <span className="badge-sel">{nPre > 0 ? `✓ Pedido${nPre > 1 ? ` (${nPre})` : ''}` : `✓ En tu carrito${n > 1 ? ` (${n})` : ''}`}</span>}
                  {prod.activo === false && <span className="badge-oculto">OCULTO</span>}
                  {adminPass && (
                    <button type="button" className={`btn-ocultar ${prod.activo === false ? 'mostrar' : ''}`}
                      title={prod.activo === false ? 'Mostrar en la tienda' : 'Ocultar de la tienda'}
                      aria-label={prod.activo === false ? 'Mostrar en la tienda' : 'Ocultar de la tienda'}
                      onClick={() => cambiarVisibilidad(prod, prod.activo === false)}>
                      {prod.activo === false ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12z" /><circle cx="12" cy="12" r="3" /></svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.9 17.9A10.9 10.9 0 0 1 12 19.5C5.5 19.5 1.5 12 1.5 12a19.6 19.6 0 0 1 4.6-5.7M9.9 4.7A10 10 0 0 1 12 4.5C18.5 4.5 22.5 12 22.5 12a19.5 19.5 0 0 1-2.7 3.7M1 1l22 22" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
                      )}
                    </button>
                  )}
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
                {prod.activo === false ? (
                  <>
                    <button className="btn-carrito btn-mostrar" onClick={() => cambiarVisibilidad(prod, true)}>Mostrar en la tienda</button>
                    <button className="btn-carrito btn-borrar" onClick={() => borrarProducto(prod)}>Borrar definitivamente</button>
                  </>
                ) : agotado ? (
                  nPre > 0 ? (
                    <>
                      <button className="btn-carrito btn-encargo" disabled>✓ Ya lo pediste</button>
                      <button className="quitar-sel" onClick={() => onRemove(`${prod.id}-pre`)}>Quitar</button>
                    </>
                  ) : (
                    <button className="btn-carrito btn-encargo" onClick={() => setPreorden(prod)}>
                      Pídelo: llega en {DIAS_PREORDEN} días
                    </button>
                  )
                ) : (
                  <>
                    <p className="stock-info">{prod.stock <= 3 ? `Últimas ${prod.stock} pieza(s)` : 'Disponible'} · se puede apartar {DIAS_APARTADO} días</p>
                    <button className={`btn-carrito ${n > 0 ? 'sel' : ''}`} disabled={restante <= 0} onClick={() => agregar(prod)}>
                      {restante <= 0 ? '✓ Ya está todo en tu carrito' : n > 0 ? 'Agregar otra pieza' : 'Agregar al carrito'}
                    </button>
                    {n > 0 && <button className="quitar-sel" onClick={() => onRemove(String(prod.id))}>Quitar del carrito</button>}
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
            <h2>Disponible sobre pedido</h2>
            <p><strong>{preorden.nombre}</strong> ({money(preorden.precio)}) no está en existencia por ahora, pero lo pedimos para ti.</p>
            <p>
              Lo pedimos a nuestro proveedor y llega en aproximadamente <strong>{DIAS_PREORDEN} días</strong>.
              Para reservarlo se pide un anticipo del {PCT_ANTICIPO}% y el resto al entregarlo. Tu pedido queda confirmado cuando se recibe ese pago, y te enviaremos tu recibo.
            </p>
            <p>¿Quieres pedirlo?</p>
            <div className="modal-botones">
              <button className="btn-primary" onClick={confirmarPreorden}>Sí, pedirlo</button>
              <button className="btn-secundario" onClick={() => setPreorden(null)}>No, gracias</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
