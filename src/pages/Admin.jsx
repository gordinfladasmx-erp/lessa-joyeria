import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'

const ADMIN_PASSWORD = "lessa2024"

export default function Admin() {
  const [loggedIn, setLoggedIn] = useState(localStorage.getItem('admin_logged') === 'true')
  const [password, setPassword] = useState('')
  const [tab, setTab] = useState('stock')
  const [searchTerm, setSearchTerm] = useState('')
  const [productos, setProductos] = useState([])
  const [searching, setSearching] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editingStock, setEditingStock] = useState(0)
  const [nombre, setNombre] = useState('')
  const [sku, setSku] = useState('')
  const [precio, setPrecio] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [agregando, setAgregando] = useState(false)

  const handleLogin = (e) => {
    e.preventDefault()
    if (password === ADMIN_PASSWORD) {
      setLoggedIn(true)
      localStorage.setItem('admin_logged', 'true')
      setPassword('')
    } else {
      alert('Contraseña incorrecta')
    }
  }

  const handleLogout = () => {
    setLoggedIn(false)
    localStorage.removeItem('admin_logged')
  }

  if (!loggedIn) {
    return (
      <div style={{ maxWidth: '400px', margin: '100px auto', padding: '2rem' }}>
        <h1 style={{ textAlign: 'center', color: '#A01848' }}>Acceso Admin</h1>
        <form onSubmit={handleLogin}>
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', fontSize: '1rem' }}
          />
          <button
            type="submit"
            style={{ width: '100%', padding: '0.75rem', background: '#A01848', color: 'white', border: 'none', cursor: 'pointer', fontSize: '1rem' }}
          >
            Ingresar
          </button>
        </form>
      </div>
    )
  }

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
      await sb.from('productos').update({ stock: nuevoStock }).eq('id', productoId)
      setProductos(productos.map((p) => p.id === productoId ? { ...p, stock: nuevoStock } : p))
      setEditingId(null)
      alert('Stock actualizado')
    } catch (e) {
      alert('Error: ' + e.message)
    }
  }

  const handleAgregarProducto = async (e) => {
    e.preventDefault()
    if (!nombre || !sku || !precio || !categoriaId) {
      alert('Completa todos los campos')
      return
    }
    setAgregando(true)
    try {
      await sb.from('productos').insert([{
        nombre, sku, precio: parseFloat(precio), categoria_id: parseInt(categoriaId), activo: true, stock: 0
      }])
      alert('Producto agregado')
      setNombre('')
      setSku('')
      setPrecio('')
      setCategoriaId('')
    } catch (e) {
      alert('Error: ' + e.message)
    } finally {
      setAgregando(false)
    }
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Administración</h1>
        <button onClick={handleLogout} style={{ padding: '0.5rem 1rem', background: '#999', color: 'white', border: 'none', cursor: 'pointer' }}>Salir</button>
      </div>
      
      <div style={{ marginBottom: '2rem', borderBottom: '2px solid #ddd' }}>
        <button 
          onClick={() => setTab('stock')}
          style={{ padding: '1rem', background: tab === 'stock' ? '#A01848' : 'white', color: tab === 'stock' ? 'white' : 'black', border: 'none', cursor: 'pointer', fontSize: '1rem', marginRight: '1rem' }}
        >
          Editar Stock
        </button>
        <button 
          onClick={() => setTab('nuevo')}
          style={{ padding: '1rem', background: tab === 'nuevo' ? '#A01848' : 'white', color: tab === 'nuevo' ? 'white' : 'black', border: 'none', cursor: 'pointer', fontSize: '1rem' }}
        >
          Nuevo Producto
        </button>
      </div>

      {tab === 'stock' && (
        <>
          <form onSubmit={handleSearch} style={{ marginBottom: '2rem' }}>
            <input placeholder="Buscar SKU..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', fontSize: '1rem' }} />
            <button type="submit" disabled={searching} style={{ padding: '0.75rem 1.5rem', background: '#A01848', color: 'white', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>{searching ? 'Buscando...' : 'Buscar'}</button>
          </form>
          {productos.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #ddd' }}>
                  <th style={{ textAlign: 'left', padding: '1rem' }}>SKU</th>
                  <th style={{ textAlign: 'left', padding: '1rem' }}>Nombre</th>
                  <th style={{ textAlign: 'center', padding: '1rem' }}>Stock</th>
                  <th style={{ textAlign: 'center', padding: '1rem' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '1rem' }}>{p.sku}</td>
                    <td style={{ padding: '1rem' }}>{p.nombre}</td>
                    <td style={{ textAlign: 'center', padding: '1rem' }}>{editingId === p.id ? <input type="number" value={editingStock} onChange={(e) => setEditingStock(parseInt(e.target.value) || 0)} style={{ width: '80px', padding: '0.5rem' }} /> : (p.stock || 0)}</td>
                    <td style={{ textAlign: 'center', padding: '1rem' }}>{editingId === p.id ? <><button onClick={() => handleUpdateStock(p.id, editingStock)} style={{ marginRight: '0.5rem', background: '#28a745', color: 'white', border: 'none', padding: '0.5rem 1rem', cursor: 'pointer' }}>Guardar</button><button onClick={() => setEditingId(null)} style={{ background: '#999', color: 'white', border: 'none', padding: '0.5rem 1rem', cursor: 'pointer' }}>Cancelar</button></> : <button onClick={() => { setEditingId(p.id); setEditingStock(p.stock || 0); }} style={{ background: '#A01848', color: 'white', border: 'none', padding: '0.5rem 1rem', cursor: 'pointer' }}>Editar</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {tab === 'nuevo' && (
        <form onSubmit={handleAgregarProducto} style={{ maxWidth: '500px' }}>
          <input placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', fontSize: '1rem' }} />
          <input placeholder="SKU" value={sku} onChange={(e) => setSku(e.target.value)} style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', fontSize: '1rem' }} />
          <input type="number" step="0.01" placeholder="Precio" value={precio} onChange={(e) => setPrecio(e.target.value)} style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', fontSize: '1rem' }} />
          <input type="number" placeholder="Categoría ID" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', fontSize: '1rem' }} />
          <button type="submit" disabled={agregando} style={{ padding: '0.75rem 2rem', background: '#28a745', color: 'white', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>{agregando ? 'Agregando...' : 'Agregar Producto'}</button>
        </form>
      )}
    </div>
  )
}
