import { useState } from 'react'
import { sb } from '../lib/supabase'

export default function Estrella({ producto, pass, onCambio }) {
  const [guardando, setGuardando] = useState(false)
  const activo = !!producto.destacado
  const alternar = async (e) => {
    e.preventDefault(); e.stopPropagation()
    setGuardando(true)
    const { error } = await sb.rpc('admin_set_destacado', { p_pass: pass, p_id: producto.id, p_valor: !activo })
    setGuardando(false)
    if (!error) onCambio(producto.id, !activo)
  }
  return (
    <button type="button" className={`estrella ${activo ? 'on' : ''}`} onClick={alternar} disabled={guardando}
      title={activo ? 'Quitar de destacados' : 'Marcar como destacado'} aria-label={activo ? 'Quitar de destacados' : 'Marcar como destacado'}>
      {activo ? '★' : '☆'}
    </button>
  )
}
