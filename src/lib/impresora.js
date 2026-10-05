const ESC = String.fromCharCode(27)
const GS  = String.fromCharCode(29)

// Comandos basicos compatibles con la mayoria de termicas
const CMD = {
  init:        ESC + '@',
  alignCenter: ESC + 'a' + String.fromCharCode(1),
  alignLeft:   ESC + 'a' + String.fromCharCode(0),
  bold:        ESC + 'E' + String.fromCharCode(1),
  boldOff:     ESC + 'E' + String.fromCharCode(0),
  feed:        (n=1) => String.fromCharCode(10).repeat(n),
  cut:         GS  + 'V' + String.fromCharCode(65) + String.fromCharCode(3),
}

function center(txt, width=32) {
  const pad = Math.max(0, Math.floor((width - txt.length) / 2))
  return ' '.repeat(pad) + txt
}

function row(left, right, width=30) {
  const space = Math.max(1, width - left.length - right.length)
  return left + ' '.repeat(space) + right
}

function separator(char='-', len=32) {
  return char.repeat(len)
}

export function generarComanda({ comanda, items }) {
  const hora = new Date().toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' })
  const { label, cliente, ronda } = comanda

  const lineas = []
  lineas.push(CMD.init)
  lineas.push(CMD.alignCenter)
  lineas.push(CMD.bold + 'CHILAKILEANDO' + CMD.boldOff)
  lineas.push('-- COCINA --')
  lineas.push(separator('='))
  lineas.push(CMD.bold + center(label) + CMD.boldOff)
  if (cliente) lineas.push(center('Cliente: ' + cliente))
  if (ronda > 0) lineas.push(CMD.bold + center('Ronda ' + ronda) + CMD.boldOff)
  lineas.push(center(hora))
  lineas.push(separator('='))
  lineas.push(CMD.alignLeft)

  items.forEach(item => {
    lineas.push(CMD.bold + item.qty + 'x  ' + item.plato.nombre + CMD.boldOff)
    if (item.desc) {
      item.desc.split(' | ').forEach(p => lineas.push('   ' + p.substring(0, 28)))
    }
    lineas.push('')
  })

  lineas.push(separator())
  lineas.push(CMD.feed(4))
  lineas.push(CMD.cut)

  return lineas.join('\n')
}

export function generarTicket({ comanda, items, total, canal, descuento=0 }) {
  const hora  = new Date().toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' })
  const fecha = new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' })
  const totalFinal = total - (descuento||0)
  const propina = Math.round(totalFinal * 0.15)
  const fmtM = v => '$' + Math.round(v||0).toLocaleString('es-MX')

  const lineas = []
  lineas.push(CMD.init)
  lineas.push(CMD.alignCenter)
  lineas.push(CMD.bold + 'CHILAKILEANDO' + CMD.boldOff)
  lineas.push('Desayunos y Antojos')
  lineas.push('Aguascalientes, Ags.')
  lineas.push('WhatsApp: 449-493-5377')
  lineas.push(separator('='))
  lineas.push(CMD.alignLeft)
  lineas.push('Folio: ' + (comanda.label||''))
  lineas.push('Fecha: ' + fecha + '  ' + hora)
  if (comanda.cliente) lineas.push('Cliente: ' + comanda.cliente)
  lineas.push('Canal: ' + (canal||''))
  lineas.push(separator())

  items.filter(i => (i.subtotal||0) > 0).forEach(item => {
    const nombre = (item.plato?.nombre || '').substring(0, 18)
    lineas.push(row(item.qty + 'x ' + nombre, fmtM(item.subtotal)))
  })

  lineas.push(separator())
  if (descuento > 0) {
    lineas.push(row('Subtotal', fmtM(total)))
    lineas.push(row('Descuento', '-' + fmtM(descuento)))
  }
  lineas.push(CMD.bold + row('Total:', fmtM(totalFinal)) + CMD.boldOff)
  lineas.push(separator())
  lineas.push(CMD.alignCenter)
  lineas.push('Propina sugerida (15%): ' + fmtM(propina))
  lineas.push(separator())
  lineas.push(CMD.bold + 'Gracias por tu preferencia!' + CMD.boldOff)
  lineas.push('Te esperamos nuevamente')
  lineas.push('')
  lineas.push('Comparte tu experiencia:')
  lineas.push('chilakileando.netlify.app/encuesta')
  lineas.push(CMD.alignLeft)
  lineas.push(CMD.feed(4))
  lineas.push(CMD.cut)

  return lineas.join('\n')
}

export function imprimir(escposString) {
  try {
    const textoPlano = escposString
      .replace(/[\x00-\x09\x0b-\x1f\x7f]/g, '')
    // RawBT 7.x usa este formato
    const url = 'rawbt://print?text=' + encodeURIComponent(textoPlano)
    window.location.href = url
    return true
  } catch(e) {
    console.error('Error impresora:', e)
    return false
  }
}
