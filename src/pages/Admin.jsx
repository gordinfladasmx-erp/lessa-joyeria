import { useState } from 'react'
import { sb } from '../lib/supabase'

export default function Admin() {
  const [searchTerm, setSearchTerm] = useState('')
  const [productos, setProductos] = useState([])
  const [searching, setSearching] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editingStock, setEditingStock] = useState(0)

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!searchTerm.trim()) return
    setSearching(true)
    try {
      const { data } = await sb
        .from('productos')
        .select('id, sku, nombre, stock')
        .or(`sku.ilike.%${searchTerm}%,nombre.ilike.%${searchTerm}%`)
        .limit(20)
      setProductos(data || [])
    } catch (e) {
      alert('Error: ' + e.message)
    } finally {
      setSearching(false)
    }
  }

  const handleUpdateStock = async (productoId, nuevoStock) => {
    try {
      const { error } = await sb
        .from('productos')
        .update({ stock: nuevoStock })
        .eq('id', productoId)
      if (error) throw error
      setProductos(productos.map((p) =>
        p.id === productoId ? { ...p, stock: nuevoStock } : p
      ))
      setEditingId(null)
      alert('Stock actualizado')
    } catch (e) {
      alert('Error: ' + e.message)
    }
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <h1>Inventario</h1>
      <form onSubmit={handleSearch}>
        <input
          placeholder="Buscar SKU o nombre..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem' }}
        />
        <button type="submit" disabled={searching} style={{ padding: '0.75rem 1.5rem', background: '#A01848', color: 'white', border: 'none', cursor: 'pointer' }}>
          {searching ? 'Buscando...' : 'Buscar'}
        </button>
      </form>
      <table style={{ width: '100%', marginTop: '2rem', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #ddd' }}>
            <th style={{ textAlign: 'left', padding: '1rem' }}>SKU</th>
            <th>Nombre</th>
            <th>Stock</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {productos.map((p) => (
            <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '1rem' }}>{p.sku}</td>
              <td>{p.nombre}</td>
              <td style={{ textAlign: 'center' }}>
                {editingId === p.id ? (
                  <input type="number" value={editingStock} onChange={(e) => setEditingStock(parseInt(e.target.value) || 0)} style={{ width: '60px' }} />
                ) : (
                  p.stock || 0
                )}
              </td>
              <td style={{ textAlign: 'center' }}>
                {editingId === p.id ? (
                  <>
                    <button onClick={() => handleUpdateStock(p.id, editingStock)} style={{ marginRight: '0.5rem', background: '#28a745', color: 'white', border: 'none', padding: '0.5rem 1rem', cursor: 'pointer' }}>Guardar</button>
                    <button onClick={() => setEditingId(null)} style={{ background: '#999', color: 'white', border: 'none', padding: '0.5rem 1rem', cursor: 'pointer' }}>Cancelar</button>
                  </>
                ) : (
                  <button onClick={() => { setEditingId(p.id); setEditingStock(p.stock || 0); }} style={{ background: '#A01848', color: 'white', border: 'none', padding: '0.5rem 1rem', cursor: 'pointer' }}>Editar</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
