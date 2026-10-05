import React, { useState, useEffect, useCallback } from 'react'
import { sb } from '../lib/supabase.js'
import ExportBtn from '../components/ExportBtn.jsx'

const fmtM  = v => '$' + Math.round(v||0).toLocaleString('es-MX')
const today = () => new Date().toISOString().slice(0,10)
const fmtD  = d => new Date(d+'T12:00:00').toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
const difColor = d => Math.abs(d)<1?'var(--text2)':d>0?'#1D9E75':'#E24B4A'
const difLabel = d => Math.abs(d)<1?'✓ Cuadrado':d>0?`+${fmtM(d)} sobrante`:`${fmtM(d)} faltante`

// comRate = tasa de comisión de la plataforma (lo que se queda antes de transferirte)
const PLAT_FIELDS = [
  { id:'plat_uber',     label:'Uber Eats',       canal:'Uber',             comRate:0.46 },
  { id:'plat_uber_chi', label:'Uber Chilakiles',  canal:'Uber Chilakiles',  comRate:0.46 },
  { id:'plat_didi',     label:'DiDi Food',        canal:'DiDi',             comRate:0.30 },
  { id:'plat_didi_chi', label:'DiDi Chilakiles',  canal:'DiDi Chilakiles',  comRate:0.30 },
  { id:'plat_rappi',    label:'Rappi',            canal:'Rappi',            comRate:0.30 },
  { id:'plat_ola',      label:'Ola',              canal:'Ola',              comRate:0.30 },
]

const EMPTY_FORM = {
  fecha: today(),
  efvo_billetes:'', efvo_monedas:'',
  tc_reportado:'',
  plat_uber:'', plat_uber_chi:'', plat_didi:'', plat_didi_chi:'', plat_rappi:'', plat_ola:'',
  ajuste_efvo:'', ajuste_efvo_nota:'',
  ajuste_tc:'', ajuste_tc_nota:'',
  notas:'', cerrado_por:''
}

export default function CierreDia({ role }) {
  const [fecha,      setFecha]      = useState(today())
  const [form,       setForm]       = useState(EMPTY_FORM)
  const [sys,        setSys]        = useState(null)
  const [cierre,     setCierre]     = useState(null)
  const [historial,  setHistorial]  = useState([])
  const [loading,    setLoading]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [msg,        setMsg]        = useState(null)
  const [tab,        setTab]        = useState('cierre')
  const [traspasos,  setTraspasos]  = useState([])
  const [fTraspaso,  setFTraspaso]  = useState({origen:'Efectivo',destino:'Tarjeta',monto:'',concepto:''})
  const [savingTr,   setSavingTr]   = useState(false)
  const [modalDifs,     setModalDifs]     = useState(null)   // [{caja,dif,tipo,monto}]
  const [decisiones,    setDecisiones]    = useState({})
  const [notas,         setNotas]         = useState({})
  const [kpiMes,        setKpiMes]        = useState(null)
  const [limpiando,     setLimpiando]     = useState(false)
  const [transferiendoPlat, setTransfiriendoPlat] = useState(false)
  const [recalculando,  setRecalculando]  = useState(false)
  const [platVentasAcum, setPlatVentasAcum] = useState(null)  // {mesCte, mesesAnt, total}
  const esViewer = role === 'viewer'

  const loadTraspasos = useCallback(async (f) => {
    const { data } = await sb.from('traspasos_caja').select('*').eq('fecha', f).order('created_at',{ascending:false})
    setTraspasos(data||[])
  }, [])

  useEffect(() => { loadTraspasos(fecha) }, [fecha])

  // ── VENTAS ACUMULADAS DE PLATAFORMAS ─────────────────────────────────────
  // Solo cargamos el saldo al cierre del mes anterior (inicio del mes corriente).
  // El total y mes-actual se calculan en render desde sys.acumNetoEst (valor vivo),
  // así no se desincroniza cuando la fecha seleccionada cambia o hay transferencias.
  const loadPlatVentasAcum = useCallback(async () => {
    const mesCte    = today().slice(0, 7)   // 'YYYY-MM'
    const finMesAnt = mesCte + '-01'
    const sufijos   = ['uber','uber_chi','didi','didi_chi','rappi','ola']
    const { data: antRows } = await sb.from('cierres_dia')
      .select('saldo_fin_uber,saldo_fin_uber_chi,saldo_fin_didi,saldo_fin_didi_chi,saldo_fin_rappi,saldo_fin_ola')
      .lt('fecha', finMesAnt).order('fecha', { ascending: false }).limit(1)
    const mesAnt = sufijos.reduce((s, sf) => s + (parseFloat(antRows?.[0]?.[`saldo_fin_${sf}`])||0), 0)
    setPlatVentasAcum({ mesesAnt: Math.round(mesAnt), labelMes: mesCte })
  }, [])

  useEffect(() => { loadPlatVentasAcum() }, [])

  const loadSys = useCallback(async (f) => {
    setLoading(true)
    const [{ data: ventas }, { data: gastos }, { data: cierreExistente }, { data: cierreAnterior }, { data: traspasos }] = await Promise.all([
      sb.from('ventas').select('metodo_pago,canal,importe,unidades').eq('fecha', f),
      sb.from('gastos').select('monto,metodo_pago,categoria_gasto,concepto').eq('fecha', f),
      sb.from('cierres_dia').select('*').eq('fecha', f).maybeSingle(),
      sb.from('cierres_dia').select('efvo_real,tc_real,saldo_final_efvo,saldo_final_tc,saldo_fin_uber,saldo_fin_uber_chi,saldo_fin_didi,saldo_fin_didi_chi,saldo_fin_rappi,saldo_fin_ola').lt('fecha', f).order('fecha',{ascending:false}).limit(1),
      sb.from('traspasos_caja').select('origen,destino,monto').eq('fecha', f),
    ])

    const ventasEfvo  = (ventas||[]).filter(v=>v.metodo_pago==='Efectivo').reduce((s,v)=>s+(v.importe||0),0)
    const ventasTc    = (ventas||[]).filter(v=>v.metodo_pago==='Tarjeta'||v.metodo_pago==='Transferencia').reduce((s,v)=>s+(v.importe||0),0)
    const ventasPlat  = (ventas||[]).filter(v=>v.metodo_pago==='Plataforma').reduce((s,v)=>s+(v.importe||0),0)
    const totalVentas = ventasEfvo + ventasTc + ventasPlat
    const totalUds    = (ventas||[]).reduce((s,v)=>s+(v.unidades||0),0)

    // Gastos reales por canal.
    // GASTO DE VENTAS sin metodo_pago = comisión informativa (ya descontada en liquidación plat.) → excluir.
    // GASTO DE VENTAS con metodo_pago explícito (Tarjeta/Débito/Transferencia/Efectivo) = cargo real → incluir.
    // Descuentos de comanda (concepto 'Descuento comanda ...') siempre son reales — incluir en cualquier método.
    const esGastoVentasConPago = g => {
      if ((g.concepto||'').toLowerCase().startsWith('descuento comanda')) return true
      const mp = (g.metodo_pago||'').toLowerCase()
      return mp.includes('tarjeta') || mp.includes('debito') || mp.includes('débito') || mp.includes('transfer') || mp.includes('spei')
    }
    const gastosReales = (gastos||[]).filter(g=>{
      const c=(g.categoria_gasto||'').toUpperCase()
      if (c==='AJUSTE CAJA') return false
      if (c==='GASTO DE VENTAS') return esGastoVentasConPago(g)
      return true
    })
    const gastosEfvo = gastosReales.filter(g=>!g.metodo_pago||g.metodo_pago==='Efectivo'||g.metodo_pago===null).reduce((s,g)=>s+(g.monto||0),0)
    const gastosTc   = gastosReales.filter(g=>{ const mp=(g.metodo_pago||'').toLowerCase(); return mp.includes('tarjeta')||mp.includes('debito')||mp.includes('débito')||mp.includes('transferencia') }).reduce((s,g)=>s+(g.monto||0),0)
    const gastosTransf = gastosReales.filter(g=>g.metodo_pago&&(g.metodo_pago.toLowerCase().includes('transfer')||g.metodo_pago.toLowerCase().includes('spei'))).reduce((s,g)=>s+(g.monto||0),0)
    const totalGastos= gastosReales.reduce((s,g)=>s+(g.monto||0),0)

    // Comisiones de ventas (informativas, no afectan cashflow físico)
    const esComision = g => (g.categoria_gasto||'').toUpperCase() === 'GASTO DE VENTAS'
    const esComisionTC  = g => { const c=(g.concepto||'').toLowerCase(); return c.startsWith('comision tc')||c.includes('mixto') }
    const esPrestamoClip= g => { const c=(g.concepto||'').toLowerCase(); return c.includes('clip')||c.includes('tarjeta') }
    const comisionTC    = (gastos||[]).filter(g=>esComision(g)&&esComisionTC(g)).reduce((s,g)=>s+(g.monto||0),0)
    const prestamoClip  = (gastos||[]).filter(g=>esComision(g)&&!esComisionTC(g)&&esPrestamoClip(g)).reduce((s,g)=>s+(g.monto||0),0)
    const comisionesTc  = comisionTC + prestamoClip
    const comisionesPlat= (gastos||[]).filter(g=>esComision(g)&&!esComisionTC(g)&&!esPrestamoClip(g)).reduce((s,g)=>s+(g.monto||0),0)
    const totalComisiones = comisionesTc + comisionesPlat

    const prev = cierreAnterior && cierreAnterior[0]
    const saldoInicialEfvo = prev?.saldo_final_efvo ?? prev?.efvo_real ?? 0
    const saldoInicialTc   = prev?.saldo_final_tc   ?? prev?.tc_real   ?? 0

    const byCanal = {}
    ;(ventas||[]).forEach(v => { byCanal[v.canal] = (byCanal[v.canal]||0) + (v.importe||0) })

    // Saldo ANTERIOR por plataforma (acumulado del cierre del dia previo)
    const saldoAnteriorPlat = {
      'Uber':            prev?.saldo_fin_uber     || 0,
      'Uber Chilakiles': prev?.saldo_fin_uber_chi || 0,
      'DiDi':            prev?.saldo_fin_didi     || 0,
      'DiDi Chilakiles': prev?.saldo_fin_didi_chi || 0,
      'Rappi':           prev?.saldo_fin_rappi    || 0,
      'Ola':             prev?.saldo_fin_ola      || 0,
    }

    // Traspasos del dia — salidas por cuenta/plataforma, entradas por cuenta
    const traspasosOut = {}
    const traspasosIn  = {}
    ;(traspasos||[]).forEach(t => {
      if (t.origen)  traspasosOut[t.origen]  = (traspasosOut[t.origen] ||0) + (t.monto||0)
      if (t.destino) traspasosIn[t.destino]  = (traspasosIn[t.destino] ||0) + (t.monto||0)
    })
    // Neto de traspasos para Efectivo y Tarjeta (debe ir ANTES de teorEfvo/teorTc)
    const traspNEfvo = (traspasosIn['Efectivo']||0) - (traspasosOut['Efectivo']||0)
    const traspNTc   = (traspasosIn['Tarjeta'] ||0) - (traspasosOut['Tarjeta'] ||0)

    const teorEfvo = saldoInicialEfvo + ventasEfvo - gastosEfvo + traspNEfvo
    const teorTc   = saldoInicialTc   + ventasTc   - gastosTc - gastosTransf + traspNTc

    // Saldo BRUTO acumulado = saldo anterior + ventas del dia - traspasos del dia
    const saldoAcumPlat = {
      'Uber':            (saldoAnteriorPlat['Uber'])            + (byCanal['Uber']||0)            - (traspasosOut['Uber Eats']||0)        - (traspasosOut['Uber']||0),
      'Uber Chilakiles': (saldoAnteriorPlat['Uber Chilakiles']) + (byCanal['Uber Chilakiles']||0) - (traspasosOut['Uber Chilakiles']||0),
      'DiDi':            (saldoAnteriorPlat['DiDi'])            + (byCanal['DiDi']||0)            - (traspasosOut['DiDi Food']||0)        - (traspasosOut['DiDi']||0),
      'DiDi Chilakiles': (saldoAnteriorPlat['DiDi Chilakiles']) + (byCanal['DiDi Chilakiles']||0) - (traspasosOut['DiDi Chilakiles']||0),
      'Rappi':           (saldoAnteriorPlat['Rappi'])           + (byCanal['Rappi']||0)           - (traspasosOut['Rappi']||0),
      'Ola':             (saldoAnteriorPlat['Ola'])             + (byCanal['Ola']||0)             - (traspasosOut['Ola']||0),
    }

    // Neto estimado de HOY por plataforma = bruto * (1 − comRate)
    const netoEstHoy = {}
    PLAT_FIELDS.forEach(p => {
      netoEstHoy[p.canal] = (byCanal[p.canal] || 0) * (1 - p.comRate)
    })

    // Pagos de préstamo registrados hoy en gastos (categoría PAGO PRESTAMOS)
    // Se emparejan por keyword del canal en el concepto del gasto
    // Palabras clave para emparejar gastos PAGO PRESTAMOS por plataforma.
    // Uber Eats NO tiene préstamo; el préstamo de Uber aplica solo a Uber Chilakiles.
    const platKeywords = {
      'Uber':            [],                    // sin préstamo (Uber Eats)
      'Uber Chilakiles': ['uber'],              // cualquier gasto "uber" en préstamos
      'DiDi':            ['didi'],
      'DiDi Chilakiles': ['didi chilakiles', 'didi chila'],
      'Rappi':           ['rappi'],
      'Ola':             ['ola'],
    }
    const gastosPrestamoPlat = (gastos||[]).filter(g => g.categoria_gasto === 'PAGO PRESTAMOS')
    const prestamosPlatHoy = {}
    PLAT_FIELDS.forEach(p => {
      const keywords = platKeywords[p.canal] || []
      prestamosPlatHoy[p.canal] = gastosPrestamoPlat
        .filter(g => keywords.some(k => (g.concepto||'').toLowerCase().includes(k)))
        .reduce((s,g) => s + (g.monto||0), 0)
    })

    // Acumulado neto estimado = anterior(neto) + netoEstHoy − traspasos − préstamo hoy
    // saldoAcumPlat = ant + bruto − traspasos → acumNetoEst = saldoAcumPlat − bruto*comRate − préstamo
    const acumNetoEst = {}
    PLAT_FIELDS.forEach(p => {
      acumNetoEst[p.canal] = (saldoAcumPlat[p.canal]||0)
        - (byCanal[p.canal]||0) * p.comRate
        - (prestamosPlatHoy[p.canal]||0)
    })

    // teorPlat = neto estimado de HOY (solo comisión, sin préstamo).
    // difPlat = platReal − teorPlat mide exactamente si la comisión real difirió del estimado.
    // El préstamo NO entra aquí: ya está registrado en gastos y se descuenta del acumulado (acumNetoEst/saldo_fin).
    const teorPlat = PLAT_FIELDS.reduce((s,p) => s + netoEstHoy[p.canal], 0)

    setSys({ ventasEfvo, ventasTc, ventasPlat, totalVentas, totalUds,
      gastosEfvo, gastosTc, gastosTransf, totalGastos, gastosDetalle: gastosReales,
      comisionTC, prestamoClip, comisionesTc, comisionesPlat, totalComisiones,
      saldoInicialEfvo, saldoInicialTc,
      traspNEfvo, traspNTc,
      saldoAcumPlat, saldoAnteriorPlat, netoEstHoy, acumNetoEst, prestamosPlatHoy,
      teorEfvo, teorTc, teorPlat,
      utilidad: totalVentas - totalGastos, byCanal })

    if (cierreExistente) {
      setCierre(cierreExistente)
      setForm({ fecha:f,
        efvo_billetes: cierreExistente.efvo_billetes||'',
        efvo_monedas:  cierreExistente.efvo_monedas||'',
        tc_reportado:  cierreExistente.tc_reportado||'',
        plat_uber: cierreExistente.plat_uber||'', plat_uber_chi: cierreExistente.plat_uber_chi||'',
        plat_didi: cierreExistente.plat_didi||'', plat_didi_chi: cierreExistente.plat_didi_chi||'',
        plat_rappi: cierreExistente.plat_rappi||'', plat_ola: cierreExistente.plat_ola||'',
        ajuste_efvo: cierreExistente.ajuste_efvo||'', ajuste_efvo_nota: cierreExistente.ajuste_efvo_nota||'',
        ajuste_tc: cierreExistente.ajuste_tc||'', ajuste_tc_nota: cierreExistente.ajuste_tc_nota||'',
        notas: cierreExistente.notas||'', cerrado_por: cierreExistente.cerrado_por||'' })
    } else {
      setCierre(null)
      setForm({...EMPTY_FORM, fecha:f,
        efvo_billetes: String(Math.round(teorEfvo)),
        tc_reportado:  String(Math.round(teorTc - comisionesTc)),
      })
    }
    setLoading(false)
  }, [])

  const loadHistorial = useCallback(async () => {
    const { data } = await sb.from('cierres_dia').select('*').order('fecha',{ascending:false}).limit(30)
    setHistorial(data||[])
  }, [])

  useEffect(() => { loadSys(fecha); loadHistorial() }, [fecha])

  const mesActual = new Date().toISOString().slice(0,7)
  const loadKpiMes = useCallback(async () => {
    // Fuente de verdad: cierres_dia (1 registro por día, sin duplicados)
    // dif_efvo/dif_tc/dif_plat = real − teórico → negativo = faltante, positivo = sobrante
    // Calculamos fin de mes con aritmética de string para evitar bugs de timezone UTC vs local
    const [yr, mo] = mesActual.split('-').map(Number)
    const finMes = `${mesActual}-${String(new Date(yr, mo, 0).getDate()).padStart(2,'0')}`
    const [{ data: cierresMes }, { data: ventasMes }] = await Promise.all([
      sb.from('cierres_dia').select('dif_efvo,dif_tc,dif_plat')
        .gte('fecha', mesActual+'-01').lte('fecha', finMes),
      sb.from('ventas').select('importe,unidades')
        .gte('fecha', mesActual+'-01').lte('fecha', finMes),
    ])
    // netAdj: suma de faltantes (negativo → positivo) menos sobrantes, solo días con dif >= $1
    const netAdj = field => -(cierresMes||[])
      .filter(c => Math.abs(parseFloat(c[field])||0) >= 1)
      .reduce((s,c) => s + (parseFloat(c[field])||0), 0)
    const gratis   = (ventasMes||[]).filter(v=>(parseFloat(v.importe)||0)===0)
    const pagas    = (ventasMes||[]).filter(v=>(parseFloat(v.importe)||0)>0)
    const gUds     = gratis.reduce((s,v)=>s+(v.unidades||0),0)
    const udsPagas = pagas.reduce((s,v)=>s+(v.unidades||0),0)
    const impPagas = pagas.reduce((s,v)=>s+(parseFloat(v.importe)||0),0)
    const avgPrecio = udsPagas > 0 ? impPagas / udsPagas : 0
    setKpiMes({
      ajEfvo: netAdj('dif_efvo'),
      ajTc:   netAdj('dif_tc'),
      ajPlat: netAdj('dif_plat'),
      gUds,
      gMonto: Math.round(gUds * avgPrecio),
      gCnt:   gratis.length,
      totUds: (ventasMes||[]).reduce((s,v)=>s+(v.unidades||0),0),
    })
  }, [mesActual])
  useEffect(()=>{ loadKpiMes() },[])

  // Limpieza de faltantes_caja — deduplica y elimina registros que no coinciden con cierres_dia
  const limpiarDuplicados = async () => {
    setLimpiando(true)
    try {
      // 1. Cierres como fuente de verdad
      const { data: cierres, error: eC } = await sb.from('cierres_dia')
        .select('fecha,dif_efvo,dif_tc,dif_plat').gte('fecha','2026-04-01')
      if (eC) throw new Error('cierres_dia: '+eC.message)
      const difMap = {}
      for (const c of (cierres||[])) difMap[c.fecha] = {
        Efectivo:   parseFloat(c.dif_efvo)||0,
        Tarjeta:    parseFloat(c.dif_tc)||0,
        Plataforma: parseFloat(c.dif_plat)||0,
      }

      // 2. Leer todos los faltantes
      const { data: falts, error: eF } = await sb.from('faltantes_caja')
        .select('id,fecha,caja,monto,tipo').gte('fecha','2026-04-01').order('id',{ascending:false})
      if (eF) throw new Error('faltantes_caja: '+eF.message)

      // 3. Calcular IDs a eliminar (duplicados + inválidos)
      const seen = new Set()
      const toDelete = []
      for (const r of (falts||[])) {
        const k = `${r.fecha}|${r.caja}`
        if (seen.has(k)) { toDelete.push(r.id); continue } // duplicado
        seen.add(k)
        const difs = difMap[r.fecha]
        if (!difs) { toDelete.push(r.id); continue } // sin cierre = inválido
        const difReal  = difs[r.caja] ?? 0
        const montoReal = Math.abs(difReal)
        const tipoReal  = difReal < 0 ? 'faltante' : 'sobrante'
        const valido    = montoReal >= 1 &&
                          Math.abs((parseFloat(r.monto)||0) - montoReal) <= 5 &&
                          r.tipo === tipoReal
        if (!valido) toDelete.push(r.id)
      }

      if (toDelete.length === 0) {
        setMsg({ ok:true, text:'✓ Sin duplicados ni registros inválidos. Todo está limpio.' })
        setLimpiando(false); setTimeout(()=>setMsg(null),6000); return
      }

      // 4. Borrar en lote — capturar error real de Supabase
      const { data: borrados, error: eD } = await sb.from('faltantes_caja')
        .delete().in('id', toDelete).select('id')
      if (eD) throw new Error('DELETE faltantes: '+eD.message+' ('+eD.code+')')
      const realBorrados = borrados?.length ?? 0
      if (realBorrados < toDelete.length)
        throw new Error(`Solo se borraron ${realBorrados}/${toDelete.length} faltantes. Revisa políticas DELETE en Supabase para la tabla faltantes_caja.`)

      // 5. Limpiar gastos Ajuste caja duplicados
      const { data: gsts } = await sb.from('gastos')
        .select('id,fecha,metodo_pago').eq('categoria_gasto','Ajuste caja')
        .gte('fecha','2026-04-01').order('id',{ascending:false})
      const seen2 = new Set(); const delG = []
      for (const r of (gsts||[])) {
        const k = `${r.fecha}|${r.metodo_pago}`
        if (seen2.has(k)) delG.push(r.id); else seen2.add(k)
      }
      if (delG.length > 0) await sb.from('gastos').delete().in('id', delG)

      loadKpiMes(); loadSys(fecha); loadHistorial()
      setMsg({ ok:true, text:`✓ Limpieza completa: ${realBorrados} faltantes + ${delG.length} gastos eliminados` })
    } catch(e) { setMsg({ ok:false, text:'⚠ '+e.message }) }
    setLimpiando(false)
    setTimeout(()=>setMsg(null),10000)
  }

  // ── RECALCULAR CADENA DE CIERRES ──────────────────────────────────────────
  // Cuando se edita un cierre de fecha pasada, propaga los saldos hacia adelante:
  //   saldo_inicial_efvo/tc de cada día siguiente = saldo_final del día anterior
  //   Idem para saldo_ini_* y saldo_fin_* de plataformas.
  //   Recomputa teor_*, dif_* para cada cierre posterior.
  const recalcularCadena = useCallback(async () => {
    if (!cierre || esViewer) return
    setRecalculando(true)
    try {
      // 1. Obtener todos los cierres POSTERIORES ordenados ascendente
      const { data: siguientes, error: eS } = await sb.from('cierres_dia')
        .select('*').gt('fecha', fecha).order('fecha', { ascending: true })
      if (eS) throw eS
      if (!siguientes || siguientes.length === 0) {
        setMsg({ ok:true, text:'No hay cierres posteriores que recalcular.' })
        setRecalculando(false); setTimeout(()=>setMsg(null),4000); return
      }

      // 2. Leer el cierre base (el que acabamos de guardar)
      const { data: base } = await sb.from('cierres_dia').select('*').eq('fecha', fecha).maybeSingle()
      // Para efectivo: usar saldo_final físico (lo que se contó).
      // Para tarjeta: como nunca se verifica el saldo físico diario,
      //   tc_real siempre fue igual al teórico viejo. Usar teor_tc (ya recalculado con el gasto ajustado)
      //   como el saldo real de carry-forward, para que la cadena refleje el ajuste.
      const baseSfTc = (parseFloat(base?.tc_real ?? base?.teor_tc)||0) + (parseFloat(base?.ajuste_tc)||0)
      let prev = { ...base, saldo_final_tc: baseSfTc }

      // Mapeo canal → sufijo de campo (plat_uber_chi → uber_chi, etc.)
      const canalToSuffix = {
        'Uber':'uber','Uber Chilakiles':'uber_chi',
        'DiDi':'didi','DiDi Chilakiles':'didi_chi',
        'Rappi':'rappi','Ola':'ola',
      }
      // Palabras clave para detectar préstamos por canal en gastos
      const loanKW = {
        'Uber Chilakiles':['uber chi','uber chila','uber_chi'],
        'DiDi':['didi'], 'DiDi Chilakiles':['didi chi','didi chila'],
        'Rappi':['rappi'], 'Ola':['ola'],
        'Uber':[],
      }

      let updatedCount = 0
      for (const sig of siguientes) {
        // a. Saldos iniciales del período: del cierre previo
        const newIniEfvo = parseFloat(prev?.saldo_final_efvo) || parseFloat(prev?.efvo_real) || 0
        const newIniTc   = parseFloat(prev?.saldo_final_tc)   || parseFloat(prev?.tc_real)   || 0
        const platIni = {}
        PLAT_FIELDS.forEach(p => {
          const s = canalToSuffix[p.canal]
          platIni[p.canal] = parseFloat(prev?.[`saldo_fin_${s}`]) || 0
        })

        // b. Releer ventas, gastos y traspasos de ese día
        const [{ data: vD }, { data: gD }, { data: tD }] = await Promise.all([
          sb.from('ventas').select('metodo_pago,canal,importe').eq('fecha', sig.fecha),
          sb.from('gastos').select('monto,metodo_pago,categoria_gasto,concepto').eq('fecha', sig.fecha),
          sb.from('traspasos_caja').select('origen,destino,monto').eq('fecha', sig.fecha),
        ])
        const v = vD||[], g = gD||[], t = tD||[]

        // c. Totales de ventas
        const ventasEfvo = v.filter(x=>x.metodo_pago==='Efectivo').reduce((s,x)=>s+(x.importe||0),0)
        const ventasTc   = v.filter(x=>x.metodo_pago==='Tarjeta'||x.metodo_pago==='Transferencia').reduce((s,x)=>s+(x.importe||0),0)
        const byCanal    = {}
        v.forEach(x=>{ byCanal[x.canal]=(byCanal[x.canal]||0)+(x.importe||0) })

        // d. Gastos físicos (mismo criterio que loadSys)
        const esGVConPago = x => { if ((x.concepto||'').toLowerCase().startsWith('descuento comanda')) return true; const mp=(x.metodo_pago||'').toLowerCase(); return mp.includes('tarjeta')||mp.includes('debito')||mp.includes('débito')||mp.includes('transfer')||mp.includes('spei') }
        const gReales    = g.filter(x=>{const cat=(x.categoria_gasto||'').toUpperCase(); if(cat==='AJUSTE CAJA')return false; if(cat==='GASTO DE VENTAS')return esGVConPago(x); return true})
        const gastosEfvo = gReales.filter(x=>!x.metodo_pago||x.metodo_pago==='Efectivo'||x.metodo_pago===null).reduce((s,x)=>s+(x.monto||0),0)
        const gastosTc   = gReales.filter(x=>x.metodo_pago?.toLowerCase().includes('tarjeta')||x.metodo_pago?.toLowerCase().includes('debito')||x.metodo_pago?.toLowerCase().includes('débito')||x.metodo_pago?.toLowerCase().includes('transferencia')).reduce((s,x)=>s+(x.monto||0),0)
        const gastosTransf=gReales.filter(x=>x.metodo_pago&&(x.metodo_pago.toLowerCase().includes('transfer')||x.metodo_pago.toLowerCase().includes('spei'))).reduce((s,x)=>s+(x.monto||0),0)

        // e. Préstamos de plataforma
        const loans = {}
        const gPrest = g.filter(x=>x.categoria_gasto==='PAGO PRESTAMOS')
        PLAT_FIELDS.forEach(p => {
          const kws = loanKW[p.canal]||[]
          loans[p.canal] = gPrest.filter(x=>kws.some(k=>(x.concepto||'').toLowerCase().includes(k))).reduce((s,x)=>s+(x.monto||0),0)
        })

        // f. Traspasos salida/entrada por canal
        const trOut = {}, trIn = {}
        t.forEach(x=>{
          if(x.origen)  trOut[x.origen]  = (trOut[x.origen] ||0)+(x.monto||0)
          if(x.destino) trIn[x.destino]  = (trIn[x.destino] ||0)+(x.monto||0)
        })
        const trNEfvo = (trIn['Efectivo']||0) - (trOut['Efectivo']||0)
        const trNTc   = (trIn['Tarjeta'] ||0) - (trOut['Tarjeta'] ||0)

        // g. Saldo acumulado bruto de plataformas (ini + ventas − traspasos)
        const saldoAcum = {
          'Uber':            platIni['Uber']            + (byCanal['Uber']||0)            - (trOut['Uber Eats']||0)       - (trOut['Uber']||0),
          'Uber Chilakiles': platIni['Uber Chilakiles'] + (byCanal['Uber Chilakiles']||0) - (trOut['Uber Chilakiles']||0),
          'DiDi':            platIni['DiDi']            + (byCanal['DiDi']||0)            - (trOut['DiDi Food']||0)       - (trOut['DiDi']||0),
          'DiDi Chilakiles': platIni['DiDi Chilakiles'] + (byCanal['DiDi Chilakiles']||0) - (trOut['DiDi Chilakiles']||0),
          'Rappi':           platIni['Rappi']           + (byCanal['Rappi']||0)           - (trOut['Rappi']||0),
          'Ola':             platIni['Ola']             + (byCanal['Ola']||0)             - (trOut['Ola']||0),
        }

        // h. Nuevo saldo_fin_* por plataforma (misma lógica que ejecutarGuardado)
        const platFinUpdates = {}
        PLAT_FIELDS.forEach(p => {
          const s    = canalToSuffix[p.canal]
          const acum = saldoAcum[p.canal]
          const b    = byCanal[p.canal]||0
          const r    = parseFloat(sig[p.id])||0     // neto real depositado (si fue capturado)
          const loan = loans[p.canal]||0
          platFinUpdates[`saldo_fin_${s}`] = r > 0 ? acum - b + r - loan : acum - b*p.comRate - loan
        })

        // i. Teóricos y diferencias recalculados
        const newTeorEfvo = newIniEfvo + ventasEfvo - gastosEfvo + trNEfvo
        const newTeorTc   = newIniTc   + ventasTc   - gastosTc - gastosTransf + trNTc
        const newTeorPlat = PLAT_FIELDS.reduce((s,p)=>s+(byCanal[p.canal]||0)*(1-p.comRate),0)
        const platRealSum = PLAT_FIELDS.reduce((s,p)=>s+(parseFloat(sig[p.id])||0),0)

        // j. Construir objeto de actualización
        const saldoIniPlat = {}
        PLAT_FIELDS.forEach(p => { saldoIniPlat[`saldo_ini_${canalToSuffix[p.canal]}`] = platIni[p.canal] })

        // Para tarjeta: saldo_final_tc recalculado = teórico nuevo + ajuste guardado.
        // Esto asegura que el día siguiente arranque con el valor correcto cuando loadSys
        // lo lea como "cierre anterior". Efectivo NO se toca (es conteo físico).
        const newSaldoFinalTc = Math.round(newTeorTc) + (parseFloat(sig.ajuste_tc)||0)

        const updates = {
          saldo_inicial_efvo: newIniEfvo,
          saldo_inicial_tc:   newIniTc,
          ...saldoIniPlat,
          teor_efvo:      Math.round(newTeorEfvo),
          teor_tc:        Math.round(newTeorTc),
          teor_plat:      Math.round(newTeorPlat),
          saldo_final_tc: newSaldoFinalTc,
          dif_efvo: parseFloat((((parseFloat(sig.efvo_real)||0) - newTeorEfvo)).toFixed(2)),
          dif_tc:   parseFloat((((parseFloat(sig.tc_real)||0)   - newTeorTc)).toFixed(2)),
          dif_plat: parseFloat(((platRealSum - newTeorPlat)).toFixed(2)),
          ...platFinUpdates,
        }

        const { error: eU, count: cU } = await sb.from('cierres_dia')
          .update(updates, { count: 'exact' }).eq('fecha', sig.fecha)
        if (eU) throw eU
        if (cU === 0) throw new Error(`Sin filas actualizadas para fecha ${sig.fecha} — verifica RLS`)

        // k. Propagar como prev para el siguiente día
        // Efectivo: saldo_final = conteo físico (no lo tocamos)
        const sfEfvo = sig.saldo_final_efvo != null ? parseFloat(sig.saldo_final_efvo)
          : (parseFloat(sig.efvo_real)||0) + (parseFloat(sig.ajuste_efvo)||0)
        // Tarjeta: saldo_final = teórico recalculado (ya calculado arriba)
        prev = { ...sig, ...updates, saldo_final_efvo: sfEfvo, saldo_final_tc: newSaldoFinalTc }
        updatedCount++
      }

      setMsg({ ok:true, text:`✓ Cadena actualizada: ${updatedCount} cierre${updatedCount!==1?'s':''} recalculados desde ${fecha}` })
      loadHistorial()
    } catch(e) {
      setMsg({ ok:false, text:'⚠ Error al recalcular: '+(e.message||JSON.stringify(e)) })
    }
    setRecalculando(false)
    setTimeout(()=>setMsg(null), 8000)
  }, [fecha, cierre, esViewer, loadHistorial])

  const n = id => parseFloat(form[id]||0)||0
  const efvoReal = n('efvo_billetes') + n('efvo_monedas')
  const tcReal   = n('tc_reportado')
  const platReal = PLAT_FIELDS.reduce((s,f2)=>s+n(f2.id),0)
  const difEfvo  = sys ? efvoReal - sys.teorEfvo : 0
  const teorTcNeto = sys ? sys.teorTc - sys.comisionesTc : 0
  const difTc    = sys ? tcReal   - teorTcNeto   : 0
  const difPlat  = sys ? platReal - sys.teorPlat  : 0
  const saldoFinalEfvo = efvoReal + n('ajuste_efvo')
  const saldoFinalTc   = tcReal   + n('ajuste_tc')

  // Procesa el guardado real (separado para poder llamarlo desde modal)
  const ejecutarGuardado = async (extras = {}) => {
    if (!sys || loading) return
    setSaving(true)
    try {
      const payload = {
        fecha,
        saldo_inicial_efvo: sys.saldoInicialEfvo, saldo_inicial_tc: sys.saldoInicialTc,
        efvo_billetes: n('efvo_billetes'), efvo_monedas: n('efvo_monedas'),
        efvo_real: efvoReal, tc_real: tcReal, plat_real: platReal,
        tc_reportado: n('tc_reportado'),
        plat_uber: n('plat_uber'), plat_uber_chi: n('plat_uber_chi'),
        plat_didi: n('plat_didi'), plat_didi_chi: n('plat_didi_chi'),
        plat_rappi: n('plat_rappi'), plat_ola: n('plat_ola'),
        sys_efvo: sys.ventasEfvo, sys_tc: sys.ventasTc, sys_plat: sys.ventasPlat,
        sys_total: sys.totalVentas, sys_unidades: sys.totalUds,
        gastos_efvo: sys.gastosEfvo, gastos_tc: sys.gastosTc, gastos_total: sys.totalGastos,
        teor_efvo: sys.teorEfvo, teor_tc: sys.teorTc, teor_plat: sys.teorPlat,
        dif_efvo: difEfvo, dif_tc: difTc, dif_plat: difPlat,
        ajuste_efvo: n('ajuste_efvo'), ajuste_efvo_nota: form.ajuste_efvo_nota||null,
        ajuste_tc: n('ajuste_tc'), ajuste_tc_nota: form.ajuste_tc_nota||null,
        saldo_final_efvo: saldoFinalEfvo, saldo_final_tc: saldoFinalTc,
        // saldo_fin = neto a recibir (no bruto).
        // Si el user capturó el neto real: prev_acum - bruto_hoy + neto_real
        // Si no capturó: prev_acum - bruto_hoy * comRate (descuenta comisión estimada)
        // saldo_fin = acumulado neto plataforma.
        // r = neto de comisión capturado por el user (bruto - comisión, ANTES del préstamo)
        // Si r>0: ant − traspasos + r − préstamo = g − b + r − l
        // Si r=0: ant − traspasos + bruto*(1−com) − préstamo = g − b*com − l
        saldo_fin_uber:     (() => { const g=sys.saldoAcumPlat?.['Uber']||0;            const b=sys.byCanal?.['Uber']||0;            const r=n('plat_uber');     const l=sys.prestamosPlatHoy?.['Uber']||0;            return r>0?g-b+r-l:g-b*0.46-l })(),
        saldo_fin_uber_chi: (() => { const g=sys.saldoAcumPlat?.['Uber Chilakiles']||0; const b=sys.byCanal?.['Uber Chilakiles']||0; const r=n('plat_uber_chi'); const l=sys.prestamosPlatHoy?.['Uber Chilakiles']||0; return r>0?g-b+r-l:g-b*0.46-l })(),
        saldo_fin_didi:     (() => { const g=sys.saldoAcumPlat?.['DiDi']||0;            const b=sys.byCanal?.['DiDi']||0;            const r=n('plat_didi');     const l=sys.prestamosPlatHoy?.['DiDi']||0;            return r>0?g-b+r-l:g-b*0.30-l })(),
        saldo_fin_didi_chi: (() => { const g=sys.saldoAcumPlat?.['DiDi Chilakiles']||0; const b=sys.byCanal?.['DiDi Chilakiles']||0; const r=n('plat_didi_chi'); const l=sys.prestamosPlatHoy?.['DiDi Chilakiles']||0; return r>0?g-b+r-l:g-b*0.30-l })(),
        saldo_fin_rappi:    (() => { const g=sys.saldoAcumPlat?.['Rappi']||0;           const b=sys.byCanal?.['Rappi']||0;           const r=n('plat_rappi');    const l=sys.prestamosPlatHoy?.['Rappi']||0;            return r>0?g-b+r-l:g-b*0.30-l })(),
        saldo_fin_ola:      (() => { const g=sys.saldoAcumPlat?.['Ola']||0;             const b=sys.byCanal?.['Ola']||0;             const r=n('plat_ola');      const l=sys.prestamosPlatHoy?.['Ola']||0;             return r>0?g-b+r-l:g-b*0.30-l })(),
        saldo_ini_uber:     sys.saldoIniPlat?.['Uber']||0,
        saldo_ini_uber_chi: sys.saldoIniPlat?.['Uber Chilakiles']||0,
        saldo_ini_didi:     sys.saldoIniPlat?.['DiDi']||0,
        saldo_ini_didi_chi: sys.saldoIniPlat?.['DiDi Chilakiles']||0,
        saldo_ini_rappi:    sys.saldoIniPlat?.['Rappi']||0,
        saldo_ini_ola:      sys.saldoIniPlat?.['Ola']||0,
        notas: form.notas||null, cerrado_por: form.cerrado_por||null,
      }
      const { error } = cierre
        ? await sb.from('cierres_dia').update(payload).eq('id', cierre.id)
        : await sb.from('cierres_dia').insert(payload)
      if (error) throw error
      
      // Registrar/actualizar faltantes de las 3 cajas — upsert por (fecha, caja) para evitar duplicados
      const cajas = [
        { nombre:'Efectivo',   dif: difEfvo  },
        { nombre:'Tarjeta',    dif: difTc    },
        { nombre:'Plataforma', dif: difPlat  },
      ]
      for (const c of cajas) {
        const { data: existente } = await sb.from('faltantes_caja')
          .select('id,decision').eq('fecha', fecha).eq('caja', c.nombre).maybeSingle()

        if (Math.abs(c.dif) >= 1) {
          const decision = extras.decisiones?.[c.nombre] ?? 'absorber'
          const nota     = extras.notas?.[c.nombre] || null
          const payload  = {
            fecha, tipo: c.dif < 0 ? 'faltante' : 'sobrante',
            monto: Math.abs(c.dif), decision, nota,
            caja: c.nombre, registrado_por: form.cerrado_por || null,
          }
          if (existente) await sb.from('faltantes_caja').update(payload).eq('id', existente.id)
          else            await sb.from('faltantes_caja').insert(payload)

          // Gasto: crear o actualizar si decision='gasto', eliminar si cambia a absorber
          const { data: gastoEx } = await sb.from('gastos').select('id')
            .eq('fecha', fecha).eq('categoria_gasto','Ajuste caja').eq('metodo_pago', c.nombre).maybeSingle()
          if (decision === 'gasto') {
            const concepto = c.dif < 0 ? `Faltante ${c.nombre}${nota?' — '+nota:''}` : `Sobrante ${c.nombre}${nota?' — '+nota:''}`
            const gPay = { fecha, concepto, categoria_gasto:'Ajuste caja',
              monto: c.dif < 0 ? Math.abs(c.dif) : -Math.abs(c.dif), metodo_pago: c.nombre }
            if (gastoEx) await sb.from('gastos').update(gPay).eq('id', gastoEx.id)
            else          await sb.from('gastos').insert(gPay)
          } else if (gastoEx) {
            await sb.from('gastos').delete().eq('id', gastoEx.id)
          }
        } else {
          // Diferencia < 1: limpiar registros previos si existían
          if (existente) await sb.from('faltantes_caja').delete().eq('id', existente.id)
          await sb.from('gastos').delete()
            .eq('fecha', fecha).eq('categoria_gasto','Ajuste caja').eq('metodo_pago', c.nombre)
        }
      }
      loadKpiMes()
      
      setMsg({ ok:true, text:`Cierre guardado ✓ — Saldo final efectivo: ${fmtM(saldoFinalEfvo)} · Tarjeta: ${fmtM(saldoFinalTc)}` })
      loadSys(fecha); loadHistorial()
    } catch(e) { setMsg({ ok:false, text:e.message }) }
    setSaving(false)
    setTimeout(()=>setMsg(null), 5000)
  }
  
  // Transfiere saldo acumulado de todas las plataformas a Efectivo
  const transferirTodoEfvo = async () => {
    if (!sys || esViewer) return
    // Neto acumulado real por plataforma: acumNetoEst ajustado si user capturó neto real hoy
    const acumReales = PLAT_FIELDS.map(p => {
      const est   = sys.acumNetoEst?.[p.canal]||0
      const netoH = sys.netoEstHoy?.[p.canal]||0
      const realH = parseFloat(form[p.id])||0
      return { p, monto: realH > 0 ? est - netoH + realH : est }
    }).filter(x => x.monto > 0.5)
    if (acumReales.length === 0) return
    setTransfiriendoPlat(true)
    try {
      for (const { p, monto } of acumReales) {
        await sb.from('traspasos_caja').insert({
          fecha,
          origen: p.label,
          destino: 'Efectivo',
          monto: Math.round(monto),
          concepto: 'Liquidación acumulada ' + p.label,
        })
      }
      await Promise.all([loadSys(fecha), loadTraspasos(fecha)])
      setMsg({ ok:true, text:'Saldo de plataformas transferido a Efectivo.' })
      setTimeout(()=>setMsg(null), 4000)
    } catch(e) { setMsg({ ok:false, text:e.message }) }
    setTransfiriendoPlat(false)
  }

  // Handler que verifica diferencias en las 3 cajas y muestra modal
  const handleSave = () => {
    if (!sys) return
    const cajasConDif = [
      { caja:'Efectivo',   dif:difEfvo,  tipo:difEfvo <0?'faltante':'sobrante', monto:Math.abs(difEfvo)  },
      { caja:'Tarjeta',    dif:difTc,    tipo:difTc   <0?'faltante':'sobrante', monto:Math.abs(difTc)    },
      { caja:'Plataforma', dif:difPlat,  tipo:difPlat <0?'faltante':'sobrante', monto:Math.abs(difPlat)  },
    ].filter(c=>Math.abs(c.dif)>=1)
    if (cajasConDif.length > 0) {
      const initDec={}, initNot={}
      cajasConDif.forEach(c=>{ initDec[c.caja]='absorber'; initNot[c.caja]='' })
      setModalDifs(cajasConDif); setDecisiones(initDec); setNotas(initNot)
    } else {
      ejecutarGuardado({ decisiones:{}, notas:{} })
    }
  }

  const inp = (id, label, placeholder='0', type='number') => (
    <div className="form-group">
      <div className="form-label">{label}</div>
      <input className="form-input" type={type} placeholder={placeholder}
        value={form[id]} onChange={e=>setForm(f=>({...f,[id]:e.target.value}))} disabled={esViewer}/>
    </div>
  )

  const CashRow = ({label, val, color, bold, border}) => (
    <div style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:4,
      paddingBottom:border?4:0,borderBottom:border?'0.5px solid var(--border)':'none'}}>
      <span style={{color:'var(--text2)'}}>{label}</span>
      <span style={{fontWeight:bold?700:500,color:color||'var(--text1)'}}>{fmtM(val)}</span>
    </div>
  )

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
        <div>
          <div style={{fontSize:14,fontWeight:600}}>Cierre de día — Cashflow por canal</div>
          <div style={{fontSize:11,color:'var(--text2)'}}>{fmtD(fecha)}</div>
        </div>
        <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
          <input className="form-input" type="date" value={fecha} onChange={e=>setFecha(e.target.value)} style={{width:160}}/>
          {['cierre','cashflow','traspasos','faltantes','historial'].map(t=>(
            <button key={t} className={`psw-btn${tab===t?' active':''}`} onClick={()=>setTab(t)}>
              {t==='cierre'?'Cierre del día':t==='cashflow'?'Cashflow':t==='traspasos'?'Traspasos':t==='faltantes'?'Faltantes':'Historial'}
            </button>
          ))}
          <ExportBtn titulo="Cierre del día" getElement={()=>document.querySelector('.content')}/>
        </div>
      </div>

      {msg && <div style={{padding:'8px 14px',borderRadius:'var(--r-sm)',marginBottom:12,
        background:msg.ok?'#EAF3DE':'#FCEBEB',color:msg.ok?'#3B6D11':'#A32D2D',fontSize:12,fontWeight:500}}>{msg.text}</div>}

      {loading ? <div className="loading-screen" style={{height:300}}><div className="spinner"/></div> : <>

      {/* KPIs */}
      {sys && (
        <div className="metrics" style={{gridTemplateColumns:'repeat(4,minmax(0,1fr))',marginBottom:10}}>
          {[
            {label:'Ventas del día',  val:sys.totalVentas,  color:'#378ADD'},
            {label:'Unidades',        val:sys.totalUds,     color:'#1D9E75', uds:true},
            {label:'Gastos del día',  val:sys.totalGastos,  color:'#E24B4A', detalle:sys.gastosDetalle||[]},
            {label:'Utilidad del día',val:sys.utilidad,     color:sys.utilidad>=0?'#1D9E75':'#E24B4A'},
          ].map(k=>(
            <div key={k.label} className="mc" style={{position:'relative'}}>
              <div className="mc-label">{k.label}</div>
              <div className="mc-value" style={{color:k.color,fontSize:16}}>{k.uds?Math.round(k.val)+' uds':fmtM(k.val)}</div>
              {k.detalle && k.detalle.length > 0 && (() => {
                // Agrupar por concepto+metodo_pago y sumar
                const grouped = []
                const keyMap = {}
                k.detalle.forEach(g => {
                  const mp = (g.metodo_pago||'').toLowerCase()
                  const tag = mp.includes('tarjeta')||mp.includes('transferencia') ? 'TC' : mp.includes('transfer')||mp.includes('spei') ? 'TR' : 'EF'
                  const key = (g.concepto||g.categoria_gasto||'') + '|' + tag
                  if (keyMap[key] == null) { keyMap[key] = grouped.length; grouped.push({ concepto: g.concepto||g.categoria_gasto, tag, monto:0, mp: g.metodo_pago }) }
                  grouped[keyMap[key]].monto += g.monto||0
                })
                return (
                  <div style={{marginTop:6,borderTop:'0.5px solid var(--border)',paddingTop:5}}>
                    {grouped.map((g,i) => (
                      <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'var(--text3)',lineHeight:1.5}}>
                        <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'65%'}} title={g.concepto}>{g.concepto}</span>
                        <span style={{fontWeight:600,color:g.tag==='TC'?'#7F77DD':'var(--text2)',whiteSpace:'nowrap'}}>
                          {fmtM(g.monto)} {g.tag}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              })()}
              {k.detalle && k.detalle.length === 0 && sys.totalGastos > 0 && (
                <div style={{fontSize:9,color:'var(--text3)',marginTop:4}}>—</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── KPIs ACUMULADOS DEL MES ── */}
      {kpiMes && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(6,minmax(0,1fr))',gap:8,marginBottom:10}}>
          {[
            { label:'Ajustes Efectivo',   val:kpiMes.ajEfvo,  fmt:'$', color:'#EF9F27', hint:'Faltantes − sobrantes acum. mes' },
            { label:'Ajustes Tarjeta',    val:kpiMes.ajTc,    fmt:'$', color:'#7F77DD', hint:'Faltantes − sobrantes acum. mes' },
            { label:'Ajustes Plataforma', val:kpiMes.ajPlat,  fmt:'$', color:'#E24B4A', hint:'Faltantes − sobrantes acum. mes' },
            { label:'Ventas gratis (uds)',val:kpiMes.gUds,    fmt:'u', color:'#378ADD', hint:`${kpiMes.gCnt} órdenes sin cobro`, sub: kpiMes.gMonto>0?'~'+fmtM(kpiMes.gMonto)+' est.':'' },
            { label:'Uds vendidas mes',   val:kpiMes.totUds,  fmt:'u', color:'#1D9E75', hint:'Acumulado del mes' },
          ].map(k=>(
            <div key={k.label} title={k.hint} style={{background:'var(--surface)',border:'0.5px solid var(--border)',borderRadius:'var(--r-sm)',padding:'8px 10px',cursor:'default'}}>
              <div style={{fontSize:9,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:.5,marginBottom:3}}>{k.label}</div>
              <div style={{fontSize:16,fontWeight:800,color:k.fmt==='$'?Math.abs(k.val)<1?'var(--text2)':k.val>0?'#E24B4A':'#1D9E75':k.color}}>
                {k.fmt==='$'
                  ? (k.val>0?'+':'')+fmtM(k.val)
                  : Math.round(k.val).toLocaleString('es-MX')+' uds'}
              </div>
              {k.sub && <div style={{fontSize:10,color:'#E24B4A',fontWeight:700,marginTop:1}}>{k.sub}</div>}
              <div style={{fontSize:9,color:'var(--text3)',marginTop:2}}>{new Date().toLocaleString('es-MX',{month:'long'})}</div>
            </div>
          ))}
          {(() => {
            const total = kpiMes.ajEfvo + kpiMes.ajTc + kpiMes.ajPlat
            const ok    = Math.abs(total) < 50
            const lineas = [
              Math.abs(kpiMes.ajEfvo)>=1 && `Efvo ${kpiMes.ajEfvo>0?'+':''}${fmtM(kpiMes.ajEfvo)}`,
              Math.abs(kpiMes.ajTc)  >=1 && `TC ${kpiMes.ajTc>0?'+':''}${fmtM(kpiMes.ajTc)}`,
              Math.abs(kpiMes.ajPlat)>=1 && `Plat ${kpiMes.ajPlat>0?'+':''}${fmtM(kpiMes.ajPlat)}`,
            ].filter(Boolean)
            return (
              <div style={{background:'var(--surface)',border:`0.5px solid ${ok?'var(--border)':'#E24B4A44'}`,borderRadius:'var(--r-sm)',padding:'8px 10px'}}>
                <div style={{fontSize:9,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:.5,marginBottom:3}}>Ajuste neto mes</div>
                <div style={{fontSize:16,fontWeight:800,color:ok?'#1D9E75':total>0?'#E24B4A':'#EF9F27'}}>
                  {ok?'✓ Cuadrado':(total>0?'+':'')+fmtM(total)}
                </div>
                <div style={{fontSize:9,color:'var(--text3)',marginTop:3,lineHeight:1.6}}>
                  {ok?'Sin diferencias relevantes en el mes':lineas.join(' · ')}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* TOTALES POR CANAL — siempre visible */}
      {sys && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:14}}>
          {/* Efectivo */}
          <div style={{background:'#E6F1FB',borderRadius:'var(--r-lg)',padding:'14px 16px',border:'0.5px solid #B5D4F4'}}>
            <div style={{fontSize:11,color:'#185FA5',fontWeight:600,marginBottom:6}}>💵 Efectivo</div>
            <div style={{fontSize:22,fontWeight:700,color:'#185FA5',marginBottom:8}}>{fmtM(sys.teorEfvo)}</div>
            <div style={{fontSize:11,color:'#378ADD',lineHeight:1.8}}>
              <div>S.inicial: {fmtM(sys.saldoInicialEfvo)}</div>
              <div>+ Ventas: {fmtM(sys.ventasEfvo)}</div>
              <div>− Gastos: {fmtM(sys.gastosEfvo)}</div>
            </div>
            <div style={{marginTop:6,paddingTop:6,borderTop:'0.5px solid #B5D4F4',fontSize:10,fontWeight:600,color:'#185FA5'}}>
              Debe haber: {fmtM(sys.teorEfvo)}
            </div>
          </div>
          {/* Tarjeta */}
          <div style={{background:'#EEEDFE',borderRadius:'var(--r-lg)',padding:'14px 16px',border:'0.5px solid #AFA9EC'}}>
            <div style={{fontSize:11,color:'#534AB7',fontWeight:600,marginBottom:6}}>💳 Tarjeta</div>
            <div style={{fontSize:22,fontWeight:700,color:'#534AB7',marginBottom:8}}>{fmtM(sys.teorTc)}</div>
            <div style={{fontSize:11,color:'#7F77DD',lineHeight:1.9}}>
              <div>S.inicial: {fmtM(sys.saldoInicialTc)}</div>
              <div>+ Ventas: {fmtM(sys.ventasTc)}</div>
              <div>− Gastos: {fmtM(sys.gastosTc)}</div>
              {sys.comisionTC>0  && <div style={{color:'#E24B4A'}}>− Comisión TC (4.5%): {fmtM(sys.comisionTC)}</div>}
              {sys.prestamoClip>0 && <div style={{color:'#E24B4A'}}>− Préstamo Clip (30%): {fmtM(sys.prestamoClip)}</div>}
            </div>
            <div style={{marginTop:6,paddingTop:6,borderTop:'0.5px solid #AFA9EC',fontSize:10,fontWeight:600,color:'#534AB7'}}>
              Debe reportar: <span style={{color: sys.comisionesTc>0?'#E24B4A':'#534AB7'}}>{fmtM(sys.teorTc - sys.comisionesTc)}</span>
              {sys.comisionesTc>0 && <span style={{color:'#888',marginLeft:6,fontWeight:400}}>(bruto {fmtM(sys.teorTc)})</span>}
            </div>
          </div>
          {/* TOTAL */}
          {(() => {
            // realAcum = anteriorPlat + realNeto - traspasos
            // = saldoAcumPlat (que ya tiene anteriorPlat + bruto - traspasos) - bruto + realNeto
            const realAcumPlat = (p) => {
              const gross = sys.saldoAcumPlat?.[p.canal]||0
              const byC   = sys.byCanal?.[p.canal]||0
              const real  = parseFloat(form[p.id])||0
              return real > 0 ? gross - byC + real : gross
            }
            const totalPlat = PLAT_FIELDS.reduce((s,p)=>s+realAcumPlat(p),0)
            const totalGeneral = sys.teorEfvo + sys.teorTc + totalPlat
            return (
              <div style={{background:'#EAF3DE',borderRadius:'var(--r-lg)',padding:'14px 16px',border:'0.5px solid #C0DD97'}}>
                <div style={{fontSize:11,color:'#3B6D11',fontWeight:600,marginBottom:6}}>💰 Total acumulado</div>
                <div style={{fontSize:22,fontWeight:700,color:'#3B6D11',marginBottom:8}}>{fmtM(totalGeneral)}</div>
                <div style={{fontSize:11,color:'#639922',lineHeight:1.8}}>
                  <div>Efectivo: {fmtM(sys.teorEfvo)}</div>
                  <div>Tarjeta: {fmtM(sys.teorTc)}</div>
                  <div>Plataformas: {fmtM(totalPlat)}</div>
                </div>
                <div style={{marginTop:6,paddingTop:6,borderTop:'0.5px solid #C0DD97',fontSize:10,fontWeight:600,color:'#3B6D11'}}>
                  Utilidad del día: {fmtM(sys.utilidad)}
                </div>
              </div>
            )
          })()}
          {/* ── PLATAFORMAS: ventas de HOY + acumulado ── */}
          {(PLAT_FIELDS.some(p => (sys.byCanal?.[p.canal]||0) > 0) || platVentasAcum) && (
            <div style={{gridColumn:'1 / -1',background:'#EBF5FB',borderRadius:'var(--r-lg)',padding:'14px 16px',border:'0.5px solid #5DADE2'}}>
              <div style={{fontSize:11,color:'#1A5276',fontWeight:700,marginBottom:8}}>🛵 Plataformas — ventas de hoy</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))',gap:8}}>
                {PLAT_FIELDS.map(p => {
                  const bruto   = sys.byCanal?.[p.canal]||0
                  const comEst  = bruto * p.comRate
                  const loan    = sys.prestamosPlatHoy?.[p.canal]||0
                  const netoH   = sys.netoEstHoy?.[p.canal]||0  // neto estimado HOY = bruto*(1-com), antes de préstamo
                  const realH   = parseFloat(form[p.id])||0      // neto de comisión capturado (bruto−com real, ANTES del préstamo)
                  if (bruto === 0 && loan === 0) return null
                  // comReal = diferencia entre neto capturado y bruto = comisión real cobrada (negativo)
                  const comReal = realH > 0 ? realH - bruto : null
                  return (
                    <div key={p.canal} style={{background:'#fff',borderRadius:'var(--r-md)',padding:'10px 12px',border:`0.5px solid ${loan>0?'#F5B7B1':'#AED6F1'}`}}>
                      <div style={{fontSize:11,fontWeight:700,color:'#1A5276',marginBottom:6}}>{p.label}</div>
                      <div style={{fontSize:10,color:'#2E86C1',lineHeight:1.9}}>
                        {bruto > 0 && <>
                          <div style={{display:'flex',justifyContent:'space-between'}}>
                            <span>Ventas POS (bruto):</span><span style={{fontWeight:600}}>+{fmtM(bruto)}</span>
                          </div>
                          <div style={{display:'flex',justifyContent:'space-between',color:'#E24B4A'}}>
                            <span>Comisión est. ~{Math.round(p.comRate*100)}%:</span><span>−{fmtM(comEst)}</span>
                          </div>
                        </>}
                        {loan > 0 && (
                          <div style={{display:'flex',justifyContent:'space-between',color:'#8E44AD',fontWeight:600}}>
                            <span>Pago préstamo (gastos):</span><span>−{fmtM(loan)}</span>
                          </div>
                        )}
                        {loan > 0 ? (
                          // Con préstamo: mostrar neto est. antes y después del préstamo
                          <>
                            <div style={{display:'flex',justifyContent:'space-between',color:'#1D9E75',fontWeight:600}}>
                              <span>Neto est. (sin préstamo):</span><span>{fmtM(netoH)}</span>
                            </div>
                            <div style={{display:'flex',justifyContent:'space-between',color:'#7D3C98',fontWeight:700,borderTop:'0.5px solid #AED6F1',paddingTop:3,marginTop:2}}>
                              <span>Neto est. (con préstamo):</span><span>{fmtM(netoH - loan)}</span>
                            </div>
                          </>
                        ) : (
                          <div style={{display:'flex',justifyContent:'space-between',color:'#1D9E75',fontWeight:600,borderTop:'0.5px solid #AED6F1',paddingTop:3,marginTop:2}}>
                            <span>Neto est. hoy:</span><span>{fmtM(netoH)}</span>
                          </div>
                        )}
                      </div>
                      {bruto > 0 && <div style={{marginTop:6}}>
                        <div style={{fontSize:9,color:'#1A5276',fontWeight:600,marginBottom:3}}>
                          Neto de comisión (de la app, sin descontar préstamo):
                        </div>
                        <input
                          type="number"
                          placeholder={String(Math.round(netoH))}
                          value={form[p.id]||''}
                          onChange={e=>setForm(f=>({...f,[p.id]:e.target.value}))}
                          disabled={esViewer}
                          style={{width:'100%',padding:'4px 8px',fontSize:11,border:`1px solid ${realH>0?'#1D9E75':'#AED6F1'}`,borderRadius:'var(--r-sm)',outline:'none',background:realH>0?'#F0FBF5':'#F0F8FF',boxSizing:'border-box'}}/>
                        {comReal !== null && bruto > 0 && (
                          <div style={{fontSize:9,marginTop:3,color:comReal<-bruto*0.05?'#E24B4A':'#1D9E75',fontWeight:600}}>
                            Comisión real: {fmtM(Math.abs(comReal))} ({Math.round((Math.abs(comReal)/bruto)*100)}%)
                          </div>
                        )}
                      </div>}
                    </div>
                  )
                })}
                {/* 3 cards de acumulado neto — en la misma grid */}
                {platVentasAcum && sys && (()=>{
                  const _tot = PLAT_FIELDS.reduce((s,p)=>s+(sys.acumNetoEst?.[p.canal]||0),0)
                  const pa   = {...platVentasAcum, total:Math.round(_tot), mesCte:Math.round(_tot-platVentasAcum.mesesAnt)}
                  return <>
                  {/* Mes actual — gris claro */}
                  <div style={{background:'#F8F9FA',borderRadius:'var(--r-md)',padding:'10px 12px',border:'0.5px solid #ADB5BD'}}>
                    <div style={{fontSize:11,fontWeight:700,color:'#343A40',marginBottom:6}}>📅 Mes {pa.labelMes}</div>
                    <div style={{fontSize:10,color:'#6C757D',lineHeight:1.9}}>
                      <div style={{display:'flex',justifyContent:'space-between'}}><span>Inicio del mes:</span><span>{fmtM(pa.mesesAnt)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',fontWeight:600,color:'#495057'}}><span>+ Acum. mes cte.:</span><span>{fmtM(pa.mesCte)}</span></div>
                    </div>
                    <div style={{marginTop:6,paddingTop:4,borderTop:'0.5px solid #CED4DA',fontSize:13,fontWeight:700,color:'#212529'}}>{fmtM(pa.mesCte)}</div>
                    <div style={{fontSize:9,color:'#6C757D'}}>neto acumulado del mes</div>
                  </div>
                  {/* Meses anteriores — gris medio */}
                  <div style={{background:'#F1F3F5',borderRadius:'var(--r-md)',padding:'10px 12px',border:'0.5px solid #868E96'}}>
                    <div style={{fontSize:11,fontWeight:700,color:'#343A40',marginBottom:6}}>🗓 Meses anteriores</div>
                    <div style={{fontSize:10,color:'#6C757D',lineHeight:1.9}}>
                      <div style={{display:'flex',justifyContent:'space-between'}}><span>Saldo al cierre may:</span><span>{fmtM(pa.mesesAnt)}</span></div>
                      <div style={{fontSize:9,color:'#868E96'}}>sin retirar desde plataformas</div>
                    </div>
                    <div style={{marginTop:6,paddingTop:4,borderTop:'0.5px solid #CED4DA',fontSize:13,fontWeight:700,color:'#212529'}}>{fmtM(pa.mesesAnt)}</div>
                    <div style={{fontSize:9,color:'#6C757D'}}>neto acumulado previo</div>
                  </div>
                  {/* Total — gris oscuro */}
                  <div style={{background:'#E9ECEF',borderRadius:'var(--r-md)',padding:'10px 12px',border:'1px solid #495057'}}>
                    <div style={{fontSize:11,fontWeight:700,color:'#212529',marginBottom:6}}>💰 Total acumulado</div>
                    <div style={{fontSize:10,color:'#495057',lineHeight:1.9}}>
                      <div style={{display:'flex',justifyContent:'space-between'}}><span>Ant.:</span><span>{fmtM(pa.mesesAnt)}</span></div>
                      <div style={{display:'flex',justifyContent:'space-between',fontWeight:600}}><span>+ Mes:</span><span>{fmtM(pa.mesCte)}</span></div>
                    </div>
                    <div style={{marginTop:6,paddingTop:4,borderTop:'0.5px solid #ADB5BD',fontSize:13,fontWeight:700,color:'#212529'}}>{fmtM(pa.total)}</div>
                    <div style={{fontSize:9,color:'#495057'}}>saldo neto total hoy</div>
                  </div>
                </>})()}
              </div>
            </div>
          )}
          {/* ── PLATAFORMAS: saldo acumulado ── */}
          {(() => {
            // acumNetoEst = ant + netoEstHoy − traspasos − loan
            // realH = neto de comisión (bruto−com), ANTES del préstamo
            // new_acum = ant − traspasos + realH − loan
            //          = acumNetoEst − netoEstHoy + realH  (ya que est incluye −loan)
            const acumReal = (p) => {
              const est    = sys.acumNetoEst?.[p.canal]||0
              const netoEH = sys.netoEstHoy?.[p.canal]||0
              const realH  = parseFloat(form[p.id])||0
              return realH > 0 ? est - netoEH + realH : est
            }
            const totalAcum = PLAT_FIELDS.reduce((s,p)=>s+acumReal(p),0)
            const totalAnt  = PLAT_FIELDS.reduce((s,p)=>s+(sys.saldoAnteriorPlat?.[p.canal]||0),0)
            // totalHoy = lo que se suma al acumulado hoy (neto de comisión − préstamo)
            const totalHoy  = PLAT_FIELDS.reduce((s,p)=>{
              const realH  = parseFloat(form[p.id])||0
              const loan   = sys.prestamosPlatHoy?.[p.canal]||0
              const netoEH = sys.netoEstHoy?.[p.canal]||0
              return s + (realH > 0 ? realH - loan : netoEH - loan)
            },0)
            const hayAcum = totalAcum > 0.5
            return (
              <div style={{gridColumn:'1 / -1',background:'#EBF5FB',borderRadius:'var(--r-lg)',padding:'14px 16px',border:'0.5px solid #5DADE2'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10,flexWrap:'wrap',gap:8}}>
                  <div>
                    <div style={{fontSize:11,color:'#1A5276',fontWeight:700}}>🏦 Acumulado plataformas (neto)</div>
                    <div style={{fontSize:9,color:'#2E86C1',marginTop:3,lineHeight:1.7}}>
                      <span>Anterior: {fmtM(totalAnt)}</span>
                      <span style={{margin:'0 6px'}}>+</span>
                      <span>Hoy (neto): +{fmtM(totalHoy)}</span>
                      <span style={{margin:'0 6px'}}>=</span>
                      <b style={{color:'#1A5276'}}>Nuevo saldo: {fmtM(totalAcum)}</b>
                    </div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:24,fontWeight:800,color:'#1A5276'}}>{fmtM(totalAcum)}</div>
                    <div style={{fontSize:9,color:'#2E86C1'}}>saldo acumulado neto</div>
                  </div>
                </div>
                {/* Desglose por plataforma */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:6,marginBottom:hayAcum?10:0}}>
                  {PLAT_FIELDS.map(p => {
                    const ant   = sys.saldoAnteriorPlat?.[p.canal]||0
                    const netoEH = sys.netoEstHoy?.[p.canal]||0
                    const loan  = sys.prestamosPlatHoy?.[p.canal]||0
                    const netoH = netoEH - loan  // neto hoy ya sin préstamo
                    const realH = parseFloat(form[p.id])||0
                    const acum  = acumReal(p)
                    if (ant===0 && netoEH===0 && loan===0 && acum===0) return null
                    return (
                      <div key={p.canal} style={{background:'#fff',borderRadius:'var(--r-sm)',padding:'7px 9px',border:`0.5px solid ${loan>0?'#D7BDE2':'#AED6F1'}`}}>
                        <div style={{fontSize:9,fontWeight:700,color:'#1A5276',marginBottom:3}}>{p.label}</div>
                        <div style={{fontSize:9,color:'#2E86C1',lineHeight:1.7}}>
                          {ant > 0 && <div>Ant: {fmtM(ant)}</div>}
                          <div>+Hoy: {fmtM(realH>0?realH:netoH)}{realH>0?'':' est.'}</div>
                          {loan > 0 && <div style={{color:'#8E44AD'}}>Préstamo: −{fmtM(loan)}</div>}
                        </div>
                        <div style={{fontSize:11,fontWeight:700,color:'#1A5276',marginTop:3,borderTop:'0.5px solid #AED6F1',paddingTop:3}}>{fmtM(acum)}</div>
                      </div>
                    )
                  })}
                </div>
                {hayAcum && !esViewer && (
                  <button
                    onClick={transferirTodoEfvo}
                    disabled={transferiendoPlat}
                    style={{width:'100%',padding:'10px 0',background:transferiendoPlat?'#aaa':'#1A5276',color:'#fff',border:'none',borderRadius:'var(--r-md)',fontSize:12,fontWeight:700,cursor:transferiendoPlat?'not-allowed':'pointer',letterSpacing:0.3}}>
                    {transferiendoPlat ? 'Registrando traspasos…' : `💸 Transferir todo a Efectivo (${fmtM(totalAcum)})`}
                  </button>
                )}
                {!hayAcum && (
                  <div style={{fontSize:10,color:'#1D9E75',fontWeight:600,textAlign:'center'}}>✓ Sin saldo pendiente en plataformas</div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* SALDO INICIAL MANUAL — cuando no hay cierre anterior */}
      {sys && sys.saldoInicialEfvo===0 && sys.saldoInicialTc===0 && !cierre && (
        <div style={{padding:'10px 14px',borderRadius:'var(--r-md)',marginBottom:14,background:'#FFF9E6',border:'0.5px solid #EF9F27',fontSize:11}}>
          <div style={{fontWeight:600,color:'#8A5A00',marginBottom:8}}>⚠ Sin cierre anterior — captura el saldo inicial de hoy</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div className="form-group">
              <div className="form-label">Saldo inicial efectivo</div>
              <input className="form-input" type="number" placeholder="0"
                value={form.saldo_inicial_efvo_manual||''}
                onChange={e=>{
                  const v = parseFloat(e.target.value)||0
                  setForm(f=>({...f, saldo_inicial_efvo_manual:e.target.value}))
                  setSys(s=>({...s,
                    saldoInicialEfvo:v,
                    teorEfvo:v+s.ventasEfvo-s.gastosEfvo
                  }))
                }}/>
            </div>
            <div className="form-group">
              <div className="form-label">Saldo inicial tarjeta</div>
              <input className="form-input" type="number" placeholder="0"
                value={form.saldo_inicial_tc_manual||''}
                onChange={e=>{
                  const v = parseFloat(e.target.value)||0
                  setForm(f=>({...f, saldo_inicial_tc_manual:e.target.value}))
                  setSys(s=>({...s,
                    saldoInicialTc:v,
                    teorTc:v+s.ventasTc-s.gastosTc
                  }))
                }}/>
            </div>
          </div>
        </div>
      )}

      {/* ── CIERRE ── */}
      {tab==='cierre' && sys && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          {/* CONTEO FÍSICO */}
          <div className="card">
            <div className="ct" style={{marginBottom:14}}>Conteo físico de caja</div>

            {/* Efectivo */}
            <div style={{fontSize:11,fontWeight:600,color:'#378ADD',marginBottom:6}}>💵 Efectivo</div>
            <div style={{padding:'10px 12px',background:'#E6F1FB',borderRadius:'var(--r-sm)',marginBottom:10,fontSize:12,lineHeight:2}}>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span>Saldo inicial</span><strong>{fmtM(sys.saldoInicialEfvo)}</strong>
              </div>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span>+ Ventas efectivo</span><strong style={{color:'#1D9E75'}}>{fmtM(sys.ventasEfvo)}</strong>
              </div>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span>− Gastos efectivo</span><strong style={{color:'#E24B4A'}}>{fmtM(sys.gastosEfvo)}</strong>
              </div>
              {sys.traspNEfvo !== 0 && (
                <div style={{display:'flex',justifyContent:'space-between'}}>
                  <span>{sys.traspNEfvo > 0 ? '+ Traspasos entrada' : '− Traspasos salida'}</span>
                  <strong style={{color: sys.traspNEfvo > 0 ? '#1D9E75' : '#E24B4A'}}>{sys.traspNEfvo > 0 ? '+' : ''}{fmtM(sys.traspNEfvo)}</strong>
                </div>
              )}
              <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px solid #B5D4F4',marginTop:4,paddingTop:4}}>
                <span style={{fontWeight:700}}>Debe haber en caja</span>
                <strong style={{color:'#185FA5',fontSize:14}}>{fmtM(sys.teorEfvo)}</strong>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
              {inp('efvo_billetes','Billetes contados')}
              {inp('efvo_monedas','Monedas contadas')}
            </div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'8px 12px',
              background:Math.abs(difEfvo)<1?'#EAF3DE':difEfvo>0?'#EAF3DE':'#FCEBEB',
              borderRadius:'var(--r-sm)',marginBottom:10}}>
              <span>Total contado: <strong>{fmtM(efvoReal)}</strong></span>
              <span style={{fontWeight:700,color:difColor(difEfvo)}}>{difLabel(difEfvo)}</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
              {inp('ajuste_efvo','Ajuste efectivo (+/−)','ej. −500 retiro')}
              {inp('ajuste_efvo_nota','Motivo del ajuste','Retiro, depósito...','text')}
            </div>
            {n('ajuste_efvo')!==0 && (
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'6px 12px',
                background:'#FFF9E6',borderRadius:'var(--r-sm)',marginBottom:14,border:'0.5px solid #EF9F27'}}>
                <span>Saldo final con ajuste</span>
                <strong style={{color:'#EF9F27'}}>{fmtM(saldoFinalEfvo)}</strong>
              </div>
            )}

            {/* Tarjeta */}
            <div style={{fontSize:11,fontWeight:600,color:'#7F77DD',marginBottom:6,marginTop:6}}>💳 Tarjeta</div>
            <div style={{padding:'10px 12px',background:'#EEEDFE',borderRadius:'var(--r-sm)',marginBottom:10,fontSize:12,lineHeight:2}}>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span>Saldo inicial</span><strong>{fmtM(sys.saldoInicialTc)}</strong>
              </div>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span>+ Ventas tarjeta</span><strong style={{color:'#1D9E75'}}>{fmtM(sys.ventasTc)}</strong>
              </div>
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <span>− Gastos tarjeta</span><strong style={{color:'#E24B4A'}}>{fmtM(sys.gastosTc)}</strong>
              </div>
              {sys.gastosTransf>0 && (
                <div style={{display:'flex',justifyContent:'space-between'}}>
                  <span>− Transferencias</span><strong style={{color:'#E24B4A'}}>{fmtM(sys.gastosTransf)}</strong>
                </div>
              )}
              {sys.traspNTc !== 0 && (
                <div style={{display:'flex',justifyContent:'space-between'}}>
                  <span>{sys.traspNTc > 0 ? '+ Traspasos entrada' : '− Traspasos salida'}</span>
                  <strong style={{color: sys.traspNTc > 0 ? '#1D9E75' : '#E24B4A'}}>{sys.traspNTc > 0 ? '+' : ''}{fmtM(sys.traspNTc)}</strong>
                </div>
              )}
              {sys.comisionTC>0 && (
                <div style={{display:'flex',justifyContent:'space-between'}}>
                  <span>− Comisión TC (4.5%)</span><strong style={{color:'#E24B4A'}}>{fmtM(sys.comisionTC)}</strong>
                </div>
              )}
              {sys.prestamoClip>0 && (
                <div style={{display:'flex',justifyContent:'space-between'}}>
                  <span>− Préstamo Clip (30%)</span><strong style={{color:'#E24B4A'}}>{fmtM(sys.prestamoClip)}</strong>
                </div>
              )}
              <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px solid #AFA9EC',marginTop:4,paddingTop:4}}>
                <span style={{fontWeight:700}}>Debe reportar terminal</span>
                <strong style={{color:'#534AB7',fontSize:14}}>{fmtM(sys.teorTc - sys.comisionesTc)}</strong>
              </div>
            </div>
            <div style={{marginBottom:8}}>{inp('tc_reportado','Monto reportado en terminal')}</div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'8px 12px',
              background:Math.abs(difTc)<1?'#EAF3DE':difTc>0?'#EAF3DE':'#FCEBEB',
              borderRadius:'var(--r-sm)',marginBottom:10}}>
              <span>Reportado: <strong>{fmtM(tcReal)}</strong></span>
              <span style={{fontWeight:700,color:difColor(difTc)}}>{difLabel(difTc)}</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
              {inp('ajuste_tc','Ajuste tarjeta (+/−)','ej. −200 comisión')}
              {inp('ajuste_tc_nota','Motivo del ajuste','Comisión, retiro...','text')}
            </div>

            {/* Plataformas */}
            <div style={{fontSize:11,fontWeight:600,color:'#E24B4A',marginBottom:6,marginTop:6}}>🛵 Plataformas</div>
            <div style={{padding:'10px 12px',background:'#FCEBEB',borderRadius:'var(--r-sm)',marginBottom:10,fontSize:11,lineHeight:1.8}}>
              <div style={{display:'flex',justifyContent:'space-between',fontWeight:600,marginBottom:4}}>
                <span>Ventas POS (bruto)</span><strong style={{color:'#1D9E75'}}>{fmtM(sys.ventasPlat)}</strong>
              </div>
              {Object.entries(sys.byCanal)
                .filter(([c])=>['Uber','Uber Chilakiles','DiDi','DiDi Chilakiles','Rappi','Ola'].includes(c))
                .map(([c,v])=>(
                  <div key={c} style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'#A32D2D'}}>
                    <span>{c}</span><span>{fmtM(v)}</span>
                  </div>
                ))}
            </div>

            <div style={{fontSize:11,color:'var(--text2)',marginBottom:8,padding:'6px 10px',background:'#FFF9E6',borderRadius:'var(--r-sm)',border:'0.5px solid #EF9F27'}}>
              💡 Captura lo que <strong>realmente deposita</strong> cada plataforma (ya descontadas sus comisiones)
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
              {PLAT_FIELDS.map(f2=>{
                const ventasSistema = sys.byCanal?.[f2.canal]||0
                const depositado = parseFloat(form[f2.id]||0)||0
                const difPlat = depositado>0 ? depositado - ventasSistema : null
                return (
                  <div key={f2.id} className="form-group">
                    <div className="form-label">{f2.label}</div>
                    <input className="form-input" type="number" placeholder={ventasSistema>0?'POS: '+Math.round(ventasSistema):'0'}
                      value={form[f2.id]} onChange={e=>setForm(f=>({...f,[f2.id]:e.target.value}))} disabled={esViewer}/>
                    {depositado>0 && (
                      <div style={{fontSize:10,marginTop:2,color:difColor(difPlat)}}>
                        POS: {fmtM(ventasSistema)} · Dif: {difPlat>0?'+':''}{fmtM(difPlat)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Total diferencia plataformas */}
            {platReal > 0 && (
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'8px 12px',
                background:Math.abs(difPlat)<1?'#EAF3DE':'#FCEBEB',borderRadius:'var(--r-sm)',marginBottom:14,
                border:`0.5px solid ${Math.abs(difPlat)<1?'#86C442':'#F09595'}`}}>
                <span>Depositado real vs POS: <strong>{fmtM(platReal)}</strong></span>
                <span style={{fontWeight:700,color:difColor(difPlat)}}>Dif: {difPlat>0?'+':''}{fmtM(difPlat)}</span>
              </div>
            )}

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
              {inp('notas','Notas','Observaciones...','text')}
              {inp('cerrado_por','Cerrado por','Nombre','text')}
            </div>

            {!esViewer && (
              <button className="btn btn-primary" style={{width:'100%',padding:10}} onClick={handleSave} disabled={saving||recalculando||loading}>
                {loading?'Cargando datos...':(saving?'Guardando...':(cierre?'Actualizar cierre':'Guardar cierre del día'))}
              </button>
            )}

            {/* Recalcular cadena — solo para fechas pasadas con cierre guardado */}
            {!esViewer && cierre && fecha < today() && (
              <div style={{marginTop:8}}>
                <button
                  onClick={recalcularCadena}
                  disabled={recalculando || saving}
                  style={{width:'100%',padding:9,borderRadius:'var(--r-md)',
                    border:'1.5px solid #EF9F27',background:recalculando?'#EF9F2722':'#FFF9E6',
                    color:'#8A5A00',cursor:recalculando?'not-allowed':'pointer',
                    fontSize:12,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                  {recalculando
                    ? <><span style={{animation:'spin 1s linear infinite',display:'inline-block'}}>⏳</span> Recalculando cadena...</>
                    : '🔄 Propagar saldos a cierres siguientes'}
                </button>
                <div style={{fontSize:9,color:'var(--text3)',marginTop:4,textAlign:'center',lineHeight:1.5}}>
                  Actualiza saldo_inicial de todos los cierres posteriores a esta fecha,
                  recalculando teóricos y diferencias en cadena.
                </div>
              </div>
            )}
          </div>

          {/* RESUMEN CASHFLOW */}
          <div className="card">
            <div className="ct" style={{marginBottom:14}}>Resumen cashflow del día</div>

            {/* Efectivo */}
            <div style={{marginBottom:12,padding:12,background:'var(--bg)',borderRadius:'var(--r-md)'}}>
              <div style={{fontSize:12,fontWeight:600,color:'#378ADD',marginBottom:8}}>💵 Efectivo</div>
              <CashRow label="Saldo inicial"     val={sys.saldoInicialEfvo}/>
              <CashRow label="+ Ventas efectivo" val={sys.ventasEfvo}  color="#1D9E75"/>
              <CashRow label="− Gastos efectivo" val={-sys.gastosEfvo} color="#E24B4A"/>
              <CashRow label="= Saldo teórico"   val={sys.teorEfvo}    color="#378ADD" bold border/>
              <CashRow label="Conteo físico"      val={efvoReal}        bold/>
              <CashRow label="Diferencia"         val={difEfvo}         color={difColor(difEfvo)} bold/>
              {n('ajuste_efvo')!==0 && <CashRow label="Ajuste" val={n('ajuste_efvo')} color="#EF9F27"/>}
              <CashRow label="Saldo final"        val={saldoFinalEfvo}  color="#378ADD" bold/>
            </div>

            {/* Tarjeta */}
            <div style={{marginBottom:12,padding:12,background:'var(--bg)',borderRadius:'var(--r-md)'}}>
              <div style={{fontSize:12,fontWeight:600,color:'#7F77DD',marginBottom:8}}>💳 Tarjeta</div>
              <CashRow label="Saldo inicial"    val={sys.saldoInicialTc}/>
              <CashRow label="+ Ventas tarjeta" val={sys.ventasTc}  color="#1D9E75"/>
              <CashRow label="− Gastos tarjeta" val={-sys.gastosTc} color="#E24B4A"/>
              {sys.comisionTC>0   && <CashRow label="− Comisión TC (4.5%)"  val={-sys.comisionTC}   color="#E24B4A"/>}
              {sys.prestamoClip>0 && <CashRow label="− Préstamo Clip (30%)" val={-sys.prestamoClip} color="#E24B4A"/>}
              <CashRow label="= Neto esperado"  val={sys.teorTc-sys.comisionesTc} color="#7F77DD" bold border/>
              <CashRow label="Reportado terminal" val={tcReal}       bold/>
              <CashRow label="Diferencia"        val={difTc}         color={difColor(difTc)} bold/>
              <CashRow label="Saldo final"       val={saldoFinalTc}  color="#7F77DD" bold/>
            </div>

            {/* Plataformas */}
            <div style={{marginBottom:12,padding:12,background:'var(--bg)',borderRadius:'var(--r-md)'}}>
              <div style={{fontSize:12,fontWeight:600,color:'#E24B4A',marginBottom:8}}>🛵 Plataformas</div>
              <CashRow label="Ventas POS (bruto)" val={sys.ventasPlat} color="#1D9E75"/>
              <CashRow label="Depositado real"    val={platReal}       bold/>
              <CashRow label="Diferencia (comisiones)" val={difPlat}   color={difColor(difPlat)} bold border/>
              {PLAT_FIELDS.map(f2=>{
                const pos = sys.byCanal?.[f2.canal]||0
                const dep = parseFloat(form[f2.id]||0)||0
                if (pos===0 && dep===0) return null
                return (
                  <div key={f2.canal} style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'var(--text3)',marginTop:3}}>
                    <span>{f2.label}</span>
                    <span>POS: {fmtM(pos)} → Dep: {fmtM(dep)} {dep>0&&pos>0?'('+Math.round((pos-dep)/pos*100)+'% com.)':''}</span>
                  </div>
                )
              })}
            </div>

            {/* Estado */}
            <div style={{padding:12,borderRadius:'var(--r-md)',
              background:Math.abs(difEfvo)+Math.abs(difTc)+Math.abs(difPlat)<3?'#EAF3DE':'#FCEBEB',
              border:`0.5px solid ${Math.abs(difEfvo)+Math.abs(difTc)+Math.abs(difPlat)<3?'#86C442':'#E24B4A'}`}}>
              <div style={{fontSize:12,fontWeight:600,
                color:Math.abs(difEfvo)+Math.abs(difTc)+Math.abs(difPlat)<3?'#3B6D11':'#A32D2D'}}>
                {Math.abs(difEfvo)+Math.abs(difTc)+Math.abs(difPlat)<3
                  ? '✓ Caja cuadrada — todo en orden'
                  : `⚠ Efvo: ${difLabel(difEfvo)} · TC: ${difLabel(difTc)} · Plat: ${difLabel(difPlat)}`}
              </div>
              {cierre && <div style={{fontSize:10,color:'var(--text3)',marginTop:4}}>
                Guardado{cierre.cerrado_por?' por '+cierre.cerrado_por:''}
              </div>}
            </div>
          </div>
        </div>
      )}

      {/* ── CASHFLOW ACUMULADO ── */}
      {tab==='cashflow' && (
        <div className="card">
          <div className="ch"><div className="ct">Cashflow acumulado por canal</div>
            <span style={{fontSize:11,color:'var(--text3)'}}>Últimos 30 días</span></div>
          {historial.length===0
            ? <div style={{textAlign:'center',padding:'40px 0',color:'var(--text3)'}}>Sin cierres registrados</div>
            : <div style={{overflowX:'auto'}}>
                <table className="tbl" style={{minWidth:900}}>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th className="num">S.Ini Efvo</th>
                      <th className="num">+Ventas</th>
                      <th className="num">−Gastos</th>
                      <th className="num">Teórico</th>
                      <th className="num">Real Efvo</th>
                      <th className="num">Dif Efvo</th>
                      <th className="num" style={{color:'#378ADD'}}>S.Final Efvo</th>
                      <th className="num">TC Real</th>
                      <th className="num">Plat</th>
                      <th className="num">Utilidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historial.map(c=>(
                      <tr key={c.id} style={{cursor:'pointer'}} onClick={()=>{setFecha(c.fecha);setTab('cierre')}}>
                        <td style={{whiteSpace:'nowrap',fontSize:11,fontWeight:500}}>
                          {new Date(c.fecha+'T12:00').toLocaleDateString('es-MX',{weekday:'short',day:'numeric',month:'short'})}
                        </td>
                        <td className="num" style={{fontSize:11}}>{fmtM(c.saldo_inicial_efvo||0)}</td>
                        <td className="num" style={{fontSize:11,color:'#1D9E75'}}>{fmtM(c.sys_efvo||0)}</td>
                        <td className="num" style={{fontSize:11,color:'#E24B4A'}}>{fmtM(c.gastos_efvo||0)}</td>
                        <td className="num" style={{fontSize:11,color:'#378ADD'}}>{fmtM(c.teor_efvo||0)}</td>
                        <td className="num" style={{fontSize:11,fontWeight:600}}>{fmtM(c.efvo_real||0)}</td>
                        <td className="num" style={{fontSize:11,fontWeight:600,color:difColor(c.dif_efvo||0)}}>{difLabel(c.dif_efvo||0)}</td>
                        <td className="num" style={{fontSize:11,fontWeight:700,color:'#378ADD'}}>{fmtM(c.saldo_final_efvo||0)}</td>
                        <td className="num" style={{fontSize:11}}>{fmtM(c.tc_real||0)}</td>
                        <td className="num" style={{fontSize:11}}>{fmtM(c.plat_real||0)}</td>
                        <td className="num" style={{fontSize:11,fontWeight:600,color:(c.sys_total-c.gastos_total)>=0?'#1D9E75':'#E24B4A'}}>
                          {fmtM((c.sys_total||0)-(c.gastos_total||0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{fontWeight:700}}>
                      <td>TOTAL</td>
                      <td className="num">—</td>
                      <td className="num" style={{color:'#1D9E75'}}>{fmtM(historial.reduce((s,c)=>s+(c.sys_efvo||0),0))}</td>
                      <td className="num" style={{color:'#E24B4A'}}>{fmtM(historial.reduce((s,c)=>s+(c.gastos_efvo||0),0))}</td>
                      <td className="num">—</td>
                      <td className="num">{fmtM(historial.reduce((s,c)=>s+(c.efvo_real||0),0))}</td>
                      <td className="num">—</td>
                      <td className="num" style={{color:'#378ADD'}}>—</td>
                      <td className="num">{fmtM(historial.reduce((s,c)=>s+(c.tc_real||0),0))}</td>
                      <td className="num">{fmtM(historial.reduce((s,c)=>s+(c.plat_real||0),0))}</td>
                      <td className="num" style={{color:'#1D9E75'}}>{fmtM(historial.reduce((s,c)=>s+((c.sys_total||0)-(c.gastos_total||0)),0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
          }
        </div>
      )}

      {/* ── TRASPASOS ── */}
      {tab==='traspasos' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          {/* NUEVO TRASPASO */}
          <div className="card">
            <div className="ct" style={{marginBottom:14}}>Registrar traspaso</div>
            <div style={{fontSize:11,color:'var(--text2)',marginBottom:14,lineHeight:1.7}}>
              Mueve dinero entre cuentas — efectivo a banco, cobro de plataforma, depósito, etc.
              Los traspasos afectan el saldo final de cada cuenta al cerrar el día.
            </div>

            <div className="form-group" style={{marginBottom:10}}>
              <div className="form-label">Origen (de dónde sale)</div>
              <select className="form-input" value={fTraspaso.origen} onChange={e=>setFTraspaso(x=>({...x,origen:e.target.value}))}>
                <option>Efectivo</option>
                <option>Tarjeta</option>
                <option>Uber Eats</option>
                <option>Uber Chilakiles</option>
                <option>DiDi Food</option>
                <option>DiDi Chilakiles</option>
                <option>Rappi</option>
                <option>Ola</option>
              </select>
            </div>

            <div className="form-group" style={{marginBottom:10}}>
              <div className="form-label">Destino (a dónde va)</div>
              <select className="form-input" value={fTraspaso.destino} onChange={e=>setFTraspaso(x=>({...x,destino:e.target.value}))}>
                <option>Tarjeta</option>
                <option>Efectivo</option>
                <option>Banco (fuera del sistema)</option>
                <option>Uber Eats</option>
                <option>Uber Chilakiles</option>
                <option>DiDi Food</option>
                <option>DiDi Chilakiles</option>
                <option>Rappi</option>
                <option>Ola</option>
              </select>
            </div>

            <div className="form-group" style={{marginBottom:10}}>
              <div className="form-label">Monto</div>
              <input className="form-input" type="number" placeholder="0" value={fTraspaso.monto}
                onChange={e=>setFTraspaso(x=>({...x,monto:e.target.value}))}/>
            </div>

            <div className="form-group" style={{marginBottom:14}}>
              <div className="form-label">Concepto</div>
              <input className="form-input" type="text" placeholder="Depósito a banco, cobro Uber, retiro..." value={fTraspaso.concepto}
                onChange={e=>setFTraspaso(x=>({...x,concepto:e.target.value}))}/>
            </div>

            {fTraspaso.monto>0 && (
              <div style={{padding:'10px 12px',background:'#E6F1FB',borderRadius:'var(--r-md)',marginBottom:14,fontSize:11}}>
                <strong>{fTraspaso.origen}</strong> → <strong>{fTraspaso.destino}</strong>: <strong style={{color:'#185FA5'}}>{fmtM(parseFloat(fTraspaso.monto)||0)}</strong>
              </div>
            )}

            {!esViewer && (
              <button onClick={async()=>{
                if (!fTraspaso.monto || !fTraspaso.concepto) return
                setSavingTr(true)
                const { error } = await sb.from('traspasos_caja').insert({
                  fecha, origen:fTraspaso.origen, destino:fTraspaso.destino,
                  monto:parseFloat(fTraspaso.monto)||0, concepto:fTraspaso.concepto
                })
                if (!error) {
                  setFTraspaso(x=>({...x,monto:'',concepto:''}))
                  loadTraspasos(fecha)
                  loadSys(fecha)
                }
                setSavingTr(false)
              }} disabled={savingTr||!fTraspaso.monto||!fTraspaso.concepto}
                style={{width:'100%',padding:10,borderRadius:'var(--r-md)',border:'none',
                  background:'#378ADD',color:'#fff',cursor:'pointer',fontSize:13,fontWeight:600}}>
                {savingTr?'Registrando...':'Registrar traspaso'}
              </button>
            )}
          </div>

          {/* HISTORIAL TRASPASOS */}
          <div className="card">
            <div className="ch">
              <div className="ct">Traspasos del día</div>
              <span style={{fontSize:11,color:'var(--text3)'}}>{traspasos.length} movimientos</span>
            </div>
            {traspasos.length===0
              ? <div style={{textAlign:'center',padding:'30px 0',color:'var(--text3)',fontSize:11}}>Sin traspasos registrados hoy</div>
              : <table className="tbl">
                  <thead><tr><th>Origen</th><th>Destino</th><th className="num">Monto</th><th>Concepto</th>{role==='admin'&&<th></th>}</tr></thead>
                  <tbody>
                    {traspasos.map(t=>(
                      <tr key={t.id}>
                        <td><span style={{fontSize:10,padding:'1px 8px',borderRadius:99,background:'#E6F1FB',color:'#185FA5'}}>{t.origen}</span></td>
                        <td><span style={{fontSize:10,padding:'1px 8px',borderRadius:99,background:'#EAF3DE',color:'#3B6D11'}}>{t.destino}</span></td>
                        <td className="num" style={{fontWeight:600}}>{fmtM(t.monto)}</td>
                        <td style={{fontSize:11,color:'var(--text2)'}}>{t.concepto}</td>
                        {role==='admin' && <td>
                          <button onClick={async()=>{
                            if (!confirm('¿Eliminar este traspaso?')) return
                            await sb.from('traspasos_caja').delete().eq('id',t.id)
                            loadTraspasos(fecha)
                            loadSys(fecha)
                          }} style={{fontSize:10,padding:'1px 7px',borderRadius:'var(--r-sm)',border:'0.5px solid #E24B4A',color:'#E24B4A',background:'transparent',cursor:'pointer'}}>✕</button>
                        </td>}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{fontWeight:700}}>
                      <td colSpan={2}>Total movido</td>
                      <td className="num">{fmtM(traspasos.reduce((s,t)=>s+t.monto,0))}</td>
                      <td colSpan={role==='admin'?2:1}></td>
                    </tr>
                  </tfoot>
                </table>
            }
          </div>
        </div>
      )}

      {/* ── HISTORIAL ── */}
      {tab==='faltantes' && (
        <div className="card" style={{marginTop:12}}>
          <div className="ch">
            <div className="ct">Faltantes y sobrantes de caja</div>
            <button onClick={limpiarDuplicados} disabled={limpiando}
              style={{padding:'4px 12px',borderRadius:99,fontSize:11,cursor:'pointer',
                border:'1.5px solid #EF9F27',background:'transparent',color:'#EF9F27',
                opacity:limpiando?.6:1}}>
              {limpiando?'Limpiando…':'🧹 Limpiar duplicados'}
            </button>
          </div>
          <div style={{fontSize:11,color:'var(--text3)',padding:'0 0 10px 0',borderBottom:'0.5px solid var(--border)',marginBottom:10}}>
            Si los ajustes del KPI acumulado muestran montos incorrectos, usa "Limpiar duplicados" para corregir registros repetidos del histórico.
          </div>
          <FaltantesCajaReport />
        </div>
      )}

      {tab==='historial' && (
        <div className="card">
          <div className="ch"><div className="ct">Historial de cierres</div>
            <span style={{fontSize:11,color:'var(--text3)'}}>{historial.length} registros</span></div>
          <div style={{overflowX:'auto'}}>
            <table className="tbl" style={{minWidth:700}}>
              <thead>
                <tr><th>Fecha</th><th className="num">Ventas</th><th className="num">Gastos</th>
                  <th className="num">Utilidad</th><th className="num">Efvo real</th>
                  <th className="num">TC real</th><th className="num">Plat real</th>
                  <th>Estado</th><th>Cerrado por</th></tr>
              </thead>
              <tbody>
                {historial.map(c=>{
                  const dif=Math.abs(c.dif_efvo||0)+Math.abs(c.dif_tc||0)+Math.abs(c.dif_plat||0)
                  return (
                    <tr key={c.id} style={{cursor:'pointer'}} onClick={()=>{setFecha(c.fecha);setTab('cierre')}}>
                      <td style={{whiteSpace:'nowrap'}}>{new Date(c.fecha+'T12:00').toLocaleDateString('es-MX',{weekday:'short',day:'numeric',month:'short'})}</td>
                      <td className="num">{fmtM(c.sys_total)}</td>
                      <td className="num">{fmtM(c.gastos_total)}</td>
                      <td className="num" style={{color:(c.sys_total-c.gastos_total)>=0?'#1D9E75':'#E24B4A',fontWeight:600}}>{fmtM(c.sys_total-c.gastos_total)}</td>
                      <td className="num">{fmtM(c.efvo_real||0)}</td>
                      <td className="num">{fmtM(c.tc_real||0)}</td>
                      <td className="num">{fmtM(c.plat_real||0)}</td>
                      <td><span style={{fontSize:11,padding:'2px 8px',borderRadius:99,
                        background:dif<3?'#EAF3DE':dif<100?'#FFF9E6':'#FCEBEB',
                        color:dif<3?'#3B6D11':dif<100?'#8A5A00':'#A32D2D'}}>
                        {dif<3?'Cuadrado':dif<100?'Dif menor':'Revisar'}</span></td>
                      <td style={{fontSize:11,color:'var(--text2)'}}>{c.cerrado_por||'—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL — DIFERENCIAS EN CAJA (hasta 3 cajas simultáneas) */}
      {modalDifs && (
        <div onClick={()=>!saving&&setModalDifs(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,padding:16,overflowY:'auto'}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'var(--surface)',borderRadius:'var(--r-lg)',padding:24,maxWidth:520,width:'100%',boxShadow:'0 20px 50px rgba(0,0,0,0.3)'}}>
            <div style={{fontSize:17,fontWeight:700,marginBottom:4}}>⚖️ Diferencias encontradas</div>
            <div style={{fontSize:11,color:'var(--text2)',marginBottom:16}}>Define qué hacer con cada diferencia antes de guardar el cierre</div>

            {modalDifs.map(c=>{
              const dec = decisiones[c.caja]||'absorber'
              const col = c.caja==='Efectivo'?'#EF9F27':c.caja==='Tarjeta'?'#7F77DD':'#E24B4A'
              return (
                <div key={c.caja} style={{marginBottom:16,padding:14,borderRadius:'var(--r-md)',border:`1.5px solid ${col}22`,background:col+'0A'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                    <div style={{fontWeight:700,fontSize:13,color:col}}>
                      {c.caja==='Efectivo'?'💵':c.caja==='Tarjeta'?'💳':'🛵'} {c.caja}
                    </div>
                    <div style={{fontSize:18,fontWeight:800,color:c.tipo==='faltante'?'#E24B4A':'#1D9E75'}}>
                      {c.tipo==='faltante'?'−':'+' }{fmtM(c.monto)}
                      <span style={{fontSize:10,fontWeight:500,marginLeft:6}}>{c.tipo}</span>
                    </div>
                  </div>
                  <div style={{display:'flex',gap:8,marginBottom:8}}>
                    {['absorber','gasto'].map(opt=>(
                      <label key={opt} style={{flex:1,display:'flex',alignItems:'flex-start',gap:8,padding:'8px 10px',
                        border:`2px solid ${dec===opt?opt==='gasto'?'#E24B4A':'#3B82F6':'var(--border-md)'}`,
                        borderRadius:'var(--r-sm)',cursor:'pointer',
                        background:dec===opt?opt==='gasto'?'#FEF2F2':'#EFF6FF':'transparent'}}>
                        <input type="radio" name={'dec_'+c.caja} checked={dec===opt}
                          onChange={()=>setDecisiones(d=>({...d,[c.caja]:opt}))} style={{marginTop:2}}/>
                        <div>
                          <div style={{fontSize:12,fontWeight:600}}>
                            {opt==='absorber'?'Absorber en caja':c.tipo==='faltante'?'Registrar como gasto':'Registrar como ingreso'}
                          </div>
                          <div style={{fontSize:10,color:'var(--text3)',lineHeight:1.4}}>
                            {opt==='absorber'?'Solo se anota. No afecta P&L.':c.tipo==='faltante'?'Crea gasto "Ajuste caja". Afecta resultados.':'Crea ingreso "Ajuste caja". Afecta resultados.'}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <input type="text" placeholder="Nota (opcional)" value={notas[c.caja]||''}
                    onChange={e=>setNotas(n=>({...n,[c.caja]:e.target.value}))}
                    style={{width:'100%',padding:'6px 10px',border:'1px solid var(--border-md)',borderRadius:'var(--r-sm)',fontSize:11,background:'var(--surface)'}}/>
                </div>
              )
            })}

            <div style={{display:'flex',gap:8,marginTop:4}}>
              <button onClick={()=>setModalDifs(null)} disabled={saving}
                style={{flex:1,padding:'11px',borderRadius:'var(--r-md)',border:'1px solid var(--border-md)',background:'var(--surface)',color:'var(--text1)',fontSize:13,fontWeight:600,cursor:'pointer'}}>
                Cancelar
              </button>
              <button onClick={async()=>{
                await ejecutarGuardado({ decisiones, notas })
                setModalDifs(null)
              }} disabled={saving}
                style={{flex:2,padding:'11px',borderRadius:'var(--r-md)',border:'none',background:'#1D9E75',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',opacity:saving?0.6:1}}>
                {saving?'Guardando...':'Confirmar y guardar cierre'}
              </button>
            </div>
          </div>
        </div>
      )}
      </>}
    </div>
  )
}

// Componente de historial de faltantes/sobrantes
function FaltantesCajaReport() {
  const [faltantes, setFaltantes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    sb.from('faltantes_caja').select('*').order('fecha', { ascending: false }).then(({ data }) => {
      setFaltantes(data || [])
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="loading-screen" style={{height:100}}><div className="spinner"/></div>
  if (faltantes.length === 0) return <div style={{textAlign:'center',padding:30,color:'var(--text3)',fontSize:12}}>No hay faltantes ni sobrantes registrados</div>

  // Agrupar por mes
  const porMes = {}
  faltantes.forEach(f => {
    const mesKey = f.fecha.slice(0, 7)
    if (!porMes[mesKey]) porMes[mesKey] = { faltantes:0, sobrantes:0, registros:[] }
    const monto = parseFloat(f.monto) || 0
    if (f.tipo === 'faltante') porMes[mesKey].faltantes += monto
    else porMes[mesKey].sobrantes += monto
    porMes[mesKey].registros.push(f)
  })

  const totalFaltantes = faltantes.filter(f=>f.tipo==='faltante').reduce((s,f)=>s+(parseFloat(f.monto)||0), 0)
  const totalSobrantes = faltantes.filter(f=>f.tipo==='sobrante').reduce((s,f)=>s+(parseFloat(f.monto)||0), 0)

  return (
    <div>
      <div className="metrics" style={{gridTemplateColumns:'repeat(3,minmax(0,1fr))',marginBottom:14}}>
        <div className="mc">
          <div className="mc-label">Total faltantes</div>
          <div className="mc-value" style={{color:'#E24B4A'}}>{fmtM(totalFaltantes)}</div>
        </div>
        <div className="mc">
          <div className="mc-label">Total sobrantes</div>
          <div className="mc-value" style={{color:'#1D9E75'}}>{fmtM(totalSobrantes)}</div>
        </div>
        <div className="mc">
          <div className="mc-label">Neto</div>
          <div className="mc-value" style={{color:(totalSobrantes-totalFaltantes)>=0?'#1D9E75':'#E24B4A'}}>
            {fmtM(totalSobrantes - totalFaltantes)}
          </div>
        </div>
      </div>

      <div className="metrics" style={{gridTemplateColumns:'repeat(3,minmax(0,1fr))',marginBottom:14}}>
        {['Efectivo','Tarjeta','Plataforma'].map(c => {
          const falt = faltantes.filter(f=>f.caja===c && f.tipo==='faltante').reduce((s,f)=>s+(parseFloat(f.monto)||0),0)
          const sobr = faltantes.filter(f=>f.caja===c && f.tipo==='sobrante').reduce((s,f)=>s+(parseFloat(f.monto)||0),0)
          const neto = sobr - falt
          const col = c==='Efectivo'?'#EF9F27':c==='Tarjeta'?'#378ADD':'#7F77DD'
          return (
            <div key={c} className="mc" style={{borderLeft:`3px solid ${col}`}}>
              <div className="mc-label" style={{color:col,fontWeight:600}}>Neto {c}</div>
              <div className="mc-value" style={{color:neto>=0?'#1D9E75':'#E24B4A'}}>{fmtM(neto)}</div>
              <div style={{fontSize:10,color:'var(--text3)',marginTop:2}}>F: {fmtM(falt)} · S: {fmtM(sobr)}</div>
            </div>
          )
        })}
      </div>

      <table className="tbl" style={{fontSize:12}}>
        <thead><tr>
          <th>Mes</th>
          <th className="num">Faltantes</th>
          <th className="num">Sobrantes</th>
          <th className="num">Neto</th>
          <th className="num">Eventos</th>
        </tr></thead>
        <tbody>
          {Object.entries(porMes).sort((a,b)=>b[0].localeCompare(a[0])).map(([mes, d]) => (
            <tr key={mes}>
              <td style={{fontWeight:500}}>{mes}</td>
              <td className="num" style={{color:'#E24B4A'}}>{fmtM(d.faltantes)}</td>
              <td className="num" style={{color:'#1D9E75'}}>{fmtM(d.sobrantes)}</td>
              <td className="num" style={{fontWeight:600,color:(d.sobrantes-d.faltantes)>=0?'#1D9E75':'#E24B4A'}}>{fmtM(d.sobrantes-d.faltantes)}</td>
              <td className="num c-muted">{d.registros.length}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{marginTop:20,fontSize:12,fontWeight:600,marginBottom:8}}>Detalle de eventos</div>
      <table className="tbl" style={{fontSize:11}}>
        <thead><tr>
          <th>Fecha</th>
          <th>Caja</th>
          <th>Tipo</th>
          <th className="num">Monto</th>
          <th>Decisión</th>
          <th>Nota</th>
          <th>Registró</th>
        </tr></thead>
        <tbody>
          {faltantes.slice(0, 100).map(f => {
            const cajaColor = f.caja==='Efectivo'?'#EF9F27':f.caja==='Tarjeta'?'#378ADD':'#7F77DD'
            return (
            <tr key={f.id}>
              <td>{f.fecha}</td>
              <td><span style={{padding:'2px 8px',borderRadius:99,fontSize:10,fontWeight:600,background:cajaColor+'22',color:cajaColor}}>{f.caja||'Efectivo'}</span></td>
              <td><span style={{padding:'2px 8px',borderRadius:99,fontSize:10,fontWeight:600,background:f.tipo==='faltante'?'#FCEBEB':'#EAF3DE',color:f.tipo==='faltante'?'#A32D2D':'#3B6D11'}}>{f.tipo}</span></td>
              <td className="num" style={{color:f.tipo==='faltante'?'#E24B4A':'#1D9E75',fontWeight:600}}>{fmtM(f.monto)}</td>
              <td style={{fontSize:10,textTransform:'capitalize'}}>{f.decision}</td>
              <td style={{fontSize:10,color:'var(--text3)'}}>{f.nota || '—'}</td>
              <td style={{fontSize:10,color:'var(--text3)'}}>{f.registrado_por || '—'}</td>
            </tr>
          )})}
        </tbody>
      </table>
    </div>
  )
}

