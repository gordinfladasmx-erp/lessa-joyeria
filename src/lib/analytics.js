import { sb } from './supabase'
import { startOfDay, endOfDay, startOfWeek, endOfWeek,
         startOfMonth, endOfMonth, startOfQuarter, endOfQuarter,
         startOfYear, endOfYear, subDays, subWeeks, subMonths,
         subQuarters, subYears, format } from 'date-fns'
import { es } from 'date-fns/locale'

export const fmt      = d => format(d, 'yyyy-MM-dd')
export const fmtLabel = (d, period) => {
  const map = {
    diario:'dd MMM', semanal:'dd MMM', mensual:"MMM ''yy",
    trimestral:"'Q'Q yy", anual:'yyyy',
    '2anios':'MMM yy', '3anios':'MMM yy', '4anios':'MMM yy',
  }
  return format(d, map[period] || 'dd MMM', { locale: es })
}

export function getPeriodRange(period, anchor = new Date()) {
  const fns = {
    diario:     [startOfDay, endOfDay],
    semanal:    [d=>startOfWeek(d,{weekStartsOn:1}), d=>endOfWeek(d,{weekStartsOn:1})],
    mensual:    [startOfMonth, endOfMonth],
    trimestral: [startOfQuarter, endOfQuarter],
    anual:      [startOfYear, endOfYear],
    '2anios':   [d=>startOfYear(subYears(d,1)), endOfYear],
    '3anios':   [d=>startOfYear(subYears(d,2)), endOfYear],
    '4anios':   [d=>startOfYear(subYears(d,3)), endOfYear],
  }
  const [s,e] = fns[period] || fns.diario
  return { from: fmt(s(anchor)), to: fmt(e(anchor)) }
}

export function getPrevRange(period, anchor = new Date()) {
  const subFn = {
    diario:subDays, semanal:subWeeks, mensual:subMonths,
    trimestral:subQuarters, anual:subYears,
    '2anios':subYears, '3anios':subYears, '4anios':subYears,
  }
  const subCount = { '2anios':2, '3anios':3, '4anios':4 }
  const prev = subFn[period]?.(anchor, subCount[period]||1) || subDays(anchor,1)
  return getPeriodRange(period, prev)
}

// Paginated fetch — usado solo para datos detallados (reportes, rentabilidad)
async function fetchAll(table, select, from, to) {
  const PAGE = 1000
  let all = [], idx = 0, done = false
  while (!done) {
    const { data, error } = await sb.from(table).select(select)
      .gte('fecha', from).lte('fecha', to)
      .order('fecha', { ascending: true })
      .range(idx, idx + PAGE - 1)
    if (error) throw error
    all = all.concat(data || [])
    if (!data || data.length < PAGE) done = true
    else idx += PAGE
  }
  return all
}

// ── Caché en memoria ────────────────────────────────────────────────────────
// Guarda resultados de queries para evitar llamadas repetidas a Supabase.
// TTL: 5 minutos para el día actual (puede cambiar), 60 min para periodos pasados.
const _cache = new Map()
function _cacheGet(key) {
  const entry = _cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.exp) { _cache.delete(key); return null }
  return entry.data
}
function _cacheSet(key, data, from, to) {
  const today = fmt(new Date())
  // Si el rango incluye hoy → TTL corto (5 min); si es historia → TTL largo (60 min)
  const ttl = (to >= today) ? 5 * 60 * 1000 : 60 * 60 * 1000
  _cache.set(key, { data, exp: Date.now() + ttl })
}
export function clearAnalyticsCache() { _cache.clear() }

// Fetch desde vista agregada — mucho más rápido (365 filas vs 18k)
// Límite 10,000: cubre hasta ~4 años de datos diarios con múltiples canales
async function fetchView(view, select, from, to) {
  const key = `${view}|${select}|${from}|${to}`
  const cached = _cacheGet(key)
  if (cached) return cached

  // Paginar para superar el límite de 1,000 filas de Supabase PostgREST
  const PAGE = 1000
  let all = [], idx = 0, done = false
  while (!done) {
    const { data, error } = await sb.from(view).select(select)
      .gte('fecha', from).lte('fecha', to)
      .order('fecha', { ascending: true })
      .range(idx, idx + PAGE - 1)
    if (error) throw error
    all = all.concat(data || [])
    if (!data || data.length < PAGE) done = true; else idx += PAGE
  }

  _cacheSet(key, all, from, to)
  return all
}

export async function fetchVentasRange(from, to) {
  return fetchAll('ventas', 'id,fecha,created_at,producto,categoria,canal,unidades,importe,metodo_pago,cliente', from, to)
}

// ── KPIs ACUMULADOS DEL PERÍODO (usa vista agregada) ─────────
export async function fetchKpiAcum(from, to) {
  const [cierres, ventas] = await Promise.all([
    fetchAll('cierres_dia', 'dif_efvo,dif_tc,dif_plat', from, to),
    fetchView('v_ventas_dia', 'fecha,canal,metodo_pago,importe,unidades,ordenes', from, to),
  ])
  const netAdj = field => -(cierres)
    .filter(c => Math.abs(parseFloat(c[field])||0) >= 1)
    .reduce((s,c) => s + (parseFloat(c[field])||0), 0)

  // órdenes completas sin cobrar (metodo_pago/canal = 'Gratis')
  const isGratis  = v => (v.metodo_pago||'').toLowerCase() === 'gratis' || (v.canal||'').toLowerCase() === 'gratis'
  const sinCobro  = ventas.filter(v =>  isGratis(v))
  // artículos gratuitos dentro de órdenes pagadas (café de olla gratis, etc.)
  const artGratis = ventas.filter(v => !isGratis(v) && (parseFloat(v.importe)||0) === 0)
  // ventas con importe > 0
  const pagas     = ventas.filter(v => !isGratis(v) && (parseFloat(v.importe)||0) > 0)

  const gUds          = sinCobro.reduce((s,v)  => s + (v.unidades||0), 0)
  const gImporte      = sinCobro.reduce((s,v)  => s + (parseFloat(v.importe)||0), 0)
  const artUds        = artGratis.reduce((s,v) => s + (v.unidades||0), 0)
  const udsPagas      = pagas.reduce((s,v)     => s + (v.unidades||0), 0)
  const impPagas      = pagas.reduce((s,v)     => s + (parseFloat(v.importe)||0), 0)
  const avgPrecio     = udsPagas > 0 ? impPagas / udsPagas : 0

  return {
    ajEfvo: netAdj('dif_efvo'),
    ajTc:   netAdj('dif_tc'),
    ajPlat: netAdj('dif_plat'),
    gUds,                                   // uds de órdenes sin cobro
    gImporte: Math.round(gImporte),         // importe real de órdenes no cobradas
    gMonto: Math.round(gUds * avgPrecio),   // valor estimado (legacy)
    gCnt:   sinCobro.length,                // nº órdenes sin cobro
    artUds,                                 // uds de artículos gratis en órdenes pagadas
    artCnt: artGratis.length,               // nº registros de artículos gratis
    totUds: ventas.reduce((s,v) => s + (v.unidades||0), 0),
  }
}

export async function fetchGastosRange(from, to) {
  return fetchAll('gastos', 'fecha,proveedor,concepto,categoria_gasto,subcategoria_gasto,metodo_pago,monto', from, to)
}

export async function fetchVentasCatRange(from, to) {
  return fetchAll('ventas_cat', 'fecha,categoria,importe,unidades', from, to)
}

export async function fetchKpiPeriod(period, anchor = new Date(), customFrom = null, customTo = null) {
  const cur  = customFrom ? { from:customFrom, to:customTo } : getPeriodRange(period, anchor)
  const prev = getPrevRange(period, anchor)

  const [curV, prevV, curG, prevG] = await Promise.all([
    fetchView('v_ventas_dia', 'fecha,importe,unidades', cur.from, cur.to),
    fetchView('v_ventas_dia', 'fecha,importe,unidades', prev.from, prev.to),
    fetchView('v_gastos_dia', 'fecha,monto', cur.from, cur.to),
    fetchView('v_gastos_dia', 'fecha,monto', prev.from, prev.to),
  ])

  const aggV = rows => ({ ventas:rows.reduce((s,r)=>s+(r.importe||0),0), unidades:rows.reduce((s,r)=>s+(r.unidades||0),0) })
  const aggG = rows => rows.reduce((s,r)=>s+(r.monto||0),0)
  const pct  = (a,b) => b===0?null:Math.round((a-b)/b*100)

  const c=aggV(curV), p=aggV(prevV), cg=aggG(curG), pg=aggG(prevG)
  return {
    ventas:c.ventas, ventasVsPrev:pct(c.ventas,p.ventas),
    unidades:c.unidades, unidadesVsPrev:pct(c.unidades,p.unidades),
    gastos:cg, gastosVsPrev:pct(cg,pg),
    utilidad:c.ventas-cg,
    margen:c.ventas?Math.round((c.ventas-cg)/c.ventas*100):0,
  }
}

export async function fetchSeries(period, n=12, customFrom=null, customTo=null) {
  const useMonthly = ['2anios','3anios','4anios','rango'].includes(period)

  let from, to
  if (customFrom && customTo) { from=customFrom; to=customTo }
  else {
    const subFn = { diario:subDays,semanal:subWeeks,mensual:subMonths,trimestral:subQuarters,anual:subYears,'2anios':subYears,'3anios':subYears,'4anios':subYears }
    const oldest = subFn[period]?.(new Date(), n-1) || subDays(new Date(), n-1)
    from = getPeriodRange(useMonthly?'mensual':period, oldest).from
    to   = getPeriodRange(useMonthly?'mensual':period, new Date()).to
  }

  const [ventas, gastos] = await Promise.all([
    fetchView('v_ventas_dia', 'fecha,importe,unidades', from, to),
    fetchView('v_gastos_dia', 'fecha,monto', from, to),
  ])

  const key = (fecha) => {
    const d = new Date(fecha+'T00:00:00')
    if (period==='diario'||customFrom)  return format(d,'yyyy-MM-dd')
    if (period==='semanal')             return format(startOfWeek(d,{weekStartsOn:1}),'yyyy-MM-dd')
    if (period==='mensual'||useMonthly) return format(d,'yyyy-MM')
    if (period==='trimestral')          return format(d,'yyyy')+'-Q'+Math.ceil((d.getMonth()+1)/3)
    if (period==='anual')               return format(d,'yyyy')
    return format(d,'yyyy-MM')
  }

  const vMap={}, gMap={}, uMap={}
  ventas.forEach(r=>{ const k=key(r.fecha); vMap[k]=(vMap[k]||0)+(r.importe||0); uMap[k]=(uMap[k]||0)+(r.unidades||0) })
  gastos.forEach(r=>{ const k=key(r.fecha); gMap[k]=(gMap[k]||0)+(r.monto||0) })

  const labels=[], vArr=[], gArr=[], uArr=[], utilArr=[]

  if (customFrom && customTo) {
    const d1=new Date(customFrom+'T00:00:00'), d2=new Date(customTo+'T00:00:00')
    for (let d=new Date(d1); d<=d2; d.setDate(d.getDate()+1)) {
      const k=format(d,'yyyy-MM-dd')
      labels.push(format(d,'dd MMM',{locale:es}))
      const v=Math.round(vMap[k]||0), g=Math.round(gMap[k]||0)
      vArr.push(v); gArr.push(g); uArr.push(Math.round(uMap[k]||0)); utilArr.push(v-g)
    }
  } else if (useMonthly) {
    const nMeses = period==='2anios'?24:period==='3anios'?36:period==='4anios'?48:n
    for (let i=nMeses-1; i>=0; i--) {
      const d=subMonths(new Date(),i)
      const k=format(d,'yyyy-MM')
      labels.push(format(d,"MMM ''yy",{locale:es}))
      const v=Math.round(vMap[k]||0), g=Math.round(gMap[k]||0)
      vArr.push(v); gArr.push(g); uArr.push(Math.round(uMap[k]||0)); utilArr.push(v-g)
    }
  } else {
    const subFn={diario:subDays,semanal:subWeeks,mensual:subMonths,trimestral:subQuarters,anual:subYears}
    for (let i=n-1; i>=0; i--) {
      const d=subFn[period]?.(new Date(),i)||subDays(new Date(),i)
      const k=key(fmt(d))
      labels.push(fmtLabel(d,period))
      const v=Math.round(vMap[k]||0), g=Math.round(gMap[k]||0)
      vArr.push(v); gArr.push(g); uArr.push(Math.round(uMap[k]||0)); utilArr.push(v-g)
    }
  }
  return { labels, ventas:vArr, gastos:gArr, unidades:uArr, utilidad:utilArr }
}

export async function fetchTopProductos(from, to, limit=10) {
  const rows = await fetchView('v_ventas_cat_dia', 'fecha,categoria,importe,unidades', from, to)
  const map={}
  rows.forEach(r=>{
    const k = r.categoria||'Otros'
    if (!map[k]) map[k]={producto:k,familia:k,importe:0,unidades:0}
    map[k].importe  += (r.importe||0)
    map[k].unidades += (r.unidades||0)
  })
  return Object.values(map).sort((a,b)=>b.importe-a.importe).slice(0,limit)
    .map(x=>({...x,importe:Math.round(x.importe),unidades:Math.round(x.unidades)}))
}

export async function fetchPorCategoria(from, to) {
  const rows = await fetchView('v_ventas_cat_dia', 'fecha,categoria,importe,unidades', from, to)
  const map={}
  rows.forEach(r=>{
    const c=r.categoria||'Otros'
    if (!map[c]) map[c]={categoria:c,importe:0,unidades:0}
    map[c].importe  += (r.importe||0)
    map[c].unidades += (r.unidades||0)
  })
  return Object.values(map).map(x=>({...x,importe:Math.round(x.importe),unidades:Math.round(x.unidades)}))
    .sort((a,b)=>b.importe-a.importe)
}

export async function fetchRentabilidadCategoria(from, to, canalesFiltro=[]) {
  const PLATAFORMAS = ['Uber','Uber Chilakiles','DiDi','DiDi Chilakiles','Rappi']

  const [ventas, productos, config] = await Promise.all([
    fetchVentasRange(from, to),
    sb.from('productos').select('nombre,costo_unitario').then(r=>r.data||[]),
    sb.from('config_comisiones').select('id,porcentaje').then(r=>r.data||[])
  ])

  // Cargar comisiones desde BD con fallback a valores por defecto
  const getCom = (id, def) => {
    const c = config.find(x=>x.id===id)
    return c ? (c.porcentaje/100) : def
  }
  const CARGO_TC   = getCom('tarjeta', 0.045)
  const CARGO_PLAT_UBER  = getCom('uber',  0.46)
  const CARGO_PLAT_DIDI  = getCom('didi',  0.46)
  const CARGO_PLAT_RAPPI = getCom('rappi', 0.46)
  const costoMap = {}
  const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()
  productos.forEach(p => {
    costoMap[normalize(p.nombre)] = p.costo_unitario||0
    costoMap[p.nombre] = p.costo_unitario||0 // también con acento
  })

  const NOMBRE_MAP = {
    'chilakiles naturales':'Naturales','chilakiles gratinados':'Gratinados',
    'chilakiles rellenos':'Rellenos','crokantes y otros chilakiles':'Kostrakiles',
  }
  const getCosto = (nombre) => {
    const nombreBase = (nombre||'').replace(/\s*\(.*?\)/g,'').trim()
    const mapped = NOMBRE_MAP[normalize(nombreBase)] || NOMBRE_MAP[normalize(nombre)]
    if (mapped) return costoMap[normalize(mapped)] || costoMap[mapped] || 0
    return costoMap[normalize(nombreBase)] || costoMap[nombreBase] ||
           costoMap[normalize(nombre)]     || costoMap[nombre]     || 0
  }

  const ventasFilt = canalesFiltro.length>0
    ? ventas.filter(r=>canalesFiltro.includes(r.canal||r.metodo_pago))
    : ventas

  const map = {}
  ventasFilt.filter(r=>r.producto!=='Venta dia').forEach(r => {
    const cat = r.categoria||'Otros'
    if (!map[cat]) map[cat] = { categoria:cat, importe:0, costo:0, comision:0, unidades:0 }
    const imp = r.importe||0
    map[cat].importe  += imp
    map[cat].unidades += r.unidades||0
    const costo = getCosto(r.producto)
    map[cat].costo += costo * (r.unidades||0)
    // Agregar comisión de plataforma si aplica
    if (PLATAFORMAS.includes(r.canal)) {
      const rate = r.canal.includes('Uber') ? CARGO_PLAT_UBER
                 : r.canal.includes('DiDi') ? CARGO_PLAT_DIDI
                 : CARGO_PLAT_RAPPI
      map[cat].comision += Math.round(imp * rate)
    }
    // Agregar comisión tarjeta si aplica
    if (r.canal === 'Tarjeta' || r.metodo_pago === 'Tarjeta' || r.canal === 'Transferencia' || r.metodo_pago === 'Transferencia') {
      map[cat].comision += Math.round(imp * CARGO_TC)
    }
  })

  return Object.values(map).map(x=>({
    ...x,
    importe:   Math.round(x.importe),
    costo:     Math.round(x.costo),
    comision:  Math.round(x.comision),
    utilidad:  Math.round(x.importe - x.costo - x.comision),
    margen:    x.importe>0 ? Math.round((x.importe-x.costo-x.comision)/x.importe*100) : 0,
  })).sort((a,b)=>b.importe-a.importe)
}

export async function fetchRentabilidadCanal(from, to) {
  const PLATAFORMAS = ['Uber','Uber Chilakiles','DiDi','DiDi Chilakiles','Rappi']
  const [ventas, productos, config] = await Promise.all([
    fetchVentasRange(from, to),
    sb.from('productos').select('nombre,costo_unitario').then(r=>r.data||[]),
    sb.from('config_comisiones').select('id,porcentaje').then(r=>r.data||[])
  ])
  const getCom = (id, def) => { const c=config.find(x=>x.id===id); return c?(c.porcentaje/100):def }
  const CARGO_TC         = getCom('tarjeta', 0.045)
  const CARGO_PLAT_UBER  = getCom('uber',    0.46)
  const CARGO_PLAT_DIDI  = getCom('didi',    0.46)
  const CARGO_PLAT_RAPPI = getCom('rappi',   0.46)
  const costoMap = {}
  const normalize = s => s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim()
  productos.forEach(p => { costoMap[normalize(p.nombre)]=p.costo_unitario||0; costoMap[p.nombre]=p.costo_unitario||0 })
  const NOMBRE_MAP = {
    'chilakiles naturales':'Naturales','chilakiles gratinados':'Gratinados',
    'chilakiles rellenos':'Rellenos','crokantes y otros chilakiles':'Kostrakiles',
  }
  const getCosto = (nombre) => {
    const nombreBase=(nombre||'').replace(/\s*\(.*?\)/g,'').trim()
    const mapped=NOMBRE_MAP[normalize(nombreBase)]||NOMBRE_MAP[normalize(nombre)]
    if(mapped) return costoMap[normalize(mapped)]||costoMap[mapped]||0
    return costoMap[normalize(nombreBase)]||costoMap[nombreBase]||costoMap[normalize(nombre)]||costoMap[nombre]||0
  }
  const map = {}
  ventas.filter(r=>r.producto!=='Venta dia').forEach(r => {
    const canal = r.canal||r.metodo_pago||'Sin dato'
    if(!map[canal]) map[canal]={ canal, importe:0, costo:0, comision:0, unidades:0 }
    const imp=r.importe||0
    map[canal].importe  += imp
    map[canal].unidades += r.unidades||0
    map[canal].costo    += getCosto(r.producto)*(r.unidades||0)
    if(PLATAFORMAS.includes(r.canal)) {
      const rate=r.canal.includes('Uber')?CARGO_PLAT_UBER:r.canal.includes('DiDi')?CARGO_PLAT_DIDI:CARGO_PLAT_RAPPI
      map[canal].comision += Math.round(imp*rate)
    }
    if(r.canal==='Tarjeta'||r.metodo_pago==='Tarjeta'||r.canal==='Transferencia'||r.metodo_pago==='Transferencia') map[canal].comision += Math.round(imp*CARGO_TC)
  })
  return Object.values(map).map(x=>({
    ...x,
    importe:  Math.round(x.importe),
    costo:    Math.round(x.costo),
    comision: Math.round(x.comision),
    utilidad: Math.round(x.importe-x.costo-x.comision),
    margen:   x.importe>0?Math.round((x.importe-x.costo-x.comision)/x.importe*100):0,
  })).sort((a,b)=>b.importe-a.importe)
}

export async function fetchPorCanal(from, to) {
  const rows = await fetchView('v_ventas_dia', 'canal,metodo_pago,importe,unidades', from, to)
  const map={}
  rows.forEach(r=>{
    const c=r.canal||r.metodo_pago||'Sin dato'
    if (!map[c]) map[c]={canal:c,importe:0,unidades:0}
    map[c].importe  += (r.importe||0)
    map[c].unidades += (r.unidades||0)
  })
  return Object.values(map).map(x=>({...x,importe:Math.round(x.importe)})).sort((a,b)=>b.importe-a.importe)
}

export async function fetchSeriesCat(from, to, period='mensual') {
  // Series de importe y unidades por categoría para gráficas
  const rows = await fetchView('v_ventas_cat_dia', 'fecha,categoria,importe,unidades', from, to)
  const cats = [...new Set(rows.map(r=>r.categoria))].filter(Boolean)

  const key = (fecha) => {
    const d = new Date(fecha+'T00:00:00')
    if (period==='diario') return format(d,'yyyy-MM-dd')
    if (period==='mensual'||['2anios','3anios','4anios'].includes(period)) return format(d,'yyyy-MM')
    if (period==='anual') return format(d,'yyyy')
    return format(d,'yyyy-MM')
  }

  // Agrupar por periodo y categoría
  const byPeriodCat = {}
  rows.forEach(r=>{
    const k=key(r.fecha), cat=r.categoria||'Otros'
    if (!byPeriodCat[k]) byPeriodCat[k]={}
    byPeriodCat[k][cat] = (byPeriodCat[k][cat]||0) + (r.importe||0)
  })

  const periods = Object.keys(byPeriodCat).sort()
  return { periods, cats, byPeriodCat }
}

export async function fetchGastosPorCategoria(from, to) {
  const rows = await fetchView('v_gastos_dia', 'categoria_gasto,monto', from, to)
  const map={}
  rows.forEach(r=>{
    const c=r.categoria_gasto||'Otros'
    if (!map[c]) map[c]={categoria:c,monto:0}
    map[c].monto += (r.monto||0)
  })
  return Object.values(map).map(x=>({...x,monto:Math.round(x.monto)})).sort((a,b)=>b.monto-a.monto)
}

export async function fetchComparativo(period, anchor=new Date(), nAnios=3) {
  const series = []
  for (let i=0; i<nAnios; i++) {
    const anclaje = subYears(anchor, i)
    const { from, to } = getPeriodRange(period, anclaje)
    const [ventas, gastos] = await Promise.all([
      fetchView('v_ventas_dia', 'fecha,importe,unidades', from, to),
      fetchView('v_gastos_dia', 'fecha,monto', from, to),
    ])
    const v=ventas.reduce((s,r)=>s+(r.importe||0),0)
    const g=gastos.reduce((s,r)=>s+(r.monto||0),0)
    const u=ventas.reduce((s,r)=>s+(r.unidades||0),0)
    series.push({
      anio:anclaje.getFullYear(),
      label:i===0?'Este año':'Hace '+(i===1?'1 año':i+' años'),
      ventas:Math.round(v),gastos:Math.round(g),
      utilidad:Math.round(v-g),unidades:Math.round(u),
      from,to,
    })
  }
  return series.reverse()
}

// ── HELPER: rango de fechas según rango + granularidad ──────
// Devuelve el período anterior equivalente al rango dado
export function getPrevPeriodRange(rango, rangoDesde, rangoHasta) {
  const hoy = new Date()
  const addDays = (d, n) => { const r=new Date(d); r.setDate(r.getDate()+n); return r }
  if (rango === 'hoy') { const d=addDays(hoy,-1); return { from:fmt(d), to:fmt(d) } }
  if (rango === 'semana') { const d=addDays(startOfWeek(hoy,{weekStartsOn:1}),-7); return { from:fmt(d), to:fmt(addDays(d,6)) } }
  if (rango === 'mes') { const d=new Date(hoy.getFullYear(),hoy.getMonth()-1,1); return { from:fmt(startOfMonth(d)), to:fmt(endOfMonth(d)) } }
  if (rango === 'mes-ant') { const d=new Date(hoy.getFullYear(),hoy.getMonth()-2,1); return { from:fmt(startOfMonth(d)), to:fmt(endOfMonth(d)) } }
  if (rango === 'trim') { const d=addDays(startOfQuarter(hoy),-1); return { from:fmt(startOfQuarter(d)), to:fmt(endOfQuarter(d)) } }
  if (rango === 'anio-actual') return { from: fmt(startOfYear(addDays(startOfYear(hoy),-1))), to: fmt(addDays(startOfYear(hoy),-1)) }
  if (/^\d{4}$/.test(rango)) { const a=parseInt(rango)-1; return { from:`${a}-01-01`, to:`${a}-12-31` } }
  if (rango === '12m') { const cur=getRangoFechas('12m'); return { from:fmt(subMonths(new Date(cur.from+'T00:00'),12)), to:fmt(subMonths(new Date(cur.to+'T00:00'),12)) } }
  if (rango === '18m') { const cur=getRangoFechas('18m'); return { from:fmt(subMonths(new Date(cur.from+'T00:00'),18)), to:fmt(subMonths(new Date(cur.to+'T00:00'),18)) } }
  if (rango === '36m') { const cur=getRangoFechas('36m'); return { from:fmt(subMonths(new Date(cur.from+'T00:00'),36)), to:fmt(subMonths(new Date(cur.to+'T00:00'),36)) } }
  // Para rangos personalizados o genéricos: desplaza por la misma duración
  const cur = getRangoFechas(rango, rangoDesde, rangoHasta)
  const f=new Date(cur.from+'T00:00:00'), t=new Date(cur.to+'T00:00:00')
  const dias = Math.round((t-f)/(1000*60*60*24)) + 1
  return { from: fmt(addDays(f,-dias)), to: fmt(addDays(t,-dias)) }
}

export function getRangoFechas(rango, rangoDesde, rangoHasta) {
  const hoy = new Date()
  if (rango === 'rango' && rangoDesde && rangoHasta) return { from: rangoDesde, to: rangoHasta }
  if (rango === 'hoy') return { from: fmt(hoy), to: fmt(hoy) }
  if (rango === 'semana') return { from: fmt(startOfWeek(hoy,{weekStartsOn:1})), to: fmt(endOfWeek(hoy,{weekStartsOn:1})) }
  if (rango === 'mes') return { from: fmt(startOfMonth(hoy)), to: fmt(endOfMonth(hoy)) }
  if (rango === 'mes-ant') { const d = new Date(hoy.getFullYear(), hoy.getMonth()-1, 1); return { from: fmt(startOfMonth(d)), to: fmt(endOfMonth(d)) } }
  if (rango === 'trim') return { from: fmt(startOfQuarter(hoy)), to: fmt(endOfQuarter(hoy)) }
  if (rango === 'anio-actual') return { from: fmt(startOfYear(hoy)), to: fmt(hoy) }
  if (/^\d{4}$/.test(rango)) { const a=parseInt(rango); return { from: `${a}-01-01`, to: `${a}-12-31` } }
  if (rango === '1anio') return { from: fmt(subYears(hoy,1)), to: fmt(hoy) }
  if (rango === '12m') return { from: fmt(startOfMonth(subMonths(hoy,11))), to: fmt(endOfMonth(hoy)) }
  if (rango === '18m') return { from: fmt(startOfMonth(subMonths(hoy,17))), to: fmt(endOfMonth(hoy)) }
  if (rango === '36m') return { from: fmt(startOfMonth(subMonths(hoy,35))), to: fmt(endOfMonth(hoy)) }
  const anios = rango==='2anios'?2:rango==='3anios'?3:4
  const desde = new Date(hoy); desde.setFullYear(hoy.getFullYear()-anios); desde.setMonth(0); desde.setDate(1)
  return { from: fmt(desde), to: fmt(endOfYear(hoy)) }
}

// ── SERIES con rango + granularidad ──────────────────────────
export async function fetchSeriesRangoGran(rango, granularidad, rangoDesde, rangoHasta, canalesFiltro=[]) {
  const { from, to } = getRangoFechas(rango, rangoDesde, rangoHasta)
  const [ventasRaw, gastos] = await Promise.all([
    fetchView('v_ventas_dia', 'fecha,canal,metodo_pago,importe,unidades', from, to),
    fetchView('v_gastos_dia', 'fecha,categoria_gasto,monto', from, to),
  ])
  const ventas = canalesFiltro.length>0
    ? ventasRaw.filter(r=>canalesFiltro.includes(r.canal||r.metodo_pago))
    : ventasRaw

  const key = (fecha) => {
    const d = new Date(fecha+'T00:00:00')
    if (granularidad==='diario')     return format(d,'yyyy-MM-dd')
    if (granularidad==='semanal')    return format(startOfWeek(d,{weekStartsOn:1}),'yyyy-MM-dd')
    if (granularidad==='mensual')    return format(d,'yyyy-MM')
    if (granularidad==='trimestral') return format(d,'yyyy')+'-Q'+Math.ceil((d.getMonth()+1)/3)
    if (granularidad==='anual')      return format(d,'yyyy')
    return format(d,'yyyy-MM')
  }

  const label = (fecha) => {
    const d = new Date(fecha+'T00:00:00')
    if (granularidad==='diario')     return format(d,'dd MMM',{locale:es})
    if (granularidad==='semanal')    return format(d,'dd MMM',{locale:es})
    if (granularidad==='mensual')    return format(d,"MMM ''yy",{locale:es})
    if (granularidad==='trimestral') return 'Q'+Math.ceil((d.getMonth()+1)/3)+' '+d.getFullYear().toString().slice(2)
    if (granularidad==='anual')      return format(d,'yyyy')
    return format(d,"MMM ''yy",{locale:es})
  }

  // Bucket data — separar costo del resto de gastos
  const vMap={}, gMap={}, cMap={}, uMap={}, lblMap={}
  ventas.forEach(r=>{ const k=key(r.fecha); vMap[k]=(vMap[k]||0)+(r.importe||0); uMap[k]=(uMap[k]||0)+(r.unidades||0); if(!lblMap[k])lblMap[k]=label(r.fecha) })
  gastos.forEach(r=>{ 
    const k=key(r.fecha)
    gMap[k]=(gMap[k]||0)+(r.monto||0)
    if(r.categoria_gasto==='COSTOS' || r.categoria_gasto==='Costo') cMap[k]=(cMap[k]||0)+(r.monto||0)
    if(!lblMap[k])lblMap[k]=label(r.fecha)
  })

  // Generate ordered complete timeline for multi-period ranges; sparse for short ranges
  const needsFullTimeline = ['mensual','trimestral','anual'].includes(granularidad)
  let allKeys
  if (needsFullTimeline) {
    const keys = new Set()
    const d0 = new Date(from+'T00:00:00'), d1 = new Date(to+'T00:00:00')
    if (granularidad === 'mensual') {
      for (let d=new Date(d0); d<=d1; d=new Date(d.getFullYear(), d.getMonth()+1, 1))
        keys.add(format(d,'yyyy-MM'))
    } else if (granularidad === 'trimestral') {
      for (let d=new Date(d0.getFullYear(), Math.floor(d0.getMonth()/3)*3, 1); d<=d1; d=new Date(d.getFullYear(), d.getMonth()+3, 1))
        keys.add(format(d,'yyyy')+'-Q'+Math.ceil((d.getMonth()+1)/3))
    } else if (granularidad === 'anual') {
      for (let y=d0.getFullYear(); y<=d1.getFullYear(); y++) keys.add(String(y))
    }
    // also include any sparse keys from data not covered above
    Object.keys(vMap).forEach(k=>keys.add(k)); Object.keys(gMap).forEach(k=>keys.add(k))
    allKeys = [...keys].sort()
  } else {
    allKeys = [...new Set([...Object.keys(vMap), ...Object.keys(gMap)])].sort()
  }

  // Build label for generated keys that may not be in lblMap
  const keyToLabel = (k) => {
    if (lblMap[k]) return lblMap[k]
    if (granularidad==='mensual') { const d=new Date(k+'-01T00:00:00'); return format(d,"MMM ''yy",{locale:es}) }
    if (granularidad==='trimestral') return k.replace('-','Q').replace('Q','Q')
    return k
  }

  const labels=[], vArr=[], gArr=[], cArr=[], uArr=[], utilArr=[], pctCostoArr=[]
  allKeys.forEach(k=>{
    labels.push(keyToLabel(k))
    const v=Math.round(vMap[k]||0), g=Math.round(gMap[k]||0), c=Math.round(cMap[k]||0)
    vArr.push(v); gArr.push(g); cArr.push(c); uArr.push(Math.round(uMap[k]||0)); utilArr.push(v-g)
    pctCostoArr.push(v>0?Math.round(c/v*100):0)
  })

  return { labels, ventas:vArr, gastos:gArr, costo:cArr, unidades:uArr, utilidad:utilArr, pctCosto:pctCostoArr, from, to }
}

export async function fetchKpiRangoGran(rango, granularidad, rangoDesde, rangoHasta, canalesFiltro=[]) {
  const { from, to } = getRangoFechas(rango, rangoDesde, rangoHasta)
  const [ventasRaw, gastos] = await Promise.all([
    fetchView('v_ventas_dia', 'fecha,canal,metodo_pago,importe,unidades,ordenes', from, to),
    fetchView('v_gastos_dia', 'fecha,monto', from, to),
  ])
  const ventas = canalesFiltro.length>0
    ? ventasRaw.filter(r=>canalesFiltro.includes(r.canal||r.metodo_pago))
    : ventasRaw
  const v = ventas.reduce((s,r)=>s+(r.importe||0),0)
  const u = ventas.reduce((s,r)=>s+(r.unidades||0),0)
  const o = ventas.reduce((s,r)=>s+(r.ordenes||0),0)
  const g = gastos.reduce((s,r)=>s+(r.monto||0),0)
  return {
    ventas:Math.round(v), unidades:Math.round(u), gastos:Math.round(g),
    utilidad:Math.round(v-g), margen:v?Math.round((v-g)/v*100):0,
    ticketProm: o>0 ? Math.round(v/o) : 0, ordenes: o,
  }
}

export async function fetchCatSeriesRangoGran(rango, granularidad, rangoDesde, rangoHasta) {
  const { from, to } = getRangoFechas(rango, rangoDesde, rangoHasta)
  const rows = await fetchView('v_ventas_cat_dia', 'fecha,categoria,importe,unidades', from, to)

  const key = (fecha) => {
    const d = new Date(fecha+'T00:00:00')
    if (granularidad==='diario')     return format(d,'yyyy-MM-dd')
    if (granularidad==='semanal')    return format(startOfWeek(d,{weekStartsOn:1}),'yyyy-MM-dd')
    if (granularidad==='mensual')    return format(d,'yyyy-MM')
    if (granularidad==='trimestral') return format(d,'yyyy')+'-Q'+Math.ceil((d.getMonth()+1)/3)
    if (granularidad==='anual')      return format(d,'yyyy')
    return format(d,'yyyy-MM')
  }

  const impMap={}, udsMap={}
  rows.forEach(r=>{
    const k=key(r.fecha), cat=r.categoria||'Otros'
    if(!impMap[k])impMap[k]={}
    if(!udsMap[k])udsMap[k]={}
    impMap[k][cat]=(impMap[k][cat]||0)+(r.importe||0)
    udsMap[k][cat]=(udsMap[k][cat]||0)+(r.unidades||0)
  })

  const cats = [...new Set(rows.map(r=>r.categoria))].filter(Boolean)

  // Generate complete timeline for mensual/trimestral/anual granularidades
  let periodKeys
  if (['mensual','trimestral','anual'].includes(granularidad)) {
    const keys = new Set()
    const d0 = new Date(from+'T00:00:00'), d1 = new Date(to+'T00:00:00')
    if (granularidad === 'mensual') {
      for (let d=new Date(d0); d<=d1; d=new Date(d.getFullYear(), d.getMonth()+1, 1))
        keys.add(format(d,'yyyy-MM'))
    } else if (granularidad === 'trimestral') {
      for (let d=new Date(d0.getFullYear(), Math.floor(d0.getMonth()/3)*3, 1); d<=d1; d=new Date(d.getFullYear(), d.getMonth()+3, 1))
        keys.add(format(d,'yyyy')+'-Q'+Math.ceil((d.getMonth()+1)/3))
    } else if (granularidad === 'anual') {
      for (let y=d0.getFullYear(); y<=d1.getFullYear(); y++) keys.add(String(y))
    }
    Object.keys(impMap).forEach(k=>keys.add(k))
    periodKeys = [...keys].sort()
  } else {
    periodKeys = [...new Set(Object.keys(impMap))].sort()
  }

  return { periodKeys, cats, impMap, udsMap, from, to }
}

// ── PROMEDIO DIARIO POR CATEGORÍA MES A MES ──────────────────
export async function fetchPromedioDiarioMes(anios = (() => { const y = new Date().getFullYear(); return [y-2, y-1, y] })()) {
  const desde = `${Math.min(...anios)}-01-01`
  const hasta = `${Math.max(...anios)}-12-31`
  const rows = await fetchView('v_ventas_cat_dia', 'fecha,categoria,importe,unidades', desde, hasta)

  // Contar días con ventas por mes
  const diasPorMes = {}
  const ventasPorMes = {}

  rows.forEach(r => {
    const d = new Date(r.fecha+'T00:00:00')
    const mesKey = format(d, 'yyyy-MM')
    const cat = r.categoria || 'Otros'

    if (!diasPorMes[mesKey]) diasPorMes[mesKey] = new Set()
    diasPorMes[mesKey].add(r.fecha)

    if (!ventasPorMes[mesKey]) ventasPorMes[mesKey] = {}
    if (!ventasPorMes[mesKey][cat]) ventasPorMes[mesKey][cat] = { importe:0, unidades:0 }
    ventasPorMes[mesKey][cat].importe  += r.importe  || 0
    ventasPorMes[mesKey][cat].unidades += r.unidades || 0
  })

  const cats = [...new Set(rows.map(r=>r.categoria).filter(Boolean))]
  const meses = [...new Set(rows.map(r=>format(new Date(r.fecha+'T00:00:00'),'yyyy-MM')))].sort()

  // Calcular promedio diario = total / días con ventas
  const result = {}
  meses.forEach(mes => {
    const dias = diasPorMes[mes]?.size || 1
    result[mes] = {}
    cats.forEach(cat => {
      const v = ventasPorMes[mes]?.[cat] || { importe:0, unidades:0 }
      result[mes][cat] = {
        importe:  Math.round(v.importe  / dias),
        unidades: Math.round(v.unidades / dias),
        dias,
      }
    })
  })

  return { meses, cats, result }
}

// ── COMPARATIVO DE PERÍODOS ENTRE AÑOS ───────────────────────
export async function fetchComparativoPeriodos(mesDesde, mesHasta, anios) {
  // mesDesde/mesHasta: 1-12, anios: [2024,2025,2026]
  const allData = {}
  for (const anio of anios) {
    const desde = `${anio}-${String(mesDesde).padStart(2,'0')}-01`
    const hastaDate = new Date(anio, mesHasta, 0) // último día del mesHasta
    const hasta = format(hastaDate, 'yyyy-MM-dd')
    const [ventasRaw, gastosRaw] = await Promise.all([
      fetchAll('ventas', 'fecha,importe,unidades,categoria', desde, hasta),
      fetchAll('gastos', 'fecha,monto,categoria_gasto', desde, hasta),
    ])
    const ventas   = (ventasRaw||[]).reduce((s,r)=>s+(r.importe||0),0)
    const unidades = (ventasRaw||[]).reduce((s,r)=>s+(r.unidades||0),0)
    const gastos   = (gastosRaw||[]).reduce((s,r)=>s+(r.monto||0),0)
    const diasConVentas = [...new Set((ventasRaw||[]).map(r=>r.fecha))].length

    // Por mes dentro del período
    const porMes = {}
    ;(ventasRaw||[]).forEach(r => {
      const mes = format(new Date(r.fecha+'T00:00:00'),'MM')
      if (!porMes[mes]) porMes[mes] = { importe:0, unidades:0, gastos:0 }
      porMes[mes].importe  += r.importe  || 0
      porMes[mes].unidades += r.unidades || 0
    })
    ;(gastosRaw||[]).forEach(r => {
      const mes = format(new Date(r.fecha+'T00:00:00'),'MM')
      if (!porMes[mes]) porMes[mes] = { importe:0, unidades:0, gastos:0 }
      porMes[mes].gastos += r.monto || 0
    })
    // Calcular utilidad y alias ventas por mes
    Object.keys(porMes).forEach(mes => {
      porMes[mes].utilidad = porMes[mes].importe - porMes[mes].gastos
      porMes[mes].ventas   = porMes[mes].importe
    })

    allData[anio] = { ventas: Math.round(ventas), unidades: Math.round(unidades),
      gastos: Math.round(gastos), utilidad: Math.round(ventas-gastos),
      diasConVentas, porMes }
  }
  return allData
}

// ── CAGR ─────────────────────────────────────────────────────
export function calcCAGR(valorInicial, valorFinal, anios) {
  if (!valorInicial || valorInicial <= 0 || anios <= 0) return null
  return Math.round(((valorFinal / valorInicial) ** (1 / anios) - 1) * 1000) / 10
}

export async function fetchAnualParaCAGR() {
  const hoy = new Date()
  const anioActual = hoy.getFullYear()
  const anios = [anioActual - 2, anioActual - 1, anioActual]
  const result = {}
  for (const anio of anios) {
    const desde = `${anio}-01-01`
    const esActual = anio === anioActual
    const hasta = esActual ? format(hoy, 'yyyy-MM-dd') : `${anio}-12-31`
    const meses = esActual
      ? (hoy.getMonth() + hoy.getDate() / new Date(hoy.getFullYear(), hoy.getMonth()+1, 0).getDate())
      : 12
    const [v, g] = await Promise.all([
      fetchView('v_ventas_dia', 'fecha,importe,unidades', desde, hasta),
      fetchAll('gastos', 'monto', desde, hasta),
    ])
    const ventas   = (v||[]).reduce((s,r)=>s+(r.importe||0),0)
    const unidades = (v||[]).reduce((s,r)=>s+(r.unidades||0),0)
    const gastos   = (g||[]).reduce((s,r)=>s+(r.monto||0),0)
    result[anio] = {
      ventas:    Math.round(ventas / meses * 12),
      unidades:  Math.round(unidades / meses * 12),
      gastos:    Math.round(gastos / meses * 12),
      utilidad:  Math.round((ventas - gastos) / meses * 12),
      meses,
    }
  }
  return result
}
// ── Proyección inteligente para un día de la semana ──────────
// Retorna proyección para los próximos N días (incluyendo hoy)
export async function fetchProyeccionDia(nDias = 3) {
  const hoy     = new Date()
  const anioAct = hoy.getFullYear()

  // Rango histórico: últimos 2 años completos + lo que va del año actual
  const desde = `${anioAct - 2}-01-01`
  const hasta  = format(hoy, 'yyyy-MM-dd')

  const rows = await fetchView('v_ventas_dia', 'fecha,importe,unidades', desde, hasta)

  // Agrupar por fecha → total del día
  const porFecha = {}
  ;(rows||[]).forEach(r => {
    if (!porFecha[r.fecha]) porFecha[r.fecha] = { importe:0, unidades:0 }
    porFecha[r.fecha].importe  += parseFloat(r.importe)  || 0
    porFecha[r.fecha].unidades += r.unidades || 0
  })

  // Para cada día de la semana (0-6), calcular promedio ponderado por recencia
  // y CAGR inter-año para ese día de la semana en el mismo mes
  const calcProyDia = (fecha) => {
    const dow = fecha.getDay()                // 0=Dom … 6=Sáb
    const mesTarget = fecha.getMonth() + 1   // 1-12

    // Recopilar todos los días históricos del mismo dow Y mismo mes
    // con peso mayor a los más recientes (decay semanal)
    const muestras = []
    Object.entries(porFecha).forEach(([f, v]) => {
      const d = new Date(f + 'T12:00')
      if (d >= fecha) return  // excluir hoy y futuro
      if (d.getDay() !== dow) return
      // Solo mismo mes ±1 para capturar comportamiento estacional
      const mes = d.getMonth() + 1
      if (Math.abs(mes - mesTarget) > 1 && !(mesTarget === 1 && mes === 12) && !(mesTarget === 12 && mes === 1)) return
      const diasAtras = Math.round((fecha - d) / 86400000)
      // Peso exponencial: más reciente = más peso (half-life ~90 días)
      const peso = Math.exp(-diasAtras / 90)
      muestras.push({ anio: d.getFullYear(), importe: v.importe, unidades: v.unidades, diasAtras, peso })
    })

    if (muestras.length === 0) return null

    // Promedio ponderado
    const sumPeso = muestras.reduce((s,m) => s + m.peso, 0)
    const avgImp  = muestras.reduce((s,m) => s + m.importe  * m.peso, 0) / sumPeso
    const avgUds  = muestras.reduce((s,m) => s + m.unidades * m.peso, 0) / sumPeso

    // CAGR: comparar promedio de muestras del año actual vs año anterior para ese dow+mes
    const porAnio = {}
    muestras.forEach(m => {
      if (!porAnio[m.anio]) porAnio[m.anio] = { imp:[], uds:[] }
      porAnio[m.anio].imp.push(m.importe)
      porAnio[m.anio].uds.push(m.unidades)
    })
    const anios = Object.keys(porAnio).map(Number).sort()
    let cagrFactor = 1
    if (anios.length >= 2) {
      const avg = arr => arr.reduce((s,v)=>s+v,0)/arr.length
      const vIni = avg(porAnio[anios[0]].imp)
      const vFin = avg(porAnio[anios[anios.length-1]].imp)
      const n    = anios[anios.length-1] - anios[0]
      if (vIni > 0 && n > 0) {
        const cagrAnual = (vFin / vIni) ** (1/n) - 1
        // Proyectar al año actual desde el último año histórico
        const anosExtra = anioAct - anios[anios.length-1]
        cagrFactor = (1 + cagrAnual) ** Math.max(anosExtra, 0)
      }
    }

    // Promedio ponderado reciente (últimas 4 semanas mismo dow) para ajuste de tendencia corta
    const recientes = muestras.filter(m => m.diasAtras <= 28).sort((a,b)=>a.diasAtras-b.diasAtras)
    let factorReciente = 1
    if (recientes.length >= 2) {
      const primerMitad = recientes.slice(Math.floor(recientes.length/2))
      const segMitad    = recientes.slice(0, Math.floor(recientes.length/2))
      const avgR1 = primerMitad.reduce((s,m)=>s+m.importe,0)/primerMitad.length
      const avgR2 = segMitad.reduce((s,m)=>s+m.importe,0)/segMitad.length
      if (avgR2 > 0) factorReciente = Math.max(0.85, Math.min(1.2, avgR1 / avgR2))
    }

    return {
      importe:  Math.round(avgImp  * cagrFactor * factorReciente),
      unidades: Math.round(avgUds  * cagrFactor * factorReciente),
      muestras: muestras.length,
      cagrFactor: Math.round((cagrFactor - 1) * 1000) / 10,  // % crecimiento aplicado
    }
  }

  // Calcular proyección para hoy + siguientes N-1 días
  const resultado = []
  for (let i = 0; i < nDias; i++) {
    const fecha = new Date(hoy)
    fecha.setDate(hoy.getDate() + i)
    const proj = calcProyDia(fecha)
    resultado.push({ fecha: format(fecha, 'yyyy-MM-dd'), dow: fecha.getDay(), proj })
  }
  return resultado
}

// ── Proyección inteligente de cierre de mes ──────────────────
// Combina curva de completitud histórica + CAGR + lineal
export async function fetchProyeccionInteligente(ventasActual, gastosActual, unidadesActual, diasAbierto, diasRestantes) {
  const hoy     = new Date()
  const anio    = hoy.getFullYear()
  const mes     = hoy.getMonth() + 1   // 1-12
  const diaHoy  = hoy.getDate()
  const diasMes = new Date(anio, mes, 0).getDate()

  const mesStr  = String(mes).padStart(2, '0')
  const iniMes  = `${anio}-${mesStr}-01`
  const finMes  = `${anio}-${mesStr}-${String(diasMes).padStart(2,'0')}`
  const hoyStr  = format(hoy, 'yyyy-MM-dd')

  // Años históricos: últimos 3 con datos del mismo mes
  const aniosHist = [anio-3, anio-2, anio-1].filter(a => a >= 2023)

  // Para cada año histórico: total del mes completo + acumulado hasta el día equivalente
  const ratios      = []   // % completado a día equivalente vs total mes (ventas $)
  const totales     = []   // total del mes en ese año (ventas $)
  const ratiosUnids = []   // % completado a día equivalente vs total mes (unidades)
  const totalesUnids= []   // total del mes en ese año (unidades)
  for (const a of aniosHist) {
    const iniH = `${a}-${mesStr}-01`
    const finH = `${a}-${mesStr}-${String(new Date(a, mes, 0).getDate()).padStart(2,'0')}`
    const diaEquiv = Math.min(diaHoy, new Date(a, mes, 0).getDate())
    const hastaEquiv = `${a}-${mesStr}-${String(diaEquiv).padStart(2,'0')}`

    const [{ data: rowsMes }, { data: rowsHasta }] = await Promise.all([
      sb.from('v_ventas_dia').select('importe,unidades').gte('fecha', iniH).lte('fecha', finH),
      sb.from('v_ventas_dia').select('importe,unidades').gte('fecha', iniH).lte('fecha', hastaEquiv),
    ])
    const totalMes    = (rowsMes  ||[]).reduce((s,r)=>s+(parseFloat(r.importe)||0),0)
    const acumHasta   = (rowsHasta||[]).reduce((s,r)=>s+(parseFloat(r.importe)||0),0)
    const totalMesU   = (rowsMes  ||[]).reduce((s,r)=>s+(r.unidades||0),0)
    const acumHastaU  = (rowsHasta||[]).reduce((s,r)=>s+(r.unidades||0),0)

    if (totalMes > 0 && acumHasta > 0) {
      ratios.push(acumHasta / totalMes)
      totales.push(totalMes)
    }
    if (totalMesU > 0 && acumHastaU > 0) {
      ratiosUnids.push(acumHastaU / totalMesU)
      totalesUnids.push(totalMesU)
    }
  }

  // CAGR del mismo mes año vs año (usando los totales históricos)
  let cagrMes = 0
  if (totales.length >= 2) {
    const vInicio = totales[0], vFinal = totales[totales.length - 1]
    const n = totales.length - 1
    if (vInicio > 0) cagrMes = (vFinal / vInicio) ** (1 / n) - 1
  }
  let cagrMesUnids = 0
  if (totalesUnids.length >= 2) {
    const uInicio = totalesUnids[0], uFinal = totalesUnids[totalesUnids.length - 1]
    const n = totalesUnids.length - 1
    if (uInicio > 0) cagrMesUnids = (uFinal / uInicio) ** (1 / n) - 1
  }

  const anosDesde = aniosHist.length > 0 ? anio - aniosHist[aniosHist.length-1] : 1

  // Proyección histórica ventas $
  let proyHistorico = null
  if (ratios.length > 0 && ventasActual > 0) {
    const ratioPromedio = ratios.reduce((s,r)=>s+r,0) / ratios.length
    if (ratioPromedio > 0) {
      const baseTotal = ventasActual / ratioPromedio
      proyHistorico = Math.round(baseTotal * (1 + cagrMes) ** anosDesde)
    }
  }

  // Proyección histórica unidades
  let proyHistoricoUnids = null
  if (ratiosUnids.length > 0 && unidadesActual > 0) {
    const ratioPromedioU = ratiosUnids.reduce((s,r)=>s+r,0) / ratiosUnids.length
    if (ratioPromedioU > 0) {
      const baseTotalU = unidadesActual / ratioPromedioU
      proyHistoricoUnids = Math.round(baseTotalU * (1 + cagrMesUnids) ** anosDesde)
    }
  }

  // Proyección lineal clásica
  const proyLineal = diasAbierto > 0
    ? Math.round(ventasActual + (ventasActual / diasAbierto) * diasRestantes)
    : ventasActual
  const proyLinealUnids = diasAbierto > 0
    ? Math.round(unidadesActual + (unidadesActual / diasAbierto) * diasRestantes)
    : unidadesActual

  // Blend: 65% histórico, 35% lineal (si hay datos históricos), sino 100% lineal
  const pV = proyHistorico !== null
    ? Math.round(proyHistorico * 0.65 + proyLineal * 0.35)
    : proyLineal

  const pUnids = proyHistoricoUnids !== null
    ? Math.round(proyHistoricoUnids * 0.65 + proyLinealUnids * 0.35)
    : proyLinealUnids

  // Gastos: proyección lineal (no hay data histórica detallada de gastos)
  const pG = diasAbierto > 0 ? Math.round(gastosActual + (gastosActual / diasAbierto) * diasRestantes) : gastosActual

  return {
    pV, pG, pU: pV - pG, pUnids,
    // Metadatos para mostrar en UI
    ratioUsado:    ratios.length > 0 ? Math.round(ratios.reduce((s,r)=>s+r,0)/ratios.length*100) : null,
    cagrMesPct:    Math.round(cagrMes * 1000) / 10,
    proyHistorico,
    proyLineal,
    aniosUsados:   aniosHist.length,
  }
}

// ── Proyección inteligente genérica: mes / trimestre / año ───
// tipo: 'mes' | 'trim' | 'anio'
// Mismos criterios que fetchProyeccionInteligente (completitud histórica + CAGR + lineal 65/35)
export async function fetchProyeccionPeriodo(tipo, ventasActual, gastosActual, unidadesActual, diasAbierto, diasRestantes) {
  const hoy  = new Date()
  const anio = hoy.getFullYear()
  const mes  = hoy.getMonth() + 1

  // Determinar rango del período actual y equivalente histórico
  let iniActual, finActual, diaEnPeriodo, diasEnPeriodo, periodoStr
  if (tipo === 'mes') {
    const diasMes = new Date(anio, mes, 0).getDate()
    const mesStr = String(mes).padStart(2,'0')
    iniActual = `${anio}-${mesStr}-01`
    finActual = `${anio}-${mesStr}-${String(diasMes).padStart(2,'0')}`
    diaEnPeriodo = hoy.getDate()
    diasEnPeriodo = diasMes
    periodoStr = 'mes'
  } else if (tipo === 'trim') {
    const q = Math.ceil(mes / 3)
    const qMesIni = (q - 1) * 3 + 1
    const qMesFin = q * 3
    const diasFinQ = new Date(anio, qMesFin, 0).getDate()
    iniActual = `${anio}-${String(qMesIni).padStart(2,'0')}-01`
    finActual = `${anio}-${String(qMesFin).padStart(2,'0')}-${String(diasFinQ).padStart(2,'0')}`
    diaEnPeriodo = Math.round((hoy - new Date(iniActual+'T00:00')) / 86400000) + 1
    diasEnPeriodo = Math.round((new Date(finActual+'T00:00') - new Date(iniActual+'T00:00')) / 86400000) + 1
    periodoStr = `Q${q}`
  } else { // anio
    iniActual = `${anio}-01-01`
    finActual = `${anio}-12-31`
    diaEnPeriodo = Math.round((hoy - new Date(`${anio}-01-01T00:00`)) / 86400000) + 1
    diasEnPeriodo = (anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0)) ? 366 : 365
    periodoStr = String(anio)
  }

  const aniosHist = [anio-3, anio-2, anio-1].filter(a => a >= 2023)

  const ratios = [], totales = [], ratiosUnids = [], totalesUnids = []
  for (const a of aniosHist) {
    let iniH, finH, hastaEquivH
    if (tipo === 'mes') {
      const mesStr = String(mes).padStart(2,'0')
      const diasH = new Date(a, mes, 0).getDate()
      iniH = `${a}-${mesStr}-01`
      finH = `${a}-${mesStr}-${String(diasH).padStart(2,'0')}`
      hastaEquivH = `${a}-${mesStr}-${String(Math.min(diaEnPeriodo, diasH)).padStart(2,'0')}`
    } else if (tipo === 'trim') {
      const q = Math.ceil(mes / 3)
      const qMesIni = (q - 1) * 3 + 1
      const qMesFin = q * 3
      const diasFinQH = new Date(a, qMesFin, 0).getDate()
      iniH = `${a}-${String(qMesIni).padStart(2,'0')}-01`
      finH = `${a}-${String(qMesFin).padStart(2,'0')}-${String(diasFinQH).padStart(2,'0')}`
      const equivDate = new Date(new Date(iniH+'T00:00').getTime() + (diaEnPeriodo - 1) * 86400000)
      const maxDate = new Date(finH+'T00:00')
      hastaEquivH = format(equivDate <= maxDate ? equivDate : maxDate, 'yyyy-MM-dd')
    } else {
      const diasAnioH = (a % 4 === 0 && (a % 100 !== 0 || a % 400 === 0)) ? 366 : 365
      iniH = `${a}-01-01`
      finH = `${a}-12-31`
      const equivDate = new Date(new Date(iniH+'T00:00').getTime() + (diaEnPeriodo - 1) * 86400000)
      hastaEquivH = format(equivDate, 'yyyy-MM-dd')
    }

    const [{ data: rowsMes }, { data: rowsHasta }] = await Promise.all([
      sb.from('v_ventas_dia').select('importe,unidades').gte('fecha', iniH).lte('fecha', finH),
      sb.from('v_ventas_dia').select('importe,unidades').gte('fecha', iniH).lte('fecha', hastaEquivH),
    ])
    const totalMes   = (rowsMes  ||[]).reduce((s,r)=>s+(parseFloat(r.importe)||0),0)
    const acumHasta  = (rowsHasta||[]).reduce((s,r)=>s+(parseFloat(r.importe)||0),0)
    const totalMesU  = (rowsMes  ||[]).reduce((s,r)=>s+(r.unidades||0),0)
    const acumHastaU = (rowsHasta||[]).reduce((s,r)=>s+(r.unidades||0),0)
    if (totalMes > 0 && acumHasta > 0)  { ratios.push(acumHasta/totalMes);  totales.push(totalMes) }
    if (totalMesU > 0 && acumHastaU > 0){ ratiosUnids.push(acumHastaU/totalMesU); totalesUnids.push(totalMesU) }
  }

  // CAGR
  let cagrP = 0
  if (totales.length >= 2) { const n=totales.length-1; if(totales[0]>0) cagrP=(totales[n]/totales[0])**(1/n)-1 }
  let cagrPUnids = 0
  if (totalesUnids.length >= 2) { const n=totalesUnids.length-1; if(totalesUnids[0]>0) cagrPUnids=(totalesUnids[n]/totalesUnids[0])**(1/n)-1 }

  const anosDesde = aniosHist.length > 0 ? anio - aniosHist[aniosHist.length-1] : 1

  let proyHistorico = null
  if (ratios.length > 0 && ventasActual > 0) {
    const rp = ratios.reduce((s,r)=>s+r,0)/ratios.length
    if (rp > 0) proyHistorico = Math.round((ventasActual/rp) * (1+cagrP)**anosDesde)
  }
  let proyHistoricoUnids = null
  if (ratiosUnids.length > 0 && unidadesActual > 0) {
    const rp = ratiosUnids.reduce((s,r)=>s+r,0)/ratiosUnids.length
    if (rp > 0) proyHistoricoUnids = Math.round((unidadesActual/rp) * (1+cagrPUnids)**anosDesde)
  }

  const proyLineal = diasAbierto > 0 ? Math.round(ventasActual + (ventasActual/diasAbierto)*diasRestantes) : ventasActual
  const proyLinealUnids = diasAbierto > 0 ? Math.round(unidadesActual + (unidadesActual/diasAbierto)*diasRestantes) : unidadesActual

  const pV     = proyHistorico      !== null ? Math.round(proyHistorico     *0.65 + proyLineal     *0.35) : proyLineal
  const pUnids = proyHistoricoUnids !== null ? Math.round(proyHistoricoUnids*0.65 + proyLinealUnids*0.35) : proyLinealUnids
  const pG     = diasAbierto > 0 ? Math.round(gastosActual + (gastosActual/diasAbierto)*diasRestantes) : gastosActual

  return {
    pV, pG, pU: pV-pG, pUnids,
    ratioUsado:   ratios.length > 0 ? Math.round(ratios.reduce((s,r)=>s+r,0)/ratios.length*100) : null,
    cagrMesPct:   Math.round(cagrP*1000)/10,
    proyHistorico, proyLineal,
    aniosUsados:  aniosHist.length,
    tipo, periodoStr,
    diaEnPeriodo, diasEnPeriodo,
  }
}

export function trendline(data) {
  const n = data.length
  if (n < 2) return data.map(()=>null)
  const valid = data.map((v,i)=>({x:i,y:v||0}))
  const sumX  = valid.reduce((s,p)=>s+p.x,0)
  const sumY  = valid.reduce((s,p)=>s+p.y,0)
  const sumXY = valid.reduce((s,p)=>s+p.x*p.y,0)
  const sumX2 = valid.reduce((s,p)=>s+p.x*p.x,0)
  const slope = (n*sumXY - sumX*sumY) / (n*sumX2 - sumX*sumX) || 0
  const intercept = (sumY - slope*sumX) / n
  return valid.map(p => Math.round(intercept + slope*p.x))
}
