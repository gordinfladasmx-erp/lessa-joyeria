import { sb } from './supabase.js'

const norm = s => (s || '').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Alias: preparaciones/combinaciones que apuntan al insumo real.
// Valor puede ser string (uno) o array (varios, como La Suegra + Diabla).
const ALIAS_GUISO = {
  'huevo estrellado': 'Huevo',
  'claras de huevo':  'Huevo',
}
const ALIAS_SALSA = {
  'diabla':             'La Suegra',   // Diabla se produce desde La Suegra
  'la suegra + diabla': 'La Suegra',   // combinación, misma base
}

// Resuelve un nombre de guiso/salsa → array de nombres de insumo reales
function resolverAliasGuiso(nombre) {
  const n = norm(nombre)
  const alias = ALIAS_GUISO[n]
  if (!alias) return [nombre]
  return Array.isArray(alias) ? alias : [alias]
}
function resolverAliasSalsa(nombre) {
  const n = norm(nombre)
  const alias = ALIAS_SALSA[n]
  if (!alias) return [nombre]
  return Array.isArray(alias) ? alias : [alias]
}

// Descuenta insumos de stock cuando una comanda queda lista.
// Llama desde marcarListo() en Comanda.jsx y cambiarEstado('lista') en KDS.jsx
export async function descontarInsumos(comanda) {
  if (!comanda?.items?.length || !comanda.id) return

  const codigos = [...new Set(comanda.items.map(i => i.plato?.codigo).filter(Boolean))]
  if (!codigos.length) return

  const [{ data: recetas }, { data: insumos }] = await Promise.all([
    sb.from('recetas').select('producto_codigo, insumo_id, cantidad, tipo').in('producto_codigo', codigos),
    sb.from('insumos').select('id, nombre, stock_actual'),
  ])

  if (!recetas?.length) return

  const insumoByNombre = {}
  ;(insumos || []).forEach(i => { insumoByNombre[norm(i.nombre)] = i })
  const insumoById = {}
  ;(insumos || []).forEach(i => { insumoById[i.id] = i })

  // Acumular cuánto consumir de cada insumo
  const consumo = {}  // insumo_id → cantidad a descontar (positivo)

  const sumar = (insumoNombre, cantidad) => {
    const ins = insumoByNombre[norm(insumoNombre)]
    if (!ins) return
    consumo[ins.id] = (consumo[ins.id] || 0) + cantidad
  }

  for (const item of comanda.items) {
    if (!item.plato?.codigo) continue
    const qty    = item.qty || 1
    const cfg    = item._config || {}
    // Guisos: guiso1 (base) + guisoX (extras) — ambos se descuentan
    const guisos  = [...(cfg.guiso1 || []), ...(cfg.guisoX || [])]
    const salsas  = cfg.salsas  || []
    const tops    = cfg.tops    || []

    const itemRecetas = recetas.filter(r => r.producto_codigo === item.plato.codigo)

    for (const r of itemRecetas) {
      if (r.tipo === 'fijo') {
        if (!r.insumo_id) continue
        consumo[r.insumo_id] = (consumo[r.insumo_id] || 0) + r.cantidad * qty

      } else if (r.tipo === 'guiso') {
        // Descontar de cada guiso que el cliente eligió
        guisos.forEach(g => resolverAliasGuiso(g).forEach(nombre => sumar(nombre, r.cantidad * qty)))

      } else if (r.tipo === 'salsa') {
        // Descontar de cada salsa elegida
        salsas.forEach(s => resolverAliasSalsa(s).forEach(nombre => sumar(nombre, r.cantidad * qty)))

      } else if (r.tipo === 'topping') {
        // Descontar de cada topping elegido (queso, crema, etc.)
        tops.forEach(t => sumar(t, r.cantidad * qty))
      }
    }
  }

  if (!Object.keys(consumo).length) return

  // Registrar movimientos (ignoreDuplicates evita doble descuento)
  const movRows = Object.entries(consumo).map(([insumo_id, cantidad]) => ({
    insumo_id,
    cantidad: -Math.abs(cantidad),
    tipo: 'venta',
    comanda_id: comanda.id,
    nota: null,
  }))

  await sb.from('insumos_movimientos').upsert(movRows, {
    onConflict: 'comanda_id,insumo_id',
    ignoreDuplicates: true,
  })

  // Actualizar stock_actual de cada insumo afectado
  await Promise.all(
    Object.entries(consumo).map(async ([insumo_id, cantidad]) => {
      const ins = insumoById[insumo_id]
      if (!ins) return
      const nuevoStock = Math.max(0, (ins.stock_actual || 0) - cantidad)
      await sb.from('insumos').update({
        stock_actual: nuevoStock,
        updated_at: new Date().toISOString(),
      }).eq('id', insumo_id)
    })
  )
}
