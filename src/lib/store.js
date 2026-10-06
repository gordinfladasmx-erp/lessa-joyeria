export const WA_TIENDA = '524493876360'
export const EMAIL_TIENDA = 'alessandra.reyes04@gmail.com'
export const DIAS_PREORDEN = 15

export const money = (n) =>
  '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const fotoUrl = (sku) => `/fotos/${encodeURIComponent(sku)}.jpg`

export function waNumber(tel) {
  const d = (tel || '').replace(/\D/g, '')
  if (d.length === 10) return '52' + d
  if (d.length === 12 && d.startsWith('52')) return d
  if (d.length === 13 && d.startsWith('521')) return '52' + d.slice(3)
  return d
}

export const getAdminPass = () => {
  try { return sessionStorage.getItem('lessa_admin_pass') || '' } catch { return '' }
}
export const setAdminPass = (p) => {
  try { p ? sessionStorage.setItem('lessa_admin_pass', p) : sessionStorage.removeItem('lessa_admin_pass') } catch { /* sin storage */ }
}

export const fechaCorta = (d) =>
  d ? new Date(d + (String(d).length === 10 ? 'T12:00:00' : '')).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

export function reciboTexto(r, cliente) {
  const normales = r.items.filter((i) => !i.preorden)
  const pre = r.items.filter((i) => i.preorden)
  const linea = (i) => `- ${i.nombre} x${i.cantidad}  ${money(i.precio * i.cantidad)}`
  let t = `*Lessa Joyería*\nRecibo ${r.numero_pedido}\nCliente: ${cliente.nombre}\n\n`
  if (normales.length) t += `*Disponibles (entrega inmediata)*\n${normales.map(linea).join('\n')}\n\n`
  if (pre.length) t += `*Por encargo (llega en ~${DIAS_PREORDEN} días, aprox. ${fechaCorta(r.entrega_estimada)})*\n${pre.map(linea).join('\n')}\n\n`
  t += `Subtotal: ${money(r.subtotal)}\n`
  if (r.descuento > 0) t += `Descuento: -${money(r.descuento)}\n`
  t += `*Total: ${money(r.total)}*\n`
  if (r.tiene_preorden) {
    t += `\nAnticipo para apartar los productos por encargo: *${money(r.anticipo)}*\nSaldo a la entrega: ${money(r.total - r.anticipo)}\n`
  }
  t += `\nGracias por tu compra.`
  return t
}
