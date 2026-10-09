export const WA_TIENDA = '524493876360'
export const WA_TIENDA_VISIBLE = '+52 449 387 6360'
export const EMAIL_TIENDA = 'lessa.joyeria07@gmail.com'
export const CLABE = '638180010154516719'
export const WEB_TIENDA = 'https://lessa-joyeria.netlify.app'
export const INSTAGRAM = '@lessa_joyeria'
export const INSTAGRAM_URL = 'https://www.instagram.com/lessa_joyeria'
export const DIAS_PREORDEN = 15
export const DIAS_APARTADO = 15
export const PCT_ANTICIPO = 30

export const money = (n) =>
  '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const fotoUrl = (sku) => `/fotos/${encodeURIComponent(sku)}.jpg`
export const fotoGrandeUrl = (sku) => `/fotos/grande/${encodeURIComponent(sku)}.jpg`

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
    t += `*Encargo ${p.numero_pedido}* (llega en ~${DIAS_PREORDEN} días)\n${lineas}\n`
  } else {
    t += `*${p.mostrador ? 'Venta' : 'Apartado'} ${p.numero_pedido}*\n${lineas}\n`
  }
  if (p.descuento > 0) t += `Descuento: -${money(p.descuento)}\n`
  t += `${p.validado || p.mostrador ? 'Total' : 'Total estimado'}: ${money(p.total)}\n`
  if (!p.mostrador) t += `${p.validado ? 'Reserva a pagar' : 'Reserva estimada'}: ${money(p.anticipo)}\n`
  return t
}

export function reciboTexto(r, cliente) {
  let t = `*Lessa Joyería*\nCliente: ${cliente.nombre}\n\n`
  t += r.pedidos.map(bloque).join('\n')
  t += `\n*Total general: ${money(r.total)}*\n`
  if (cliente.solicitud) t += `\nSolicitud de descuento / código: ${cliente.solicitud}\n`
  if (cliente.entrega === 'envio') t += `\nEnvío local a: ${cliente.direccion}\n`
  if (r.pedidos.some((p) => !p.validado && !p.mostrador)) {
    t += `\nLessa validará tu pedido (descuento, envío y fecha de entrega) y te confirmará el valor final y cómo pagar la reserva. No hagas transferencias hasta recibir esa confirmación.\n`
  } else if (!r.pedidos.every((p) => p.mostrador)) {
    t += `\nPara confirmar, transfiere la reserva a la CLABE *${CLABE}* y envía tu comprobante por WhatsApp indicando tu número de recibo.\n`
  }
  t += `\nGracias por tu preferencia.`
  return t
}

// Mensaje que Lessa manda al cliente cuando valida el pedido (valor neto, envío y fecha).
export function mensajeConfirmacion(p) {
  const lineas = p.items.map((i) => `- ${i.nombre} x${i.cantidad}  ${money(i.precio * i.cantidad)}`).join('\n')
  let t = `*Lessa Joyería*\nHola ${p.nombre_cliente}, validamos tu pedido *${p.numero_pedido}*:\n\n${lineas}\n\nSubtotal: ${money(p.subtotal)}\n`
  if (Number(p.descuento) > 0) t += `Descuento: -${money(p.descuento)}\n`
  if (Number(p.envio) > 0) t += `Envío local: ${money(p.envio)}\n`
  t += `*Valor neto: ${money(p.total)}*\n\n`
  t += `Reserva a pagar para confirmar: *${money(p.anticipo_requerido)}*\nSaldo a la entrega: ${money(Number(p.total) - Number(p.anticipo_requerido))}\n`
  const f = p.fecha_entrega || (p.tipo === 'encargo' ? p.entrega_estimada : null)
  if (f) t += `Fecha de entrega: ${fechaCorta(f)}\n`
  else if (p.tipo === 'apartado') t += `Tu pieza se aparta ${DIAS_APARTADO} días desde que confirmemos el pago.\n`
  t += `\nTransfiere la reserva a la CLABE *${CLABE}* y envíanos tu comprobante por WhatsApp indicando tu número de pedido.\n\nGracias por tu preferencia.`
  t += `\n\n*Contacto Lessa Joyería*\nInstagram: ${INSTAGRAM} (${INSTAGRAM_URL})\nPágina web: ${WEB_TIENDA}\nWhatsApp: ${WA_TIENDA_VISIBLE}\nCorreo: ${EMAIL_TIENDA}`
  return t
}

// Mensaje que el cliente envia a Lessa por WhatsApp para que Lessa revise el pedido en el panel.
export function pedidoParaLessa(r, cliente) {
  let t = `*NUEVO PEDIDO LESSA*\n`
  t += r.pedidos.map((p) => `Pedido ${p.numero_pedido} (${p.tipo === 'encargo' ? 'encargo' : 'apartado'})`).join('\n')
  t += `\n\n*Cliente:* ${cliente.nombre}\n*WhatsApp:* ${cliente.whatsapp}\n*Correo:* ${cliente.email}\n\n`
  t += r.pedidos.map((p) => p.items.map((i) => `- ${i.nombre} x${i.cantidad}  ${money(i.precio * i.cantidad)}`).join('\n')).join('\n')
  t += `\n\n*Total estimado: ${money(r.total)}*\n`
  t += `*Entrega:* ${cliente.entrega === 'envio' ? `Envío local a ${cliente.direccion}` : 'Recoger'}\n`
  if (cliente.solicitud) t += `*Código / solicitud de descuento:* ${cliente.solicitud}\n`
  if (cliente.notas) t += `*Notas:* ${cliente.notas}\n`
  t += `\nPor favor valida mi pedido (descuento, envío y fecha de entrega) y confírmame el valor final.`
  return t
}
