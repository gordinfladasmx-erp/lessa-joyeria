import { useState } from 'react'
import { Link } from 'react-router-dom'
import Foto from './Foto'
import Estrella from './Estrella'
import { money } from '../lib/store'

export default function TarjetasDestacadas({ prods, cart = [], onAddToCart, onRemove, adminPass, onQuitar }) {
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
        const linea = cart.find((i) => i.key === String(p.id))
        const n = linea ? linea.cantidad : 0
        const completo = n >= (p.stock || 0)
        return (
          <div key={p.id} className={`dest-card ${agotado ? 'agotado' : ''} ${n > 0 ? 'seleccionado' : ''}`}>
            <div className="dest-foto">
              <Foto sku={p.sku} nombre={p.nombre} />
              {adminPass
                ? <Estrella producto={p} pass={adminPass} onCambio={(id, v) => !v && onQuitar(id)} />
                : <span className="badge-dest" title="Destacado">★</span>}
              {agotado && <span className="badge-agotado">Sobre pedido</span>}
              {n > 0 && <span className="badge-sel">✓ En tu carrito{n > 1 ? ` (${n})` : ''}</span>}
            </div>
            <h3>{p.nombre}</h3>
            <p className="dest-precio">{money(p.precio)}</p>
            {agotado ? (
              <Link to="/catalogo" className="btn-dest ver">Pídelo sobre pedido</Link>
            ) : (
              n > 0 ? (
                <>
                  <button className="btn-dest sel" disabled={completo} onClick={() => agregar(p)}>
                    {aviso[p.id] || (completo ? '✓ Ya lo tienes' : 'Agregar otra')}
                  </button>
                  <button className="quitar-sel" onClick={() => onRemove(String(p.id))}>Quitar</button>
                </>
              ) : (
                <button className="btn-dest" onClick={() => agregar(p)}>{aviso[p.id] || 'Agregar'}</button>
              )
            )}
          </div>
        )
      })}
    </div>
  )
}
