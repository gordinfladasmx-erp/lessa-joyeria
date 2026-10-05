import React, { useState, useEffect, useRef, useCallback } from 'react'
import { sb } from '../lib/supabase.js'
import { generarComanda, generarTicket, imprimir } from '../lib/impresora.js'
import UdsHoyBadge from '../components/UdsHoyBadge.jsx'
import { canonNombre, fetchStockBebidasPostres } from '../utils/stockUtils.js'
import { descontarInsumos } from '../lib/insumos.js'
import { descontarAlmacen } from '../lib/almacen.js'

const PLATOS_BASE = [
  { codigo:'CHI-01', nombre:'Naturales',          familia:'Los Chilakiles',     precio:110, color:'#E24B4A' },
  { codigo:'CHI-02', nombre:'Gratinados',          familia:'Los Chilakiles',     precio:120, color:'#E24B4A' },
  { codigo:'CHI-03', nombre:'Rellenos',            familia:'Los Chilakiles',     precio:140, color:'#E24B4A' },
  { codigo:'CHI-04', nombre:'Botijones',           familia:'Los Chilakiles',     precio:150, color:'#E24B4A' },
  { codigo:'CHI-05', nombre:'Migakiles',           familia:'Los Chilakiles',     precio:130, color:'#E24B4A' },
  { codigo:'CHI-06', nombre:'Suizos',              familia:'Los Chilakiles',     precio:140, color:'#E24B4A' },
  { codigo:'CHI-07', nombre:'Crudakiles',          familia:'Los Chilakiles',     precio:140, color:'#E24B4A' },
  { codigo:'CHI-08', nombre:'Crudakiles Rellenos', familia:'Los Chilakiles',     precio:165, color:'#E24B4A' },
  { codigo:'CHI-09', nombre:'Kostrakiles',         familia:'Los Chilakiles',     precio:140, color:'#E24B4A' },
  { codigo:'HUE-01', nombre:'Omelette',            familia:'Huevos y Crokantes', precio:120, color:'#D85A30' },
  { codigo:'HUE-02', nombre:'Revueltos',           familia:'Huevos y Crokantes', precio:120, color:'#D85A30' },
  { codigo:'HUE-03', nombre:'Estrellados',         familia:'Huevos y Crokantes', precio:120, color:'#D85A30' },
  { codigo:'HUE-04', nombre:'Huevos Rellenos',     familia:'Huevos y Crokantes', precio:120, color:'#D85A30' },
  { codigo:'DOR-01', nombre:'Kekas',               familia:'Los Dorados',        precio: 40, color:'#D85A30' },
  { codigo:'DOR-02', nombre:'Sopes',               familia:'Los Dorados',        precio: 40, color:'#D85A30' },
  { codigo:'COM-01', nombre:'Gorditas',            familia:'Del Comal',          precio: 35, color:'#BA7517' },
  { codigo:'COM-02', nombre:'Tacos',               familia:'Del Comal',          precio: 35, color:'#BA7517' },
  { codigo:'COM-03', nombre:'Quesadillas',         familia:'Del Comal',          precio: 35, color:'#BA7517' },
  { codigo:'COM-04', nombre:'Volcanes',            familia:'Del Comal',          precio: 40, color:'#BA7517' },
  { codigo:'COM-05', nombre:'Sincronizadas',       familia:'Del Comal',          precio: 85, color:'#BA7517' },
  { codigo:'ENF-01', nombre:'Enfrijoladas',        familia:'Enfrijoladas',       precio:120, color:'#BA3B3B' },
  { codigo:'LIT-01', nombre:'Arroz 1/2L',              familia:'1/2 Litros', precio:150, color:'#D4A017' },
  { codigo:'LIT-02', nombre:'Frijolitos de la Casa 1/2L', familia:'1/2 Litros', precio:150, color:'#D4A017' },
  { codigo:'LIT-03', nombre:'Mole de la Casa 1/2L',    familia:'1/2 Litros', precio:150, color:'#D4A017' },
  { codigo:'LIT-04', nombre:'Picadillo 1/2L',          familia:'1/2 Litros', precio:150, color:'#D4A017' },
  { codigo:'LIT-05', nombre:'Deshebrada a la Mexicana 1/2L', familia:'1/2 Litros', precio:150, color:'#D4A017' },
  { codigo:'LIT-06', nombre:'Nopales 1/2L',            familia:'1/2 Litros', precio:150, color:'#D4A017' },
  { codigo:'LIT-07', nombre:'Huevo 1/2L',              familia:'1/2 Litros', precio:150, color:'#D4A017' },
  { codigo:'LIT-08', nombre:'Bistec 1/2L',             familia:'1/2 Litros', precio:150, color:'#D4A017' },
  { codigo:'LIT-09', nombre:'Trocito de la Casa 1/2L', familia:'1/2 Litros', precio:150, color:'#D4A017' },
  { codigo:'LIT-10', nombre:'Papas 1/2L',              familia:'1/2 Litros', precio:150, color:'#D4A017' },
  { codigo:'LIT-11', nombre:'Rajas Poblanas 1/2L',     familia:'1/2 Litros', precio:150, color:'#D4A017' },
  { codigo:'LIT-12', nombre:'Chicharron Duro 1/2L',    familia:'1/2 Litros', precio:150, color:'#D4A017' },
  { codigo:'LIT-13', nombre:'Prensado de la Casa 1/2L',familia:'1/2 Litros', precio:150, color:'#D4A017' },
  { codigo:'CoOr-01', nombre:'Coca-Cola Original',  familia:'Bebidas Frias',      precio: 30, color:'#378ADD' },
  { codigo:'CoZe-01', nombre:'Coca-Cola Zero',      familia:'Bebidas Frias',      precio: 30, color:'#378ADD' },
  { codigo:'BEF-02', nombre:'Agua Natural',        familia:'Bebidas Frias',      precio: 20, color:'#378ADD' },
  { codigo:'BEF-03', nombre:'Agua Jamaica',        familia:'Bebidas Frias',      precio: 30, color:'#378ADD' },
  { codigo:'BEF-04', nombre:'Agua Horchata',       familia:'Bebidas Frias',      precio: 30, color:'#378ADD' },
  { codigo:'BEF-05', nombre:'Agua Limon con Chia', familia:'Bebidas Frias',      precio: 30, color:'#378ADD' },
  { codigo:'BEF-06', nombre:'Agua Mango',          familia:'Bebidas Frias',      precio: 30, color:'#378ADD' },
  { codigo:'BEF-07', nombre:'Agua Pina',           familia:'Bebidas Frias',      precio: 30, color:'#378ADD' },
  { codigo:'BEC-01', nombre:'Cafe de Olla',        familia:'Bebidas Calientes',  precio: 30, color:'#2568B0' },
  { codigo:'BEC-02', nombre:'Cafe de Olla Refill', familia:'Bebidas Calientes',  precio: 20, color:'#2568B0' },
  { codigo:'BEC-03', nombre:'Cafe Americano',      familia:'Bebidas Calientes',  precio: 50, color:'#2568B0' },
  { codigo:'BEC-04', nombre:'Latte',               familia:'Bebidas Calientes',  precio: 70, color:'#2568B0' },
  { codigo:'POS-01', nombre:'Galleta',             familia:'Postres',            precio: 20, color:'#6E6E73' },
  { codigo:'POS-02', nombre:'Muffin',              familia:'Postres',            precio: 35, color:'#6E6E73' },
  { codigo:'POS-03', nombre:'Rol de Canela',       familia:'Postres',            precio: 40, color:'#6E6E73' },
  { codigo:'POS-04', nombre:'Croissant',           familia:'Postres',            precio: 40, color:'#6E6E73' },
{ codigo:'PLA-01', nombre:'Plato a la Carta',   familia:'Platos a la Carta',  precio:100, color:'#9C27B0' },
  { codigo:'POR-01', nombre:'Porcion Arroz',                    familia:'Guisos Extras', precio:40, color:'#8B6914' },
  { codigo:'POR-02', nombre:'Porcion Frijolitos de la Casa',    familia:'Guisos Extras', precio:40, color:'#8B6914' },
  { codigo:'POR-03', nombre:'Porcion Mole de la Casa',          familia:'Guisos Extras', precio:40, color:'#8B6914' },
  { codigo:'POR-04', nombre:'Porcion Picadillo',                familia:'Guisos Extras', precio:40, color:'#8B6914' },
  { codigo:'POR-05', nombre:'Porcion Deshebrada a la Mexicana', familia:'Guisos Extras', precio:40, color:'#8B6914' },
  { codigo:'POR-06', nombre:'Porcion Nopales',                  familia:'Guisos Extras', precio:40, color:'#8B6914' },
  { codigo:'POR-07', nombre:'Porcion Huevo',                    familia:'Guisos Extras', precio:20, color:'#8B6914' },
  { codigo:'POR-08', nombre:'Porcion Bistec',                   familia:'Guisos Extras', precio:40, color:'#8B6914' },
  { codigo:'POR-09', nombre:'Porcion Trocito de la Casa',       familia:'Guisos Extras', precio:40, color:'#8B6914' },
  { codigo:'POR-10', nombre:'Porcion Papas',                    familia:'Guisos Extras', precio:40, color:'#8B6914' },
  { codigo:'POR-11', nombre:'Porcion Rajas Poblanas',           familia:'Guisos Extras', precio:40, color:'#8B6914' },
  { codigo:'POR-12', nombre:'Porcion Chicharron Duro',          familia:'Guisos Extras', precio:40, color:'#8B6914' },
  { codigo:'POR-13', nombre:'Porcion Prensado de la Casa',      familia:'Guisos Extras', precio:40, color:'#8B6914' },
  { codigo:'EMP-01', nombre:'Croissant Relleno',    familia:'Emparedados', precio:60, color:'#2D9E6A' },
  { codigo:'EMP-02', nombre:'Sandwich Natural',     familia:'Emparedados', precio:70, color:'#2D9E6A' },
  { codigo:'EMP-03', nombre:'Sandwich Montecristo', familia:'Emparedados', precio:90, color:'#2D9E6A' },
]

const GUISOS = ['Arroz','Frijolitos de la Casa','Mole de la Casa','Picadillo','Deshebrada a la Mexicana','Nopales','Huevo','Huevo Estrellado','Claras de Huevo','Bistec','Pollo','Arrachera','Trocito de la Casa','Papas','Rajas Poblanas','Chicharron Duro','Prensado de la Casa']
const GUISOS_SIEMPRE_SHOW = ['Huevo Estrellado','Claras de Huevo','Frijolitos de la Casa']
const normZ = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
// Precios especiales por guiso (sobrescriben el precioExtra del plato)
const GUISOS_PREMIUM = { 'Pollo':20, 'Arrachera':30 }
// Guisos que en Chilakiles/Crokantes son SOLO extras con cargo (no aparecen como guiso gratis incluido)
const GUISOS_SOLO_EXTRA_CHILA = ['Pollo']
// Guisos que no aplican en Del Comal y Los Dorados
const GUISOS_SIN_COMAL_DORADOS = ['Pollo']
const SALSAS = [
  { nombre:'Salsa Verde', precio:0 },{ nombre:'Salsa Roja', precio:0 },{ nombre:'Salsa Chipotle', precio:0 },{ nombre:'Cremosa', precio:0 },
  { nombre:'La Cunada', precio:15 },{ nombre:'Diabla', precio:15 },{ nombre:'La Suegra', precio:15 },{ nombre:'La Suegra + Diabla', precio:20 },{ nombre:'Mole', precio:15 }]
const TOPPINGS = [{ nombre:'Queso Sierra', precio:0 },{ nombre:'Queso Asadero', precio:0 },{ nombre:'Crema', precio:0 },{ nombre:'Frijolitos de la Casa', precio:0 }]
const TOPPINGS_POSTRES = [{ nombre:'Queso Crema', precio:0 },{ nombre:'Mermelada', precio:0 }]
const TOPPINGS_EMPAREDADOS = [{ nombre:'Jamon', precio:0 },{ nombre:'Queso', precio:0 },{ nombre:'Vegetales', precio:0 },{ nombre:'Aderezo de la Casa', precio:0 },{ nombre:'Jamon Extra', precio:10 },{ nombre:'Queso Extra', precio:10 }]
const SABORES_LATTE = ['Natural','Vainilla','Moka','Crema Irlandesa']
const LECHE_LATTE   = ['Entera','Deslactosada']
const FAMILIAS_TABS = ['Todos','Los Chilakiles','Huevos y Crokantes','Los Dorados','Del Comal','Enfrijoladas','Emparedados','Platos a la Carta','1/2 Litros','Guisos Extras','Bebidas Frías','Bebidas Calientes','Postres']

// Colores por tab de familia (agrupados por tipo)
const TAB_COLORS = {
  'Todos':             '#378ADD',
  'Los Chilakiles':    '#E24B4A',
  'Huevos y Crokantes':'#D85A30',
  'Los Dorados':       '#D85A30',
  'Del Comal':         '#BA7517',
  'Enfrijoladas':      '#BA3B3B',
  'Guisos Extras':     '#8B6914',
  'Emparedados':       '#2D9E6A',
  'Platos a la Carta': '#7F77DD',
  '1/2 Litros':        '#D4A017',
  'Bebidas Frías':     '#378ADD',
  'Bebidas Calientes': '#2568B0',
  'Postres':           '#6E6E73',
}
const PRODUCTOS_PLATAFORMA = [
  'Naturales','Gratinados','Rellenos','Botijones','Migakiles','Suizos','Crudakiles','Crudakiles Rellenos','Kostrakiles',
  'Gorditas','Kekas','Sopes','Tacos','Quesadillas','Volcanes',
  'Cafe de Olla','Refresco','Agua Jamaica','Agua Horchata','Agua Limon con Chia','Agua Mango','Agua Pina','Agua Natural',
  'Muffin','Galleta',
]
const CANALES = [
  { id:'Efectivo', label:'Efectivo', cargo:0, clip:false },
  { id:'Tarjeta',        label:'Tarjeta',        cargo:0.045, clip:true  },
  { id:'Transferencia',  label:'Transferencia',  cargo:0.045, clip:false },
  { id:'Uber', label:'Uber Eats', cargo:0.46, clip:false },
  { id:'Uber Chilakiles', label:'Uber Chilakiles', cargo:0.46, clip:false },
  { id:'DiDi', label:'DiDi Food', cargo:0.46, clip:false },
  { id:'DiDi Chilakiles', label:'DiDi Chilakiles', cargo:0.46, clip:false },
  { id:'Rappi', label:'Rappi', cargo:0.46, clip:false },
  { id:'Ola', label:'Ola', cargo:0, clip:false },
  { id:'Gratis', label:'Gratis', cargo:0, clip:false },
]
const TIPOS_COMANDA = [
  { id:'mesa', label:'Mesa', icon:'M', color:'#378ADD' },
  { id:'llevar', label:'Para llevar', icon:'L', color:'#EF9F27' },
  { id:'plataforma', label:'Plataforma', icon:'P', color:'#7F77DD' },
]
const SIN_GUISOS = ['CoOr-01','CoZe-01','BEF-02','BEF-03','BEF-04','BEF-05','BEF-06','BEF-07','BEC-01','BEC-02','BEC-03','BEC-04','POS-01','POS-02','POS-03','POS-04','POR-01','POR-02','POR-03','POR-04','POR-05','POR-06','POR-07','POR-08','POR-09','POR-10','POR-11','POR-12','POR-13','EMP-01','EMP-02','EMP-03']
const CON_GUISO_EXTRA = ['Los Chilakiles','Huevos y Crokantes','Enfrijoladas']
const CON_2_GUISOS_GRATIS = ['Del Comal','Los Dorados']
const CON_3_GUISOS_GRATIS = ['CHI-03','CHI-08','CHI-04','HUE-04']
const PLATOS_A_LA_CARTA = ['Platos a la Carta']
// Alias para compatibilidad con el código de inserción de ventas
const canonicalNombre = canonNombre

const ESTADO_LABEL = { pendiente_pago:'💳 Pago pendiente', abierta:'Abierta', en_cocina:'En cocina', en_preparacion:'🍳 En preparación', lista:'Lista ✓', standby:'Standby', cobrada:'Cobrada', cuenta_pedida:'🧾 Cuenta pedida' }
const ESTADO_COLOR = { pendiente_pago:'#7F77DD', abierta:'#378ADD', en_cocina:'#EF9F27', en_preparacion:'#E8883A', lista:'#1D9E75', standby:'#7F77DD', cobrada:'#888', cuenta_pedida:'#E24B4A' }

const today = () => { const d=new Date(); return d.getFullYear()+'-'+(String(d.getMonth()+1).padStart(2,'0'))+'-'+(String(d.getDate()).padStart(2,'0')) }
const fmtM  = v => '$' + Math.round(v).toLocaleString('es-MX')

// Sonido de alarma
function playAlarm() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const beep = (freq, start, dur) => {
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.connect(g); g.connect(ctx.destination)
      o.frequency.value = freq; o.type = 'sine'
      g.gain.setValueAtTime(0.3, ctx.currentTime+start)
      g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime+start+dur)
      o.start(ctx.currentTime+start); o.stop(ctx.currentTime+start+dur+0.05)
    }
    beep(880, 0, 0.3); beep(1100, 0.35, 0.3); beep(880, 0.7, 0.3); beep(1100, 1.05, 0.5)
  } catch(e) {}
}

// ── CONFIG MODAL ──────────────────────────────────────────────
function ConfigModal({ plato, onConfirm, onCancel, stockMax=null, initialConfig=null, guisosActivos=[] }) {
  const ic = initialConfig || {}
  const [qty,        setQty]        = useState(ic.qty        ?? 1)
  const [guiso1,     setGuiso1]     = useState(ic.guiso1     ?? [])
  const [guisoX,     setGuisoX]     = useState(ic.guisoX     ?? [])
  const [salsas,     setSalsas]     = useState(ic.salsas     ?? [])
  const [tops,       setTops]       = useState(ic.tops       ?? [])
  const [sabor,      setSabor]      = useState(ic.sabor      ?? '')
  const [leche,      setLeche]      = useState(ic.leche      ?? '')
  const [notas,      setNotas]      = useState(ic.notas      ?? '')
  const [mediaOrden, setMediaOrden] = useState(ic.mediaOrden ?? false)
  const [extras,     setExtras]     = useState(ic.extras     ?? [])
  const [extraNom,   setExtraNom]   = useState('')
  const [extraMonto, setExtraMonto] = useState('')
  const [cafeOlla,   setCafeOlla]   = useState(ic.cafeOlla   ?? false)
  const [natural,    setNatural]    = useState(ic.natural    ?? false)

  // Guisos visibles: respeta activo del DB; mantiene siempre los que no tienen producto propio
  const guisosVis = guisosActivos.length > 0
    ? (() => {
        const dbNorm = guisosActivos.map(normZ)
        const dbMap  = Object.fromEntries(guisosActivos.map(n=>[normZ(n),n]))
        return GUISOS
          .filter(g => GUISOS_SIEMPRE_SHOW.includes(g) || dbNorm.includes(normZ(g)))
          .map(g => dbMap[normZ(g)] || g)
      })()
    : GUISOS

  const necesitaGuisos = !SIN_GUISOS.includes(plato.codigo) && !plato.codigo.startsWith('LIT-') && !plato.codigo.startsWith('POR-')
  const necesitaExtras = necesitaGuisos && !plato.codigo.startsWith('POR-')
  const esComalDorados = CON_2_GUISOS_GRATIS.includes(plato.familia)
  const esPlatoCarta = PLATOS_A_LA_CARTA.includes(plato.familia)
  const esTresGuisosGratis = CON_3_GUISOS_GRATIS.includes(plato.codigo)
  const esChilakiles   = CON_GUISO_EXTRA.includes(plato.familia)
  const esLatte = plato.codigo === 'BEC-04'
  const esPostreConTops = plato.codigo === 'POS-04' // Croissant: con toppings de postres
  const esEmparedado = plato.codigo.startsWith('EMP-')
  const incluyeCafe = ['Los Chilakiles','Huevos y Crokantes'].includes(plato.familia)
  const esHuevoNaturalOCrocante = ['HUE-01','HUE-02','HUE-03','HUE-04'].includes(plato.codigo)
  const tog = (arr, setArr, v) => setArr(a => a.includes(v) ? a.filter(x=>x!==v) : [...a,v])

  const extraGuisos   = esChilakiles && !esTresGuisosGratis ? guisoX.reduce((s,g)=>s+(GUISOS_PREMIUM[g] ?? (plato.precioExtra||20)),0)
                      : esPlatoCarta ? guisoX.length * 20 : 0
  const extraSalsas   = salsas.reduce((s,n)=>{ const sl=SALSAS.find(x=>x.nombre===n); return s+(sl?.precio||0) },0)
  const toppingsActivos = esEmparedado ? TOPPINGS_EMPAREDADOS : esPostreConTops ? TOPPINGS_POSTRES : TOPPINGS
  const extraToppings = tops.reduce((s,n)=>{ const tp=toppingsActivos.find(x=>x.nombre===n); return s+(tp?.precio||0) },0)
  const extrasManuales= extras.reduce((s,e)=>s+(parseFloat(e.monto)||0), 0)
  const precioBase    = plato.precio + extraGuisos + extraSalsas + extraToppings
  const precioMedia   = mediaOrden ? Math.round(precioBase * 0.60) : precioBase
  const precioUnit    = precioMedia + extrasManuales
  const subtotal      = precioUnit * qty

  const desc = () => {
    const p = []
    if (esHuevoNaturalOCrocante) p.push(natural ? 'Natural sin totopos' : 'Crocante con totopos')
    if (mediaOrden) p.push('½ orden')
    if (guiso1.length) p.push(guiso1.join(', '))
    if (guisoX.length) p.push(guisoX.map(g=>g+' (+$'+(GUISOS_PREMIUM[g] ?? (plato.precioExtra||20))+')').join(', '))
    if (salsas.length) p.push(salsas.join(', '))
    if (tops.length)   p.push(tops.join(', '))
    if (sabor) p.push(sabor)
    if (leche) p.push(leche)
    if (extras.length) p.push(extras.map(e=>e.nombre+' +$'+e.monto).join(', '))
    if (notas) p.push(notas)
    return p.join(' | ')
  }

  const btn = (active, color='var(--accent)') => ({
    padding:'8px 14px', borderRadius:99, fontSize:13, cursor:'pointer',
    border: active ? 'none' : '1.5px solid var(--border-md)',
    background: active ? color : 'var(--bg)',
    color: active ? '#fff' : 'var(--text)',
    fontWeight: active ? 600 : 400,
    minHeight: 38,
  })

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300 }}>
      <div style={{ background:'var(--surface)',borderRadius:'var(--r-lg)',padding:22,width:520,maxHeight:'88vh',overflowY:'auto',border:'0.5px solid var(--border-md)' }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14 }}>
          <div>
            <div style={{ fontSize:15,fontWeight:600 }}>{plato.nombre}</div>
            <div style={{ fontSize:11,color:'var(--text2)' }}>{plato.familia} · ${plato.precio}</div>
          </div>
          <div style={{ display:'flex',alignItems:'center',gap:8 }}>
            <button onClick={()=>setQty(q=>Math.max(1,q-1))} style={{ width:26,height:26,borderRadius:'50%',border:'0.5px solid var(--border-md)',background:'var(--bg)',cursor:'pointer',fontSize:15 }}>−</button>
            <span style={{ fontSize:15,fontWeight:600,minWidth:20,textAlign:'center' }}>{qty}</span>
            <button onClick={()=>setQty(q=>stockMax!==null?Math.min(stockMax,q+1):q+1)} style={{ width:26,height:26,borderRadius:'50%',border:'0.5px solid var(--border-md)',background:'var(--bg)',cursor:'pointer',fontSize:15 }}>+</button>
          </div>
        </div>

        {necesitaGuisos && <>
          {esChilakiles && <>
            <div style={{ fontSize:11,fontWeight:600,color:'var(--text2)',marginBottom:5 }}>Guiso incluido (elige 1)</div>
            <div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:12 }}>
              {guisosVis.filter(g=>!GUISOS_SOLO_EXTRA_CHILA.includes(g)).map(g=><button key={g} onClick={()=>setGuiso1([g])} style={btn(guiso1.includes(g))}>{g}</button>)}
            </div>
            {esTresGuisosGratis ? <>
              <div style={{ fontSize:11,fontWeight:600,color:'var(--text2)',marginBottom:5 }}>Guisos adicionales sin costo (elige hasta 2)</div>
              <div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:12 }}>
                {guisosVis.map(g=>{ const sel=guisoX.includes(g); const dis=!sel&&guisoX.length>=2
                  return <button key={g} onClick={()=>!dis&&tog(guisoX,setGuisoX,g)} style={{...btn(sel),opacity:dis?0.4:1,cursor:dis?'not-allowed':'pointer'}}>{g}</button>})}
              </div>
            </> : <>
              <div style={{ fontSize:11,fontWeight:600,color:'#EF9F27',marginBottom:5 }}>Guisos adicionales (+${plato.precioExtra||20} c/u)</div>
              <div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:12 }}>
                {guisosVis.map(g=><button key={g} onClick={()=>tog(guisoX,setGuisoX,g)} style={btn(guisoX.includes(g),'#EF9F27')}>{g}{guisoX.includes(g)?` +$${GUISOS_PREMIUM[g] ?? (plato.precioExtra||20)}`:''}</button>)}
              </div>
            </>}
          </>}
          {esComalDorados && <>
            <div style={{ fontSize:11,fontWeight:600,color:'var(--text2)',marginBottom:5 }}>Guisos (hasta 2, sin costo extra)</div>
            <div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:12 }}>
              {guisosVis.filter(g=>!GUISOS_SIN_COMAL_DORADOS.includes(g)).map(g=>{
                const sel=guiso1.includes(g); const disabled=!sel&&guiso1.length>=2
                return <button key={g} onClick={()=>!disabled&&tog(guiso1,setGuiso1,g)} style={{...btn(sel),opacity:disabled?0.4:1,cursor:disabled?'not-allowed':'pointer'}}>{g}</button>
              })}
            </div>
          </>} {esPlatoCarta && <>
            <div style={{ fontSize:11,fontWeight:600,color:'var(--text2)',marginBottom:5 }}>Guisos incluidos (elige hasta 2)</div>
            <div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:12 }}>
              {guisosVis.map(g=>{
                const sel=guiso1.includes(g); const disabled=!sel&&guiso1.length>=2
                return <button key={g} onClick={()=>!disabled&&tog(guiso1,setGuiso1,g)} style={{...btn(sel),opacity:disabled?0.4:1,cursor:disabled?'not-allowed':'pointer'}}>{g}</button>
              })}
            </div>
            <div style={{ fontSize:11,fontWeight:600,color:'#EF9F27',marginBottom:5 }}>Guisos adicionales (+$20 c/u, hasta 3 más)</div>
            <div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:12 }}>
              {guisosVis.map(g=>{
                const sel=guisoX.includes(g); const dis=!sel&&guisoX.length>=3
                return <button key={g} onClick={()=>!dis&&tog(guisoX,setGuisoX,g)} style={{...btn(sel,'#EF9F27'),opacity:dis?0.4:1,cursor:dis?'not-allowed':'pointer'}}>{g}{sel?` +$20`:''}</button>
              })}
            </div>
          </>}
          <div style={{ fontSize:11,fontWeight:600,color:'var(--text2)',marginBottom:5 }}>Salsas</div>
          <div style={{ display:'flex',flexWrap:'wrap',gap:8,marginBottom:12 }}>
            {SALSAS.map(s=><button key={s.nombre} onClick={()=>tog(salsas,setSalsas,s.nombre)} style={btn(salsas.includes(s.nombre),'#E24B4A')}>{s.nombre}{s.precio>0?` +$${s.precio}`:''}</button>)}
          </div>
          <div style={{ fontSize:11,fontWeight:600,color:'var(--text2)',marginBottom:5 }}>Toppings</div>
          <div style={{ display:'flex',gap:8,flexWrap:'wrap',marginBottom:12 }}>
            {toppingsActivos.map(t=><button key={t.nombre} onClick={()=>tog(tops,setTops,t.nombre)} style={btn(tops.includes(t.nombre),'#1D9E75')}>{t.nombre}{t.precio>0?` +$${t.precio}`:''}</button>)}
          </div>
        </>}

        {(esPostreConTops || esEmparedado) && <>
          <div style={{ fontSize:11,fontWeight:600,color:'var(--text2)',marginBottom:5 }}>
            {esEmparedado ? 'Ingredientes (base sin costo, extras +$)' : 'Toppings'}
          </div>
          <div style={{ display:'flex',gap:8,flexWrap:'wrap',marginBottom:12 }}>
            {toppingsActivos.map(t=><button key={t.nombre} onClick={()=>tog(tops,setTops,t.nombre)} style={btn(tops.includes(t.nombre),'#2D9E6A')}>{t.nombre}{t.precio>0?` +$${t.precio}`:''}</button>)}
          </div>
        </>}

        {esLatte && <>
          <div style={{ fontSize:11,fontWeight:600,color:'var(--text2)',marginBottom:5 }}>Sabor</div>
          <div style={{ display:'flex',gap:8,flexWrap:'wrap',marginBottom:12 }}>
            {SABORES_LATTE.map(s=><button key={s} onClick={()=>setSabor(sabor===s?'':s)} style={btn(sabor===s,'#1D9E75')}>{s}</button>)}
          </div>
          <div style={{ fontSize:11,fontWeight:600,color:'var(--text2)',marginBottom:5 }}>Tipo de leche</div>
          <div style={{ display:'flex',gap:4,marginBottom:10 }}>
            {LECHE_LATTE.map(l=><button key={l} onClick={()=>setLeche(leche===l?'':l)} style={btn(leche===l,'#1D9E75')}>{l}</button>)}
          </div>
        </>}

        <div style={{ fontSize:11,fontWeight:600,color:'var(--text2)',marginBottom:5 }}>Notas</div>
        <input style={{ width:'100%',padding:'6px 9px',border:'0.5px solid var(--border-md)',borderRadius:'var(--r-sm)',background:'var(--bg)',color:'var(--text)',fontSize:12,fontFamily:'inherit',marginBottom:14 }}
          placeholder="Sin picante, extra crema..." value={notas} onChange={e=>setNotas(e.target.value)} />

        {/* NATURAL (sin totopos) o CROCANTE (con totopos) */}
        {esHuevoNaturalOCrocante && (
          <div style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'#EBF2FC',borderRadius:'var(--r-md)',marginBottom:12,border:'0.5px solid #378ADD' }}>
            <input type="checkbox" id="natural" checked={natural} onChange={e=>setNatural(e.target.checked)} style={{ width:18,height:18,cursor:'pointer' }}/>
            <label htmlFor="natural" style={{ fontSize:12,fontWeight:500,cursor:'pointer',color:'#185FA5' }}>
              {natural ? '🌾 Natural — sin totopos' : '🫓 Crocante — con totopos (default)'}
            </label>
          </div>
        )}

        {/* MEDIA ORDEN */}
        <div style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'#FFF9E6',borderRadius:'var(--r-md)',marginBottom:12,border:'0.5px solid #EF9F27' }}>
          <input type="checkbox" id="media-orden" checked={mediaOrden} onChange={e=>setMediaOrden(e.target.checked)} style={{ width:18,height:18,cursor:'pointer' }}/>
          <label htmlFor="media-orden" style={{ fontSize:12,fontWeight:500,cursor:'pointer',color:'#8A5A00' }}>
            ½ Orden — descuento 40% (${Math.round(plato.precio*0.6)} base)
          </label>
        </div>

        {/* CAFÉ DE OLLA GRATIS */}
        {incluyeCafe && (
          <div style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'#EAF3DE',borderRadius:'var(--r-md)',marginBottom:12,border:'0.5px solid #86C442' }}>
            <input type="checkbox" id="cafe-olla" checked={cafeOlla} onChange={e=>setCafeOlla(e.target.checked)} style={{ width:18,height:18,cursor:'pointer' }}/>
            <label htmlFor="cafe-olla" style={{ fontSize:12,fontWeight:500,cursor:'pointer',color:'#3B6D11' }}>
              ☕ Incluye Café de Olla gratis
            </label>
          </div>
        )}

        {/* EXTRAS MANUALES */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11,fontWeight:600,color:'var(--text2)',marginBottom:6 }}>Extras manuales</div>
          {extras.map((e,i)=>(
            <div key={i} style={{ display:'flex',alignItems:'center',gap:6,marginBottom:4 }}>
              <span style={{ flex:1,fontSize:12,padding:'4px 8px',background:'var(--bg)',borderRadius:'var(--r-sm)' }}>{e.nombre}</span>
              <span style={{ fontSize:12,fontWeight:600,color:'#1D9E75' }}>+{fmtM(e.monto)}</span>
              <button onClick={()=>setExtras(ex=>ex.filter((_,j)=>j!==i))}
                style={{ fontSize:11,padding:'2px 6px',borderRadius:'var(--r-sm)',border:'0.5px solid #E24B4A',color:'#E24B4A',background:'transparent',cursor:'pointer' }}>✕</button>
            </div>
          ))}
          <div style={{ display:'flex',gap:6,marginTop:6 }}>
            <input value={extraNom} onChange={e=>setExtraNom(e.target.value)} placeholder="Ej: doble queso"
              style={{ flex:2,padding:'6px 10px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',fontSize:12,background:'var(--surface)',color:'var(--text1)' }}/>
            <input type="number" value={extraMonto} onChange={e=>setExtraMonto(e.target.value)} placeholder="$"
              style={{ flex:1,padding:'6px 10px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',fontSize:12,background:'var(--surface)',color:'var(--text1)' }}/>
            <button onClick={()=>{
              if (!extraNom||!extraMonto) return
              setExtras(ex=>[...ex,{nombre:extraNom,monto:parseFloat(extraMonto)||0}])
              setExtraNom(''); setExtraMonto('')
            }} style={{ padding:'6px 12px',borderRadius:'var(--r-sm)',border:'none',background:'#1D9E75',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600 }}>+ Add</button>
          </div>
        </div>

        <div style={{ background:'var(--bg)',borderRadius:'var(--r-md)',padding:'10px 12px',marginBottom:14 }}>
          <div style={{ display:'flex',justifyContent:'space-between',fontSize:12,color:'var(--text2)',marginBottom:3 }}><span>Precio base</span><span>{fmtM(plato.precio)}</span></div>
          {mediaOrden && <div style={{ display:'flex',justifyContent:'space-between',fontSize:12,color:'#EF9F27',marginBottom:3 }}><span>½ orden (−40%)</span><span>−{fmtM(plato.precio*0.4)}</span></div>}
          {extraGuisos>0   && <div style={{ display:'flex',justifyContent:'space-between',fontSize:12,color:'#EF9F27',marginBottom:3 }}><span>Guisos adicionales ({guisoX.length}x)</span><span>+{fmtM(extraGuisos)}</span></div>}
          {extraSalsas>0   && <div style={{ display:'flex',justifyContent:'space-between',fontSize:12,color:'#E24B4A',marginBottom:3 }}><span>Salsas extra</span><span>+{fmtM(extraSalsas)}</span></div>}
          {extraToppings>0 && <div style={{ display:'flex',justifyContent:'space-between',fontSize:12,color:'#1D9E75',marginBottom:3 }}><span>Toppings extra</span><span>+{fmtM(extraToppings)}</span></div>}
          {extras.map((e,i)=><div key={i} style={{ display:'flex',justifyContent:'space-between',fontSize:12,color:'#1D9E75',marginBottom:3 }}><span>{e.nombre}</span><span>+{fmtM(e.monto)}</span></div>)}
          <div style={{ display:'flex',justifyContent:'space-between',fontSize:14,fontWeight:600,borderTop:'0.5px solid var(--border-md)',paddingTop:7,marginTop:5 }}>
            <span>Subtotal ({qty}x)</span><span>{fmtM(subtotal)}</span>
          </div>
        </div>

        <div style={{ display:'flex',gap:8 }}>
          <button onClick={onCancel} style={{ flex:1,padding:9,borderRadius:'var(--r-md)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:13 }}>Cancelar</button>
          <button onClick={()=>onConfirm({ plato, qty, desc:desc(), subtotal, precioUnit, cafeOlla, _config:{ qty, guiso1, guisoX, salsas, tops, sabor, leche, notas, mediaOrden, extras, cafeOlla, natural: esHuevoNaturalOCrocante ? natural : undefined } })}
            style={{ flex:2,padding:9,borderRadius:'var(--r-md)',border:'none',background:'var(--accent)',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600 }}>
            Agregar — {fmtM(subtotal)}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── COBRO MODAL ───────────────────────────────────────────────
function ModalSinStock({ plato, nombreInv, fecha, onCerrar, onConfirmarStock, onAgregarSinStock, soloAjuste=false }) {
  const [paso, setPaso] = useState(soloAjuste ? 'capturar' : 'alerta') // alerta | capturar
  const [cantidad, setCantidad] = useState('')

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.65)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:500}}>
      <div style={{background:'var(--surface)',borderRadius:'var(--r-lg)',padding:24,width:380,border:'0.5px solid var(--border-md)'}}>
        {paso === 'alerta' && (
          <>
            <div style={{fontSize:18,fontWeight:700,color:'#E24B4A',marginBottom:8}}>⚠️ Sin stock en sistema</div>
            <div style={{fontSize:13,color:'var(--text2)',marginBottom:6,lineHeight:1.5}}>
              No hay <strong>{plato.nombre}</strong> registrado en el inventario de hoy.
            </div>
            <div style={{padding:'10px 12px',background:'#FFF9E6',borderRadius:'var(--r-sm)',border:'0.5px solid #EF9F27',marginBottom:14,fontSize:11,color:'#8A5A00',lineHeight:1.5}}>
              👉 <strong>Verifica fisicamente</strong> en el refrigerador / estante.<br/>
              Si SI hay producto, captura cuantas hay para ajustar el inventario.
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <button onClick={()=>setPaso('capturar')}
                style={{padding:11,borderRadius:'var(--r-md)',border:'none',background:'#1D9E75',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600}}>
                ✓ Si hay, capturar cantidad fisica
              </button>
              <button onClick={onAgregarSinStock}
                style={{padding:9,borderRadius:'var(--r-md)',border:'1px solid #EF9F27',background:'transparent',color:'#8A5A00',cursor:'pointer',fontSize:12}}>
                Agregar de todos modos (sin ajustar)
              </button>
              <button onClick={onCerrar}
                style={{padding:9,borderRadius:'var(--r-md)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:12,color:'var(--text2)'}}>
                Cancelar
              </button>
            </div>
          </>
        )}

        {paso === 'capturar' && (
          <>
            <div style={{fontSize:18,fontWeight:700,marginBottom:8,color:'#1D9E75'}}>📦 Verificacion fisica</div>
            <div style={{fontSize:13,color:'var(--text2)',marginBottom:14,lineHeight:1.5}}>
              ¿Cuantas piezas de <strong>{plato.nombre}</strong> hay fisicamente disponibles?
            </div>
            <div style={{marginBottom:16}}>
              <input type="number" value={cantidad} onChange={e=>setCantidad(e.target.value)}
                placeholder="Cantidad disponible" min="0" step="1" autoFocus
                style={{width:'100%',padding:'12px 16px',borderRadius:'var(--r-md)',border:'1.5px solid #1D9E75',fontSize:18,fontWeight:600,background:'var(--surface)',color:'var(--text1)',textAlign:'center'}}/>
              <div style={{fontSize:10,color:'var(--text3)',marginTop:6,textAlign:'center'}}>
                Esto ajustara el inventario y permitira agregar el producto a la comanda
              </div>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setPaso('alerta')}
                style={{flex:1,padding:9,borderRadius:'var(--r-md)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:13}}>
                Atras
              </button>
              <button onClick={()=>{
                  const n = parseInt(cantidad) || 0
                  if (n < 1) return
                  onConfirmarStock(n)
                }}
                disabled={!cantidad || parseInt(cantidad) < 1}
                style={{flex:2,padding:11,borderRadius:'var(--r-md)',border:'none',
                  background: cantidad && parseInt(cantidad)>=1 ? '#1D9E75' : 'var(--border)',
                  color:'#fff',cursor:cantidad && parseInt(cantidad)>=1 ? 'pointer' : 'default',fontSize:13,fontWeight:600}}>
                Ajustar y agregar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function CobroModal({ total, canal, items = [], onConfirm, onCancel }) {
  const [selCanal,   setSelCanal]   = useState(canal||'Efectivo')
  const [aplicaClip, setAplicaClip] = useState(false)
  const [mixto,      setMixto]      = useState(false)
  const [montoEfvo,  setMontoEfvo]  = useState('')
  const [descuento,  setDescuento]  = useState('')
  const [tipoDesc,   setTipoDesc]   = useState('pct') // 'pct' o 'monto'
  const [estMode,    setEstMode]    = useState(false)  // descuento estudiante
  const [estPct,     setEstPct]     = useState(20)    // % aplicable a base est.
  const [regalos,    setRegalos]    = useState(new Set())  // índices de items regalo

  // Base EST: total de items que NO son bebidas ni postres
  const EXCL_EST = ['Bebidas Frías','Bebidas Frias','Postres']
  const baseEst = items.reduce((s, i) => EXCL_EST.includes(i.plato?.familia) ? s : s + (i.subtotal||0), 0)
  const [comConfig,  setComConfig]  = useState({ tarjeta:4.5, prestamo:30, uber:46, didi:46, rappi:46 })
  const [empaqueActivo, setEmpaqueActivo] = useState(false)
  const [empaqueMonto,  setEmpaqueMonto]  = useState(10)
  const [recibido,      setRecibido]      = useState('')

  const empaqueCargo = empaqueActivo ? (parseFloat(empaqueMonto)||0) : 0
  const totalConEmpaque = total + empaqueCargo
  // Monto de productos marcados como regalo
  const montoRegalo = items.reduce((s, item, idx) => regalos.has(idx) ? s + (item.subtotal||0) : s, 0)
  // Base para descuento adicional (excluye productos ya regalados)
  const baseDesc = Math.max(0, totalConEmpaque - montoRegalo)
  const descAdicional = estMode
    ? Math.round(baseEst * (parseFloat(estPct)||0) / 100)
    : tipoDesc==='pct'
      ? Math.round(baseDesc * (parseFloat(descuento)||0) / 100)
      : Math.min(parseFloat(descuento)||0, baseDesc)
  const montoDescuento = Math.min(montoRegalo + descAdicional, totalConEmpaque)
  const totalConDesc = totalConEmpaque - montoDescuento

  useEffect(() => {
    sb.from('config_comisiones').select('id,porcentaje').then(({ data }) => {
      if (!data) return
      const m = {}; data.forEach(c=>{ m[c.id]=c.porcentaje }); setComConfig(m)
    })
  }, [])

  const cObj    = CANALES.find(c=>c.id===selCanal)||CANALES[0]
  const getPlatRate = (canal) => {
    if (canal.includes('Uber')) return (comConfig.uber||46)/100
    if (canal.includes('DiDi')) return (comConfig.didi||46)/100
    if (canal.includes('Rappi')) return (comConfig.rappi||46)/100
    return 0
  }
  const comPlat = cObj.cargo>0 ? Math.round(totalConDesc*getPlatRate(selCanal)) : 0
  // Comisión Clip 4.5% para pago directo con tarjeta
  const esTC = c => c==='Tarjeta'||c==='Transferencia'
  const comTarjeta = (!mixto && esTC(selCanal)) ? Math.round(totalConDesc*(comConfig.tarjeta||4.5)/100) : 0
  const comClip = (cObj.clip && aplicaClip) ? Math.round(totalConDesc*(comConfig.prestamo||30)/100) : 0

  // Pago mixto: efectivo + tarjeta
  const efvo    = mixto ? (parseFloat(montoEfvo)||0) : 0
  const tarj    = mixto ? Math.max(0, totalConDesc - efvo) : 0
  const comTC   = mixto && tarj>0 ? Math.round(tarj*(comConfig.tarjeta||4.5)/100) : 0
  const clipMix = mixto && aplicaClip ? Math.round(tarj*(comConfig.prestamo||30)/100) : 0

  const neto    = mixto
    ? totalConDesc - comTC - clipMix
    : totalConDesc - comPlat - comTarjeta - comClip

  const recibidoNum = parseFloat(recibido) || 0
  const esEfectivoSimple = !mixto && selCanal === 'Efectivo'
  const cambio = esEfectivoSimple
    ? Math.max(0, recibidoNum - totalConDesc)
    : (mixto && efvo > totalConDesc ? efvo - totalConDesc : 0)

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300 }}>
      <div style={{ background:'var(--surface)',borderRadius:'var(--r-lg)',padding:24,width:360,border:'0.5px solid var(--border-md)',maxHeight:'90vh',overflowY:'auto' }}>
        <div style={{ fontSize:15,fontWeight:600,marginBottom:14 }}>Confirmar cobro</div>

        {/* Empaque */}
        <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:12,padding:'10px 12px',background:empaqueActivo?'#FFF4E6':'var(--bg)',borderRadius:'var(--r-md)',border:'1px solid var(--border-md)' }}>
          <input type="checkbox" id="empaque-cobro" checked={empaqueActivo} onChange={e=>setEmpaqueActivo(e.target.checked)} style={{ width:16,height:16,cursor:'pointer' }}/>
          <label htmlFor="empaque-cobro" style={{ fontSize:12,cursor:'pointer',fontWeight:500,flex:1 }}>¿Pidió algo para llevar? (empaque)</label>
          {empaqueActivo && (
            <div style={{ display:'flex',alignItems:'center',gap:4 }}>
              <span style={{ fontSize:11,color:'var(--text2)' }}>$</span>
              <input type="number" value={empaqueMonto} onChange={e=>setEmpaqueMonto(e.target.value)} min="0" step="1"
                style={{ width:64,padding:'4px 8px',borderRadius:'var(--r-sm)',border:'1px solid var(--border-md)',fontSize:12,background:'var(--surface)',textAlign:'right' }}/>
            </div>
          )}
        </div>

        {/* Productos regalo — colapsable */}
        {items.length > 0 && (() => {
          const [showRegalos, setShowRegalos] = React.useState(false)
          return (
            <div style={{ marginBottom:12 }}>
              <button
                onClick={() => setShowRegalos(s => !s)}
                style={{
                  width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'7px 10px', borderRadius:'var(--r-sm)', cursor:'pointer',
                  background: montoRegalo > 0 ? '#FFF4D611' : 'var(--bg)',
                  border: montoRegalo > 0 ? '1px solid #EF9F2766' : '0.5px solid var(--border-md)',
                  fontSize:11, fontWeight:600, color: montoRegalo > 0 ? '#EF9F27' : 'var(--text2)',
                  transition:'all 0.15s',
                }}>
                <span>🎁 Productos gratis{montoRegalo > 0 ? ` · −${fmtM(montoRegalo)}` : ''}</span>
                <span style={{fontSize:10,color:'var(--text3)'}}>{showRegalos ? '▲' : '▼'}</span>
              </button>
              {showRegalos && (
                <div style={{ display:'flex',flexDirection:'column',gap:4,marginTop:6 }}>
                  {items.map((item, idx) => (
                    <label key={idx} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',borderRadius:'var(--r-sm)',cursor:'pointer',
                      background: regalos.has(idx) ? '#FFF4D6' : 'var(--bg)',
                      border: regalos.has(idx) ? '1px solid #EF9F27' : '0.5px solid var(--border-md)',
                      transition:'all 0.15s'}}>
                      <input type="checkbox" checked={regalos.has(idx)} style={{cursor:'pointer'}}
                        onChange={e => setRegalos(prev => { const n=new Set(prev); e.target.checked?n.add(idx):n.delete(idx); return n })}/>
                      <span style={{flex:1,fontSize:12}}>{item.qty}x {item.plato?.nombre}</span>
                      <span style={{fontSize:12,fontWeight:600,color: regalos.has(idx) ? '#EF9F27' : 'var(--text2)'}}>
                        {regalos.has(idx) ? `🎁 −${fmtM(item.subtotal||0)}` : fmtM(item.subtotal||0)}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

        {/* Descuento */}
        <div style={{ marginBottom:12 }}>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6 }}>
            <div style={{ fontSize:11,fontWeight:600,color:'var(--text2)' }}>Descuento adicional (opcional)</div>
            <button
              onClick={()=>{ setEstMode(e=>!e); setDescuento('') }}
              style={{
                padding:'3px 10px',fontSize:11,fontWeight:700,borderRadius:99,cursor:'pointer',
                background: estMode ? '#378ADD' : 'var(--bg)',
                color: estMode ? '#fff' : 'var(--text3)',
                border: estMode ? 'none' : '0.5px solid var(--border-md)',
                transition:'all 0.15s',
              }}>
              🎓 EST
            </button>
          </div>

          {estMode ? (
            /* Modo Estudiante */
            <div style={{ background:'#EEF4FF',borderRadius:'var(--r-md)',padding:'10px 12px',border:'1px solid #378ADD44' }}>
              <div style={{ fontSize:11,color:'#378ADD',fontWeight:600,marginBottom:8 }}>
                Descuento estudiante — aplica sobre alimentos (excluye bebidas y postres)
              </div>
              <div style={{ display:'flex',gap:8,alignItems:'center',marginBottom:6 }}>
                <span style={{ fontSize:12,color:'var(--text2)' }}>Base:</span>
                <span style={{ fontSize:13,fontWeight:700,color:'var(--text1)' }}>{fmtM(baseEst)}</span>
                <span style={{ fontSize:12,color:'var(--text3)',marginLeft:'auto' }}>
                  {baseEst < totalConEmpaque ? `(excluye ${fmtM(totalConEmpaque-baseEst)})` : ''}
                </span>
              </div>
              <div style={{ display:'flex',gap:8,alignItems:'center' }}>
                <span style={{ fontSize:12,color:'var(--text2)',whiteSpace:'nowrap' }}>Descuento</span>
                <input type="number" value={estPct} onChange={e=>setEstPct(e.target.value)}
                  min="0" max="100"
                  style={{ width:64,padding:'5px 8px',borderRadius:'var(--r-sm)',border:'1.5px solid #378ADD',fontSize:14,fontWeight:700,textAlign:'center',background:'var(--surface)',color:'var(--text1)' }}/>
                <span style={{ fontSize:12,color:'var(--text2)' }}>%</span>
                <span style={{ marginLeft:'auto',fontSize:14,fontWeight:700,color:'#E24B4A' }}>−{fmtM(montoDescuento)}</span>
              </div>
            </div>
          ) : (
            /* Modo normal */
            <div style={{ display:'flex',gap:6,alignItems:'center' }}>
              <div style={{ display:'flex',borderRadius:'var(--r-sm)',overflow:'hidden',border:'0.5px solid var(--border-md)' }}>
                <button onClick={()=>setTipoDesc('pct')} style={{ padding:'5px 12px',fontSize:11,border:'none',cursor:'pointer',background:tipoDesc==='pct'?'var(--accent)':'var(--bg)',color:tipoDesc==='pct'?'#fff':'var(--text2)' }}>%</button>
                <button onClick={()=>setTipoDesc('monto')} style={{ padding:'5px 12px',fontSize:11,border:'none',cursor:'pointer',background:tipoDesc==='monto'?'var(--accent)':'var(--bg)',color:tipoDesc==='monto'?'#fff':'var(--text2)' }}>$</button>
              </div>
              <input type="number" value={descuento} onChange={e=>setDescuento(e.target.value)}
                placeholder={tipoDesc==='pct'?'0%':'$0'} min="0" max={tipoDesc==='pct'?100:total}
                style={{ flex:1,padding:'6px 10px',borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',fontSize:13,background:'var(--surface)',color:'var(--text1)' }}/>
              {montoDescuento>0 && <span style={{ fontSize:12,color:'#1D9E75',fontWeight:600 }}>−{fmtM(montoDescuento)}</span>}
            </div>
          )}
          {montoDescuento>0 && (
            <div style={{ display:'flex',justifyContent:'space-between',fontSize:12,marginTop:6,padding:'4px 8px',background:'#EAF3DE',borderRadius:'var(--r-sm)' }}>
              <span>Total con descuento</span><strong style={{ color:'#1D9E75' }}>{fmtM(totalConDesc)}</strong>
            </div>
          )}
        </div>

        {/* Toggle pago mixto */}
        <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:12,padding:'8px 12px',background:'var(--bg)',borderRadius:'var(--r-md)' }}>
          <input type="checkbox" id="mixto-check" checked={mixto} onChange={e=>{ setMixto(e.target.checked); setMontoEfvo('') }} style={{ width:16,height:16,cursor:'pointer' }}/>
          <label htmlFor="mixto-check" style={{ fontSize:12,cursor:'pointer',fontWeight:500 }}>Pago mixto (efectivo + tarjeta)</label>
        </div>

        {mixto ? (
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11,fontWeight:600,color:'var(--text2)',marginBottom:6 }}>Monto en efectivo</div>
            <input type="number" value={montoEfvo} onChange={e=>setMontoEfvo(e.target.value)}
              placeholder={`Máx. ${fmtM(total)}`} min="0" max={total} step="1"
              style={{ width:'100%',padding:'8px 12px',borderRadius:'var(--r-md)',border:'1.5px solid #378ADD',fontSize:14,fontWeight:600,background:'var(--surface)',color:'var(--text1)' }}/>
            {efvo>0 && tarj>0 && (
              <div style={{ marginTop:6,fontSize:11,color:'var(--text2)' }}>
                Efectivo: {fmtM(efvo)} · Tarjeta: {fmtM(tarj)}
              </div>
            )}
            {/* Clip en parte tarjeta */}
            {tarj>0 && (
              <div style={{ display:'flex',alignItems:'center',gap:8,marginTop:10,padding:'8px 10px',background:'#FFF9E6',borderRadius:'var(--r-md)',border:'0.5px solid #EF9F27' }}>
                <input type="checkbox" id="clip-mix" checked={aplicaClip} onChange={e=>setAplicaClip(e.target.checked)} style={{ width:16,height:16,cursor:'pointer' }}/>
                <label htmlFor="clip-mix" style={{ fontSize:11,color:'#8A5A00',cursor:'pointer' }}>¿Aplica préstamo Clip? (30% sobre {fmtM(tarj)})</label>
              </div>
            )}
          </div>
        ) : (
          <>
            <div style={{ fontSize:11,fontWeight:600,color:'var(--text2)',marginBottom:6 }}>Canal de venta</div>
            <div style={{ display:'flex',flexWrap:'wrap',gap:5,marginBottom:14 }}>
              {CANALES.map(c=>(
                <button key={c.id} onClick={()=>{ setSelCanal(c.id); setAplicaClip(false) }}
                  style={{ padding:'4px 10px',borderRadius:99,fontSize:11,cursor:'pointer',border:'0.5px solid var(--border-md)',
                    background:selCanal===c.id?'var(--accent)':'transparent',color:selCanal===c.id?'#fff':'var(--text2)' }}>
                  {c.label}
                </button>
              ))}
            </div>
            {cObj.clip && (
              <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:14,padding:'10px 12px',background:'#FFF9E6',borderRadius:'var(--r-md)',border:'0.5px solid #EF9F27' }}>
                <input type="checkbox" id="clip-check" checked={aplicaClip} onChange={e=>setAplicaClip(e.target.checked)} style={{ width:16,height:16,cursor:'pointer' }}/>
                <label htmlFor="clip-check" style={{ fontSize:12,color:'#8A5A00',cursor:'pointer',fontWeight:500 }}>
                  ¿Aplica pago préstamo Clip? (30% sobre total)
                </label>
              </div>
            )}
            {esEfectivoSimple && (
              <div style={{ marginBottom:14,padding:'10px 12px',background:'#F4F8F2',borderRadius:'var(--r-md)',border:'1px solid #1D9E75' }}>
                <div style={{ fontSize:11,fontWeight:600,color:'#3B6D11',marginBottom:6 }}>¿Cuanto recibio? (opcional)</div>
                <div style={{ display:'flex',gap:8,alignItems:'center' }}>
                  <input type="number" value={recibido} onChange={e=>setRecibido(e.target.value)}
                    placeholder={`Total: ${fmtM(totalConDesc)}`} min="0" step="1"
                    style={{ flex:1,padding:'8px 12px',borderRadius:'var(--r-sm)',border:'1px solid #1D9E75',fontSize:14,fontWeight:600,background:'var(--surface)',color:'var(--text1)' }}/>
                  {cambio>0 && (
                    <div style={{ background:'#1D9E75',color:'#fff',padding:'8px 14px',borderRadius:'var(--r-sm)',fontSize:13,fontWeight:700,whiteSpace:'nowrap' }}>
                      Cambio: {fmtM(cambio)}
                    </div>
                  )}
                </div>
                {recibidoNum > 0 && recibidoNum < totalConDesc && (
                  <div style={{ fontSize:10,color:'#A32D2D',marginTop:6 }}>
                    Falta {fmtM(totalConDesc - recibidoNum)}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Resumen */}
        <div style={{ background:'var(--bg)',borderRadius:'var(--r-md)',padding:12,marginBottom:14 }}>
          <div style={{ display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:6 }}><span>Total</span><span style={{fontWeight:600}}>{fmtM(total)}</span></div>
          {!mixto && comPlat>0 && <div style={{ display:'flex',justifyContent:'space-between',fontSize:12,color:'#E24B4A',marginBottom:4 }}><span>Comisión plataforma</span><span>−{fmtM(comPlat)}</span></div>}
          {!mixto && comTarjeta>0 && <div style={{ display:'flex',justifyContent:'space-between',fontSize:12,color:'#E24B4A',marginBottom:4 }}><span>Comisión Clip ({comConfig.tarjeta||4.5}% s/{fmtM(totalConDesc)})</span><span>−{fmtM(comTarjeta)}</span></div>}
          {!mixto && comClip>0 && <div style={{ display:'flex',justifyContent:'space-between',fontSize:12,color:'#E24B4A',marginBottom:4 }}><span>Pago préstamo Clip (30%)</span><span>−{fmtM(comClip)}</span></div>}
          {mixto && comTC>0 && <div style={{ display:'flex',justifyContent:'space-between',fontSize:12,color:'#E24B4A',marginBottom:4 }}><span>Comisión tarjeta (4.5% s/{fmtM(tarj)})</span><span>−{fmtM(comTC)}</span></div>}
          {mixto && clipMix>0 && <div style={{ display:'flex',justifyContent:'space-between',fontSize:12,color:'#E24B4A',marginBottom:4 }}><span>Pago préstamo Clip (30% s/{fmtM(tarj)})</span><span>−{fmtM(clipMix)}</span></div>}
          {cambio>0 && <div style={{ display:'flex',justifyContent:'space-between',fontSize:12,color:'#1D9E75',marginBottom:4 }}><span>Cambio a devolver</span><span>{fmtM(cambio)}</span></div>}
          <div style={{ display:'flex',justifyContent:'space-between',fontSize:15,fontWeight:700,borderTop:'0.5px solid var(--border-md)',paddingTop:8,marginTop:4 }}><span>Neto</span><span style={{color:'#1D9E75'}}>{fmtM(neto)}</span></div>
        </div>

        <div style={{ display:'flex',gap:8 }}>
          <button onClick={onCancel} style={{ flex:1,padding:10,borderRadius:'var(--r-md)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:13 }}>Cancelar</button>
          <button onClick={()=>onConfirm({
              comPlat: mixto ? comTC : comPlat,
              comTarjeta: mixto ? 0 : comTarjeta,
              comClip: mixto ? clipMix : comClip,
              neto,
              clip: mixto ? (aplicaClip&&tarj>0) : (cObj.clip&&aplicaClip),
              canal: mixto ? 'Mixto' : selCanal,
              mixto, efvo: mixto?efvo:0, tarj: mixto?tarj:0,
              descuento: montoDescuento, totalOriginal: total, totalConDesc,
              empaque: empaqueCargo
            })}
            style={{ flex:2,padding:10,borderRadius:'var(--r-md)',border:'none',background:'#1D9E75',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600 }}>
            Confirmar y cobrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── MODAL ¿QUIÉN COBRA? ──────────────────────────────────────
function CobradoPorModal({ staff, sugerido, onConfirm, onCancel }) {
  const [sel, setSel] = useState(sugerido || '')
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.72)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:600}}>
      <div style={{background:'var(--surface)',borderRadius:'var(--r-lg)',padding:'28px 32px',minWidth:320,maxWidth:400,boxShadow:'0 20px 60px rgba(0,0,0,0.4)',animation:'pop 0.2s ease'}}>
        <div style={{fontSize:28,textAlign:'center',marginBottom:4}}>💰</div>
        <div style={{fontSize:17,fontWeight:700,textAlign:'center',marginBottom:4}}>¿Quién cobra?</div>
        <div style={{fontSize:12,color:'var(--text3)',textAlign:'center',marginBottom:20}}>
          Selecciona quién está recibiendo el pago
        </div>
        {/* Botones de selección */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:8,marginBottom:20}}>
          {staff.map(nombre => (
            <button key={nombre} onClick={()=>setSel(nombre)}
              style={{
                padding:'12px 10px', borderRadius:'var(--r-md)', cursor:'pointer',
                fontSize:13, fontWeight:700, textAlign:'center',
                border: sel===nombre ? '2px solid #1D9E75' : '1.5px solid var(--border-md)',
                background: sel===nombre ? '#1D9E7515' : 'var(--bg)',
                color: sel===nombre ? '#1D9E75' : 'var(--text1)',
                transition: 'all 0.15s ease',
              }}>
              {sel===nombre && <span style={{marginRight:4}}>✓</span>}
              {nombre}
            </button>
          ))}
        </div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={onCancel}
            style={{flex:1,padding:'10px',borderRadius:'var(--r-md)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:13,color:'var(--text2)'}}>
            Cancelar
          </button>
          <button onClick={()=>{ if(sel) onConfirm(sel) }}
            disabled={!sel}
            style={{flex:2,padding:'10px',borderRadius:'var(--r-md)',border:'none',
              background:sel?'#1D9E75':'var(--border)',color:'#fff',cursor:sel?'pointer':'default',
              fontSize:14,fontWeight:700,transition:'background 0.2s'}}>
            {sel ? `Confirmar — ${sel}` : 'Selecciona un nombre'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── MODAL MESA ───────────────────────────────────────────────
function MesaModal({ onConfirm, onCancel, comandasAbiertas }) {
  const [mesa,    setMesa]    = useState('')
  const [cliente, setCliente] = useState('')
  const [timer1,  setTimer1]  = useState(10)
  const [timerN,  setTimerN]  = useState(5)
  const mesas = [...new Set(comandasAbiertas.filter(c=>c.tipo==='mesa').map(c=>c.mesa))]
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300}}>
      <div style={{background:'var(--surface)',borderRadius:'var(--r-lg)',padding:22,width:340,border:'0.5px solid var(--border-md)'}}>
        <div style={{fontSize:15,fontWeight:600,marginBottom:14}}>🍽 Nueva mesa</div>
        <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>Número de mesa</div>
        <input className="form-input" value={mesa} onChange={e=>setMesa(e.target.value)}
          placeholder="Ej: 1, 2A, Terraza..." style={{width:'100%',marginBottom:8}}/>
        {mesas.length>0 && <div style={{fontSize:10,color:'var(--text3)',marginBottom:10}}>Ocupadas: {mesas.join(', ')}</div>}
        <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>Cliente (opcional)</div>
        <input className="form-input" value={cliente} onChange={e=>setCliente(e.target.value)}
          placeholder="Nombre..." style={{width:'100%',marginBottom:12}}/>
        <div style={{display:'flex',gap:8,marginBottom:16}}>
          <div style={{flex:1}}>
            <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>Timer 1a ronda (min)</div>
            <input type="number" className="form-input" value={timer1} onChange={e=>setTimer1(parseInt(e.target.value)||10)} min="1" max="60" style={{width:'100%'}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>Timer siguiente (min)</div>
            <input type="number" className="form-input" value={timerN} onChange={e=>setTimerN(parseInt(e.target.value)||5)} min="1" max="60" style={{width:'100%'}}/>
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={onCancel} style={{flex:1,padding:9,borderRadius:'var(--r-md)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:13}}>Cancelar</button>
          <button onClick={()=>mesa&&onConfirm({tipo:'mesa',mesa,canal:'Efectivo',cliente,timer1,timerN})}
            disabled={!mesa}
            style={{flex:2,padding:9,borderRadius:'var(--r-md)',border:'none',background:mesa?'#378ADD':'var(--border)',color:'#fff',cursor:mesa?'pointer':'default',fontSize:13,fontWeight:600}}>
            Abrir mesa
          </button>
        </div>
      </div>
    </div>
  )
}

// ── MODAL PARA LLEVAR ─────────────────────────────────────────
function LlevarModal({ onConfirm, onCancel }) {
  const [cliente, setCliente] = useState('')
  const [timer1,  setTimer1]  = useState(10)
  const [empaque, setEmpaque] = useState(10)
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300}}>
      <div style={{background:'var(--surface)',borderRadius:'var(--r-lg)',padding:22,width:340,border:'0.5px solid var(--border-md)'}}>
        <div style={{fontSize:15,fontWeight:600,marginBottom:14}}>🥡 Para llevar</div>
        <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>Nombre del cliente</div>
        <input className="form-input" value={cliente} onChange={e=>setCliente(e.target.value)}
          placeholder="Nombre..." style={{width:'100%',marginBottom:12}}/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
          <div>
            <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>Timer (min)</div>
            <input type="number" className="form-input" value={timer1} onChange={e=>setTimer1(parseInt(e.target.value)||10)} min="1" max="60" style={{width:'100%'}}/>
          </div>
          <div>
            <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>Empaque ($)</div>
            <input type="number" className="form-input" value={empaque} onChange={e=>setEmpaque(parseFloat(e.target.value)||0)} min="0" style={{width:'100%'}}/>
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={onCancel} style={{flex:1,padding:9,borderRadius:'var(--r-md)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:13}}>Cancelar</button>
          <button onClick={()=>onConfirm({tipo:'llevar',mesa:'',canal:'Efectivo',cliente,timer1,timerN:5,empaque})}
            style={{flex:2,padding:9,borderRadius:'var(--r-md)',border:'none',background:'#EF9F27',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600}}>
            Abrir pedido
          </button>
        </div>
      </div>
    </div>
  )
}

// ── MODAL PLATAFORMA RÁPIDA ──────────────────────────────────
function PlataformaModal({ onConfirm, onCancel }) {
  const [canal,    setCanal]    = useState('Uber')
  const [numOrden, setNumOrden] = useState('')
  const [cliente,  setCliente]  = useState('')
  const PLATS = ['Uber','Uber Chilakiles','DiDi','DiDi Chilakiles','Rappi']
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300}}>
      <div style={{background:'var(--surface)',borderRadius:'var(--r-lg)',padding:22,width:340,border:'0.5px solid var(--border-md)'}}>
        <div style={{fontSize:15,fontWeight:600,marginBottom:14}}>📦 Pedido de plataforma</div>
        <div style={{fontSize:11,color:'var(--text2)',marginBottom:6}}>Canal</div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
          {PLATS.map(p=>(
            <button key={p} onClick={()=>setCanal(p)}
              style={{padding:'6px 12px',borderRadius:99,fontSize:11,cursor:'pointer',
                border:`1.5px solid ${canal===p?'#7F77DD':'var(--border-md)'}`,
                background:canal===p?'#7F77DD18':'transparent',
                color:canal===p?'#7F77DD':'var(--text2)',fontWeight:canal===p?600:400}}>
              {p}
            </button>
          ))}
        </div>
        <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>Numero de orden</div>
        <input className="form-input" value={numOrden} onChange={e=>setNumOrden(e.target.value)}
          placeholder="Ej: 1234" style={{width:'100%',marginBottom:12}}/>
        <div style={{fontSize:11,color:'var(--text2)',marginBottom:4}}>Nombre del cliente</div>
        <input className="form-input" value={cliente} onChange={e=>setCliente(e.target.value)}
          placeholder="Nombre..." style={{width:'100%',marginBottom:16}}/>
        <div style={{display:'flex',gap:8}}>
          <button onClick={onCancel}
            style={{flex:1,padding:9,borderRadius:'var(--r-md)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:13}}>
            Cancelar
          </button>
          <button onClick={()=>onConfirm({ canal, numOrden, cliente })}
            style={{flex:2,padding:9,borderRadius:'var(--r-md)',border:'none',background:'#7F77DD',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600}}>
            Abrir comanda
          </button>
        </div>
      </div>
    </div>
  )
}

// ── NUEVA COMANDA MODAL ───────────────────────────────────────
function NuevaComandaModal({ onConfirm, onCancel, comandasAbiertas }) {
  const [tipo,   setTipo]   = useState('mesa')
  const [mesa,   setMesa]   = useState('')
  const [canal,  setCanal]  = useState('Efectivo')
  const [cliente,setCliente]= useState('')
  const [timer1, setTimer1] = useState(10)
  const [timerN, setTimerN] = useState(5)
  const mesas = [...new Set(comandasAbiertas.filter(c=>c.tipo==='mesa').map(c=>c.mesa))]
  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300 }}>
      <div style={{ background:'var(--surface)',borderRadius:'var(--r-lg)',padding:22,width:380,border:'0.5px solid var(--border-md)' }}>
        <div style={{ fontSize:15,fontWeight:600,marginBottom:14 }}>Nueva comanda</div>
        <div style={{ display:'flex',gap:6,marginBottom:14 }}>
          {TIPOS_COMANDA.map(t=>(
            <button key={t.id} onClick={()=>setTipo(t.id)}
              style={{ flex:1,padding:'8px 0',borderRadius:'var(--r-md)',fontSize:12,fontWeight:500,cursor:'pointer',
                border:`2px solid ${tipo===t.id?t.color:'var(--border-md)'}`,
                background:tipo===t.id?t.color+'18':'transparent',color:tipo===t.id?t.color:'var(--text2)' }}>
              {t.label}
            </button>
          ))}
        </div>
        {tipo==='mesa' && (
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11,color:'var(--text2)',marginBottom:4 }}>Número de mesa</div>
            <input className="form-input" value={mesa} onChange={e=>setMesa(e.target.value)} placeholder="Ej: 1, 2A, Terraza..." style={{ width:'100%' }}/>
            {mesas.length>0 && <div style={{ fontSize:10,color:'var(--text3)',marginTop:4 }}>Ocupadas: {mesas.join(', ')}</div>}
          </div>
        )}
        {tipo==='plataforma' && (
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11,color:'var(--text2)',marginBottom:4 }}>Canal</div>
            <select className="form-input" value={canal} onChange={e=>setCanal(e.target.value)} style={{ width:'100%' }}>
              {['Uber','Uber Chilakiles','DiDi','DiDi Chilakiles','Rappi','Ola'].map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
        )}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11,color:'var(--text2)',marginBottom:4 }}>Cliente (opcional)</div>
          <input className="form-input" value={cliente} onChange={e=>setCliente(e.target.value)} placeholder="Nombre del cliente..." style={{ width:'100%' }}/>
        </div>
        <div style={{ display:'flex',gap:8,marginBottom:14 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11,color:'var(--text2)',marginBottom:4 }}>Timer 1ª ronda (min)</div>
            <input type="number" className="form-input" value={timer1} onChange={e=>setTimer1(parseInt(e.target.value)||10)} min="1" max="60" style={{ width:'100%' }}/>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11,color:'var(--text2)',marginBottom:4 }}>Timer rondas sig. (min)</div>
            <input type="number" className="form-input" value={timerN} onChange={e=>setTimerN(parseInt(e.target.value)||5)} min="1" max="60" style={{ width:'100%' }}/>
          </div>
        </div>
        <div style={{ display:'flex',gap:8 }}>
          <button onClick={onCancel} style={{ flex:1,padding:9,borderRadius:'var(--r-md)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:13 }}>Cancelar</button>
          <button onClick={()=>onConfirm({ tipo, mesa, canal: tipo==='plataforma'?canal:'Efectivo', cliente, timer1, timerN })}
            style={{ flex:2,padding:9,borderRadius:'var(--r-md)',border:'none',background:'var(--accent)',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600 }}>
            Abrir comanda
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ALERTA TIMER ──────────────────────────────────────────────
function AlertaTimer({ comanda, onCerrar }) {
  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:500 }}>
      <div style={{ background:'var(--surface)',borderRadius:'var(--r-lg)',padding:28,width:360,textAlign:'center',border:'3px solid #EF9F27' }}>
        <div style={{ fontSize:40,marginBottom:8 }}>⏰</div>
        <div style={{ fontSize:18,fontWeight:700,color:'#EF9F27',marginBottom:8 }}>¡Pedido listo!</div>
        <div style={{ fontSize:14,color:'var(--text)',marginBottom:6 }}><strong>{comanda.label}</strong>{comanda.cliente?' — '+comanda.cliente:''}</div>
        <div style={{ fontSize:13,color:'var(--text2)',marginBottom:20 }}>El pedido ya debe ser entregado al cliente</div>
        <button onClick={onCerrar}
          style={{ width:'100%',padding:12,borderRadius:'var(--r-md)',border:'none',background:'#EF9F27',color:'#fff',cursor:'pointer',fontSize:14,fontWeight:700 }}>
          Entendido
        </button>
      </div>
    </div>
  )
}

// ── TIMER DISPLAY ─────────────────────────────────────────────
function TimerDisplay({ enviado_at, timer_minutos }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(enviado_at)) / 1000))
    }, 1000)
    return () => clearInterval(iv)
  }, [enviado_at])
  const totalSec = timer_minutos * 60
  const pct = Math.min(elapsed / totalSec, 1)
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  const color = pct >= 1 ? '#E24B4A' : pct >= 0.75 ? '#EF9F27' : '#1D9E75'
  return (
    <div style={{ display:'flex',alignItems:'center',gap:8 }}>
      <div style={{ flex:1,height:6,background:'var(--border)',borderRadius:3,overflow:'hidden' }}>
        <div style={{ width:`${pct*100}%`,height:'100%',background:color,transition:'width 1s linear',borderRadius:3 }}/>
      </div>
      <span style={{ fontSize:12,fontWeight:600,color,minWidth:40 }}>{mins}:{String(secs).padStart(2,'0')}</span>
    </div>
  )
}

// ── COMANDA PRINCIPAL ─────────────────────────────────────────
function useCatalogoActivo(setFamInactivas, setProdInactivos) {
  useEffect(() => {
    const cargar = async () => {
      const [{ data: fams }, { data: prods }] = await Promise.all([
        sb.from('familias').select('nombre,activa'),
        sb.from('productos').select('codigo,activo'),
      ])
      setFamInactivas((fams||[]).filter(f=>!f.activa).map(f=>f.nombre))
      setProdInactivos((prods||[]).filter(p=>!p.activo).map(p=>p.codigo))
    }
    cargar()
  }, [])
}

export default function Comanda({ role }) {
  const [comandas,    setComandas]    = useState([])
  const [activa,      setActiva]      = useState(null)
  const [familia,     setFamilia]     = useState('Todos')
  const [famInactivas, setFamInactivas] = useState([])
  const [prodInactivos, setProdInactivos] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [modalCocina, setModalCocina] = useState(null)

  // Reproducir beep al enviar a cocina
  const reproducirBeep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const beep = (freq, dur, delay=0) => {
        setTimeout(() => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain); gain.connect(ctx.destination)
          osc.frequency.value = freq
          osc.type = 'sine'
          gain.gain.setValueAtTime(0.3, ctx.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + dur)
          osc.start()
          osc.stop(ctx.currentTime + dur)
        }, delay)
      }
      beep(880, 0.15, 0)
      beep(1100, 0.15, 180)
      beep(1320, 0.25, 360)
    } catch(e) { console.error('Audio error:', e) }
  }
  useCatalogoActivo(setFamInactivas, setProdInactivos)
  const [modal,       setModal]       = useState(null)
  const [cobroModal,  setCobroModal]  = useState(false)
  const [nuevaModal,  setNuevaModal]  = useState(false)
  const [platModal,   setPlatModal]   = useState(false)
  const [mesaModal,   setMesaModal]   = useState(false)
  const [llevarModal, setLlevarModal] = useState(false)
  const [modoPlatforma, setModoPlatforma] = useState(false)
  const [stockAlerta, setStockAlerta] = useState(null)

  const [alertaTimer, setAlertaTimer] = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [msg,         setMsg]         = useState(null)
  // Capturador global temporal — muestra cualquier error silencioso en vez de fallar sin aviso
  useEffect(() => {
    const onErr = (e) => setMsg({ ok:false, text:'JS Error: '+(e.error?.message||e.message||'desconocido') })
    const onRej = (e) => setMsg({ ok:false, text:'Promise Error: '+(e.reason?.message||String(e.reason)) })
    window.addEventListener('error', onErr)
    window.addEventListener('unhandledrejection', onRej)
    return () => { window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onRej) }
  }, [])
  const [fecha,       setFecha]       = useState(today())
  const [stockBebidas, setStockBebidas] = useState({})
  const [modalSinStock, setModalSinStock] = useState(null)
  const [staff,        setStaff]        = useState([])
  const [cobradoPorModal, setCobradoPorModal] = useState(null)  // {params, onConfirm}

  // Cargar lista de personal al montar
  useEffect(() => {
    sb.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) return
      fetch('/.netlify/functions/staff-list', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })
        .then(r => r.json())
        .then(d => { if (d.usuarios) setStaff(d.usuarios.map(u => u.nombre)) })
        .catch(() => {})
    })
  }, [])

  // Stock actual de bebidas y postres — usa el mismo algoritmo que Almacén
  const cargarStockBebidas = useCallback(async () => {
    const map = await fetchStockBebidasPostres()
    setStockBebidas(map)
  }, [])

  useEffect(() => { cargarStockBebidas() }, [cargarStockBebidas])

  // Sincronizar stock en tiempo real cuando otro usuario registra una venta
  useEffect(() => {
    const channel = sb.channel('inventario-stock-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventario_maestro' }, () => {
        cargarStockBebidas()
      })
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [cargarStockBebidas])
  const [platosDB,       setPlatosDB]       = useState([])
  const [guisosActivos,  setGuisosActivos]  = useState([])
  const alertasDisparadas = useRef(new Set())

  // Cargar productos desde BD como fuente principal
  useEffect(() => {
    sb.from('productos')
      .select('codigo,nombre,precio_base,precio_extra,familias(nombre)')
      .eq('activo', true)
      .then(({ data }) => {
        if (!data?.length) return
        // Extraer guisos activos para el configurador
        setGuisosActivos((data||[]).filter(d=>d.familias?.nombre==='Guisos').map(d=>d.nombre))
        // Familias que NO aparecen en el menú de comanda
        const FAMILIAS_SKIP = ['Guisos','Salsas','Toppings']
        const CAT_COLOR_MAP = {
          'Los Chilakiles':'#E24B4A','Huevos y Crokantes':'#D85A30',
          'Los Dorados':'#D85A30','Del Comal':'#BA7517','Enfrijoladas':'#BA3B3B',
          '1/2 Litros':'#D4A017','Bebidas Frías':'#378ADD','Bebidas Calientes':'#2568B0',
          'Postres':'#6E6E73','Emparedados':'#2D9E6A','Guisos Extras':'#8B6914',
          'Platos a la Carta':'#7F77DD',
        }
        const fromDB = data
          .filter(d => !FAMILIAS_SKIP.includes(d.familias?.nombre))
          .map(d => {
            // Buscar en PLATOS_BASE para heredar color y propiedades
            const base = PLATOS_BASE.find(p=>p.codigo===d.codigo||p.nombre===d.nombre)
            const familia = d.familias?.nombre || base?.familia || 'Otros'
            return {
              codigo:      d.codigo,
              nombre:      d.nombre,
              familia:     familia,
              precio:      d.precio_base > 0 ? d.precio_base : (base?.precio || 0),
              precioExtra: d.precio_extra > 0 ? d.precio_extra : 20,
              color:       base?.color || CAT_COLOR_MAP[familia] || '#888780',
            }
          })
        setPlatosDB(fromDB)
      })
  }, [])

  // Cargar comandas activas desde BD
  // IMPORTANTE: hace MERGE por updated_at en vez de reemplazo ciego — evita que un
  // reload disparado por Realtime (de esta u otra tablet) pise un edit/delete local
  // que aún no terminó de persistir o que llegó fuera de orden por latencia de red.
  const loadComandas = useCallback(async () => {
    const { data } = await sb.from('comandas_activas')
      .select('*')
      .not('estado','eq','eliminada')
      .order('created_at')

    // Eliminar comandas cobradas hace más de 5 segundos (quedaron huérfanas por recarga)
    const ahora = Date.now()
    const huerfanas = (data||[]).filter(c =>
      c.estado === 'cobrada' &&
      (ahora - new Date(c.updated_at).getTime()) > 5000
    )
    if (huerfanas.length > 0) {
      await Promise.all(huerfanas.map(c =>
        sb.from('comandas_activas').delete().eq('id', c.id)
      ))
    }
    const activasBD = (data||[]).filter(c =>
      c.estado !== 'cobrada' || (ahora - new Date(c.updated_at).getTime()) <= 5000
    )

    setComandas(prevLocal => {
      const localMap = new Map(prevLocal.map(c => [c.id, c]))
      return activasBD.map(bdRow => {
        const local = localMap.get(bdRow.id)
        if (!local) return bdRow
        // Ventana de gracia: si esta tablet acaba de escribir esta comanda, conservar
        // la version local sin importar el reloj del dispositivo (evita clock-skew)
        const expiry = pendingWritesRef.current.get(bdRow.id)
        if (expiry && Date.now() < expiry) return local
        // Si la version local es igual o mas nueva que la de BD, conservar la local
        const tLocal = new Date(local.updated_at||0).getTime()
        const tBD    = new Date(bdRow.updated_at||0).getTime()
        return tLocal > tBD ? local : bdRow
      })
    })
  }, [])

  useEffect(() => { loadComandas() }, [loadComandas])

  // Supabase Realtime — escuchar cambios en comandas_activas
  const cobrandoRef = React.useRef(new Set()) // IDs en proceso de cobro — evita race condition
  const writingRef  = React.useRef(false)      // true mientras hay un write en vuelo — suprime Realtime reload
  const pendingWritesRef = React.useRef(new Map()) // id -> expiry ms. Blinda el merge contra desfase de reloj entre dispositivos
  useEffect(() => {
    let timeout = null
    const channel = sb.channel('comandas-realtime')
      .on('postgres_changes', { event:'*', schema:'public', table:'comandas_activas' }, () => {
        // Ignorar si hay un write local en curso — se recargarå al terminar
        if (writingRef.current) return
        // Debounce 800ms para evitar race condition con estado local
        clearTimeout(timeout)
        timeout = setTimeout(() => loadComandas(), 800)
      })
      .subscribe()
    return () => { sb.removeChannel(channel); clearTimeout(timeout) }
  }, [loadComandas])

  // Timer checker — verificar si alguna comanda llegó al límite
  useEffect(() => {
    const iv = setInterval(() => {
      setComandas(prev => {
        prev.forEach(c => {
          if ((c.estado==='en_cocina'||c.estado==='en_preparacion') && c.enviado_cocina_at) {
            const elapsed = (Date.now() - new Date(c.enviado_cocina_at)) / 60000
            const key = c.id + '_' + c.ronda
            if (elapsed >= c.timer_minutos && !alertasDisparadas.current.has(key)) {
              alertasDisparadas.current.add(key)
              playAlarm()
              setAlertaTimer(c)
            }
          }
        })
        return prev
      })
    }, 5000)
    return () => clearInterval(iv)
  }, [])

  const esDemo   = role === 'demo'
  const esViewer = role === 'viewer' || esDemo
  const PLATOS   = platosDB.length > 0 ? platosDB : PLATOS_BASE.map(p=>({...p,precioExtra:20}))
  const comanda  = comandas.find(c=>c.id===activa)
  const items   = comanda?.items || []
  const [personaActiva,  setPersonaActiva]  = useState(1)
  const [editandoNombre, setEditandoNombre] = useState(false)
  const [editMesa,       setEditMesa]       = useState('')
  const [editCliente,    setEditCliente]    = useState('')
  const total    = items.reduce((s,i)=>s+i.subtotal,0)
  const totalUds = items.reduce((s,i)=>s+i.qty,0)

  const guardarEdicionNombre = async () => {
    if (!comanda) return
    const nuevaMesa   = comanda.tipo==='mesa' ? editMesa.trim() : comanda.mesa
    const nuevoCliente = editCliente.trim()
    const nuevoLabel  = comanda.tipo==='mesa' ? 'Mesa '+nuevaMesa : comanda.label
    setComandas(prev => prev.map(c => c.id===activa
      ? {...c, mesa:nuevaMesa, cliente:nuevoCliente, label:nuevoLabel}
      : c))
    await sb.from('comandas_activas')
      .update({ mesa:nuevaMesa, cliente:nuevoCliente, label:nuevoLabel, updated_at:new Date().toISOString() })
      .eq('id', activa)
    setEditandoNombre(false)
  }
  const canal   = comanda?.canal || 'Efectivo'
  const platosBase = modoPlatforma && comanda?.tipo==='plataforma'
    ? [...PLATOS.filter(p => PRODUCTOS_PLATAFORMA.includes(p.nombre)), ...PLATOS.filter(p => !PRODUCTOS_PLATAFORMA.includes(p.nombre))]
    : PLATOS
  // Filtrar por visibilidad Supabase + busqueda + familia seleccionada
  const visibles = platosBase.filter(p => !prodInactivos.includes(p.codigo) && !famInactivas.includes(p.familia))
  const busq = busqueda.trim().toLowerCase()
  const platos = busq.length > 0
    ? visibles.filter(p => p.nombre.toLowerCase().includes(busq) || p.codigo.toLowerCase().includes(busq))
    : (familia==='Todos' ? visibles : visibles.filter(p=>p.familia===familia))

  // Abrir comanda de plataforma
  const abrirPlataforma = async ({ canal, numOrden, cliente }) => {
    const id = Date.now().toString()
    const label = canal + (numOrden ? ' #' + numOrden : '')
    const nueva = { id, tipo:'plataforma', mesa:'', canal, cliente, label, items:[], estado:'abierta', ronda:0, timer_minutos:15, timer_siguiente:5, created_at:new Date().toISOString(), updated_at:new Date().toISOString() }
    const { error } = await sb.from('comandas_activas').insert(nueva)
    if (error) { setMsg({ ok:false, text:'Error: '+error.message }); return }
    setComandas(prev => [...prev, nueva])
    setActiva(id)
    setPlatModal(false)
    setModoPlatforma(true)
  }

  // Abrir nueva comanda — guardar en BD
  const abrirComanda = async ({ tipo, mesa, canal, cliente, timer1, timerN, empaque }) => {
    const id = Date.now().toString()
    const label = tipo==='mesa' ? 'Mesa '+mesa : tipo==='llevar' ? 'Para llevar' : canal
    // Si hay empaque (>0), lo metemos como primer item de la comanda
    const itemsIniciales = empaque > 0 ? [{
      id: Date.now() + 1,
      plato: { nombre: 'Empaque', familia: 'Empaque', codigo: 'EMP-01', color: '#888' },
      qty: 1,
      subtotal: empaque,
      precioUnit: empaque,
      desc: 'Cargo por empaque',
    }] : []
    const nueva = { id, tipo, mesa, canal, cliente, label, items:itemsIniciales, estado:'abierta', ronda:0, timer_minutos:timer1, timer_siguiente:timerN, created_at:new Date().toISOString(), updated_at:new Date().toISOString() }
    const { error } = await sb.from('comandas_activas').insert(nueva)
    if (error) { setMsg({ ok:false, text:'Error: '+error.message }); return }
    // Agregar localmente sin esperar Realtime
    setComandas(prev => [...prev, nueva])
    setActiva(id)
    setNuevaModal(false)
    setMesaModal(false)
    setLlevarModal(false)
  }

  const [editingItemId, setEditingItemId] = useState(null)

  const editItem = (item) => {
    setEditingItemId(item.id)
    setModal({ ...item.plato, _stockMax: null, _editConfig: item._config || null })
  }

  // Agregar ítem (o reemplazar si estamos editando)
  const confirmarItem = async (item) => {
    let nuevosItems
    if (editingItemId) {
      // Reemplazar item existente manteniendo persona y id original
      const original = items.find(i => i.id === editingItemId)
      const updated = { ...item, id: editingItemId, persona: original?.persona }
      nuevosItems = items.map(i => i.id === editingItemId ? updated : i)
      setEditingItemId(null)
    } else {
      const newItem = { ...item, id:Date.now() }
      const itemConPersona = comanda.tipo === 'mesa' ? { ...newItem, persona: personaActiva } : newItem
      nuevosItems = [...items, itemConPersona]
    }
    // Si incluye café de olla gratis y es item nuevo, agregarlo como item $0
    if (item.cafeOlla && !editingItemId) {
      const cafeItem = {
        id: Date.now()+1,
        plato: { nombre:'Cafe de Olla', familia:'Bebidas Calientes', codigo:'BEC-01' },
        qty: item.qty, subtotal: 0, precioUnit: 0, desc: 'Gratis con pedido',
        persona: comanda.tipo === 'mesa' ? personaActiva : undefined,
      }
      nuevosItems = [...nuevosItems, cafeItem]
    }
    // "Llevar" en mesa — cliente que come ahi pero tambien pide algo para llevar.
    // Al agregar el primer producto a ese comensal, se cobra el empaque una sola vez.
    if (comanda.tipo === 'mesa' && personaActiva === 'llevar' && !editingItemId) {
      const yaTieneEmpaque = items.some(i => i.persona === 'llevar' && i.plato?.codigo === 'EMP-LLEVAR')
      if (!yaTieneEmpaque) {
        nuevosItems = [...nuevosItems, {
          id: Date.now()+3,
          plato: { nombre:'Empaque para llevar', familia:'Cargo', codigo:'EMP-LLEVAR' },
          qty: 1, subtotal: 10, precioUnit: 10, desc: 'Cargo por empaque',
          persona: 'llevar',
        }]
      }
    }
    const ts = new Date().toISOString()
    setComandas(prev => prev.map(c => c.id===activa ? { ...c, items:nuevosItems, updated_at:ts } : c))
    writingRef.current = true
    pendingWritesRef.current.set(activa, Date.now() + 4000)
    await sb.from('comandas_activas').update({ items:nuevosItems, updated_at:ts }).eq('id', activa)
    writingRef.current = false
    setModal(null)
  }

  // Quitar ítem - actualiza UI inmediatamente
  const removeItem = async (itemId) => {
    // eslint-disable-next-line eqeqeq
    const nuevosItems = items.filter(i => i.id != itemId)
    const ts = new Date().toISOString()
    setMsg({ ok:true, text:'Quitando item...' })
    setComandas(prev => prev.map(c => c.id===activa ? { ...c, items:nuevosItems, updated_at:ts } : c))
    writingRef.current = true
    pendingWritesRef.current.set(activa, Date.now() + 4000)
    const { error } = await sb.from('comandas_activas')
      .update({ items: nuevosItems, updated_at: ts })
      .eq('id', activa)
    writingRef.current = false
    if (error) {
      setComandas(prev => prev.map(c => c.id===activa ? { ...c, items } : c))
      setMsg({ ok:false, text:'Error al quitar item: '+error.message })
    } else {
      setMsg({ ok:true, text:'Item quitado ✓' })
      setTimeout(()=>setMsg(null), 1500)
    }
  }

  // Enviar a cocina
  const enviarCocina = async () => {
    if (!items.length) return setMsg({ ok:false, text:'Agrega productos antes de enviar a cocina' })
    const nuevaRonda = (comanda.ronda||0) + 1
    const timerMin = nuevaRonda===1 ? (comanda.timer_minutos||10) : (comanda.timer_siguiente||5)
    const update = { estado:'en_cocina', ronda:nuevaRonda, timer_minutos:timerMin, enviado_cocina_at:new Date().toISOString(), updated_at:new Date().toISOString() }
    setComandas(prev => prev.map(c => c.id===activa ? { ...c, ...update } : c))
    await sb.from('comandas_activas').update(update).eq('id', activa)
    reproducirBeep()
    setModalCocina({ tipo:'enviado', label:comanda.label, timer:timerMin, items:items.length })
    setTimeout(()=>setModalCocina(null), 2500)
  }

  // Imprimir comanda cocina
  const imprimirComanda = () => {
    const doc = generarComanda({ comanda, items })
    imprimir(doc)
  }

  // Imprimir ticket cliente (pregunta si imprimir)
  const imprimirTicket = (cobroParams) => {
    const quiere = window.confirm('¿El cliente quiere ticket impreso?\n\nAceptar = imprimir\nCancelar = no imprimir')
    if (!quiere) return
    const doc = generarTicket({
      comanda, items,
      total: cobroParams.totalOriginal || total,
      canal: cobroParams.canal || canal,
      neto: cobroParams.neto,
      descuento: cobroParams.descuento || 0,
    })
    imprimir(doc)
  }

  // Imprimir cuenta sin cobrar
  const imprimirCuenta = async () => {
    const doc = generarTicket({ comanda, items, total, canal, neto: total, descuento: 0 })
    imprimir(doc)
    // Cambiar estado a cuenta_pedida
    setComandas(prev => prev.map(c => c.id===activa ? { ...c, estado:'cuenta_pedida' } : c))
    await sb.from('comandas_activas').update({ estado:'cuenta_pedida', updated_at:new Date().toISOString() }).eq('id', activa)
    setMsg({ ok:true, text:'🧾 Cuenta impresa — esperando pago del cliente' })
    setTimeout(()=>setMsg(null), 3000)
  }

  // Marcar listo
  const marcarListo = async () => {
    const comanda = comandas.find(c => c.id === activa)
    setComandas(prev => prev.map(c => c.id===activa ? { ...c, estado:'lista' } : c))
    await sb.from('comandas_activas').update({ estado:'lista', updated_at:new Date().toISOString() }).eq('id', activa)
    if (comanda) {
      descontarInsumos(comanda).catch(() => {})
      descontarAlmacen(comanda).catch(() => {})
    }
  }

  // Enviar cuenta por WhatsApp
  const cuentaWA = async () => {
    const comanda = comandas.find(c => c.id === activa)
    const tel = (comanda?.cliente||'').replace(/[^0-9]/g,'')
    const fmtMl = n => '$'+Math.round(n).toLocaleString('es-MX')
    const lineas = items.map(i => `  • ${i.qty}x ${i.plato.nombre} — ${fmtMl((i.plato.precio||0)*i.qty)}`).join('\n')
    const msg = `🧾 *Cuenta Chilakileando*\n\n${lineas}\n\n*Total: ${fmtMl(total)}*\n\n¡Gracias por visitarnos! 💛`
    const waNum = tel ? (tel.startsWith('52') ? tel : '52'+tel) : ''
    const url = waNum
      ? `https://api.whatsapp.com/send?phone=${waNum}&text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`
    if (comanda && comanda.estado !== 'cuenta_pedida') {
      setComandas(prev => prev.map(c => c.id===activa ? { ...c, estado:'cuenta_pedida' } : c))
      await sb.from('comandas_activas').update({ estado:'cuenta_pedida', updated_at:new Date().toISOString() }).eq('id', activa)
    }
    window.open(url, '_blank')
  }

  // Standby (cliente pide más)
  const ponerStandby = async () => {
    setComandas(prev => prev.map(c => c.id===activa ? { ...c, estado:'standby' } : c))
    await sb.from('comandas_activas').update({ estado:'standby', updated_at:new Date().toISOString() }).eq('id', activa)
  }

  // Cancelar comanda completa
  const cancelarComanda = async () => {
    if (!window.confirm('¿Cancelar esta comanda? Se eliminará sin registrar venta.')) return
    setSaving(true)
    try {
      await sb.from('comandas_activas').delete().eq('id', activa)
      setComandas(prev => prev.filter(c => c.id !== activa))
      setActiva(null)
      setMsg({ ok:true, text:'Comanda cancelada' })
      setTimeout(()=>setMsg(null), 3000)
    } catch(e) { setMsg({ ok:false, text:'Error al cancelar: '+e.message }) }
    setSaving(false)
  }

  // Generar folio único del día via función PostgreSQL (atómico, sin duplicados)
  const generarFolio = async (canalCobro) => {
    const prefijo = canalCobro.includes('Uber') || canalCobro.includes('DiDi') || 
                    canalCobro.includes('Rappi') || canalCobro === 'Ola' ? 'P'
                  : canalCobro === 'Tarjeta' ? 'T'
                  : canalCobro === 'Gratis' ? 'G'
                  : canalCobro === 'Mixto' ? 'M' : 'E'
    const { data, error } = await sb.rpc('generar_folio', { p_fecha: fecha, p_prefijo: prefijo })
    console.log('generar_folio result:', data, error)
    if (error || !data) {
      console.error('Error generando folio:', error)
      // Fallback: contar folios únicos manualmente
      const hoy = new Date()
      const fechaStr = hoy.getFullYear() + String(hoy.getMonth()+1).padStart(2,'0') + String(hoy.getDate()).padStart(2,'0')
      const patron = fechaStr + '-' + prefijo + '-'
      const { data: d2 } = await sb.from('ventas').select('folio').eq('fecha', fecha).like('folio', patron + '%').not('folio', 'is', null)
      const unicos = new Set((d2||[]).map(r=>r.folio).filter(Boolean))
      return patron + String(unicos.size + 1).padStart(3,'0')
    }
    return data
  }

  // Cobrar comanda
  const ejecutarCobro = async ({ comPlat, comTarjeta, comClip, neto, clip, canal: canalCobro, mixto, efvo, tarj, descuento, totalConDesc, empaque, cobradaPor }) => {
    // Evitar doble cobro
    if (cobrandoRef.current.has(activa)) return
    cobrandoRef.current.add(activa)
    setSaving(true)
    const comandaId = activa
    const canalFinal = canalCobro || canal
    const descuentoMonto = descuento || 0
    try {
      const metodo = ['Uber','Uber Chilakiles','DiDi','DiDi Chilakiles','Rappi','Ola'].includes(canalFinal)?'Plataforma':canalFinal
      const folio = await generarFolio(canalFinal)
      const tiempoCocina = comanda.enviado_cocina_at
        ? Math.round((Date.now() - new Date(comanda.enviado_cocina_at)) / 1000)
        : null

      let rows = []
      if (mixto && efvo>0 && tarj>0) {
        // Pago mixto — prorratear importe entre efectivo y tarjeta por producto
        const ratioEfvo = efvo / (efvo+tarj)
        const ratioTarj = tarj / (efvo+tarj)
        items.forEach(item => {
          const impEfvo = Math.round(item.subtotal * ratioEfvo)
          const impTarj = item.subtotal - impEfvo
          if (impEfvo>0) rows.push({ fecha, folio, cliente:comanda.cliente||null, metodo_pago:'Efectivo', canal:'Efectivo',
            producto:item.plato.nombre+(item.desc?' ('+item.desc+')':''),
            categoria:item.plato.familia, unidades:Math.round(item.qty*ratioEfvo)||0, importe:impEfvo,
            tiempo_cocina_seg:tiempoCocina, canal_tipo:comanda.tipo||'mesa' })
          if (impTarj>0) rows.push({ fecha, folio, cliente:comanda.cliente||null, metodo_pago:'Tarjeta', canal:'Tarjeta',
            producto:item.plato.nombre+(item.desc?' ('+item.desc+')':''),
            categoria:item.plato.familia, unidades:Math.round(item.qty*ratioTarj)||0, importe:impTarj,
            tiempo_cocina_seg:tiempoCocina, canal_tipo:comanda.tipo||'mesa' })
        })
      } else {
        rows = items.map(item=>({
          fecha, folio, cliente:comanda.cliente||null, metodo_pago:metodo, canal:canalFinal,
          producto:item.plato.nombre+(item.desc?' ('+item.desc+')':''),
          categoria:item.plato.familia, unidades:item.qty, importe:item.subtotal,
          tiempo_cocina_seg:tiempoCocina, canal_tipo:comanda.tipo||'mesa',
        }))
      }
      // Empaque como venta adicional
      if (empaque > 0) {
        if (mixto && efvo>0 && tarj>0) {
          const ratioEfvo = efvo / (efvo+tarj)
          const impEfvoEmp = Math.round(empaque * ratioEfvo)
          const impTarjEmp = empaque - impEfvoEmp
          if (impEfvoEmp>0) rows.push({ fecha, folio, cliente:comanda.cliente||null, metodo_pago:'Efectivo', canal:'Efectivo', producto:'Empaque', categoria:'Empaque', unidades:1, importe:impEfvoEmp, tiempo_cocina_seg:null, canal_tipo:comanda.tipo||'mesa' })
          if (impTarjEmp>0) rows.push({ fecha, folio, cliente:comanda.cliente||null, metodo_pago:'Tarjeta', canal:'Tarjeta', producto:'Empaque', categoria:'Empaque', unidades:0, importe:impTarjEmp, tiempo_cocina_seg:null, canal_tipo:comanda.tipo||'mesa' })
        } else {
          rows.push({ fecha, folio, cliente:comanda.cliente||null, metodo_pago:metodo, canal:canalFinal, producto:'Empaque', categoria:'Empaque', unidades:1, importe:empaque, tiempo_cocina_seg:null, canal_tipo:comanda.tipo||'mesa' })
        }
      }
      // Agregar cobrada_por + tomada_por a todos los rows para trazabilidad
      const rowsConStaff = rows.map(r => ({
        ...r,
        cobrada_por:  cobradaPor  || null,
        tomada_por:   comanda.tomada_por || null,
      }))
      let { error } = await sb.from('ventas').insert(rowsConStaff)
      if (error) {
        // Si la columna aún no existe en BD, reintentar sin los campos de staff
        if (error.message?.includes('cobrada_por') || error.message?.includes('tomada_por') || error.code === '42703') {
          const { error: e2 } = await sb.from('ventas').insert(rows)
          if (e2) throw e2
        } else {
          throw error
        }
      }

      // Sincronizar ventas_cat por categoría
      const catMap = {}
      rows.forEach(r => {
        if (!catMap[r.categoria]) catMap[r.categoria] = { importe:0, unidades:0 }
        catMap[r.categoria].importe  += r.importe||0
        catMap[r.categoria].unidades += r.unidades||0
      })
      for (const [categoria, vals] of Object.entries(catMap)) {
        // Buscar si ya existe registro para esa fecha+categoria
        const { data: existing } = await sb.from('ventas_cat')
          .select('id,importe,unidades').eq('fecha',fecha).eq('categoria',categoria).maybeSingle()
        if (existing) {
          await sb.from('ventas_cat').update({
            importe:  (existing.importe||0)  + vals.importe,
            unidades: (existing.unidades||0) + vals.unidades,
          }).eq('id', existing.id)
        } else {
          await sb.from('ventas_cat').insert({ fecha, categoria, importe:vals.importe, unidades:vals.unidades })
        }
      }
      if (comPlat>0) await sb.from('gastos').insert({ fecha, concepto: canalFinal==='Mixto' ? 'Comision TC' : 'Comision '+canalFinal, categoria_gasto:'GASTO DE VENTAS', monto:comPlat, metodo_pago: canalFinal==='Mixto' ? 'Tarjeta' : 'Plataforma' })
      if (comTarjeta>0) await sb.from('gastos').insert({ fecha, concepto:'Comision TC', categoria_gasto:'GASTO DE VENTAS', monto:comTarjeta, metodo_pago: canalFinal==='Transferencia'?'Transferencia':'Tarjeta' })
      if (clip&&comClip>0) {
        await sb.from('gastos').insert({ fecha, concepto:'Comision Clip', categoria_gasto:'GASTO DE VENTAS', monto:comClip, metodo_pago:'Tarjeta' })
        // Reducir saldo del préstamo Clip en BD
        const { data: prestamo } = await sb.from('prestamos').select('saldo_actual').eq('id','clip').maybeSingle()
        if (prestamo) {
          const nuevoSaldo = Math.max(0, (prestamo.saldo_actual||0) - comClip)
          await sb.from('prestamos').update({ saldo_actual: nuevoSaldo, updated_at: new Date().toISOString() }).eq('id','clip')
        }
      }
      if (descuentoMonto > 0) {
        if (mixto && efvo > 0 && tarj > 0) {
          // Descuento proporcional a cada medio de pago
          const totalMixto = efvo + tarj
          const descEfvo = Math.round(descuentoMonto * efvo / totalMixto)
          const descTarj = descuentoMonto - descEfvo
          const promises = []
          if (descEfvo > 0) promises.push(sb.from('gastos').insert({ fecha, concepto:'Descuento comanda '+folio, categoria_gasto:'GASTO DE VENTAS', monto:descEfvo, metodo_pago:'Efectivo' }))
          if (descTarj > 0) promises.push(sb.from('gastos').insert({ fecha, concepto:'Descuento comanda '+folio, categoria_gasto:'GASTO DE VENTAS', monto:descTarj, metodo_pago:'Tarjeta' }))
          await Promise.all(promises)
        } else {
          const mpDesc = canalFinal==='Efectivo' ? 'Efectivo' : (canalFinal==='Tarjeta'||canalFinal==='Transferencia') ? canalFinal : 'Plataforma'
          await sb.from('gastos').insert({ fecha, concepto:'Descuento comanda '+folio, categoria_gasto:'GASTO DE VENTAS', monto:descuentoMonto, metodo_pago:mpDesc })
        }
      }
      // Descontar bebidas frías y postres — nombre normalizado al canónico para consistencia con Almacén
      const notaComanda = `Comanda ${comanda.label}${comanda.cliente?' — '+comanda.cliente:''}`
      for (const bev of items.filter(i=>i.plato.familia==='Bebidas Frías'||i.plato.familia==='Bebidas Frias')) {
        await sb.from('inventario_maestro').insert({
          fecha, producto: canonicalNombre(bev.plato.nombre), categoria:'bebida', unidad:'piezas',
          tipo_movimiento:'venta', cantidad:bev.qty, notas: notaComanda,
        })
      }
      for (const pos of items.filter(i=>i.plato.familia==='Postres')) {
        await sb.from('inventario_maestro').insert({
          fecha, producto: canonicalNombre(pos.plato.nombre), categoria:'postre', unidad:'piezas',
          tipo_movimiento:'venta', cantidad:pos.qty, notas: notaComanda,
        })
      }
      // Marcar como cobrada en estado local (para mostrar botón WA) y luego eliminar
      setComandas(prev => prev.map(c => c.id===comandaId ? {...c, estado:'cobrada'} : c))
      await sb.from('comandas_activas').update({ estado:'cobrada', cobrada_por: cobradaPor||null, updated_at:new Date().toISOString() }).eq('id', comandaId)
      setMsg({ ok:true, text:'✅ Comanda cobrada — '+items.length+' producto(s) — Neto '+fmtM(neto)+' · Envía el WhatsApp de encuesta al cliente' })
      // Impresión automática desactivada — usar botón manual
      // Eliminar de BD después de 5 segundos para evitar duplicar pagos
      setTimeout(async () => {
        await sb.from('comandas_activas').delete().eq('id', comandaId)
        setComandas(prev => prev.filter(c => c.id !== comandaId))
        setActiva(prev => prev === comandaId ? null : prev)
        cobrandoRef.current.delete(comandaId)
      }, 5000)
    } catch(e) {
      setMsg({ ok:false, text:e.message })
      cobrandoRef.current.delete(comandaId)
    }
    setSaving(false)
    setTimeout(()=>setMsg(null),5000)
  }

  const cobrar = async (params) => {
    setCobroModal(false)
    // Verificación de stock
    const checkStock = (paramsConCobrador) => {
      const conStock = items.filter(i => i.plato.familia==='Bebidas Frías' || i.plato.familia==='Bebidas Frias' || i.plato.familia==='Postres')
      const alertas = []
      for (const item of conStock) {
        const nombreInv = canonicalNombre(item.plato.nombre)
        const stockActual = stockBebidas[nombreInv] ?? null
        if (stockActual === null) alertas.push(`${item.plato.nombre}: sin registro en inventario`)
        else if (stockActual < item.qty) alertas.push(`${item.plato.nombre}: disponible ${stockActual} pzas, requiere ${item.qty}`)
      }
      if (alertas.length > 0) {
        setStockAlerta({ msgs:alertas, onConfirm:()=>{ setStockAlerta(null); ejecutarCobro(paramsConCobrador) } })
      } else { ejecutarCobro(paramsConCobrador) }
    }
    // Mostrar modal "¿Quién cobra?" si hay lista de staff
    if (staff.length > 0) {
      setCobradoPorModal({
        params,
        sugerido: comanda.tomada_por || null,
        onConfirm: (cobradaPor) => {
          setCobradoPorModal(null)
          checkStock({ ...params, cobradaPor })
        },
      })
    } else {
      checkStock(params)
    }
  }

  const TIPO_COLOR = { mesa:'#378ADD', llevar:'#EF9F27', plataforma:'#7F77DD' }

  return (
    <div>
      {/* Badge flotante unidades del día — z-index 90 queda debajo de todos los modales */}
      <UdsHoyBadge floating={true} />

      {modal && <ConfigModal plato={modal} onConfirm={confirmarItem} onCancel={()=>{ setModal(null); setEditingItemId(null) }} stockMax={modal._stockMax} initialConfig={modal._editConfig||null} guisosActivos={guisosActivos} />}
      {cobroModal && !esViewer && <CobroModal total={total} canal={canal} items={items} onConfirm={cobrar} onCancel={()=>setCobroModal(false)} />}
      {cobradoPorModal && (
        <CobradoPorModal
          staff={staff}
          sugerido={cobradoPorModal.sugerido}
          onConfirm={cobradoPorModal.onConfirm}
          onCancel={()=>setCobradoPorModal(null)}
        />
      )}
      {mesaModal   && <MesaModal   onConfirm={abrirComanda} onCancel={()=>setMesaModal(false)}   comandasAbiertas={comandas}/>}
      {llevarModal && <LlevarModal onConfirm={abrirComanda} onCancel={()=>setLlevarModal(false)}/>}
      {platModal && <PlataformaModal onConfirm={abrirPlataforma} onCancel={()=>setPlatModal(false)} />}
      {nuevaModal && <NuevaComandaModal onConfirm={abrirComanda} onCancel={()=>setNuevaModal(false)} comandasAbiertas={comandas} />}

      {/* ALERTA TIMER */}
      {alertaTimer && <AlertaTimer comanda={alertaTimer} onCerrar={()=>setAlertaTimer(null)} />}

      {/* MODAL COCINA - notificacion al enviar pedido */}
      {modalCocina && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:500,animation:'fadeIn 0.2s ease'}}>
          <div style={{background:'#1D9E75',borderRadius:24,padding:'40px 50px',textAlign:'center',color:'#fff',boxShadow:'0 20px 60px rgba(0,0,0,0.4)',minWidth:340,animation:'pop 0.3s ease'}}>
            <div style={{fontSize:72,marginBottom:12}}>👨‍🍳</div>
            <div style={{fontSize:24,fontWeight:800,marginBottom:8}}>¡Enviado a cocina!</div>
            <div style={{fontSize:14,opacity:0.9,marginBottom:6}}>{modalCocina.label}</div>
            <div style={{fontSize:13,opacity:0.85,marginBottom:14}}>{modalCocina.items} producto{modalCocina.items>1?'s':''} · Timer {modalCocina.timer} min</div>
            <div style={{fontSize:11,opacity:0.7}}>Cerrando automaticamente...</div>
          </div>
        </div>
      )}

      {/* STOCK ALERTA */}
      {stockAlerta && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:400}}>
          <div style={{background:'var(--surface)',borderRadius:'var(--r-lg)',padding:24,width:360,border:'0.5px solid var(--border-md)'}}>
            <div style={{fontSize:16,fontWeight:700,color:'#E24B4A',marginBottom:8}}>⚠️ Stock insuficiente</div>
            {stockAlerta.msgs.map((m,i)=>(
              <div key={i} style={{padding:'6px 10px',background:'#FCEBEB',borderRadius:'var(--r-sm)',marginBottom:6,fontSize:12,color:'#A32D2D'}}>{m}</div>
            ))}
            <div style={{display:'flex',gap:8,marginTop:14}}>
              <button onClick={()=>setStockAlerta(null)} style={{flex:1,padding:9,borderRadius:'var(--r-md)',border:'0.5px solid var(--border-md)',background:'transparent',cursor:'pointer',fontSize:13}}>Cancelar</button>
              <button onClick={stockAlerta.onConfirm} style={{flex:1,padding:9,borderRadius:'var(--r-md)',border:'none',background:'#E24B4A',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600}}>Cobrar igual</button>
            </div>
          </div>
        </div>
      )}

      {modalSinStock && (
        <ModalSinStock
          plato={modalSinStock.plato}
          nombreInv={modalSinStock.nombreInv}
          soloAjuste={modalSinStock.soloAjuste||false}
          fecha={fecha}
          onCerrar={()=>setModalSinStock(null)}
          onConfirmarStock={async (cantidad) => {
            // Calcular cuanto hay que ajustar para llegar a la cantidad fisica capturada
            const stockActual = stockBebidas[modalSinStock.nombreInv] || 0
            const diferencia = cantidad - stockActual
            const catAjuste = modalSinStock.plato.familia === 'Postres' ? 'postre' : 'bebida'
            await sb.from('inventario_maestro').insert({
              fecha,
              producto: modalSinStock.nombreInv,
              categoria: catAjuste,
              unidad: 'piezas',
              tipo_movimiento: 'ajuste',
              cantidad: diferencia,
              notas: 'Ajuste manual desde Comanda (verificacion fisica)'
            })
            await cargarStockBebidas()
            const platoSinLimite = { ...modalSinStock.plato, _stockMax: null }
            setModalSinStock(null)
            setModal(platoSinLimite)
          }}
          onAgregarSinStock={() => {
            setModal(modalSinStock.plato)
            setModalSinStock(null)
          }}
        />
      )}

      {esViewer && (
        <div style={{padding:'8px 14px',borderRadius:'var(--r-md)',marginBottom:12,background:'#EAF3DE',color:'#3B6D11',fontSize:12}}>
          Modo consulta — puedes crear comandas y ver totales pero no cobrar.
        </div>
      )}

      {msg && <div style={{padding:'9px 14px',borderRadius:'var(--r-md)',marginBottom:10,background:msg.ok?'#EAF3DE':'#FCEBEB',color:msg.ok?'#3B6D11':'#A32D2D',fontSize:12,fontWeight:500}}>{msg.text}</div>}

      {/* BARRA COMANDAS */}
      <div style={{marginBottom:12}}>
        <div style={{display:'flex',gap:6,marginBottom:8,alignItems:'center'}}>
        <button onClick={()=>!esViewer&&setMesaModal(true)}
          style={{padding:'6px 14px',borderRadius:'var(--r-md)',border:'1.5px solid #378ADD',background:'#378ADD18',cursor:'pointer',fontSize:12,color:'#378ADD',fontWeight:600}}>
          🍽 Mesa
        </button>
        <button onClick={()=>!esViewer&&setLlevarModal(true)}
          style={{padding:'6px 14px',borderRadius:'var(--r-md)',border:'1.5px solid #EF9F27',background:'#EF9F2718',cursor:'pointer',fontSize:12,color:'#EF9F27',fontWeight:600}}>
          🥡 Para llevar
        </button>
        <button onClick={()=>!esViewer&&setPlatModal(true)}
          style={{padding:'6px 14px',borderRadius:'var(--r-md)',border:'1.5px solid #7F77DD',background:'#7F77DD18',cursor:'pointer',fontSize:12,color:'#7F77DD',fontWeight:600}}>
          📦 Plataforma
        </button>
        </div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
        {comandas.map(c=>(
          <button key={c.id} onClick={()=>setActiva(c.id)}
            style={{padding:'6px 14px',borderRadius:'var(--r-md)',fontSize:12,fontWeight:600,cursor:'pointer',position:'relative',
              border:`2px solid ${activa===c.id?TIPO_COLOR[c.tipo]||ESTADO_COLOR[c.estado]:'var(--border-md)'}`,
              background:activa===c.id?(TIPO_COLOR[c.tipo]||ESTADO_COLOR[c.estado])+'18':'var(--bg)',
              color:activa===c.id?TIPO_COLOR[c.tipo]||ESTADO_COLOR[c.estado]:'var(--text2)'}}>
            {c.label}{c.cliente?' — '+c.cliente:''}
            <span style={{marginLeft:6,fontSize:9,padding:'1px 5px',borderRadius:99,background:ESTADO_COLOR[c.estado]+'33',color:ESTADO_COLOR[c.estado]}}>
              {ESTADO_LABEL[c.estado]}
            </span>
            {c.tomada_por && (
              <span style={{marginLeft:4,fontSize:9,padding:'1px 5px',borderRadius:99,background:'#37849922',color:'#378499'}}>
                👤 {c.tomada_por}
              </span>
            )}
          </button>
        ))}
        </div>
      </div>

      {!comanda ? (
        <div className="card" style={{textAlign:'center',padding:'40px 0',color:'var(--text3)'}}>
          <div style={{fontSize:32,marginBottom:8}}>🍽</div>
          <div>Selecciona o crea una comanda</div>
        </div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:12,alignItems:'start'}}>

          {/* MENÚ */}
          <div>
            <div style={{position:'relative',marginBottom:8}}>
              <input
                type="text"
                value={busqueda}
                onChange={e=>setBusqueda(e.target.value)}
                placeholder="🔍 Buscar producto en todo el menu..."
                style={{width:'100%',padding:'8px 32px 8px 12px',borderRadius:8,border:'1px solid var(--border-md)',fontSize:12,background:'var(--surface)',color:'var(--text1)'}}
              />
              {busqueda && (
                <button onClick={()=>setBusqueda('')}
                  style={{position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',background:'transparent',border:'none',cursor:'pointer',fontSize:14,color:'var(--text2)',padding:'4px 8px'}}>
                  ×
                </button>
              )}
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12,opacity:busqueda?0.4:1}}>
              {FAMILIAS_TABS.filter(f => f==='Todos' || !famInactivas.includes(f)).map(f=>{
                const c = TAB_COLORS[f]||'#378ADD'
                const sel = familia===f
                return (
                <button key={f} onClick={()=>setFamilia(f)}
                  style={{padding:'4px 10px',borderRadius:99,fontSize:11,cursor:'pointer',
                    border:`1.5px solid ${c}`,
                    background:sel?c:c+'15',
                    color:sel?'#fff':c,
                    fontWeight:sel?700:600}}>
                  {f}
                </button>)
              })}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))',gap:6}}>
              {platos.map(p=>{
                const esBebFria = p.familia==='Bebidas Frias' || p.familia==='Bebidas Frías'
                const esPostre  = p.familia==='Postres'
                const tieneStock = esBebFria || esPostre
                const nombreInv = tieneStock ? canonicalNombre(p.nombre) : null
                const stockBD = tieneStock ? (stockBebidas[nombreInv] ?? null) : null
                const yaEnComanda = tieneStock ? items.filter(i => i.plato?.nombre === p.nombre).reduce((s,i)=>s+(i.qty||1),0) : 0
                const stock = stockBD !== null ? stockBD - yaEnComanda : null
                const sinStock = tieneStock && stock !== null && stock <= 0
                const stockBajo = tieneStock && stock !== null && stock > 0 && stock <= 3

                const handleClick = () => {
                  if (esViewer || comanda.estado==='cobrada') return
                  if (sinStock) {
                    setModalSinStock({ plato: p, nombreInv })
                    return
                  }
                  setModal({...p, _stockMax: stock})
                }

                const bgColor = sinStock ? '#FCEBEB' : stockBajo ? '#FFF4E6' : p.color+'11'
                const borderColor = sinStock ? '#E24B4A' : stockBajo ? '#EF9F27' : p.color+'33'

                return (
                  <div key={p.codigo} style={{position:'relative'}}>
                    <button onClick={handleClick}
                      style={{width:'100%',padding:'10px 8px',borderRadius:'var(--r-md)',border:`1.5px solid ${borderColor}`,
                        background:bgColor,cursor:esViewer||comanda.estado==='cobrada'?'not-allowed':'pointer',
                        textAlign:'left',opacity:comanda.estado==='cobrada'?0.4:1,position:'relative'}}>
                      <div style={{fontSize:12,fontWeight:600,color:p.color,marginBottom:2}}>{p.nombre}</div>
                      <div style={{fontSize:11,color:'var(--text3)'}}>{fmtM(p.precio)}</div>
                      {tieneStock && stock !== null && (
                        <div style={{fontSize:9,fontWeight:600,marginTop:2,
                          color: sinStock?'#E24B4A':stockBajo?'#EF9F27':'#1D9E75'}}>
                          {sinStock ? '⚠ Sin stock' : `Quedan: ${stock}`}
                        </div>
                      )}
                    </button>

                  </div>
                )
              })}
            </div>
          </div>

          {/* RESUMEN COMANDA */}
          <div className="card" style={{position:'sticky',top:12}}>
            {/* ESTADO Y TIMER */}
            <div style={{marginBottom:10}}>
              {/* Cabecera: label + totales + estado */}
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:6,gap:8}}>
                <div style={{flex:1,minWidth:0}}>
                  {editandoNombre ? (
                    <div style={{display:'flex',flexDirection:'column',gap:6}}>
                      {comanda.tipo==='mesa' && (
                        <input className="form-input" value={editMesa} onChange={e=>setEditMesa(e.target.value)}
                          placeholder="Número de mesa" style={{fontSize:12,padding:'4px 8px'}}
                          onKeyDown={e=>{if(e.key==='Enter')guardarEdicionNombre();if(e.key==='Escape')setEditandoNombre(false)}}/>
                      )}
                      <input className="form-input" value={editCliente} onChange={e=>setEditCliente(e.target.value)}
                        placeholder="Nombre cliente / tel..." style={{fontSize:12,padding:'4px 8px'}}
                        onKeyDown={e=>{if(e.key==='Enter')guardarEdicionNombre();if(e.key==='Escape')setEditandoNombre(false)}}/>
                      <div style={{display:'flex',gap:4}}>
                        <button onClick={guardarEdicionNombre}
                          style={{flex:1,padding:'4px 0',fontSize:11,borderRadius:'var(--r-sm)',border:'none',background:'#1D9E75',color:'#fff',cursor:'pointer',fontWeight:600}}>
                          Guardar
                        </button>
                        <button onClick={()=>setEditandoNombre(false)}
                          style={{padding:'4px 8px',fontSize:11,borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'transparent',color:'var(--text2)',cursor:'pointer'}}>
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap'}}>
                      <span style={{fontSize:13,fontWeight:600}}>{comanda.label}{comanda.cliente?' — '+comanda.cliente:''}</span>
                      {!esViewer && comanda.estado!=='cobrada' && (
                        <button onClick={()=>{setEditMesa(comanda.mesa||'');setEditCliente(comanda.cliente||'');setEditandoNombre(true)}}
                          title="Editar mesa / nombre"
                          style={{padding:'1px 5px',fontSize:11,borderRadius:'var(--r-sm)',border:'0.5px solid var(--border-md)',background:'transparent',color:'var(--text3)',cursor:'pointer',lineHeight:1.4}}>
                          ✏️
                        </button>
                      )}
                    </div>
                  )}
                  {/* Badge totales */}
                  {totalUds > 0 && (
                    <div style={{display:'flex',gap:8,marginTop:4,flexWrap:'wrap'}}>
                      <span style={{fontSize:11,padding:'1px 8px',borderRadius:99,background:'var(--bg2)',border:'0.5px solid var(--border-md)',color:'var(--text2)',fontWeight:600}}>
                        {totalUds} {totalUds===1?'producto':'productos'}
                      </span>
                      <span style={{fontSize:11,padding:'1px 8px',borderRadius:99,background:'var(--bg2)',border:'0.5px solid var(--border-md)',color:'var(--text)',fontWeight:600}}>
                        ${total.toLocaleString('es-MX')}
                      </span>
                    </div>
                  )}
                </div>
                <span style={{fontSize:11,padding:'2px 8px',borderRadius:99,background:ESTADO_COLOR[comanda.estado]+'22',color:ESTADO_COLOR[comanda.estado],fontWeight:600,whiteSpace:'nowrap'}}>
                  {ESTADO_LABEL[comanda.estado]}
                </span>
              </div>
              {staff.length > 0 && !esViewer && (
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
                  <span style={{fontSize:11,color:'var(--text3)',whiteSpace:'nowrap'}}>👤 Atendido por:</span>
                  <select
                    value={comanda.tomada_por || ''}
                    onChange={async e => {
                      const val = e.target.value
                      const enCocina = comanda.estado === 'en_cocina'
                      const nuevoEstado = val && enCocina ? 'en_preparacion' : undefined
                      setComandas(prev => prev.map(c => c.id===activa ? {...c, tomada_por: val||null, ...(nuevoEstado ? {estado: nuevoEstado} : {})} : c))
                      const upd = { tomada_por: val||null, updated_at: new Date().toISOString() }
                      if (nuevoEstado) upd.estado = nuevoEstado
                      await sb.from('comandas_activas').update(upd).eq('id', activa)
                    }}
                    style={{flex:1,padding:'3px 6px',borderRadius:6,border:'1px solid var(--border-md)',fontSize:11,background:'var(--surface)',color:'var(--text1)'}}>
                    <option value=''>— Sin asignar —</option>
                    {staff.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              )}
              {staff.length > 0 && esViewer && comanda.tomada_por && (
                <div style={{fontSize:11,color:'var(--text3)',marginBottom:6}}>👤 {comanda.tomada_por}</div>
              )}
              {(comanda.estado==='en_cocina'||comanda.estado==='en_preparacion') && comanda.enviado_cocina_at && (
                <TimerDisplay enviado_at={comanda.enviado_cocina_at} timer_minutos={comanda.timer_minutos||10}/>
              )}
              {comanda.ronda>0 && <div style={{fontSize:10,color:'var(--text3)',marginTop:4}}>Ronda {comanda.ronda} · Timer: {comanda.timer_minutos} min</div>}
            </div>

            {/* BOTONES DE ESTADO */}
            {!esViewer && (
              <div style={{display:'flex',gap:6,marginBottom:10,flexWrap:'wrap'}}>
                {comanda.estado==='pendiente_pago' && (
                  <button onClick={async()=>{
                    setComandas(prev=>prev.map(c=>c.id===activa?{...c,estado:'abierta'}:c))
                    await sb.from('comandas_activas').update({estado:'abierta',updated_at:new Date().toISOString()}).eq('id',activa)
                    setMsg({ok:true,text:'Pago confirmado — comanda activa'})
                    setTimeout(()=>setMsg(null),3000)
                  }} style={{flex:1,padding:'8px 0',borderRadius:'var(--r-md)',border:'none',background:'#7F77DD',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>
                    💳 Confirmar pago recibido
                  </button>
                )}
                {(comanda.estado==='abierta'||comanda.estado==='standby') && (
                  <button onClick={enviarCocina} disabled={!items.length}
                    style={{flex:1,padding:'8px 0',borderRadius:'var(--r-md)',border:'none',background:items.length?'#EF9F27':'var(--border)',color:items.length?'#fff':'var(--text3)',cursor:items.length?'pointer':'default',fontSize:12,fontWeight:600}}>
                    🍳 Enviar a cocina
                  </button>
                )}
                {comanda.estado!=='cobrada' && items.length>0 && (
                  <button onClick={imprimirComanda}
                    style={{padding:'8px 12px',borderRadius:'var(--r-md)',border:'1.5px solid #378ADD',background:'transparent',color:'#378ADD',cursor:'pointer',fontSize:12,fontWeight:600}}>
                    🖨 Comanda
                  </button>
                )}
                {(comanda.estado==='en_cocina'||comanda.estado==='en_preparacion') && (
                  <button onClick={marcarListo}
                    style={{flex:1,padding:'8px 0',borderRadius:'var(--r-md)',border:'none',background:'#1D9E75',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>
                    ✓ Marcar listo
                  </button>
                )}
                {comanda.estado==='lista' && (
                  <button onClick={ponerStandby}
                    style={{flex:1,padding:'8px 0',borderRadius:'var(--r-md)',border:'1px solid #7F77DD',background:'transparent',color:'#7F77DD',cursor:'pointer',fontSize:12,fontWeight:600}}>
                    + Agregar más
                  </button>
                )}
                {(comanda.estado==='lista'||comanda.estado==='standby'||comanda.estado==='cuenta_pedida') && items.length>0 && (
                  <button onClick={imprimirCuenta}
                    style={{flex:1,padding:'8px 0',borderRadius:'var(--r-md)',border:'none',background:'#E24B4A',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>
                    🧾 Cuenta
                  </button>
                )}
                {(comanda.estado==='lista'||comanda.estado==='standby'||comanda.estado==='cuenta_pedida') && items.length>0 && (
                  <button onClick={cuentaWA}
                    style={{padding:'8px 10px',borderRadius:'var(--r-md)',border:'1.5px solid #25D366',background:'#25D36618',color:'#25D366',cursor:'pointer',fontSize:14,lineHeight:1,flexShrink:0}}
                    title="Enviar cuenta por WhatsApp">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  </button>
                )}
                {comanda.estado==='cobrada' && items.length>0 && (
                  <button onClick={()=>imprimir(generarTicket({comanda,items,total,canal,descuento:0}))}
                    style={{padding:'8px 12px',borderRadius:'var(--r-md)',border:'1.5px solid #1D9E75',background:'transparent',color:'#1D9E75',cursor:'pointer',fontSize:12,fontWeight:600}}>
                    🖨 Ticket
                  </button>
                )}
                {/* Cancelar comanda — siempre visible excepto si ya está cobrada */}
                {comanda.estado!=='cobrada' && (
                  <button onClick={cancelarComanda} disabled={saving}
                    style={{padding:'8px 12px',borderRadius:'var(--r-md)',border:'1.5px solid #E24B4A',background:'transparent',color:'#E24B4A',cursor:'pointer',fontSize:12,fontWeight:600}}>
                    ✕ Cancelar
                  </button>
                )}
              </div>
            )}

            {/* BOTONES WHATSAPP POR ESTADO */}
            {!esViewer && comanda.cliente && (() => {
              const tel = comanda.cliente.replace(/[^0-9]/g,'')
              const WA_NUM = tel.startsWith('52') ? tel : '52'+tel
              const resumen = items.map(i=>i.qty+'x '+i.plato.nombre).join(', ')
              const msgs = {
                abierta: {
                  icon:'✅', label:'Notificar — Pedido aceptado',
                  color:'#25D366',
                  txt:`✅ *Hola ${comanda.cliente.split(' ')[0]}!* Tu pedido en Chilakileando fue recibido y está en preparación.%0A%0A🍽 ${encodeURIComponent(resumen)}%0A%0A⏱ Tiempo estimado: ${comanda.timer_minutos} min. ¡Gracias por tu pedido!`
                },
                en_cocina: {
                  icon:'🍳', label:'Notificar — En preparación',
                  color:'#EF9F27',
                  txt:`🍳 *Hola ${comanda.cliente.split(' ')[0]}!* Tu pedido ya está en la cocina.%0A%0A🍽 ${encodeURIComponent(resumen)}%0A%0A⏱ Estará listo en aprox. ${comanda.timer_minutos} min.`
                },
                lista: {
                  icon:'🎉', label:'Notificar — Pedido listo',
                  color:'#1D9E75',
                  txt:`🎉 *¡Tu pedido está listo, ${comanda.cliente.split(' ')[0]}!* Ya puedes recogerlo.%0A%0A🍽 ${encodeURIComponent(resumen)}%0A%0AGracias por visitarnos 💛`
                },
                cobrada: {
                  icon:'💛', label:'Enviar encuesta',
                  color:'#E24B4A',
                  txt:`💛 *¡Gracias ${comanda.cliente.split(' ')[0]}!* Fue un placer atenderte hoy.%0A%0A¿Cómo estuvo tu experiencia? Tu opinión nos ayuda a mejorar 🙏%0A%0A📝 Llena nuestra encuesta y gana un premio:%0Ahttps://chilakileando.netlify.app/encuesta`
                }
              }
              const m = msgs[comanda.estado]
              if (!m || !tel) return null
              return (
                <a href={`https://api.whatsapp.com/send?phone=${WA_NUM}&text=${m.txt}`} target="_blank" rel="noreferrer"
                  style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,width:'100%',padding:'7px 0',borderRadius:'var(--r-md)',border:`1.5px solid ${m.color}`,background:m.color+'18',color:m.color,cursor:'pointer',fontSize:11,fontWeight:600,textDecoration:'none',marginBottom:8}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill={m.color}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  {m.icon} {m.label}
                </a>
              )
            })()}

            {/* SELECTOR DE PERSONA — solo en mesa. Siempre incluye "🥡 Llevar" al final */}
            {comanda.tipo === 'mesa' && (
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8,paddingBottom:8,borderBottom:'0.5px solid var(--border)'}}>
                {(() => {
                  const personasUsadas = [...new Set(items.map(i=>i.persona||1))].filter(p=>p!=='llevar')
                  const maxPersona = Math.max(typeof personaActiva==='number'?personaActiva:1, ...personasUsadas, 1)
                  const personas = Array.from({length: maxPersona}, (_,i) => i+1)
                  return <>
                    {personas.map(p => (
                      <button key={p} onClick={()=>setPersonaActiva(p)}
                        style={{padding:'4px 10px',borderRadius:'var(--r-sm)',fontSize:11,fontWeight:600,cursor:'pointer',
                          border:`1.5px solid ${personaActiva===p?'var(--accent)':'var(--border-md)'}`,
                          background:personaActiva===p?'var(--accent)':'transparent',
                          color:personaActiva===p?'#fff':'var(--text2)'}}>
                        👤 P{p}
                      </button>
                    ))}
                    <button onClick={()=>setPersonaActiva(maxPersona+1)}
                      style={{padding:'4px 10px',borderRadius:'var(--r-sm)',fontSize:11,cursor:'pointer',
                        border:'1px dashed var(--border-md)',background:'transparent',color:'var(--text3)'}}>
                      + Agregar persona
                    </button>
                    <button onClick={()=>setPersonaActiva('llevar')}
                      style={{padding:'4px 10px',borderRadius:'var(--r-sm)',fontSize:11,fontWeight:600,cursor:'pointer',
                        border:`1.5px solid ${personaActiva==='llevar'?'#EF9F27':'#EF9F2766'}`,
                        background:personaActiva==='llevar'?'#EF9F27':'#EF9F2711',
                        color:personaActiva==='llevar'?'#fff':'#EF9F27'}}>
                      🥡 Llevar
                    </button>
                  </>
                })()}
              </div>
            )}

            {/* ITEMS — agrupados por persona si es mesa */}
            <div style={{flex:1,overflowY:'auto',maxHeight:280,marginBottom:10}}>
              {items.length===0
                ? <div style={{color:'var(--text3)',fontSize:11,textAlign:'center',padding:'16px 0'}}>Toca un producto para agregar</div>
                : (() => {
                    const renderItem = (item) => (
                      <div key={item.id} style={{padding:'7px 0',borderBottom:'0.5px solid var(--border)'}}>
                        <div style={{display:'flex',alignItems:'flex-start',gap:6}}>
                          <div style={{fontSize:22,fontWeight:800,color:'#E24B4A',lineHeight:1,minWidth:24,paddingTop:1,flexShrink:0}}>{item.qty}</div>
                          <div style={{flex:1}}>
                            <div style={{fontSize:13,fontWeight:700}}>{item.plato.nombre}</div>
                            {/* Chips color-coded — inline sin importar el componente de KDS */}
                            {(() => {
                              const cfg = item._config
                              const hasCfg = cfg && (cfg.guiso1?.length||cfg.guisoX?.length||cfg.salsas?.length||cfg.tops?.length||cfg.extras?.length||cfg.notas||cfg.sabor||cfg.leche||cfg.mediaOrden||cfg.cafeOlla||cfg.natural!==undefined)
                              const chipStyle = (bg, color, bold, italic) => ({
                                display:'inline-block', fontSize:10, padding:'2px 7px', borderRadius:99,
                                background:bg, color, fontWeight:bold?700:500,
                                fontStyle:italic?'italic':'normal',
                                border:`0.5px solid ${color}44`, marginRight:3, marginTop:3,
                              })
                              if (hasCfg) return (
                                <div style={{marginTop:3}}>
                                  {cfg.natural!==undefined && (
                                    <span style={chipStyle(cfg.natural?'#EAF3DE':'#EBF2FC', cfg.natural?'#3B6D11':'#185FA5', true)}>
                                      {cfg.natural ? '🌾 Natural sin totopos' : '🫓 Crocante con totopos'}
                                    </span>
                                  )}
                                  {cfg.mediaOrden && <span style={chipStyle('#EBF2FC','#185FA5')}>½ orden</span>}
                                  {cfg.cafeOlla   && <span style={chipStyle('#EAF3DE','#3B6D11')}>☕ Café</span>}
                                  {cfg.guiso1?.map(g=><span key={g} style={chipStyle('#FFF0EB','#C24A1A')}>{g}</span>)}
                                  {cfg.guisoX?.map(g=><span key={g} style={chipStyle('#FFF0EB','#C24A1A',true)}>{g} ✦</span>)}
                                  {cfg.salsas?.map(s=><span key={s} style={chipStyle('#FCEBEB','#A32D2D')}>{s}</span>)}
                                  {cfg.tops?.map(t=><span key={t} style={chipStyle('#EAF3DE','#3B6D11')}>{t}</span>)}
                                  {cfg.sabor && <span style={chipStyle('#EBF2FC','#185FA5')}>{cfg.sabor}</span>}
                                  {cfg.leche && <span style={chipStyle('#EBF2FC','#185FA5')}>{cfg.leche}</span>}
                                  {cfg.extras?.map(e=><span key={e.nombre} style={chipStyle('#EEEDFE','#534AB7',true)}>+{e.nombre} ${e.monto}</span>)}
                                  {cfg.notas && <span style={chipStyle('#FFF9E6','#8A5A00',false,true)}>📝 {cfg.notas}</span>}
                                </div>
                              )
                              if (item.desc) return (
                                <div style={{marginTop:3}}>
                                  {item.desc.split(' | ').filter(Boolean).map((p,i)=>
                                    <span key={i} style={chipStyle('var(--bg)','var(--text2)')}>{p}</span>
                                  )}
                                </div>
                              )
                              return null
                            })()}
                          </div>
                          <div style={{textAlign:'right'}}>
                            <div style={{fontSize:12,fontWeight:600}}>{fmtM(item.subtotal)}</div>
                            <div style={{fontSize:10,color:'var(--text3)'}}>{item.qty}x {fmtM(item.precioUnit)}</div>
                          </div>
                          {!esViewer && comanda.estado !== 'cobrada' && (
                            <span style={{display:'flex',gap:3,flexShrink:0}} onClick={e=>e.stopPropagation()}>
                              {item._config && (
                                <button
                                  onClick={(e)=>{ e.stopPropagation(); e.preventDefault(); try { editItem(item) } catch(err) { setMsg({ok:false,text:'Error editar: '+err.message}) } }}
                                  title="Editar item"
                                  style={{fontSize:11,color:'#378ADD',background:'#378ADD18',border:'1px solid #378ADD44',
                                    cursor:'pointer',padding:'3px 6px',borderRadius:'var(--r-sm)',minWidth:26,touchAction:'manipulation'}}>
                                  ✏️
                                </button>
                              )}
                              <button
                                onClick={(e)=>{ e.stopPropagation(); e.preventDefault(); removeItem(item.id).catch(err=>setMsg({ok:false,text:'Error borrar: '+err.message})) }}
                                style={{fontSize:13,fontWeight:700,color:'#fff',background:'#E24B4A',border:'none',
                                  cursor:'pointer',padding:'3px 8px',borderRadius:'var(--r-sm)',minWidth:26,touchAction:'manipulation'}}>
                                ✕
                              </button>
                            </span>
                          )}
                        </div>
                      </div>
                    )
                    if (comanda.tipo !== 'mesa') return items.map(renderItem)
                    const grupos = {}
                    items.forEach(i => { const p = i.persona||1; if(!grupos[p]) grupos[p]=[]; grupos[p].push(i) })
                    // Orden numerico para P1,P2,... y "llevar" siempre al final
                    const ordenGrupos = Object.keys(grupos).sort((a,b) => {
                      if (a==='llevar') return 1
                      if (b==='llevar') return -1
                      return a-b
                    })
                    return ordenGrupos.map(p => {
                      const esLlevar = p==='llevar'
                      const subtotalP = grupos[p].reduce((s,i)=>s+i.subtotal,0)
                      return (
                        <div key={p} style={{marginBottom:8}}>
                          <div style={{display:'flex',justifyContent:'space-between',padding:'4px 6px',background:esLlevar?'#EF9F2715':'var(--bg)',borderRadius:'var(--r-sm)',marginBottom:4}}>
                            <span style={{fontSize:11,fontWeight:700,color:esLlevar?'#EF9F27':'var(--accent)'}}>{esLlevar?'🥡 Llevar':`👤 P${p}`}</span>
                            <span style={{fontSize:11,fontWeight:600}}>{fmtM(subtotalP)}</span>
                          </div>
                          {grupos[p].map(renderItem)}
                        </div>
                      )
                    })
                  })()
              }
            </div>

            {/* TOTAL Y COBRAR */}
            <div style={{borderTop:'0.5px solid var(--border)',paddingTop:10}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:16,fontWeight:700,marginBottom:10}}>
                <span>Total</span><span style={{color:'#1D9E75'}}>{fmtM(total)}</span>
              </div>
              {esViewer
                ? <div style={{width:'100%',padding:10,borderRadius:'var(--r-sm)',background:'var(--border)',color:'var(--text3)',fontSize:12,textAlign:'center'}}>Solo consulta</div>
                : <button disabled={saving||items.length===0||comanda.estado==='en_cocina'||comanda.estado==='en_preparacion'}
                    style={{width:'100%',padding:10,borderRadius:'var(--r-sm)',border:'none',
                      background:items.length>0&&comanda.estado!=='en_cocina'&&comanda.estado!=='en_preparacion'?'#1D9E75':'var(--border-md)',
                      color:items.length>0&&comanda.estado!=='en_cocina'&&comanda.estado!=='en_preparacion'?'#fff':'var(--text3)',
                      cursor:items.length>0&&comanda.estado!=='en_cocina'&&comanda.estado!=='en_preparacion'?'pointer':'default',fontSize:13,fontWeight:600}}
                    onClick={()=>items.length>0&&comanda.estado!=='en_cocina'&&comanda.estado!=='en_preparacion'&&setCobroModal(true)}>
                    {saving?'Registrando...':(comanda.estado==='en_cocina'||comanda.estado==='en_preparacion')?'En preparación...':comanda.estado==='cuenta_pedida'?'Registrar pago':'Cobrar'}
                  </button>
              }
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
