import { sb } from '../lib/supabase.js'

export const TIPO_MOV = {
  cierre:        { label:'Cierre del día',   color:'#378ADD', signo: null },
  ingreso:       { label:'Ingreso / Compra', color:'#1D9E75', signo: +1  },
  produccion:    { label:'Producción',       color:'#1D9E75', signo: +1  },
  descongelado:  { label:'Descongelado',     color:'#7F77DD', signo: +1  },
  venta:         { label:'Venta (manual)',   color:'#EF9F27', signo: -1  },
  venta_auto:    { label:'Venta (comanda)',  color:'#EF9F27', signo: -1  },
  salida_manual: { label:'Salida / Merma',  color:'#E24B4A', signo: -1  },
  apertura:      { label:'Apertura (ant.)', color:'#888780', signo: +1  },
  ajuste:        { label:'Ajuste (ant.)',   color:'#888780', signo: +1  },
}

// Mapa único de normalización de nombres (unión de Almacén + Comanda)
const NOMBRE_CANON = {
  'chocolatin':'Chocolatín','chocolatín':'Chocolatín',
  'agua limon con chia':'Agua Limón con Chía','agua limón con chía':'Agua Limón con Chía',
  'agua pina':'Agua Piña','agua piña':'Agua Piña',
  'jugo fresa':'Jugo de Fresa','jugo de fresa':'Jugo de Fresa',
  'jugo mango':'Jugo de Mango','jugo de mango':'Jugo de Mango',
  'jugo manzana':'Jugo de Manzana','jugo de manzana':'Jugo de Manzana',
  'coca-cola original':'Coca-Cola Original','coca-cola zero':'Coca-Cola Zero',
  'agua natural':'Agua Natural','agua jamaica':'Agua Jamaica',
  'agua horchata':'Agua Horchata','agua mango':'Agua Mango',
  'galleta':'Galleta','muffin':'Muffin','rol de canela':'Rol de Canela',
  'croissant':'Croissant',
}

export const canonNombre = n => n ? (NOMBRE_CANON[n.toLowerCase()] || n) : n

// Obtiene TODOS los movimientos del inventario (paginado — Supabase limita 1000 filas por request).
// categorias: array opcional, ej. ['bebida','postre']. Si se omite, trae todas.
export async function fetchAllMovimientos({ categorias, desdeStr } = {}) {
  if (!desdeStr) {
    const d = new Date(); d.setDate(d.getDate() - 90)
    desdeStr = d.toISOString().slice(0, 10)
  }
  let all = [], from = 0
  const PAGE = 1000
  while (true) {
    let q = sb.from('inventario_maestro')
      .select('*')
      .gte('fecha', desdeStr)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (categorias?.length) q = q.in('categoria', categorias)
    const { data, error } = await q
    if (error || !data || data.length === 0) break
    all = [...all, ...data]
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

// Calcula el stock actual por producto a partir de los movimientos.
// Usa el último CIERRE como base absoluta; si no hay cierre, acumula desde el inicio.
// Devuelve array de { producto, categoria, unidad, cantidad, tieneCierre, ultimoCierre }
export function calcStock(movimientos) {
  const byKey = {}
  movimientos.forEach(m => {
    const key = canonNombre(m.producto) + '|' + m.categoria
    if (!byKey[key]) byKey[key] = []
    byKey[key].push(m)
  })

  const stock = {}
  Object.entries(byKey).forEach(([key, movs]) => {
    const sorted = [...movs].sort((a, b) => {
      const ta = a.created_at || a.fecha
      const tb = b.created_at || b.fecha
      return ta < tb ? -1 : ta > tb ? 1 : 0
    })

    let baseIdx = -1, baseCantidad = 0
    sorted.forEach((m, i) => {
      if (m.tipo_movimiento === 'cierre') { baseIdx = i; baseCantidad = parseFloat(m.cantidad) || 0 }
    })

    const postCierre = baseIdx >= 0 ? sorted.slice(baseIdx + 1) : sorted
    const delta = postCierre.reduce((s, m) => {
      const signo = TIPO_MOV[m.tipo_movimiento]?.signo
      if (signo === null) return s
      return s + (signo ?? +1) * (parseFloat(m.cantidad) || 0)
    }, 0)

    const last = sorted[sorted.length - 1]
    stock[key] = {
      producto: canonNombre(last.producto),
      categoria: last.categoria,
      unidad: last.unidad,
      cantidad: baseCantidad + delta,
      tieneCierre: baseIdx >= 0,
      ultimoCierre: baseIdx >= 0 ? sorted[baseIdx].fecha : null,
    }
  })
  return Object.values(stock)
}

// Versión conveniente para Comanda: devuelve mapa { nombreProducto: cantidad }
// filtrado a las categorías bebida y postre.
export async function fetchStockBebidasPostres() {
  const movs = await fetchAllMovimientos({ categorias: ['bebida', 'postre'] })
  const stockArr = calcStock(movs)
  const map = {}
  stockArr.forEach(s => { map[canonNombre(s.producto)] = s.cantidad })
  return map
}
