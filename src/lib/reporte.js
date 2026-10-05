import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

const fmtM = v => '$'+Math.round(v||0).toLocaleString('es-MX')

async function capturarChart(id) {
  const el = document.getElementById(id)
  if (!el) return null
  try {
    const canvas = await html2canvas(el, { scale:2.5, backgroundColor:'#ffffff', logging:false, useCORS:true })
    return { img: canvas.toDataURL('image/jpeg', 0.85), w: canvas.width, h: canvas.height }
  } catch(e) { return null }
}

export async function generarReportePDF({ kpi, series, cats, gastosCat, canales, rango, granularidad }) {
  const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' })
  const W = 210, H = 297, margin = 12
  let y = margin

  // LOGO
  try {
    const resp = await fetch('/logo.png')
    const blob = await resp.blob()
    const b64  = await new Promise(res => { const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(blob) })
    pdf.addImage(b64, 'PNG', margin, y, 18, 18)
  } catch(e) {}

  // ENCABEZADO
  pdf.setFontSize(14); pdf.setFont('helvetica','bold'); pdf.setTextColor(34,34,34)
  pdf.text("Chilakileando la Gordi'nflada", margin+22, y+7)
  pdf.setFontSize(8); pdf.setFont('helvetica','normal'); pdf.setTextColor(100,100,100)
  pdf.text('Reporte de resultados · '+new Date().toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'}), margin+22, y+13)
  pdf.text('Periodo: '+rango+' · Ver por: '+granularidad, margin+22, y+18)
  y += 24
  pdf.setDrawColor(220,220,220); pdf.line(margin, y, W-margin, y); y += 7

  // KPIs
  pdf.setFontSize(9); pdf.setFont('helvetica','bold'); pdf.setTextColor(34,34,34)
  pdf.text('Resumen del periodo', margin, y); y += 5

  const kpis = [
    { label:'Ventas', val:fmtM(kpi?.ventas), color:[55,138,221] },
    { label:'Unidades', val:(kpi?.unidades||0).toLocaleString()+' uds', color:[80,80,80] },
    { label:'Gastos', val:fmtM(kpi?.gastos), color:[226,75,74] },
    { label:'Utilidad', val:fmtM(kpi?.utilidad), color:kpi?.utilidad>=0?[29,158,117]:[226,75,74] },
    { label:'Margen', val:(kpi?.margen||0)+'%', color:kpi?.margen>=0?[29,158,117]:[226,75,74] },
  ]
  const kW = (W-2*margin)/kpis.length
  kpis.forEach((k,i)=>{
    const x = margin+i*kW
    pdf.setFillColor(246,248,250); pdf.roundedRect(x+1,y,kW-2,16,2,2,'F')
    pdf.setFontSize(6); pdf.setFont('helvetica','normal'); pdf.setTextColor(130,130,130)
    pdf.text(k.label, x+kW/2, y+5, {align:'center'})
    pdf.setFontSize(9); pdf.setFont('helvetica','bold'); pdf.setTextColor(...k.color)
    pdf.text(k.val, x+kW/2, y+12, {align:'center'})
  })
  y += 20

  // GRÁFICAS
  const charts = [
    { id:'chart-principal', label:'Ingresos · Gastos · Utilidad' },
    { id:'chart-costo',     label:'Costo de ventas vs Ingresos' },
    { id:'chart-familias',  label:'Ingresos por familia' },
    { id:'chart-unidades',  label:'Unidades por familia' },
  ]

  for (const ch of charts) {
    const cap = await capturarChart(ch.id)
    if (!cap) continue
    const imgH = (cap.h/cap.w)*(W-2*margin)
    if (y+imgH+10 > H-margin) { pdf.addPage(); y=margin }
    pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(60,60,60)
    pdf.text(ch.label, margin, y); y+=3
    pdf.addImage(cap.img, 'JPEG', margin, y, W-2*margin, imgH)
    y += imgH+6
  }

  // TABLAS
  const addTabla = (titulo, filas) => {
    if (!filas?.length) return
    if (y+filas.length*5+14 > H-margin) { pdf.addPage(); y=margin }
    pdf.setFontSize(9); pdf.setFont('helvetica','bold'); pdf.setTextColor(34,34,34)
    pdf.text(titulo, margin, y); y+=4
    filas.forEach(([a,b,c])=>{
      if (y>H-margin-5) { pdf.addPage(); y=margin }
      pdf.setFontSize(7); pdf.setFont('helvetica','normal'); pdf.setTextColor(60,60,60)
      pdf.text(a, margin+2, y)
      pdf.text(b, W-margin-20, y, {align:'right'})
      if(c) pdf.text(c, W-margin, y, {align:'right'})
      y+=5
    })
    y+=3
  }

  if (cats?.length) {
    const tot = cats.reduce((s,c)=>s+c.importe,0)
    addTabla('Ventas por familia', cats.map(c=>[c.categoria, fmtM(c.importe), tot>0?Math.round(c.importe/tot*100)+'%':'']))
  }
  if (canales?.length) {
    const tot = canales.reduce((s,c)=>s+c.importe,0)
    addTabla('Por canal de venta', canales.map(c=>[c.canal||'Sin dato', fmtM(c.importe), tot>0?Math.round(c.importe/tot*100)+'%':'']))
  }
  if (gastosCat?.length) {
    const tot = gastosCat.reduce((s,g)=>s+g.monto,0)
    addTabla('Gastos por categoria', gastosCat.map(g=>[g.categoria, fmtM(g.monto), tot>0?Math.round(g.monto/tot*100)+'%':'']))
  }

  // PIE
  const pages = pdf.getNumberOfPages()
  for (let i=1;i<=pages;i++) {
    pdf.setPage(i)
    pdf.setFontSize(6); pdf.setTextColor(180,180,180)
    pdf.text("Chilakileando la Gordi'nflada · ERP · chilakileando.netlify.app", W/2, H-5, {align:'center'})
    pdf.text(`Pág ${i}/${pages}`, W-margin, H-5, {align:'right'})
  }

  return pdf
}

export async function descargarReporte(params) {
  const pdf = await generarReportePDF(params)
  pdf.save(`Chilakileando-${new Date().toISOString().slice(0,10)}.pdf`)
}

export async function compartirReporte(params) {
  const pdf = await generarReportePDF(params)
  const blob = pdf.output('blob')
  const fileName = `Chilakileando-${new Date().toISOString().slice(0,10)}.pdf`

  // Intentar Web Share API (funciona en móvil)
  const file = new File([blob], fileName, { type:'application/pdf' })
  if (navigator.share && navigator.canShare?.({ files:[file] })) {
    try {
      await navigator.share({ files:[file], title:'Reporte Chilakileando' })
      return
    } catch(e) {}
  }

  // Fallback desktop: abrir PDF en nueva pestaña para imprimir/compartir
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = fileName; a.click()
  URL.revokeObjectURL(url)
}
