import { MARCA, CONTACTO } from '../config'

export const WA_TIENDA = CONTACTO.whatsapp
export const WA_TIENDA_VISIBLE = CONTACTO.whatsappVisible
export const EMAIL_TIENDA = CONTACTO.email
export const CLABE = CONTACTO.clabe
export const WEB_TIENDA = CONTACTO.web
export const INSTAGRAM = CONTACTO.instagram
export const INSTAGRAM_URL = CONTACTO.instagramUrl
export const DIAS_PREORDEN = 15
export const DIAS_ENCARGO_NORMAL = 30
export const DIAS_ENCARGO_URGENTE = 15
export const SERVICIOS_URGENTES = [
  { id: 'guia', nombre: 'Guía prepagada (plataformas como EnviaYa)', rango: '$110 a $160', tiempo: '2 a 4 días hábiles' },
  { id: 'terrestre', nombre: 'Terrestre estándar (Estafeta, DHL o FedEx)', rango: '$180 a $250', tiempo: '2 a 3 días hábiles' },
  { id: 'express', nombre: 'Express, siguiente día (Estafeta, DHL o FedEx)', rango: '$280 a $350', tiempo: '1 día hábil' },
]
export const servicioPorId = (id) => SERVICIOS_URGENTES.find((x) => x.id === id)
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
  try { return sessionStorage.getItem(`${MARCA.claveCarrito}_admin_pass`) || '' } catch { return '' }
}
export const setAdminPass = (p) => {
  try { p ? sessionStorage.setItem(`${MARCA.claveCarrito}_admin_pass`, p) : sessionStorage.removeItem(`${MARCA.claveCarrito}_admin_pass`) } catch { /* sin storage */ }
}

export const fechaCorta = (d) => {
  if (!d) return ''
  const s = String(d)
  const dt = new Date(s.length === 10 ? s + 'T12:00:00' : s)
  return dt.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
}

export const mensajeError = (err) =>
  /Could not find the function|schema cache/i.test(err?.message || '')
    ? 'Falta ejecutar el SQL de instalación en Supabase (archivo instalar.sql).'
    : err?.message || 'Error desconocido'

function bloque(p) {
  const lineas = p.items.map((i) => `- ${i.nombre} x${i.cantidad}  ${money(i.precio * i.cantidad)}`).join('\n')
  let t = ''
  if (p.tipo === 'encargo') {
    const sv = servicioPorId(p.servicio_envio)
    t += p.urgente
      ? `*Encargo urgente ${p.numero_pedido}* (máximo ${DIAS_ENCARGO_URGENTE} días desde que se confirma la reserva, con envío${sv ? `: ${sv.nombre}, de ${sv.rango}` : ''})\n${lineas}\n`
      : `*Encargo ${p.numero_pedido}* (aprox. ${DIAS_ENCARGO_NORMAL} días desde que se confirma la reserva, sin costo de envío)\n${lineas}\n`
  } else {
    t += `*${p.mostrador ? 'Venta' : 'Apartado'} ${p.numero_pedido}*\n${lineas}\n`
  }
  if (p.descuento > 0) t += `Descuento: -${money(p.descuento)}\n`
  t += `${p.validado || p.mostrador ? 'Total' : 'Total estimado'}: ${money(p.total)}\n`
  if (!p.mostrador) t += `${p.validado ? 'Reserva a pagar' : 'Reserva estimada'}: ${money(p.anticipo)}\n`
  return t
}

export function reciboTexto(r, cliente) {
  let t = `*${MARCA.nombre}*\nCliente: ${cliente.nombre}\n\n`
  t += r.pedidos.map(bloque).join('\n')
  t += `\n*Total general: ${money(r.total)}*\n`
  if (cliente.solicitud) t += `\nSolicitud de descuento / código: ${cliente.solicitud}\n`
  if (cliente.entrega === 'envio') t += `\nEnvío local a: ${cliente.direccion}\n`
  if (r.pedidos.some((p) => !p.validado && !p.mostrador)) {
    t += `\n${MARCA.nombreCorto} validará tu pedido (descuento, envío y fecha de entrega) y te confirmará el valor final y cómo pagar la reserva. No hagas transferencias hasta recibir esa confirmación.\n`
  } else if (!r.pedidos.every((p) => p.mostrador)) {
    t += `\nPara confirmar, transfiere la reserva a la CLABE *${CLABE}* y envía tu comprobante por WhatsApp indicando tu número de recibo.\n`
  }
  t += `\nGracias por tu preferencia.`
  return t
}

// Mensaje que la tienda manda al cliente cuando valida el pedido (valor neto, envío y fecha).
export function mensajeConfirmacion(p) {
  const lineas = p.items.map((i) => `- ${i.nombre} x${i.cantidad}  ${money(i.precio * i.cantidad)}`).join('\n')
  let t = `*${MARCA.nombre}*\nHola ${p.nombre_cliente}, validamos tu pedido *${p.numero_pedido}*:\n\n${lineas}\n\nSubtotal: ${money(p.subtotal)}\n`
  if (Number(p.descuento) > 0) t += `Descuento: -${money(p.descuento)}\n`
  if (Number(p.envio) > 0) t += `Envío local: ${money(p.envio)}\n`
  t += `*Valor neto: ${money(p.total)}*\n`
  if (p.tipo === 'encargo') {
    const sv = servicioPorId(p.servicio_envio)
    t += p.urgente
      ? `Modalidad: *urgente*, máximo ${DIAS_ENCARGO_URGENTE} días desde que confirmemos tu reserva${sv ? ` (envío ${sv.nombre.split(' (')[0].toLowerCase()})` : ''}\n`
      : `Modalidad: siguiente pedido normal, aprox. ${DIAS_ENCARGO_NORMAL} días desde que confirmemos tu reserva, sin costo de envío\n`
  }
  t += `\n`
  t += `Reserva a pagar para confirmar: *${money(p.anticipo_requerido)}*\nSaldo a la entrega: ${money(Number(p.total) - Number(p.anticipo_requerido))}\n`
  const f = p.fecha_entrega || (p.tipo === 'encargo' ? p.entrega_estimada : null)
  if (f) t += `Fecha de entrega: ${fechaCorta(f)}\n`
  else if (p.tipo === 'apartado') t += `Tu pieza se aparta ${DIAS_APARTADO} días desde que confirmemos el pago.\n`
  t += `\nTransfiere la reserva a la CLABE *${CLABE}* y envíanos tu comprobante por WhatsApp indicando tu número de pedido.\n\nGracias por tu preferencia.`
  t += `\n\n*Contacto ${MARCA.nombre}*\nInstagram: ${INSTAGRAM} (${INSTAGRAM_URL})\nPágina web: ${WEB_TIENDA}\nWhatsApp: ${WA_TIENDA_VISIBLE}\nCorreo: ${EMAIL_TIENDA}`
  return t
}

// Mensaje que el cliente envia a la tienda por WhatsApp para que la tienda revise el pedido en el panel.
export function pedidoParaTienda(r, cliente) {
  let t = `*NUEVO PEDIDO ${MARCA.nombreCorto.toUpperCase()}*\n`
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
