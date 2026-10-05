import React, { useState, useEffect, useCallback, useRef } from 'react'
import { sb } from '../lib/supabase.js'
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js'
import PeriodSwitcher from '../components/PeriodSwitcher.jsx'
import ExportBtn from '../components/ExportBtn.jsx'
import { getRangoFechas } from '../lib/analytics.js'
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const fmtM = v => '$'+Math.round(v||0).toLocaleString('es-MX')
const fmtN = v => Math.round(v||0).toLocaleString('es-MX')
const CAT_COLORS = {
  'Los Chilakiles':'#E24B4A','Huevos y Crokantes':'#D85A30','Los Dorados':'#EF9F27',
  'Del Comal':'#BA7517','Enfrijoladas':'#7F77DD','1/2 Litros':'#1D9E75',
  'Bebidas Frias':'#378ADD','Bebidas Calientes':'#1D6B50','Postres':'#D4537E','Otros':'#888780'
}
const getColor = cat => CAT_COLORS[cat]||'#888780'

function getPrevRange(from, to) {
  const d1 = new Date(from), d2 = new Date(to)
  const dias = Math.ceil((d2-d1)/86400000)+1
  // Si el período es mayor a 300 días (anual o multi-anual), usar el año anterior
  if (dias > 300) {
    const prevFrom = new Date(d1); prevFrom.setFullYear(prevFrom.getFullYear()-1)
    const prevTo   = new Date(d2); prevTo.setFullYear(prevTo.getFullYear()-1)
    return { prevFrom: prevFrom.toISOString().slice(0,10), prevTo: prevTo.toISOString().slice(0,10) }
  }
  // Si es trimestral o menor, usar el período inmediatamente anterior
  const prevTo   = new Date(d1); prevTo.setDate(prevTo.getDate()-1)
  const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate()-dias+1)
  return { prevFrom: prevFrom.toISOString().slice(0,10), prevTo: prevTo.toISOString().slice(0,10) }
}

// ── CALCULAR CUADRANTES (ÚNICA FUENTE DE VERDAD) ──────────────
// BCG: X=unidades, Y=crecImporte, size=unidades
// BPS: X=crecImporte, Y=crecUtil, size=utilidad
function calcCuadrantes(items, tipo) {
  const xKey = tipo==='bcg' ? 'unidades'    : 'crecImporte'
  const yKey = tipo==='bcg' ? 'crecImporte' : 'crecUtil'
  const sKey = tipo==='bcg' ? 'unidades'    : 'utilidad'
  if (!items.length) return { estrella:[], vaca:[], interrogante:[], perro:[], medX:0, medY:0, xKey, yKey, sKey }
  const mid = arr => arr.reduce((s,v)=>s+v,0)/arr.length
  const medX = mid(items.map(p=>p[xKey]||0))
  const medY = mid(items.map(p=>p[yKey]||0))
  return {
    medX, medY, xKey, yKey, sKey,
    estrella:     items.filter(p=>(p[xKey]||0)>=medX && (p[yKey]||0)>=medY),
    vaca:         items.filter(p=>(p[xKey]||0)>=medX && (p[yKey]||0)<medY),
    interrogante: items.filter(p=>(p[xKey]||0)<medX  && (p[yKey]||0)>=medY),
    perro:        items.filter(p=>(p[xKey]||0)<medX  && (p[yKey]||0)<medY),
  }
}

const Q_CFG = {
  estrella:     {label:'⭐ Estrellas',      color:'#EF9F27', bg:'#FFF9E6', accion:'Invertir y crecer'},
  vaca:         {label:'🐄 Vacas lecheras', color:'#1D9E75', bg:'#EAF3DE', accion:'Mantener y cosechar'},
  interrogante: {label:'❓ Interrogantes',  color:'#378ADD', bg:'#E6F1FB', accion:'Analizar y decidir'},
  perro:        {label:'🐕 Perros',         color:'#E24B4A', bg:'#FCEBEB', accion:'Revisar o eliminar'},
}

// ── BUBBLE CHART ──────────────────────────────────────────────
function MatrizBubble({ calc, tipo }) {
  const canvasRef = useRef(null)
  const { estrella, vaca, interrogante, perro, medX, medY, xKey, yKey, sKey } = calc
  const allItems = [...estrella, ...vaca, ...interrogante, ...perro]

  useEffect(() => {
    if (!canvasRef.current || !allItems.length) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const W=canvas.width, H=canvas.height
    const PL=65, PR=25, PT=28, PB=45

    ctx.clearRect(0,0,W,H)

    const xs = allItems.map(p=>p[xKey]||0)
    const ys = allItems.map(p=>p[yKey]||0)
    const ss = allItems.map(p=>Math.abs(p[sKey]||0))
    const xMin=Math.min(...xs), xMax=Math.max(...xs)
    const yMin=Math.min(...ys), yMax=Math.max(...ys)
    const sMax=Math.max(...ss)||1
    const pad = v => v*0.1
    const xRange=(xMax-xMin+pad(xMax-xMin))||1
    const yRange=(yMax-yMin+pad(yMax-yMin))||1

    const toX = v => PL + ((v-xMin)/xRange)*(W-PL-PR)
    const toY = v => H-PB - ((v-yMin)/yRange)*(H-PT-PB)
    const midX = toX(medX), midY = toY(medY)

    // Fondo cuadrantes — BCG estándar:
    // TL=Interrogante(bajo X, alto Y), TR=Estrella(alto X, alto Y)
    // BL=Perro(bajo X, bajo Y),        BR=Vaca(alto X, bajo Y)
    const quads = [
      {x:PL,    y:PT,    w:midX-PL,    h:midY-PT,    color:'#378ADD', label:'❓ Interrogantes'},
      {x:midX,  y:PT,    w:W-PR-midX,  h:midY-PT,    color:'#EF9F27', label:'⭐ Estrellas'},
      {x:PL,    y:midY,  w:midX-PL,    h:H-PB-midY,  color:'#E24B4A', label:'🐕 Perros'},
      {x:midX,  y:midY,  w:W-PR-midX,  h:H-PB-midY,  color:'#1D9E75', label:'🐄 Vacas'},
    ]
    quads.forEach(q => {
      ctx.fillStyle = q.color+'18'
      ctx.fillRect(q.x,q.y,q.w,q.h)
      ctx.fillStyle = q.color+'BB'
      ctx.font = 'bold 11px sans-serif'
      ctx.fillText(q.label, q.x+8, q.y+16)
    })

    // Líneas mediana
    ctx.strokeStyle = '#99999966'
    ctx.lineWidth = 1.5
    ctx.setLineDash([6,4])
    ctx.beginPath(); ctx.moveTo(midX,PT); ctx.lineTo(midX,H-PB); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(PL,midY); ctx.lineTo(W-PR,midY); ctx.stroke()
    ctx.setLineDash([])

    // Marco ejes
    ctx.strokeStyle = '#cccccc'
    ctx.lineWidth = 1
    ctx.strokeRect(PL,PT,W-PL-PR,H-PT-PB)

    // Labels ejes
    const xLabel = tipo==='bcg' ? 'Volumen (Unidades) →' : 'Crecimiento Ventas % →'
    const yLabel = tipo==='bcg' ? 'Crecimiento Ingresos %' : 'Crecimiento Rentabilidad %'
    ctx.fillStyle = '#999'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(xLabel, PL+(W-PL-PR)/2, H-PB+22)
    ctx.save(); ctx.translate(14,PT+(H-PT-PB)/2); ctx.rotate(-Math.PI/2)
    ctx.fillText(yLabel, 0, 0); ctx.restore()

    // Tick valores
    ctx.fillStyle = '#bbb'; ctx.font = '9px sans-serif'
    ctx.textAlign = 'center'
    ;[xMin, medX, xMax].forEach(v => {
      const x=toX(v)
      ctx.fillText(tipo==='bcg'&&xKey==='unidades'?fmtN(v):Math.round(v)+'%', x, H-PB+11)
    })
    ctx.textAlign = 'right'
    ;[yMin, medY, yMax].forEach(v => {
      ctx.fillText(Math.round(v)+'%', PL-4, toY(v)+3)
    })

    // Burbujas — pequeñas primero (para que grandes queden encima)
    const sorted = [...allItems].sort((a,b)=>Math.abs(b[sKey]||0)-Math.abs(a[sKey]||0)).reverse()
    sorted.forEach(p => {
      const x=toX(p[xKey]||0), y=toY(p[yKey]||0)
      const s=Math.abs(p[sKey]||0)
      const r=Math.max(8, Math.min(34, 8+(s/sMax)*26))
      // Color por cuadrante real
      const altoX=(p[xKey]||0)>=medX, altoY=(p[yKey]||0)>=medY
      const color = altoX&&altoY?'#EF9F27' : altoX&&!altoY?'#1D9E75' : !altoX&&altoY?'#378ADD' : '#E24B4A'

      ctx.shadowColor=color+'55'; ctx.shadowBlur=10
      const grad=ctx.createRadialGradient(x-r*0.3,y-r*0.3,r*0.05,x,y,r)
      grad.addColorStop(0,color+'FF'); grad.addColorStop(0.6,color+'CC'); grad.addColorStop(1,color+'66')
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2)
      ctx.fillStyle=grad; ctx.fill()
      ctx.shadowBlur=0
      ctx.strokeStyle=color; ctx.lineWidth=1.5; ctx.stroke()

      const name=p.nombre.length>11?p.nombre.slice(0,10)+'…':p.nombre
      if (r>15) {
        ctx.fillStyle='#fff'; ctx.font=`bold ${Math.max(8,Math.min(10,r-3))}px sans-serif`
        ctx.textAlign='center'; ctx.fillText(name,x,y+3)
      } else {
        ctx.fillStyle=color; ctx.font='8px sans-serif'
        ctx.textAlign='center'; ctx.fillText(name,x,y+r+10)
      }
    })
    ctx.textAlign='left'
  }, [allItems, tipo, calc])

  if (!allItems.length) return <div style={{textAlign:'center',padding:40,color:'var(--text3)'}}>Sin datos</div>
  return <canvas ref={canvasRef} width={720} height={420} style={{width:'100%',height:'auto',borderRadius:'var(--r-md)'}}/>
}

// ── COMPONENTE PRINCIPAL ──────────────────────────────────────
export default function Rendimiento() {
  const [rango,        setRango]        = useState('1anio')
  const [granularidad, setGranularidad] = useState('mensual')
  const [rangoDesde,   setRangoDesde]   = useState('')
  const [rangoHasta,   setRangoHasta]   = useState('')
  const [nivel,        setNivel]        = useState('categoria')
  const [metrica,      setMetrica]      = useState('importe')
  const [vista,        setVista]        = useState('top')
  const [topN,         setTopN]         = useState(10)
  const [loading,      setLoading]      = useState(false)
  const [datos,        setDatos]        = useState([])
  const [canalesList,  setCanalesList]  = useState([])
  const [canalFiltros, setCanalFiltros] = useState([])
  const [catFiltro,    setCatFiltro]    = useState('todas')
  const [guisos,       setGuisos]       = useState([])
  const [loadingGuisos, setLoadingGuisos] = useState(false)

  const load = useCallback(async () => {
    if (rango==='rango'&&(!rangoDesde||!rangoHasta)) return
    setLoading(true)
    try {
      const {from,to}=getRangoFechas(rango,rangoDesde,rangoHasta)
      const {prevFrom,prevTo}=getPrevRange(from,to)
      const PAGE=1000
      const fetchAll=async(tabla,cols,f,t)=>{
        let all=[],idx=0,done=false
        while(!done){const{data}=await sb.from(tabla).select(cols).gte('fecha',f).lte('fecha',t).range(idx,idx+PAGE-1);all=all.concat(data||[]);if(!data||data.length<PAGE)done=true;else idx+=PAGE}
        return all
      }
      const agrupar=(rows,keyFn,catFn)=>{
        const m={}
        rows.forEach(r=>{const k=keyFn(r);if(!m[k])m[k]={nombre:k,categoria:catFn(r),importe:0,unidades:0};m[k].importe+=r.importe||0;m[k].unidades+=r.unidades||0})
        return m
      }
      const filtrarCanal=(rows)=>canalFiltros.length>0
        ? rows.filter(r=>canalFiltros.includes(r.canal||r.metodo_pago))
        : rows

      if (nivel==='categoria' && canalFiltros.length===0) {
        // Sin filtro de canal — usar ventas para cruzar con costos reales
        const [c, p, prodsData] = await Promise.all([
          fetchAll('ventas','producto,categoria,unidades,importe,canal,metodo_pago',from,to),
          fetchAll('ventas','producto,categoria,unidades,importe,canal,metodo_pago',prevFrom,prevTo),
          sb.from('productos').select('nombre,costo_unitario'),
        ])
        const prods = prodsData.data || []
        const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
        const costoMap = {}
        prods.forEach(p => { costoMap[normalize(p.nombre)] = p.costo_unitario||0 })
        const getCosto = nombre => {
          const base = (nombre||'').replace(/\s*\(.*?\)/g,'').trim()
          return costoMap[normalize(base)] || costoMap[normalize(nombre)] || 0
        }

        const cs=[...new Set(c.map(r=>r.canal||r.metodo_pago).filter(Boolean))]
        setCanalesList(cs)

        // Agrupar por categoría con costo real por producto
        const agruparConCosto = (rows) => {
          const m = {}
          rows.filter(r=>r.producto!=='Venta dia').forEach(r => {
            const cat = r.categoria||'Otros'
            if (!m[cat]) m[cat] = { nombre:cat, categoria:cat, importe:0, unidades:0, costo:0 }
            m[cat].importe  += r.importe||0
            m[cat].unidades += r.unidades||0
            m[cat].costo    += getCosto(r.producto) * (r.unidades||0)
          })
          return m
        }

        const cm = agruparConCosto(c)
        const pm = agruparConCosto(p)
        const lista = Object.values(cm).map(x => {
          const pp = pm[x.nombre]
          const utilidad  = x.importe - x.costo
          const utilPrev  = (pp?.importe||0) - (pp?.costo||0)
          const crecImporte  = pp?.importe>0  ? ((x.importe-pp.importe)/pp.importe*100)   : 0
          const crecUnidades = pp?.unidades>0 ? ((x.unidades-pp.unidades)/pp.unidades*100) : 0
          const crecUtil     = utilPrev>0     ? ((utilidad-utilPrev)/utilPrev*100)          : 0
          return { ...x, utilidad, crecImporte, crecUnidades, crecUtil }
        })
        setDatos(lista.sort((a,b)=>b[metrica]-a[metrica]))
      } else {
        // Con filtro de canal o nivel producto: usar ventas
        const [c,p]=await Promise.all([
          fetchAll('ventas','producto,categoria,unidades,importe,canal,metodo_pago',from,to),
          fetchAll('ventas','producto,categoria,unidades,importe,canal,metodo_pago',prevFrom,prevTo),
        ])
        // Actualizar lista de canales
        const cs=[...new Set(c.map(r=>r.canal||r.metodo_pago).filter(Boolean))]
        setCanalesList(cs)
        const cf=filtrarCanal(c).filter(r=>r.producto!=='Venta dia')
        const pf=filtrarCanal(p).filter(r=>r.producto!=='Venta dia')
        if (nivel==='categoria') {
          // Agrupar por categoría con costo real
          const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
          const {data:prods2}=await sb.from('productos').select('nombre,costo_unitario')
          const costoMap2={}; (prods2||[]).forEach(p=>{costoMap2[normalize(p.nombre)]=p.costo_unitario||0})
          const getCosto2 = nombre => {
            const base=(nombre||'').replace(/\s*\(.*?\)/g,'').trim()
            return costoMap2[normalize(base)]||costoMap2[normalize(nombre)]||0
          }
          const agruparCC = (rows) => {
            const m={}
            rows.forEach(r=>{
              const cat=r.categoria||'Otros'
              if(!m[cat]) m[cat]={nombre:cat,categoria:cat,importe:0,unidades:0,costo:0}
              m[cat].importe+=r.importe||0; m[cat].unidades+=r.unidades||0
              m[cat].costo+=getCosto2(r.producto)*(r.unidades||0)
            })
            return m
          }
          const cm=agruparCC(cf), pm=agruparCC(pf)
          const lista=Object.values(cm).map(x=>{
            const pp=pm[x.nombre]
            const utilidad=x.importe-x.costo, utilPrev=(pp?.importe||0)-(pp?.costo||0)
            const crecImporte=pp?.importe>0?((x.importe-pp.importe)/pp.importe*100):0
            const crecUnidades=pp?.unidades>0?((x.unidades-pp.unidades)/pp.unidades*100):0
            const crecUtil=utilPrev>0?((utilidad-utilPrev)/utilPrev*100):0
            return {...x,utilidad,crecImporte,crecUnidades,crecUtil}
          })
          setDatos(lista.sort((a,b)=>b[metrica]-a[metrica]))
        } else {
          const {data:prods}=await sb.from('productos').select('nombre,costo_unitario')
          const costoMap={};(prods||[]).forEach(p=>{costoMap[p.nombre]=p.costo_unitario||0})
          const cm=agrupar(cf,r=>r.producto,r=>r.categoria||'Otros')
          const pm=agrupar(pf,r=>r.producto,r=>r.categoria||'Otros')
          const lista=Object.values(cm).map(x=>{
            const pp=pm[x.nombre],costo=costoMap[x.nombre]||0
            const utilidad=x.importe-costo*x.unidades
            const utilPrev=(pp?.importe||0)-costo*(pp?.unidades||0)
            const crecImporte=pp?.importe>0?((x.importe-pp.importe)/pp.importe*100):0
            const crecUnidades=pp?.unidades>0?((x.unidades-pp.unidades)/pp.unidades*100):0
            const crecUtil=utilPrev>0?((utilidad-utilPrev)/utilPrev*100):0
            return {...x,utilidad,crecImporte,crecUnidades,crecUtil}
          })
          setDatos(lista.sort((a,b)=>b[metrica]-a[metrica]))
        }
      }
    } catch(e){console.error(e)}
    setLoading(false)
  },[rango,rangoDesde,rangoHasta,nivel,metrica,canalFiltros])

  useEffect(()=>{load()},[load])

  // Cargar guisos cuando se selecciona la vista
  useEffect(()=>{
    if (vista !== 'guisos') return
    const cargarGuisos = async () => {
      setLoadingGuisos(true)
      const { from, to } = getRangoFechas(rango, rangoDesde, rangoHasta)
      const { data, error } = await sb.from('guisos_pedidos')
        .select('guiso,importe')
        .gte('fecha', from).lte('fecha', to)
      if (error) { console.error(error); setLoadingGuisos(false); return }
      // Agrupar por guiso
      const m = {}
      ;(data||[]).forEach(r=>{
        if (!m[r.guiso]) m[r.guiso] = { guiso: r.guiso, veces: 0, importe: 0 }
        m[r.guiso].veces += 1
        m[r.guiso].importe += parseFloat(r.importe)||0
      })
      setGuisos(Object.values(m).sort((a,b)=>b.veces-a.veces))
      setLoadingGuisos(false)
    }
    cargarGuisos()
  },[vista, rango, rangoDesde, rangoHasta])

  const metricaLabel={importe:'Ingresos',unidades:'Unidades',utilidad:'Utilidad'}
  const fmt={importe:fmtM,unidades:v=>fmtN(v)+' uds',utilidad:fmtM}[metrica]
  const categoriasDisponibles = [...new Set(datos.map(d=>d.categoria||'Otros'))].sort()
  const datosFiltrados = (nivel==='producto' && catFiltro!=='todas')
    ? datos.filter(d=>(d.categoria||'Otros')===catFiltro)
    : datos
  const sorted=[...datosFiltrados].sort((a,b)=>b[metrica]-a[metrica])
  const topProds=sorted.slice(0,topN)
  const bottomProds=[...sorted].reverse().slice(0,topN)

  // ÚNICA fuente de verdad para cuadrantes
  const bcgCalc = calcCuadrantes(datos, 'bcg')
  const bpsCalc = calcCuadrantes(datos, 'bps')
  const activeCalc = vista==='bcg' ? bcgCalc : bpsCalc

  const barOpts={
    indexAxis:'y',responsive:true,maintainAspectRatio:false,
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},
    scales:{
      x:{ticks:{color:'#888',font:{size:10},callback:v=>metrica==='unidades'?fmtN(v):fmtM(v)},grid:{color:'#eee'},border:{display:false}},
      y:{ticks:{color:'#888',font:{size:10}},grid:{display:false},border:{display:false}}
    }
  }

  return (
    <div>
      <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap',alignItems:'center',justifyContent:'space-between'}}>
        <PeriodSwitcher rango={rango} granularidad={granularidad}
          onRango={setRango} onGranularidad={setGranularidad}
          rangoDesde={rangoDesde} rangoHasta={rangoHasta}
          onRangoChange={(d,h)=>{setRangoDesde(d);setRangoHasta(h)}}/>
        <ExportBtn titulo="Rendimiento de productos" getElement={()=>document.querySelector('.content')}/>
      </div>

      <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
        <div style={{display:'flex',borderRadius:'var(--r-md)',overflow:'hidden',border:'1px solid var(--border-md)'}}>
          {[['categoria','Por Categoría'],['producto','Por Producto']].map(([v,l])=>(
            <button key={v} onClick={()=>setNivel(v)} style={{padding:'5px 14px',fontSize:11,cursor:'pointer',border:'none',background:nivel===v?'var(--accent)':'var(--bg)',color:nivel===v?'#fff':'var(--text2)',fontWeight:nivel===v?600:400}}>{l}</button>
          ))}
        </div>

        {/* Filtro canal */}
        {canalesList.length>0&&(<>
          <span style={{fontSize:11,color:'var(--text2)'}}>Canal:</span>
          <button onClick={()=>setCanalFiltros([])}
            style={{padding:'3px 10px',borderRadius:99,fontSize:10,cursor:'pointer',
              border:`1.5px solid ${canalFiltros.length===0?'var(--accent)':'var(--border-md)'}`,
              background:canalFiltros.length===0?'var(--accent)22':'transparent',
              color:canalFiltros.length===0?'var(--accent)':'var(--text2)'}}>Todos</button>
          {canalesList.map(c=>(
            <button key={c} onClick={()=>setCanalFiltros(prev=>prev.includes(c)?prev.filter(x=>x!==c):[...prev,c])}
              style={{padding:'3px 10px',borderRadius:99,fontSize:10,cursor:'pointer',
                border:`1.5px solid ${canalFiltros.includes(c)?'var(--accent)':'var(--border-md)'}`,
                background:canalFiltros.includes(c)?'var(--accent)22':'transparent',
                color:canalFiltros.includes(c)?'var(--accent)':'var(--text2)'}}>
              {c}
            </button>
          ))}
        </>)}
        <div style={{display:'flex',borderRadius:'var(--r-md)',overflow:'hidden',border:'1px solid var(--border-md)'}}>
          {Object.entries(metricaLabel).map(([v,l])=>(
            <button key={v} onClick={()=>setMetrica(v)} style={{padding:'5px 14px',fontSize:11,cursor:'pointer',border:'none',background:metrica===v?'#7F77DD':'var(--bg)',color:metrica===v?'#fff':'var(--text2)',fontWeight:metrica===v?600:400}}>{l}</button>
          ))}
        </div>
        <div style={{display:'flex',borderRadius:'var(--r-md)',overflow:'hidden',border:'1px solid var(--border-md)'}}>
          {[['top','📊 Top/Bottom'],['guisos','🥘 Guisos'],['bcg','🎯 Matriz BCG'],['bps','💹 Matriz BP&S']].map(([v,l])=>(
            <button key={v} onClick={()=>setVista(v)} style={{padding:'5px 14px',fontSize:11,cursor:'pointer',border:'none',background:vista===v?'#1D9E75':'var(--bg)',color:vista===v?'#fff':'var(--text2)',fontWeight:vista===v?600:400}}>{l}</button>
          ))}
        </div>
        {vista==='top'&&<select value={topN} onChange={e=>setTopN(+e.target.value)} className="form-input" style={{width:80,fontSize:11}}>{[5,10,15,20].map(n=><option key={n} value={n}>Top {n}</option>)}</select>}
      </div>

      {nivel==='producto' && vista==='top' && categoriasDisponibles.length>1 && (
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10,alignItems:'center'}}>
          <span style={{fontSize:11,color:'var(--text2)',fontWeight:600,marginRight:4}}>Categoría:</span>
          <button onClick={()=>setCatFiltro('todas')} style={{padding:'4px 12px',borderRadius:'var(--r-sm)',fontSize:11,cursor:'pointer',border:`1.5px solid ${catFiltro==='todas'?'var(--accent)':'var(--border-md)'}`,background:catFiltro==='todas'?'var(--accent)22':'transparent',color:catFiltro==='todas'?'var(--accent)':'var(--text2)',fontWeight:catFiltro==='todas'?600:400}}>Todas</button>
          {categoriasDisponibles.map(c=>(
            <button key={c} onClick={()=>setCatFiltro(c)} style={{padding:'4px 12px',borderRadius:'var(--r-sm)',fontSize:11,cursor:'pointer',border:`1.5px solid ${catFiltro===c?'var(--accent)':'var(--border-md)'}`,background:catFiltro===c?'var(--accent)22':'transparent',color:catFiltro===c?'var(--accent)':'var(--text2)',fontWeight:catFiltro===c?600:400}}>{c}</button>
          ))}
        </div>
      )}

      {nivel==='producto'&&datosFiltrados.length<10&&(
        <div style={{padding:'8px 14px',borderRadius:'var(--r-md)',marginBottom:10,background:'#FFF9E6',color:'#8A5A00',fontSize:11}}>
          ⚠ Datos por producto solo disponibles desde el POS. Para histórico completo usa <strong>Por Categoría</strong>.
        </div>
      )}

      {loading?<div className="loading-screen" style={{height:200}}><div className="spinner"/></div>
      :datosFiltrados.length===0?<div className="card" style={{textAlign:'center',padding:'40px 0',color:'var(--text3)'}}>Sin datos para el periodo</div>
      :vista==='guisos'?(
        <>
          {loadingGuisos ? <div className="loading-screen" style={{height:200}}><div className="spinner"/></div>
          : guisos.length===0 ? <div className="card" style={{textAlign:'center',padding:'40px 0',color:'var(--text3)'}}>Sin datos de guisos en este periodo</div>
          : (<>
            <div className="metrics" style={{gridTemplateColumns:'repeat(4,minmax(0,1fr))',marginBottom:12}}>
              <div className="mc"><div className="mc-label">Guisos detectados</div><div className="mc-value">{guisos.length}</div></div>
              <div className="mc"><div className="mc-label">Total pedidos</div><div className="mc-value">{guisos.reduce((s,g)=>s+g.veces,0)}</div></div>
              <div className="mc"><div className="mc-label">🏆 Más pedido</div><div className="mc-value" style={{fontSize:12,color:'#1D9E75'}}>{guisos[0]?.guiso?.slice(0,18)}</div></div>
              <div className="mc"><div className="mc-label">📉 Menos pedido</div><div className="mc-value" style={{fontSize:12,color:'#E24B4A'}}>{guisos[guisos.length-1]?.guiso?.slice(0,18)}</div></div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
              <div className="card">
                <div className="ch"><div className="ct" style={{color:'#378ADD'}}>🥘 Top {Math.min(10,guisos.length)} guisos por VECES pedido</div></div>
                <div className="chart-wrap" style={{height:Math.max(200, Math.min(10,guisos.length)*36)}}>
                  <Bar data={{
                    labels: guisos.slice(0,10).map(g=>g.guiso),
                    datasets:[{data: guisos.slice(0,10).map(g=>g.veces), backgroundColor:'#378ADDCC', borderRadius:4}]
                  }} options={{...barOpts, plugins:{...barOpts.plugins, tooltip:{callbacks:{label:c=>' '+c.raw+' veces'}}}}}/>
                </div>
              </div>
              <div className="card">
                <div className="ch"><div className="ct" style={{color:'#1D9E75'}}>💵 Top {Math.min(10,guisos.length)} guisos por DINERO</div></div>
                <div className="chart-wrap" style={{height:Math.max(200, Math.min(10,guisos.length)*36)}}>
                  <Bar data={{
                    labels: [...guisos].sort((a,b)=>b.importe-a.importe).slice(0,10).map(g=>g.guiso),
                    datasets:[{data: [...guisos].sort((a,b)=>b.importe-a.importe).slice(0,10).map(g=>g.importe), backgroundColor:'#1D9E75CC', borderRadius:4}]
                  }} options={{...barOpts, plugins:{...barOpts.plugins, tooltip:{callbacks:{label:c=>' '+fmtM(c.raw)}}}}}/>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="ch"><div className="ct">📋 Detalle completo</div></div>
              <table className="tbl" style={{fontSize:12}}>
                <thead><tr><th>Guiso</th><th className="num">Veces pedido</th><th className="num">Importe total</th><th className="num">Promedio</th></tr></thead>
                <tbody>
                  {guisos.map(g=>(
                    <tr key={g.guiso}>
                      <td style={{fontWeight:500}}>{g.guiso}</td>
                      <td className="num">{g.veces}</td>
                      <td className="num">{fmtM(g.importe)}</td>
                      <td className="num c-muted">{fmtM(g.importe/g.veces)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>)}
        </>
      ):vista==='top'?(
        <>
          <div className="metrics" style={{gridTemplateColumns:'repeat(4,minmax(0,1fr))',marginBottom:12}}>
            <div className="mc"><div className="mc-label">{nivel==='categoria'?'Categorías':'Productos'}</div><div className="mc-value">{datosFiltrados.length}</div></div>
            <div className="mc"><div className="mc-label">Total {metricaLabel[metrica]}</div><div className="mc-value" style={{fontSize:14}}>{fmt(datosFiltrados.reduce((s,p)=>s+p[metrica],0))}</div></div>
            <div className="mc"><div className="mc-label">🏆 Líder</div><div className="mc-value" style={{fontSize:11,color:'#1D9E75'}}>{sorted[0]?.nombre?.slice(0,20)}</div></div>
            <div className="mc"><div className="mc-label">📉 Rezagado</div><div className="mc-value" style={{fontSize:11,color:'#E24B4A'}}>{sorted[sorted.length-1]?.nombre?.slice(0,20)}</div></div>
          </div>

          {/* Tres tops */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:12}}>
            {/* Top Ingresos */}
            <div className="card">
              <div className="ch"><div className="ct" style={{color:'#378ADD'}}>🏆 Top {topN} Ingresos</div></div>
              <div className="chart-wrap" style={{height:Math.max(180,topN*34)}}>
                <Bar data={{
                  labels:[...datosFiltrados].sort((a,b)=>b.importe-a.importe).slice(0,topN).map(p=>p.nombre.slice(0,18)),
                  datasets:[{data:[...datosFiltrados].sort((a,b)=>b.importe-a.importe).slice(0,topN).map(p=>p.importe),
                    backgroundColor:[...datosFiltrados].sort((a,b)=>b.importe-a.importe).slice(0,topN).map(p=>getColor(p.categoria)+'CC'),borderRadius:4}]
                }} options={{...barOpts,plugins:{...barOpts.plugins,tooltip:{callbacks:{label:c=>' '+fmtM(c.raw)}}}}}/>
              </div>
            </div>

            {/* Top Unidades */}
            <div className="card">
              <div className="ch"><div className="ct" style={{color:'#1D9E75'}}>📦 Top {topN} Unidades</div></div>
              <div className="chart-wrap" style={{height:Math.max(180,topN*34)}}>
                <Bar data={{
                  labels:[...datosFiltrados].sort((a,b)=>b.unidades-a.unidades).slice(0,topN).map(p=>p.nombre.slice(0,18)),
                  datasets:[{data:[...datosFiltrados].sort((a,b)=>b.unidades-a.unidades).slice(0,topN).map(p=>p.unidades),
                    backgroundColor:[...datosFiltrados].sort((a,b)=>b.unidades-a.unidades).slice(0,topN).map(p=>getColor(p.categoria)+'CC'),borderRadius:4}]
                }} options={{...barOpts,plugins:{...barOpts.plugins,tooltip:{callbacks:{label:c=>' '+fmtN(c.raw)+' uds'}}}}}/>
              </div>
            </div>

            {/* Top Rentabilidad */}
            <div className="card">
              <div className="ch"><div className="ct" style={{color:'#7F77DD'}}>💰 Top {topN} Rentabilidad</div></div>
              <div className="chart-wrap" style={{height:Math.max(180,topN*34)}}>
                <Bar data={{
                  labels:[...datosFiltrados].sort((a,b)=>b.utilidad-a.utilidad).slice(0,topN).map(p=>p.nombre.slice(0,18)),
                  datasets:[{data:[...datosFiltrados].sort((a,b)=>b.utilidad-a.utilidad).slice(0,topN).map(p=>p.utilidad),
                    backgroundColor:[...datosFiltrados].sort((a,b)=>b.utilidad-a.utilidad).slice(0,topN).map(p=>getColor(p.categoria)+'CC'),borderRadius:4}]
                }} options={{...barOpts,plugins:{...barOpts.plugins,tooltip:{callbacks:{label:c=>' '+fmtM(c.raw)}}}}}/>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="ch"><div className="ct">Ranking completo</div><span style={{fontSize:11,color:'var(--text3)'}}>{datos.length} {nivel==='categoria'?'categorías':'productos'}</span></div>
            <div style={{overflowX:'auto',maxHeight:420,overflowY:'auto'}}>
              <table className="tbl">
                <thead style={{position:'sticky',top:0,background:'var(--surface)'}}>
                  <tr><th style={{width:36}}>#</th><th>{nivel==='categoria'?'Categoría':'Producto'}</th>{nivel==='producto'&&<th>Cat.</th>}<th className="num">Ingresos</th><th className="num">Unidades</th><th className="num">Utilidad</th><th className="num">Crec. $</th><th className="num">Crec. Uds</th></tr>
                </thead>
                <tbody>
                  {sorted.map((p,i)=>(
                    <tr key={p.nombre}>
                      <td style={{fontSize:12,fontWeight:700,color:i<3?getColor(p.categoria):'var(--text3)'}}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td>
                      <td style={{fontWeight:500,fontSize:12}}><span style={{width:8,height:8,borderRadius:'50%',background:getColor(p.categoria),display:'inline-block',marginRight:6}}/>{p.nombre}</td>
                      {nivel==='producto'&&<td><span style={{fontSize:9,padding:'1px 5px',borderRadius:99,background:getColor(p.categoria)+'22',color:getColor(p.categoria)}}>{p.categoria}</span></td>}
                      <td className="num">{fmtM(p.importe)}</td>
                      <td className="num">{fmtN(p.unidades)}</td>
                      <td className="num" style={{color:p.utilidad>=0?'#1D9E75':'#E24B4A'}}>{fmtM(p.utilidad)}</td>
                      <td className="num"><span style={{color:p.crecImporte>=0?'#1D9E75':'#E24B4A',fontWeight:600}}>{p.crecImporte>0?'+':''}{Math.round(p.crecImporte)}%</span></td>
                      <td className="num"><span style={{color:p.crecUnidades>=0?'#1D9E75':'#E24B4A',fontWeight:600}}>{p.crecUnidades>0?'+':''}{Math.round(p.crecUnidades)}%</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ):(
        <>
          {/* Leyenda + descripción */}
          <div style={{display:'flex',gap:16,marginBottom:8,flexWrap:'wrap',alignItems:'center'}}>
            {Object.entries(Q_CFG).map(([k,c])=>(
              <div key={k} style={{display:'flex',alignItems:'center',gap:5,fontSize:11}}>
                <div style={{width:10,height:10,borderRadius:'50%',background:c.color}}/>
                <span style={{color:c.color,fontWeight:600}}>{c.label}</span>
              </div>
            ))}
            <span style={{fontSize:10,color:'var(--text3)',marginLeft:'auto'}}>
              {vista==='bcg'?'X=Unidades · Y=Crec.Ingresos · Tamaño=Unidades':'X=Crec.Ventas · Y=Crec.Rentabilidad · Tamaño=Utilidad'}
            </span>
          </div>

          <div className="card" style={{marginBottom:12}}>
            <MatrizBubble calc={activeCalc} tipo={vista}/>
          </div>

          {/* Tablas por cuadrante — USANDO MISMOS DATOS DEL CHART */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            {Object.entries(Q_CFG).map(([key,c])=>{
              const items = activeCalc[key]
              const sKey = activeCalc.sKey
              const fmtS = sKey==='utilidad' ? fmtM : v=>fmtN(v)+' uds'
              return (
                <div key={key} className="card" style={{borderLeft:`3px solid ${c.color}`}}>
                  <div className="ch">
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:c.color}}>{c.label}</div>
                      <div style={{fontSize:10,color:'var(--text3)',marginTop:1}}>{c.accion}</div>
                    </div>
                    <div style={{fontSize:13,fontWeight:700,color:c.color}}>{items.length}</div>
                  </div>
                  {items.length===0
                    ? <div style={{fontSize:11,color:'var(--text3)',padding:'6px 0'}}>Sin elementos en este cuadrante</div>
                    : items.sort((a,b)=>(b[sKey]||0)-(a[sKey]||0)).map(p=>(
                        <div key={p.nombre} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'0.5px solid var(--border)'}}>
                          <div style={{display:'flex',alignItems:'center',gap:5,flex:1}}>
                            <div style={{width:7,height:7,borderRadius:'50%',background:getColor(p.categoria),flexShrink:0}}/>
                            <span style={{fontSize:11,fontWeight:500,color:'var(--text)'}}>{p.nombre.slice(0,24)}</span>
                          </div>
                          <span style={{fontSize:11,color:c.color,fontWeight:600,marginLeft:8}}>{fmtS(p[sKey]||0)}</span>
                          <span style={{fontSize:10,color:p.crecImporte>=0?'#1D9E75':'#E24B4A',marginLeft:6,minWidth:44,textAlign:'right'}}>
                            {p.crecImporte>0?'+':''}{Math.round(p.crecImporte)}%
                          </span>
                        </div>
                      ))
                  }
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
