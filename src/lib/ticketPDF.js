import { jsPDF } from 'jspdf'
import { LOGO_B64 } from './logoB64.js'

const TEL = '449-493-5377'
const QR_URL = 'https://chilakileando.netlify.app/encuesta'
const W = 58
const MARGIN = 4

const fmtM = v => '$' + Math.round(v||0).toLocaleString('es-MX')

async function loadQRImage() {
  return new Promise((res) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width; canvas.height = img.height
      canvas.getContext('2d').drawImage(img, 0, 0)
      res(canvas.toDataURL('image/png'))
    }
    img.onerror = () => res(null)
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(QR_URL)}`
  })
}

export async function generarTicketPDF({ comanda, items, total, canal, descuento=0 }) {
  const doc = new jsPDF({ unit:'mm', format:[W, 260], orientation:'portrait' })
  let y = MARGIN

  // LOGO
  try {
    doc.addImage(LOGO_B64, 'PNG', (W-22)/2, y, 22, 22)
    y += 24
  } catch(e) {}

  // ENCABEZADO
  doc.setFontSize(7.5)
  doc.text('Aguascalientes, Ags.', W/2, y, { align:'center' }); y += 4
  doc.setTextColor(37, 211, 102)
  doc.text('WhatsApp: ' + TEL, W/2, y, { align:'center' }); y += 5
  doc.setTextColor(0, 0, 0)

  doc.setDrawColor(180); doc.line(MARGIN, y, W-MARGIN, y); y += 3

  // INFO
  const fecha = new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' })
  const hora  = new Date().toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' })
  doc.setFontSize(7.5)
  doc.text('Folio: ' + (comanda.label||''), MARGIN, y); y += 4
  doc.text('Fecha: ' + fecha + '   Hora: ' + hora, MARGIN, y); y += 4
  if (comanda.cliente) { doc.text('Cliente: ' + comanda.cliente, MARGIN, y); y += 4 }
  doc.text('Canal: ' + (canal||''), MARGIN, y); y += 4

  doc.setDrawColor(180); doc.line(MARGIN, y, W-MARGIN, y); y += 3

  // PRODUCTOS
  doc.setFontSize(8)
  items.filter(i => (i.subtotal||i.importe) > 0).forEach(item => {
    const nombre = item.plato?.nombre || item.producto || ''
    const monto  = item.subtotal || item.importe || 0
    const qty    = item.qty || item.unidades || 1
    // Nombre puede ser largo — truncar a 24 chars
    const nombreCorto = nombre.length > 24 ? nombre.substring(0, 23) + '.' : nombre
    const linea = qty + 'x ' + nombreCorto
    doc.text(linea, MARGIN, y)
    doc.text(fmtM(monto), W-MARGIN, y, { align:'right' })
    y += 4.5
  })

  doc.setDrawColor(180); doc.line(MARGIN, y, W-MARGIN, y); y += 3

  // TOTALES
  const totalFinal = total - (descuento||0)
  if (descuento > 0) {
    doc.setFontSize(8)
    doc.text('Subtotal', MARGIN, y)
    doc.text(fmtM(total), W-MARGIN, y, { align:'right' }); y += 4
    doc.setTextColor(220, 50, 50)
    doc.text('Descuento', MARGIN, y)
    doc.text('-' + fmtM(descuento), W-MARGIN, y, { align:'right' }); y += 4
    doc.setTextColor(0)
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('TOTAL', MARGIN, y)
  doc.text(fmtM(totalFinal), W-MARGIN, y, { align:'right' }); y += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(120)
  doc.text('Propina sugerida (15%): ' + fmtM(Math.round(totalFinal * 0.15)), W/2, y, { align:'center' }); y += 5
  doc.setTextColor(0)

  doc.setDrawColor(180); doc.line(MARGIN, y, W-MARGIN, y); y += 4

  // MENSAJE FINAL
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Gracias por tu preferencia!', W/2, y, { align:'center' }); y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('Te esperamos nuevamente', W/2, y, { align:'center' }); y += 6

  // QR
  doc.setFontSize(8)
  doc.text('Comparte tu experiencia:', W/2, y, { align:'center' }); y += 4
  try {
    const qrData = await loadQRImage()
    if (qrData) {
      const qrW = 30
      doc.addImage(qrData, 'PNG', (W-qrW)/2, y, qrW, qrW)
      y += qrW + 2
    }
  } catch(e) {}
  doc.setFontSize(6.5)
  doc.setTextColor(120)
  doc.text('chilakileando.netlify.app/encuesta', W/2, y, { align:'center' })
  doc.setTextColor(0)

  return doc
}

export async function descargarTicketPDF(params) {
  const doc = await generarTicketPDF(params)
  const folio = params.comanda?.label || 'ticket'
  doc.save('Ticket-' + folio + '.pdf')
  return doc
}

export async function compartirTicketPDF(params) {
  const doc = await generarTicketPDF(params)
  const blob = doc.output('blob')
  const folio = params.comanda?.label || 'ticket'
  const file = new File([blob], 'Ticket-' + folio + '.pdf', { type:'application/pdf' })
  // Web Share API — funciona en Android Chrome
  if (navigator.canShare && navigator.canShare({ files:[file] })) {
    await navigator.share({ files:[file], title:'Ticket Chilakileando', text:'Tu ticket de compra' })
    return true
  }
  // Fallback — descargar
  doc.save('Ticket-' + folio + '.pdf')
  return false
}
