import { fotoUrl, money } from './store'
import { preciosPorSku, conCostos, totales, COSTO_ANTERIOR } from './costosProveedor'
import { MARCA, COLORES } from '../config'

async function aDataUrl(url) {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const b = await r.blob()
    if (!b.type.startsWith('image/')) return null
    return await new Promise((res) => {
      const fr = new FileReader()
      fr.onload = () => res(fr.result)
      fr.readAsDataURL(b)
    })
  } catch {
    return null
  }
}

export async function pdfPedidoProveedor(listaBase, titulo = 'Pedido a proveedor', pct = COSTO_ANTERIOR) {
  const lista = conCostos(listaBase, await preciosPorSku(listaBase.map((i) => i.sku)), pct)
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const logo = await aDataUrl(MARCA.logo)
  const fecha = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
  const hex = COLORES.primary.replace('#', '')
  const rosa = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))

  const dim = logo ? await new Promise((res) => {
    const i = new Image()
    i.onload = () => res({ w: i.naturalWidth || 1, h: i.naturalHeight || 1 })
    i.onerror = () => res({ w: 1, h: 1 })
    i.src = logo
  }) : { w: 1, h: 1 }
  const altoLogo = 22
  const anchoLogo = Math.min(70, altoLogo * dim.w / dim.h)
  const xTexto = 14 + (logo ? anchoLogo + 6 : 0)

  const encabezado = () => {
    if (logo) doc.addImage(logo, MARCA.logo.toLowerCase().endsWith('.png') ? 'PNG' : 'JPEG', 14, 10, anchoLogo, altoLogo)
    doc.setTextColor(...rosa).setFont('helvetica', 'bold').setFontSize(18).text(titulo, xTexto, 20)
    doc.setTextColor(90).setFont('helvetica', 'normal').setFontSize(10).text(`${MARCA.nombre} | ${fecha}`, xTexto, 27)
    doc.setFillColor(...rosa).rect(14, 36, 182, 7, 'F')
    doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(9)
    doc.setFontSize(8)
    doc.text('Foto', 16, 41); doc.text('Código', 40, 41); doc.text('Descripción', 62, 41); doc.text('Cant.', 108, 41)
    doc.text('P. unit.', 122, 41); doc.text('P. total', 140, 41); doc.text('Costo u.', 160, 41); doc.text('Costo tot.', 178, 41)
    return 46
  }

  let y = encabezado()
  for (const it of lista) {
    if (y + 20 > 282) { doc.addPage(); y = encabezado() }
    const foto = await aDataUrl(fotoUrl(it.sku))
    if (foto) {
      try { doc.addImage(foto, 'JPEG', 15, y, 22, 16.5) } catch { /* sin foto */ }
    }
    doc.setTextColor(30).setFont('helvetica', 'bold').setFontSize(9).text(String(it.sku), 40, y + 8, { maxWidth: 21 })
    doc.setFont('helvetica', 'normal').setFontSize(8).text(String(it.nombre), 62, y + 8, { maxWidth: 44 })
    doc.setFont('helvetica', 'bold').setFontSize(11).text(String(it.cantidad), 110, y + 9, { align: 'center' })
    doc.setFont('helvetica', 'normal').setFontSize(8)
    doc.text(money(it.precio), 122, y + 9); doc.text(money(it.precioTotal), 140, y + 9)
    doc.text(money(it.costo), 160, y + 9); doc.text(money(it.costoTotal), 178, y + 9)
    doc.setDrawColor(220).line(14, y + 19, 196, y + 19)
    y += 20
  }
  const t = totales(lista)
  if (y + 24 > 285) { doc.addPage(); y = 20 }
  doc.setTextColor(...rosa).setFont('helvetica', 'bold').setFontSize(12)
  doc.text(`Total: ${t.modelos} modelo(s), ${t.piezas} pieza(s)`, 14, y + 8)
  doc.setFontSize(10)
  doc.text(`Precio total: ${money(t.precioTotal)}`, 14, y + 15)
  doc.text(`Costo total (${pct}% del precio): ${money(t.costoTotal)}`, 14, y + 21)
  doc.save(`pedido-proveedor-${new Date().toISOString().slice(0, 10)}.pdf`)
}
