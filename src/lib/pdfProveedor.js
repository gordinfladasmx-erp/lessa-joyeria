import { fotoUrl } from './store'
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

export async function pdfPedidoProveedor(lista, titulo = 'Pedido a proveedor') {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const logo = await aDataUrl(MARCA.logo)
  const fecha = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
  const hex = COLORES.primary.replace('#', '')
  const rosa = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))

  const encabezado = () => {
    if (logo) doc.addImage(logo, MARCA.logo.toLowerCase().endsWith('.png') ? 'PNG' : 'JPEG', 14, 10, 22, 22)
    doc.setTextColor(...rosa).setFont('helvetica', 'bold').setFontSize(18).text(titulo, 42, 20)
    doc.setTextColor(90).setFont('helvetica', 'normal').setFontSize(10).text(`${MARCA.nombre} | ${fecha}`, 42, 27)
    doc.setFillColor(...rosa).rect(14, 36, 182, 7, 'F')
    doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(9)
    doc.text('Foto', 16, 41); doc.text('Código', 46, 41); doc.text('Descripción', 72, 41); doc.text('Cantidad', 180, 41)
    return 46
  }

  let y = encabezado()
  for (const it of lista) {
    if (y + 20 > 282) { doc.addPage(); y = encabezado() }
    const foto = await aDataUrl(fotoUrl(it.sku))
    if (foto) {
      try { doc.addImage(foto, 'JPEG', 15, y, 22, 16.5) } catch { /* sin foto */ }
    }
    doc.setTextColor(30).setFont('helvetica', 'bold').setFontSize(11).text(String(it.sku), 46, y + 8)
    doc.setFont('helvetica', 'normal').setFontSize(10).text(String(it.nombre), 72, y + 8, { maxWidth: 100 })
    doc.setFont('helvetica', 'bold').setFontSize(13).text(String(it.cantidad), 186, y + 9, { align: 'center' })
    doc.setDrawColor(220).line(14, y + 19, 196, y + 19)
    y += 20
  }
  const piezas = lista.reduce((s, i) => s + i.cantidad, 0)
  if (y + 12 > 285) { doc.addPage(); y = 20 }
  doc.setTextColor(...rosa).setFont('helvetica', 'bold').setFontSize(12)
  doc.text(`Total: ${lista.length} modelo(s), ${piezas} pieza(s)`, 14, y + 8)
  doc.save(`pedido-proveedor-${new Date().toISOString().slice(0, 10)}.pdf`)
}
