import { useState } from 'react'
import { Link } from 'react-router-dom'
import Foto from './Foto'
import Estrella from './Estrella'
import { money } from '../lib/store'

export default function TarjetasDestacadas({ prods, onAddToCart, adminPass, onQuitar }) {
  const [aviso, setAviso] = useState({})

  const agregar = (p) => {
    const msg = onAddToCart(p, false)
    setAviso((a) => ({ ...a, [p.id]: msg || '✓ Agregado' }))
    setTimeout(() => setAviso((a) => ({ ...a, [p.id]: '' })), 1800)
  }

  return (
    <div className="grid-destacados">
      {prods.map((p) => {
        const agotado = !(p.stock > 0)
        return (
          <div key={p.id} className={`dest-card ${agotado ? 'agotado' : ''}`}>
            <div className="dest-foto">
              <Foto sku={p.sku} nombre={p.nombre} />
              {adminPass
                ? <Estrella producto={p} pass={adminPass} onCambio={(id, v) => !v && onQuitar(id)} />
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
  )
}
