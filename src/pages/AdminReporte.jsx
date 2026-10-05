import React, { useState, useEffect } from 'react'
import { sb } from '../lib/supabase.js'
import { fetchKpiRangoGran } from '../lib/analytics.js'

const fmtM = v => '$'+Math.round(v||0).toLocaleString('es-MX')

const SECCIONES = [
  { id:'kpis',            label:'KPIs principales',          desc:'Ventas, gastos, utilidad, margen' },
  { id:'tendencia',       label:'Tendencia mensual',         desc:'Evolucion mes a mes' },
  { id:'productos',       label:'Top productos',             desc:'Productos mas vendidos' },
  { id:'gastos',          label:'Gastos por categoria',      desc:'Distribucion de gastos' },
  { id:'canales',         label:'Canales de venta',          desc:'Local vs Plataformas' },
  { id:'resumen',         label:'Resumen ejecutivo (IA)',    desc:'Analisis con Claude AI', requiereIA:true },
  { id:'fortalezas',      label:'Fortalezas del negocio (IA)', desc:'Que esta funcionando bien', requiereIA:true },
  { id:'alertas',         label:'Alertas (IA)',              desc:'Que requiere atencion', requiereIA:true },
  { id:'recomendaciones', label:'Recomendaciones (IA)',      desc:'Acciones concretas', requiereIA:true },
  { id:'proyeccion',      label:'Proyeccion (IA)',           desc:'Tendencia 3 meses', requiereIA:true },
]

const RANGOS = [
  { id:'mes',  label:'Ultimo mes' },
  { id:'tri',  label:'Ultimo trimestre' },
  { id:'sem',  label:'Ultimo semestre' },
  { id:'anio', label:'Ultimo año' },
]

export default function AdminReporte() {
  const [rango, setRango] = useState('mes')
  const [usarIA, setUsarIA] = useState(true)
  const [seccionesActivas, setSeccionesActivas] = useState(SECCIONES.map(s=>s.id))
  const [loading, setLoading] = useState(false)
  const [reporte, setReporte] = useState(null)
  const [msg, setMsg] = useState(null)

  const toggleSeccion = (id) => {
    setSeccionesActivas(prev => prev.includes(id) ? prev.filter(s=>s!==id) : [...prev, id])
  }

  const generarReporte = async () => {
    setLoading(true)
    setMsg(null)
    try {
      // 1. Cargar datos del periodo
      const gran = rango==='mes'?'diario':rango==='tri'?'semanal':'mensual'
      const data = await fetchKpiRangoGran(rango, gran, null, null, [])

      // 2. Cargar productos top
      const fechaIni = new Date()
      if (rango==='mes') fechaIni.setMonth(fechaIni.getMonth()-1)
      else if (rango==='tri') fechaIni.setMonth(fechaIni.getMonth()-3)
      else if (rango==='sem') fechaIni.setMonth(fechaIni.getMonth()-6)
      else fechaIni.setFullYear(fechaIni.getFullYear()-1)
      const fechaIniStr = fechaIni.toISOString().slice(0,10)
      const hoyStr = new Date().toISOString().slice(0,10)

      const { data: ventas } = await sb.from('ventas')
        .select('producto,unidades,importe,categoria,canal,fecha')
        .gte('fecha', fechaIniStr).lte('fecha', hoyStr)

      // Agrupar productos
      const prodMap = {}
      ;(ventas||[]).forEach(v => {
        const k = v.producto
        if (!prodMap[k]) prodMap[k] = { producto:k, importe:0, unidades:0 }
        prodMap[k].importe += v.importe||0
        prodMap[k].unidades += v.unidades||0
      })
      const topProductos = Object.values(prodMap).sort((a,b)=>b.importe-a.importe).slice(0,10)

      // Canales
      const canMap = {}
      ;(ventas||[]).forEach(v => {
        const k = v.canal||'Otro'
        if (!canMap[k]) canMap[k] = { canal:k, importe:0 }
        canMap[k].importe += v.importe||0
      })
      const totalCanal = Object.values(canMap).reduce((s,c)=>s+c.importe,0)
      const canales = Object.values(canMap).sort((a,b)=>b.importe-a.importe).map(c=>({ ...c, pct:totalCanal>0?Math.round(c.importe/totalCanal*100):0 }))

      // Gastos por categoria
      const { data: gastos } = await sb.from('gastos')
        .select('categoria_gasto,monto,fecha')
        .gte('fecha', fechaIniStr).lte('fecha', hoyStr)

      const gMap = {}
      ;(gastos||[]).forEach(g => {
        const k = g.categoria_gasto||'Sin categoria'
        if (!gMap[k]) gMap[k] = { categoria:k, monto:0 }
        gMap[k].monto += g.monto||0
      })
      const totalG = Object.values(gMap).reduce((s,c)=>s+c.monto,0)
      const gastosCat = Object.values(gMap).sort((a,b)=>b.monto-a.monto).map(g=>({ ...g, pct:totalG>0?Math.round(g.monto/totalG*100):0 }))

      // Calcular ticket
      const totalUnidades = (ventas||[]).reduce((s,v)=>s+(v.unidades||0),0)
      const totalVentas = (ventas||[]).reduce((s,v)=>s+(v.importe||0),0)

      const datos = {
        periodo: rango,
        kpi: {
          ventas: totalVentas,
          gastos: totalG,
          utilidad: totalVentas - totalG,
          margen: totalVentas>0 ? Math.round((totalVentas-totalG)/totalVentas*100) : 0,
          unidades: totalUnidades,
          ticket: totalUnidades>0 ? Math.round(totalVentas/totalUnidades) : 0,
        },
        tendencia: data,
        topProductos,
        gastosCat,
        canales,
      }

      let analisis = null
      // 3. Si tiene IA y secciones IA activas, llamar al backend
      const seccionesIA = SECCIONES.filter(s=>s.requiereIA && seccionesActivas.includes(s.id)).map(s=>s.id)
      if (usarIA && seccionesIA.length > 0) {
        const { data:{ session } } = await sb.auth.getSession()
        const res = await fetch('/.netlify/functions/generar-reporte', {
          method: 'POST',
          headers: { 'Content-Type':'application/json', Authorization:`Bearer ${session?.access_token}` },
          body: JSON.stringify({ datos, secciones:seccionesIA })
        })
        const result = await res.json()
        if (res.ok) {
          analisis = result.analisis
        } else {
          setMsg({ ok:false, text:`Error IA: ${result.error||'desconocido'}` })
        }
      }

      setReporte({ datos, analisis, secciones:seccionesActivas, generadoEn:new Date(), rango })
    } catch(e) {
      setMsg({ ok:false, text:'Error: '+e.message })
    }
    setLoading(false)
  }

  const descargarPDF = async () => {
    const html2canvas = (await import('html2canvas')).default
    const jsPDF = (await import('jspdf')).default
    const elemento = document.getElementById('reporte-vista')
    if (!elemento) return
    const canvas = await html2canvas(elemento, { scale: 2, backgroundColor:'#ffffff', useCORS:true })
    const imgData = canvas.toDataURL('image/jpeg', 0.85)
    const pdf = new jsPDF('p', 'mm', 'a4')
    const W = 210, H = 297
    const ratio = canvas.height / canvas.width
    const imgH = W * ratio
    let posY = 0
    while (posY < imgH) {
      pdf.addImage(imgData, 'JPEG', 0, -posY, W, imgH)
      posY += H
      if (posY < imgH) pdf.addPage()
    }
    pdf.save(`Reporte_Chilakileando_${new Date().toISOString().slice(0,10)}.pdf`)
  }

  return (
    <div>
      <div style={{marginBottom:16}}>
        <div style={{fontSize:14,fontWeight:600}}>Reportes Estrategicos</div>
        <div style={{fontSize:11,color:'var(--text2)',marginTop:2}}>
          Genera un reporte con datos en vivo y analisis con Claude AI
        </div>
      </div>

      {msg && <div style={{padding:'8px 14px',borderRadius:'var(--r-md)',marginBottom:12,
        background:msg.ok?'#EAF3DE':'#FCEBEB',color:msg.ok?'#3B6D11':'#A32D2D',fontSize:12}}>{msg.text}</div>}

      <div className="card" style={{marginBottom:14}}>
        <div className="ch"><div className="ct">Configuracion del reporte</div></div>

        {/* Rango */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:600,marginBottom:6,color:'var(--text2)'}}>Periodo</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {RANGOS.map(r=>(
              <button key={r.id} onClick={()=>setRango(r.id)}
                style={{padding:'6px 14px',borderRadius:'var(--r-sm)',border:`1.5px solid ${rango===r.id?'#1D9E75':'var(--border-md)'}`,
                  background:rango===r.id?'#1D9E75':'transparent',color:rango===r.id?'#fff':'var(--text2)',
                  cursor:'pointer',fontSize:12,fontWeight:rango===r.id?600:400}}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Checkbox IA */}
        <div style={{marginBottom:14,padding:'10px 12px',background:usarIA?'#FFF4E6':'var(--bg)',borderRadius:'var(--r-md)',border:'1px solid var(--border-md)'}}>
          <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}>
            <input type="checkbox" checked={usarIA} onChange={e=>setUsarIA(e.target.checked)} style={{width:16,height:16}}/>
            <div>
              <div style={{fontSize:12,fontWeight:600}}>Incluir analisis con IA (Claude)</div>
              <div style={{fontSize:10,color:'var(--text3)',marginTop:2}}>Costo aproximado: $0.05 USD por reporte</div>
            </div>
          </label>
        </div>

        {/* Secciones */}
        <div>
          <div style={{fontSize:11,fontWeight:600,marginBottom:6,color:'var(--text2)'}}>Secciones a incluir</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
            {SECCIONES.map(s=>{
              const activa = seccionesActivas.includes(s.id)
              const deshabilitada = s.requiereIA && !usarIA
              return (
                <label key={s.id} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'8px 10px',
                  background:activa && !deshabilitada?'#EAF3DE':'var(--bg)',
                  border:`1px solid ${activa && !deshabilitada?'#1D9E75':'var(--border-md)'}`,
                  borderRadius:'var(--r-sm)',cursor:deshabilitada?'not-allowed':'pointer',opacity:deshabilitada?0.4:1}}>
                  <input type="checkbox" checked={activa} disabled={deshabilitada}
                    onChange={()=>toggleSeccion(s.id)} style={{marginTop:2}}/>
                  <div>
                    <div style={{fontSize:11,fontWeight:500}}>{s.label}</div>
                    <div style={{fontSize:10,color:'var(--text3)',marginTop:1}}>{s.desc}</div>
                  </div>
                </label>
              )
            })}
          </div>
        </div>

        <div style={{display:'flex',gap:8,marginTop:16}}>
          <button onClick={generarReporte} disabled={loading || seccionesActivas.length===0}
            style={{flex:1,padding:10,borderRadius:'var(--r-md)',background:loading?'var(--border)':'var(--accent)',color:'#fff',border:'none',cursor:loading?'wait':'pointer',fontSize:13,fontWeight:600}}>
            {loading?'Generando reporte...':'Generar reporte'}
          </button>
          {reporte && (
            <button onClick={descargarPDF}
              style={{padding:'10px 20px',borderRadius:'var(--r-md)',background:'#1D9E75',color:'#fff',border:'none',cursor:'pointer',fontSize:13,fontWeight:600}}>
              Descargar PDF
            </button>
          )}
        </div>
      </div>

      {reporte && <ReporteVista reporte={reporte} />}
    </div>
  )
}

function ReporteVista({ reporte }) {
  const { datos, analisis, secciones, generadoEn, rango } = reporte
  const labelRango = RANGOS.find(r=>r.id===rango)?.label || rango

  return (
    <div id="reporte-vista" className="card" style={{padding:24,background:'#fff'}}>
      {/* Encabezado */}
      <div style={{textAlign:'center',marginBottom:24,paddingBottom:14,borderBottom:'2px solid #1D9E75'}}>
        <div style={{fontSize:22,fontWeight:800,color:'#222'}}>Chilakileando la Gordi'nflada</div>
        <div style={{fontSize:14,color:'#1D9E75',fontWeight:600,marginTop:4}}>Reporte Estrategico</div>
        <div style={{fontSize:11,color:'#666',marginTop:6}}>{labelRango} · Generado {generadoEn.toLocaleDateString('es-MX')}</div>
      </div>

      {/* Resumen ejecutivo IA */}
      {secciones.includes('resumen') && analisis?.resumen_ejecutivo && (
        <div style={{marginBottom:20,padding:14,background:'#F4F8F2',borderLeft:'3px solid #1D9E75',borderRadius:6}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:6,color:'#3B6D11'}}>Resumen Ejecutivo</div>
          <div style={{fontSize:12,lineHeight:1.6,color:'#333'}}>{analisis.resumen_ejecutivo}</div>
        </div>
      )}

      {/* KPIs */}
      {secciones.includes('kpis') && (
        <div style={{marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:8,color:'#222'}}>KPIs principales</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
            {[
              { l:'Ventas', v:fmtM(datos.kpi.ventas), c:'#378ADD' },
              { l:'Unidades', v:datos.kpi.unidades.toLocaleString('es-MX'), c:'#888' },
              { l:'Gastos', v:fmtM(datos.kpi.gastos), c:'#E24B4A' },
              { l:'Utilidad', v:fmtM(datos.kpi.utilidad), c:datos.kpi.utilidad>=0?'#1D9E75':'#E24B4A' },
              { l:'Margen', v:datos.kpi.margen+'%', c:datos.kpi.margen>=0?'#1D9E75':'#E24B4A' },
              { l:'Ticket prom.', v:fmtM(datos.kpi.ticket), c:'#666' },
            ].map((k,i)=>(
              <div key={i} style={{padding:12,background:'#FAFAFA',borderRadius:6,borderLeft:`3px solid ${k.c}`}}>
                <div style={{fontSize:10,color:'#888',marginBottom:3}}>{k.l}</div>
                <div style={{fontSize:18,fontWeight:700,color:k.c}}>{k.v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top productos */}
      {secciones.includes('productos') && datos.topProductos?.length>0 && (
        <div style={{marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>Top 10 productos</div>
          <table style={{width:'100%',fontSize:11,borderCollapse:'collapse'}}>
            <thead><tr style={{borderBottom:'1px solid #ddd'}}>
              <th style={{textAlign:'left',padding:6}}>Producto</th>
              <th style={{textAlign:'right',padding:6}}>Unidades</th>
              <th style={{textAlign:'right',padding:6}}>Ventas</th>
            </tr></thead>
            <tbody>
              {datos.topProductos.map((p,i)=>(
                <tr key={i} style={{borderBottom:'1px solid #f0f0f0'}}>
                  <td style={{padding:6}}>{p.producto}</td>
                  <td style={{textAlign:'right',padding:6}}>{p.unidades.toLocaleString('es-MX')}</td>
                  <td style={{textAlign:'right',padding:6,fontWeight:600}}>{fmtM(p.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Gastos por categoria */}
      {secciones.includes('gastos') && datos.gastosCat?.length>0 && (
        <div style={{marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>Distribucion de gastos</div>
          <table style={{width:'100%',fontSize:11,borderCollapse:'collapse'}}>
            <thead><tr style={{borderBottom:'1px solid #ddd'}}>
              <th style={{textAlign:'left',padding:6}}>Categoria</th>
              <th style={{textAlign:'right',padding:6}}>Monto</th>
              <th style={{textAlign:'right',padding:6}}>% del total</th>
            </tr></thead>
            <tbody>
              {datos.gastosCat.map((g,i)=>(
                <tr key={i} style={{borderBottom:'1px solid #f0f0f0'}}>
                  <td style={{padding:6}}>{g.categoria}</td>
                  <td style={{textAlign:'right',padding:6,fontWeight:600}}>{fmtM(g.monto)}</td>
                  <td style={{textAlign:'right',padding:6,color:'#888'}}>{g.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Canales */}
      {secciones.includes('canales') && datos.canales?.length>0 && (
        <div style={{marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>Canales de venta</div>
          <table style={{width:'100%',fontSize:11,borderCollapse:'collapse'}}>
            <thead><tr style={{borderBottom:'1px solid #ddd'}}>
              <th style={{textAlign:'left',padding:6}}>Canal</th>
              <th style={{textAlign:'right',padding:6}}>Ventas</th>
              <th style={{textAlign:'right',padding:6}}>% del total</th>
            </tr></thead>
            <tbody>
              {datos.canales.map((c,i)=>(
                <tr key={i} style={{borderBottom:'1px solid #f0f0f0'}}>
                  <td style={{padding:6}}>{c.canal}</td>
                  <td style={{textAlign:'right',padding:6,fontWeight:600}}>{fmtM(c.importe)}</td>
                  <td style={{textAlign:'right',padding:6,color:'#888'}}>{c.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Fortalezas IA */}
      {secciones.includes('fortalezas') && analisis?.fortalezas?.length>0 && (
        <div style={{marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:8,color:'#3B6D11'}}>Fortalezas del negocio</div>
          <ul style={{margin:0,paddingLeft:18,fontSize:12,lineHeight:1.7}}>
            {analisis.fortalezas.map((f,i)=>(<li key={i}>{f}</li>))}
          </ul>
        </div>
      )}

      {/* Alertas IA */}
      {secciones.includes('alertas') && analisis?.alertas?.length>0 && (
        <div style={{marginBottom:20,padding:14,background:'#FCEBEB',borderLeft:'3px solid #E24B4A',borderRadius:6}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:6,color:'#A32D2D'}}>Puntos de atencion</div>
          <ul style={{margin:0,paddingLeft:18,fontSize:12,lineHeight:1.7,color:'#A32D2D'}}>
            {analisis.alertas.map((a,i)=>(<li key={i}>{a}</li>))}
          </ul>
        </div>
      )}

      {/* Recomendaciones IA */}
      {secciones.includes('recomendaciones') && analisis?.recomendaciones?.length>0 && (
        <div style={{marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:8,color:'#222'}}>Recomendaciones estrategicas</div>
          <ol style={{margin:0,paddingLeft:18,fontSize:12,lineHeight:1.7}}>
            {analisis.recomendaciones.map((r,i)=>(<li key={i} style={{marginBottom:4}}>{r}</li>))}
          </ol>
        </div>
      )}

      {/* Proyeccion IA */}
      {secciones.includes('proyeccion') && analisis?.proyeccion && (
        <div style={{marginBottom:20,padding:14,background:'#F4F8F2',borderLeft:'3px solid #378ADD',borderRadius:6}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:6,color:'#1A5288'}}>Proyeccion 3 meses</div>
          <div style={{fontSize:12,lineHeight:1.6,color:'#333'}}>{analisis.proyeccion}</div>
        </div>
      )}

      <div style={{marginTop:24,paddingTop:10,borderTop:'1px solid #eee',fontSize:9,color:'#999',textAlign:'center'}}>
        Reporte generado por Chilakileando ERP · {generadoEn.toLocaleString('es-MX')}
      </div>
    </div>
  )
}
