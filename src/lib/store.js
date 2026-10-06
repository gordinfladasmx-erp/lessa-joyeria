export const WA_TIENDA = '524493876360'
export const EMAIL_TIENDA = 'alessandra.reyes04@gmail.com'
export const DIAS_PREORDEN = 15
export const DIAS_APARTADO = 15
export const PCT_ANTICIPO = 30

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

export const fechaCorta = (d) => {
  if (!d) return ''
  const s = String(d)
  const dt = new Date(s.length === 10 ? s + 'T12:00:00' : s)
  return dt.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
}

export const mensajeError = (err) =>
  /Could not find the function|schema cache/i.test(err?.message || '')
    ? 'Falta ejecutar el SQL de configuración en Supabase (archivo supabase_lessa_inventario_pedidos.sql).'
    : err?.message || 'Error desconocido'

function bloque(p) {
  const lineas = p.items.map((i) => `- ${i.nombre} x${i.cantidad}  ${money(i.precio * i.cantidad)}`).join('\n')
  let t = ''
  if (p.tipo === 'encargo') {
    t += `*Encargo ${p.numero_pedido}* (llega en ~${DIAS_PREORDEN} días, aprox. ${fechaCorta(p.entrega_estimada)})\n${lineas}\n`
  } else {
    t += `*${p.mostrador ? 'Venta' : 'Apartado'} ${p.numero_pedido}*\n${lineas}\n`
  }
  if (p.descuento > 0) t += `Descuento: -${money(p.descuento)}\n`
  t += `Total: ${money(p.total)}\n`
  if (!p.mostrador) {
    t += `Reserva a pagar para confirmar: *${money(p.anticipo)}*\n`
    if (p.tipo === 'apartado') t += `Se aparta ${DIAS_APARTADO} días desde que se confirma el pago. Pasado ese plazo sin recoger, se cancela.\n`
    t += `Saldo a la entrega: ${money(p.total - p.anticipo)}\n`
  }
  return t
}

export function reciboTexto(r, cliente) {
  let t = `*Lessa Joyería*\nCliente: ${cliente.nombre}\n\n`
  t += r.pedidos.map(bloque).join('\n')
  t += `\n*Total general: ${money(r.total)}*\n\nGracias por tu preferencia.`
  return t
}
