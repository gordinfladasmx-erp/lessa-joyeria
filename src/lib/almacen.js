import { sb } from './supabase.js'
import { canonNombre } from '../utils/stockUtils.js'

const today = () => new Date().toISOString().slice(0, 10)

const FAMILIAS_BEBIDA = ['Bebidas Frías', 'Bebidas Frias']
const FAMILIAS_POSTRE = ['Postres']

// Descuenta bebidas y postres del inventario_maestro cuando una comanda queda lista.
// Llama desde marcarListo() en Comanda.jsx y cambiarEstado('lista') en KDS.jsx
export async function descontarAlmacen(comanda) {
  if (!comanda?.items?.length || !comanda.id) return

  const fecha = today()
  const nota  = `Comanda ${comanda.label || comanda.id}${comanda.cliente ? ' — ' + comanda.cliente : ''}`

  // Verificar que no se haya descontado ya (evitar doble deducción si ambos Comanda y KDS lo llaman)
  const { data: yaExiste } = await sb
    .from('inventario_maestro')
    .select('id')
    .eq('notas', nota)
    .eq('tipo_movimiento', 'venta_auto')
    .limit(1)
  if (yaExiste?.length) return

  const rows = []

  for (const item of comanda.items) {
    const fam = item.plato?.familia || ''
    const qty = item.qty || 1

    if (FAMILIAS_BEBIDA.includes(fam)) {
      rows.push({
        fecha,
        producto: canonNombre(item.plato.nombre),
        categoria: 'bebida',
        unidad: 'piezas',
        tipo_movimiento: 'venta_auto',
        cantidad: qty,
        notas: nota,
      })
    } else if (FAMILIAS_POSTRE.includes(fam)) {
      rows.push({
        fecha,
        producto: canonNombre(item.plato.nombre),
        categoria: 'postre',
        unidad: 'piezas',
        tipo_movimiento: 'venta_auto',
        cantidad: qty,
        notas: nota,
      })
    }
  }

  if (!rows.length) return
  await sb.from('inventario_maestro').insert(rows)
}
