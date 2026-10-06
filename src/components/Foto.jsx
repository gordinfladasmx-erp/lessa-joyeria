import { useState } from 'react'
import { fotoUrl } from '../lib/store'

export default function Foto({ sku, nombre }) {
  const [error, setError] = useState(false)
  if (error) {
    return (
      <div className="foto-placeholder">
        <img src="/logo.png" alt="" />
      </div>
    )
  }
  return <img src={fotoUrl(sku)} alt={nombre} loading="lazy" onError={() => setError(true)} />
}
