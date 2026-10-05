import React, { useState, useEffect, useCallback, useRef } from 'react'
import { sb } from '../lib/supabase.js'
import ExportBtn from '../components/ExportBtn.jsx'

const fmtPct = v => Math.round(v||0)+'%'
const today = () => new Date().toISOString().slice(0,10)
const QR_URL = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data='
const BASE_URL = 'https://chilakileando.netlify.app/encuesta.html'

// ── NUBE DE PALABRAS ──────────────────────────────────────────
function NubePalabras({ datos }) {
  const canvasRef = useRef(null)

  const STOPWORDS = new Set(['de','la','el','en','que','y','a','los','las','un','una','es','se',
    'no','al','lo','su','por','con','me','mi','si','ya','le','te','fue','muy','pero','hay',
    'más','como','para','todo','esto','están','está','del','nos','les','son','cuando','bien',
    'poco','nada','ser','tuve','tiene','también','vez','tan','aquí','así','mucho','cada','sobre',
    'fue','han','era','tenía','estar','tiene','este','esta','ese','esa'])

  useEffect(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0,0,W,H)

    // Contar palabras por tipo
    const freq = { promotor:{}, neutro:{}, detractor:{} }
    datos.forEach(d => {
      if (!d.comentario) return
      const tipo = d.calificacion>=9?'promotor':d.calificacion>=7?'neutro':'detractor'
      d.comentario.toLowerCase().replace(/[^a-záéíóúüñ\s]/g,'').split(/\s+/).forEach(w => {
        if (w.length > 3 && !STOPWORDS.has(w)) {
          freq[tipo][w] = (freq[tipo][w]||0)+1
        }
      })
    })

    // Combinar todas las palabras con su frecuencia y tipo dominante
    const allWords = {}
    Object.entries(freq).forEach(([tipo, words]) => {
      Object.entries(words).forEach(([w, count]) => {
        if (!allWords[w]) allWords[w] = { total:0, promotor:0, neutro:0, detractor:0 }
        allWords[w].total += count
        allWords[w][tipo] += count
      })
    })

    const words = Object.entries(allWords)
      .sort((a,b)=>b[1].total-a[1].total)
      .slice(0,50)

    if (!words.length) {
      ctx.fillStyle = '#ccc'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('Sin comentarios aún', W/2, H/2)
      return
    }

    const maxFreq = words[0][1].total
    const placed = []
    const colors = { promotor:'#1D9E75', neutro:'#378ADD', detractor:'#E24B4A' }

    words.forEach(([word, data]) => {
      const size = Math.max(12, Math.min(46, 12 + (data.total/maxFreq)*34))
      const bold = data.total > maxFreq*0.4
      ctx.font = `${bold?'bold':'normal'} ${size}px sans-serif`
      const tw = ctx.measureText(word).width

      // Color por tipo dominante
      const tipo = data.promotor>=data.detractor && data.promotor>=data.neutro ? 'promotor'
        : data.detractor>=data.neutro ? 'detractor' : 'neutro'
      const color = colors[tipo]
      const opacity = 0.55 + (data.total/maxFreq)*0.45

      // Intentar colocar — espiral desde el centro
      let placed_ok = false
      for (let attempt = 0; attempt < 200; attempt++) {
        const angle = attempt * 0.5
        const r = attempt * 2.5
        const cx = W/2 + Math.cos(angle)*r*(1+Math.random()*0.3)
        const cy = H/2 + Math.sin(angle)*r*0.6*(1+Math.random()*0.3)
        const x = cx - tw/2, y = cy - size/2

        if (x < 2 || x+tw > W-2 || y < 6 || y+size > H-2) continue
        const rect = {x:x-2, y:y-2, w:tw+4, h:size+4}
        const col = placed.some(p =>
          rect.x < p.x+p.w && rect.x+rect.w > p.x &&
          rect.y < p.y+p.h && rect.y+rect.h > p.y)
        if (!col) {
          ctx.globalAlpha = opacity
          ctx.fillStyle = color
          ctx.textAlign = 'center'
          ctx.fillText(word, cx, cy)
          placed.push(rect)
          placed_ok = true
          break
        }
      }
    })
    ctx.globalAlpha = 1; ctx.textAlign = 'left'
  }, [datos])

  return (
    <div>
      <canvas ref={canvasRef} width={600} height={260} style={{width:'100%',height:'auto'}}/>
      <div style={{display:'flex',gap:16,justifyContent:'center',marginTop:8}}>
        {[['#1D9E75','😍 Promotores'],['#378ADD','😐 Neutros'],['#E24B4A','😞 Detractores']].map(([c,l])=>(
          <div key={l} style={{display:'flex',alignItems:'center',gap:5,fontSize:11}}>
            <div style={{width:9,height:9,borderRadius:'50%',background:c}}/>
            <span style={{color:'var(--text2)'}}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── QR GENERATOR ──────────────────────────────────────────────
function QRGenerator() {
  const [mesas, setMesas] = useState(['1','2','3','4','5','6','7','8','9','10','Terraza','Barra'])
  const [selMesa, setSelMesa] = useState('1')
  const [custom, setCustom] = useState('')
  const mesaFinal = custom || selMesa
  const encuestaUrl = BASE_URL + '?mesa=' + encodeURIComponent(mesaFinal)
  const qrUrl = QR_URL + encodeURIComponent(encuestaUrl)

  const descargar = async () => {
    const res = await fetch(qrUrl)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download=`QR-Mesa-${mesaFinal}.png`; a.click()
    URL.revokeObjectURL(url)
  }

  const imprimirTodos = () => {
    const win = window.open('','_blank')
    win.document.write(`<!DOCTYPE html><html><head><title>QR Mesas — Chilakileando</title>
    <style>*{box-sizing:border-box}body{font-family:sans-serif;padding:16px}
    h2{margin-bottom:16px;font-size:16px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
    .item{text-align:center;border:1.5px solid #ddd;padding:14px;border-radius:12px;page-break-inside:avoid}
    h3{margin:0 0 8px;font-size:14px;color:#E24B4A}img{width:130px;height:130px}
    p{font-size:9px;color:#999;margin:6px 0 0;line-height:1.4}
    .brand{font-size:11px;font-weight:700;color:#1a1a1a;margin-bottom:3px}
    @media print{.no-print{display:none}button{display:none}}</style></head>
    <body><h2>Códigos QR — Chilakileando la Gordi'nflada</h2>
    <button class="no-print" onclick="window.print()" style="margin-bottom:12px;padding:8px 16px;background:#E24B4A;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px">🖨 Imprimir</button>
    <div class="grid">${mesas.map(m=>`
      <div class="item">
        <div class="brand">Chilakileando la Gordi'nflada</div>
        <h3>Mesa ${m}</h3>
        <img src="${QR_URL}${encodeURIComponent(BASE_URL+'?mesa='+m)}" alt="QR Mesa ${m}"/>
        <p>Escanea el código QR y dinos<br>¿cómo estuvo tu experiencia?<br>¡Hay un regalo sorpresa esperándote!</p>
      </div>`).join('')}
    </div></body></html>`)
    win.document.close()
  }

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
      <div className="card">
        <div className="ch"><div className="ct">QR individual por mesa</div></div>
        <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
          <div style={{flex:1}}>
            <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>Mesa</div>
            <select className="form-input" value={selMesa} onChange={e=>{setSelMesa(e.target.value);setCustom('')}}>
              {['1','2','3','4','5','6','7','8','9','10','Terraza','Barra','VIP'].map(m=><option key={m} value={m}>Mesa {m}</option>)}
            </select>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>Nombre libre</div>
            <input className="form-input" placeholder="Terraza, VIP..." value={custom} onChange={e=>setCustom(e.target.value)}/>
          </div>
        </div>
        <div style={{textAlign:'center',marginBottom:14}}>
          <img src={qrUrl} alt="QR" style={{width:180,height:180,borderRadius:'var(--r-md)',border:'0.5px solid var(--border-md)'}}/>
          <div style={{fontSize:11,fontWeight:600,color:'var(--text)',marginTop:8}}>Mesa {mesaFinal}</div>
          <div style={{fontSize:9,color:'var(--text3)',marginTop:3,wordBreak:'break-all',padding:'0 10px'}}>{encuestaUrl}</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={descargar} style={{flex:1,padding:9,borderRadius:'var(--r-md)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:12,color:'var(--text2)'}}>
            ⬇ PNG
          </button>
          <button onClick={()=>window.open(encuestaUrl,'_blank')} style={{flex:1,padding:9,borderRadius:'var(--r-md)',border:'none',background:'var(--accent)',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>
            👁 Ver encuesta
          </button>
        </div>
      </div>

      <div className="card">
        <div className="ch"><div className="ct">Hoja de impresión completa</div></div>
        <div style={{fontSize:12,color:'var(--text2)',marginBottom:12,lineHeight:1.6}}>
          Genera una hoja lista para imprimir y recortar con los QR de todas las mesas.
        </div>
        <div style={{fontSize:11,color:'var(--text2)',marginBottom:8}}>Mesas a incluir:</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:5,marginBottom:16}}>
          {['1','2','3','4','5','6','7','8','9','10','Terraza','Barra','VIP'].map(m=>(
            <button key={m} onClick={()=>setMesas(prev=>prev.includes(m)?prev.filter(x=>x!==m):[...prev,m])}
              style={{padding:'3px 10px',borderRadius:99,fontSize:11,cursor:'pointer',
                border:`1.5px solid ${mesas.includes(m)?'var(--accent)':'var(--border-md)'}`,
                background:mesas.includes(m)?'var(--accent)22':'transparent',
                color:mesas.includes(m)?'var(--accent)':'var(--text2)'}}>
              {m}
            </button>
          ))}
        </div>
        <div style={{background:'#EAF3DE',borderRadius:'var(--r-md)',padding:'10px 12px',fontSize:11,color:'#3B6D11',marginBottom:12}}>
          ✓ Incluye: nombre del restaurante, número de mesa, QR y texto de invitación con mención al regalo sorpresa
        </div>
        <button onClick={imprimirTodos} style={{width:'100%',padding:10,borderRadius:'var(--r-md)',border:'none',background:'#1D9E75',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600}}>
          🖨 Abrir hoja de impresión ({mesas.length} QR)
        </button>
      </div>
    </div>
  )
}

// ── MÓDULO PRINCIPAL ──────────────────────────────────────────
export default function NPS() {
  const [tab,     setTab]    = useState('dashboard')
  const [desde,   setDesde]  = useState(new Date(new Date().setDate(new Date().getDate()-29)).toISOString().slice(0,10))
  const [hasta,   setHasta]  = useState(today())
  const [loading, setLoading]= useState(false)
  const [datos,   setDatos]  = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await sb.from('nps_respuestas')
      .select('*').gte('fecha',desde).lte('fecha',hasta).order('created_at',{ascending:false})
    setDatos(data||[])
    setLoading(false)
  }, [desde, hasta])

  useEffect(() => { if (tab==='dashboard') load() }, [load, tab])

  const total       = datos.length
  const promotores  = datos.filter(d=>d.calificacion>=9)
  const neutros     = datos.filter(d=>d.calificacion>=7&&d.calificacion<=8)
  const detractores = datos.filter(d=>d.calificacion<=6)
  const nps         = total>0 ? Math.round((promotores.length/total-detractores.length/total)*100) : null
  const promCalif   = total>0 ? (datos.reduce((s,d)=>s+d.calificacion,0)/total).toFixed(1) : '—'
  const npsColor    = nps===null?'#888':nps>=50?'#1D9E75':nps>=0?'#EF9F27':'#E24B4A'
  const npsLabel    = nps===null?'Sin datos':nps>=50?'Excelente 🌟':nps>=0?'Bueno 👍':'Necesita mejora ⚠'

  const conComentario = datos.filter(d=>d.comentario)

  return (
    <div>
      {/* TABS */}
      <div style={{display:'flex',gap:6,marginBottom:16}}>
        {[{id:'dashboard',label:'📊 Dashboard NPS'},{id:'qr',label:'📱 Códigos QR'}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:'6px 16px',borderRadius:'var(--r-md)',fontSize:12,fontWeight:500,cursor:'pointer',
              border:`1.5px solid ${tab===t.id?'var(--accent)':'var(--border-md)'}`,
              background:tab===t.id?'var(--accent)22':'transparent',
              color:tab===t.id?'var(--accent)':'var(--text2)'}}>
            {t.label}
          </button>
        ))}
      </div>

      {tab==='qr' ? <QRGenerator/> : (
        <>
          {/* FILTROS */}
          <div style={{display:'flex',gap:10,marginBottom:14,alignItems:'flex-end',flexWrap:'wrap',justifyContent:'space-between'}}>
            <div style={{display:'flex',gap:10,alignItems:'flex-end',flexWrap:'wrap'}}>
            <div>
              <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>Desde</div>
              <input type="date" className="form-input" value={desde} onChange={e=>setDesde(e.target.value)}/>
            </div>
            <div>
              <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>Hasta</div>
              <input type="date" className="form-input" value={hasta} onChange={e=>setHasta(e.target.value)}/>
            </div>
            {[{l:'7 días',d:6},{l:'30 días',d:29},{l:'3 meses',d:89}].map(({l,d})=>(
              <button key={l} onClick={()=>{const dt=new Date();dt.setDate(dt.getDate()-d);setDesde(dt.toISOString().slice(0,10));setHasta(today())}}
                style={{padding:'6px 12px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:11,color:'var(--text2)'}}>
                {l}
              </button>
            ))}
            <button onClick={()=>{setDesde('2020-01-01');setHasta(today())}}
              style={{padding:'6px 12px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:11,color:'var(--text2)'}}>
              Todo el historial
            </button>
            </div>
            <ExportBtn titulo="NPS y Encuestas" getElement={()=>document.querySelector('.content')}/>
          </div>

          {loading ? <div className="loading-screen" style={{height:200}}><div className="spinner"/></div>
          : total===0 ? (
            <div className="card" style={{textAlign:'center',padding:'48px 0',color:'var(--text3)'}}>
              <div style={{fontSize:36,marginBottom:8}}>📋</div>
              <div style={{fontSize:14,fontWeight:600,marginBottom:6}}>Sin respuestas todavía</div>
              <div style={{fontSize:12,marginBottom:16}}>Coloca los QR en las mesas para empezar a recibir retroalimentación</div>
              <button onClick={()=>setTab('qr')} style={{padding:'8px 20px',borderRadius:'var(--r-md)',border:'none',background:'var(--accent)',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>
                Ir a Códigos QR →
              </button>
            </div>
          ) : (
            <>
              {/* KPIs */}
              <div className="metrics" style={{gridTemplateColumns:'repeat(5,minmax(0,1fr))',marginBottom:12}}>
                <div className="mc">
                  <div className="mc-label">Score NPS</div>
                  <div style={{fontSize:30,fontWeight:800,color:npsColor,lineHeight:1.1}}>{nps}</div>
                  <div style={{fontSize:10,color:npsColor,marginTop:3}}>{npsLabel}</div>
                </div>
                <div className="mc">
                  <div className="mc-label">Calificación prom.</div>
                  <div className="mc-value">{promCalif}<span style={{fontSize:11,color:'var(--text2)'}}>/10</span></div>
                </div>
                <div className="mc">
                  <div className="mc-label" style={{color:'#1D9E75'}}>😍 Promotores</div>
                  <div className="mc-value" style={{color:'#1D9E75'}}>{promotores.length}</div>
                  <div style={{fontSize:10,color:'#1D9E75'}}>{fmtPct(promotores.length/total*100)}</div>
                </div>
                <div className="mc">
                  <div className="mc-label" style={{color:'#EF9F27'}}>😐 Neutros</div>
                  <div className="mc-value" style={{color:'#EF9F27'}}>{neutros.length}</div>
                  <div style={{fontSize:10,color:'#EF9F27'}}>{fmtPct(neutros.length/total*100)}</div>
                </div>
                <div className="mc">
                  <div className="mc-label" style={{color:'#E24B4A'}}>😞 Detractores</div>
                  <div className="mc-value" style={{color:'#E24B4A'}}>{detractores.length}</div>
                  <div style={{fontSize:10,color:'#E24B4A'}}>{fmtPct(detractores.length/total*100)}</div>
                </div>
              </div>

              {/* Barra distribución */}
              <div className="card" style={{marginBottom:12}}>
                <div className="ch"><div className="ct">Distribución</div><span style={{fontSize:11,color:'var(--text3)'}}>{total} respuestas</span></div>
                <div style={{display:'flex',height:24,borderRadius:999,overflow:'hidden',marginBottom:10}}>
                  <div style={{flex:promotores.length,background:'#1D9E75'}}/>
                  <div style={{flex:neutros.length,background:'#EF9F27'}}/>
                  <div style={{flex:detractores.length,background:'#E24B4A'}}/>
                </div>
                <div style={{display:'flex',gap:20,justifyContent:'center',fontSize:11,flexWrap:'wrap'}}>
                  {[['#1D9E75','😍 Promotores (9-10)',promotores.length],['#EF9F27','😐 Neutros (7-8)',neutros.length],['#E24B4A','😞 Detractores (0-6)',detractores.length]].map(([c,l,n])=>(
                    <div key={l} style={{display:'flex',alignItems:'center',gap:5}}>
                      <div style={{width:9,height:9,borderRadius:'50%',background:c}}/>
                      <span style={{color:'var(--text2)'}}>{l}: <strong style={{color:c}}>{n}</strong></span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Nube de palabras unificada */}
              {conComentario.length > 0 && (
                <div className="card" style={{marginBottom:12}}>
                  <div className="ch">
                    <div className="ct">Nube de palabras</div>
                    <span style={{fontSize:11,color:'var(--text3)'}}>{conComentario.length} comentarios</span>
                  </div>
                  <NubePalabras datos={datos}/>
                </div>
              )}

              {/* Verbatims */}
              <div className="card">
                <div className="ch"><div className="ct">Comentarios de clientes</div><span style={{fontSize:11,color:'var(--text3)'}}>{conComentario.length}</span></div>
                {conComentario.length===0
                  ? <div style={{fontSize:12,color:'var(--text3)',padding:'12px 0',textAlign:'center'}}>Sin comentarios escritos aún</div>
                  : conComentario.map(d=>(
                    <div key={d.id} style={{padding:'12px 0',borderBottom:'0.5px solid var(--border)',display:'flex',gap:12,alignItems:'flex-start'}}>
                      <div style={{width:34,height:34,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,
                        fontSize:14,fontWeight:700,
                        background:d.calificacion>=9?'#EAF3DE':d.calificacion>=7?'#FFF9E6':'#FCEBEB',
                        color:d.calificacion>=9?'#1D9E75':d.calificacion>=7?'#EF9F27':'#E24B4A'}}>
                        {d.calificacion}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:5,flexWrap:'wrap'}}>
                          <span style={{fontSize:11,fontWeight:600,color:d.calificacion>=9?'#1D9E75':d.calificacion>=7?'#EF9F27':'#E24B4A'}}>
                            {d.calificacion>=9?'😍 Promotor':d.calificacion>=7?'😐 Neutro':'😞 Detractor'}
                          </span>
                          {d.nombre&&<span style={{fontSize:11,color:'var(--text2)',fontWeight:500}}>{d.nombre}</span>}
                          {d.mesa&&<span style={{fontSize:10,padding:'1px 7px',borderRadius:99,background:'var(--bg)',color:'var(--text3)'}}>Mesa {d.mesa}</span>}
                          {d.productos_ordenados&&<span style={{fontSize:10,color:'var(--text3)'}}>🍽 {d.productos_ordenados.slice(0,40)}</span>}
                          <span style={{fontSize:10,color:'var(--text3)',marginLeft:'auto'}}>
                            {new Date(d.created_at).toLocaleDateString('es-MX',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
                          </span>
                        </div>
                        <div style={{fontSize:12,color:'var(--text)',lineHeight:1.6,fontStyle:'italic'}}>"{d.comentario}"</div>
                      </div>
                    </div>
                  ))
                }
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
