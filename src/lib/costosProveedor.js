import { sb } from './supabase'
import { MARCA } from '../config'

export const PCT_COSTO = 0.5

// Trae el precio de venta vigente de cada código desde el catálogo.
export async function preciosPorSku(skus) {
  const lista = [...new Set(skus.filter(Boolean))]
  const m = {}
  for (let i = 0; i < lista.length; i += 200) {
    const { data } = await sb.from('productos').select('sku,precio').in('sku', lista.slice(i, i + 200))
    ;(data || []).forEach((d) => { m[d.sku] = Number(d.precio) || 0 })
  }
  return m
}

// Agrega precio unitario, precio total, costo unitario (50% del precio) y costo total.
export function conCostos(lista, precios = {}) {
  return lista.map((it) => {
    const precio = Number(precios[it.sku] ?? it.precio) || 0
    const costo = Math.round(precio * PCT_COSTO * 100) / 100
    return { ...it, precio, costo, precioTotal: precio * it.cantidad, costoTotal: costo * it.cantidad }
  })
}

export const totales = (l) => ({
  modelos: l.length,
  piezas: l.reduce((s, i) => s + i.cantidad, 0),
  precioTotal: l.reduce((s, i) => s + i.precioTotal, 0),
  costoTotal: l.reduce((s, i) => s + i.costoTotal, 0),
})

export async function excelPedidoProveedor(lista, titulo = 'Pedido a proveedor') {
  const XLSX = await import('xlsx')
  const l = conCostos(lista, await preciosPorSku(lista.map((i) => i.sku)))
  const t = totales(l)
  const filas = [
    [`${titulo} | ${MARCA.nombre}`],
    [new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })],
    [],
    ['Código', 'Descripción', 'Cantidad', 'Precio unitario', 'Precio total', 'Costo unitario (50%)', 'Costo total'],
    ...l.map((i) => [i.sku, i.nombre, i.cantidad, i.precio, i.precioTotal, i.costo, i.costoTotal]),
    [],
    ['TOTAL', `${t.modelos} modelo(s)`, t.piezas, '', t.precioTotal, '', t.costoTotal],
  ]
  const ws = XLSX.utils.aoa_to_sheet(filas)
  ws['!cols'] = [{ wch: 14 }, { wch: 46 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 14 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Pedido')
  XLSX.writeFile(wb, `pedido-proveedor-${MARCA.archivoPrefijo}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
