import React, { useState } from 'react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

export default function ExportBtn({ titulo, getElement }) {
  const [loading, setLoading] = useState(false)

  const exportar = async (compartir = false) => {
    setLoading(true)
    try {
      const el = getElement ? getElement() : document.querySelector('.content')
      if (!el) return

      const canvas = await html2canvas(el, {
        scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true,
        scrollX: 0, scrollY: 0,
        width: el.scrollWidth, height: el.scrollHeight
      })

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const W = 210, H = 297, m = 10

      // Header
      try {
        const blob = await fetch('/logo.png').then(r => r.blob())
        const b64 = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob) })
        pdf.addImage(b64, 'PNG', m, m, 13, 13)
      } catch(e) {}
      pdf.setFontSize(12); pdf.setFont('helvetica','bold'); pdf.setTextColor(34,34,34)
      pdf.text("Chilakileando la Gordi'nflada", m+17, m+6)
      pdf.setFontSize(9); pdf.setFont('helvetica','normal'); pdf.setTextColor(100,100,100)
      pdf.text(titulo || 'Reporte', m+17, m+11)
      pdf.setFontSize(7)
      pdf.text(new Date().toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'}), W-m, m+6, {align:'right'})
      pdf.setDrawColor(220,220,220); pdf.line(m, m+17, W-m, m+17)

      // Imagen paginada
      const contentW = W - 2*m
      const imgH = (canvas.height / canvas.width) * contentW
      const startY = m + 21
      const pageH = H - startY - m

      if (imgH <= pageH) {
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', m, startY, contentW, imgH)
      } else {
        const pxPerPage = Math.floor(canvas.height * (pageH / imgH))
        let offsetPx = 0, page = 0
        while (offsetPx < canvas.height) {
          if (page > 0) pdf.addPage()
          const sliceCanvas = document.createElement('canvas')
          sliceCanvas.width = canvas.width
          sliceCanvas.height = Math.min(pxPerPage, canvas.height - offsetPx)
          sliceCanvas.getContext('2d').drawImage(canvas, 0, -offsetPx)
          const sliceH = (sliceCanvas.height / canvas.width) * contentW
          pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.85), 'JPEG', m, page === 0 ? startY : m, contentW, sliceH)
          offsetPx += pxPerPage; page++
        }
      }

      // Pie
      const pages = pdf.getNumberOfPages()
      for (let i = 1; i <= pages; i++) {
        pdf.setPage(i)
        pdf.setFontSize(6); pdf.setTextColor(180,180,180)
        pdf.text("Chilakileando ERP · BP&S Analytics · greyes@bpst.me", W/2, H-5, {align:'center'})
        pdf.text(`${i}/${pages}`, W-m, H-5, {align:'right'})
      }

      const fecha = new Date().toISOString().slice(0,10)
      const fileName = `Chilakileando-${(titulo||'reporte').replace(/\s+/g,'-')}-${fecha}.pdf`

      if (compartir) {
        const blob = pdf.output('blob')
        const file = new File([blob], fileName, { type:'application/pdf' })
        if (navigator.share && navigator.canShare?.({ files:[file] })) {
          await navigator.share({ files:[file], title:fileName })
        } else {
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a'); a.href=url; a.download=fileName; a.click()
          URL.revokeObjectURL(url)
        }
      } else {
        pdf.save(fileName)
      }
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  return (
    <div style={{display:'flex',gap:5}}>
      <button onClick={()=>exportar(false)} disabled={loading}
        style={{padding:'4px 11px',borderRadius:99,fontSize:11,cursor:loading?'not-allowed':'pointer',
          border:'0.5px solid var(--border-md)',background:'transparent',color:'var(--text2)'}}>
        {loading ? '⏳' : '⬇ PDF'}
      </button>
      <button onClick={()=>exportar(true)} disabled={loading}
        style={{padding:'4px 11px',borderRadius:99,fontSize:11,cursor:loading?'not-allowed':'pointer',
          border:'0.5px solid #25D366',background:'transparent',color:'#25D366'}}>
        {loading ? '⏳' : '📤 Compartir'}
      </button>
    </div>
  )
}
