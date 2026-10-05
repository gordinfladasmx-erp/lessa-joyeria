import React, { useState, useEffect, useCallback } from 'react'
import { sb } from '../lib/supabase.js'
import PeriodSwitcher from '../components/PeriodSwitcher.jsx'
import { getRangoFechas } from '../lib/analytics.js'

const fmtM   = v => { const n = Math.round(v || 0); return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('es-MX') }
const fmtD   = v => (v > 0 ? '+' : '') + fmtM(v)
const fmtPct = (a, b) => b ? Math.round(a / b * 100) + '%' : '—'

const PAGE = 1000
async function fetchAllTable(table, select, from, to) {
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

// ── Sub-components ─────────────────────────────────────────────
function Fila({ label, value, color, bold, sub, note, indent = 0, noFmt }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      fontSize: sub ? 10 : 12, fontWeight: bold ? 700 : 400,
      color: color || 'var(--text1)', marginBottom: sub ? 3 : 6,
      paddingLeft: indent * 14,
    }}>
      <span style={{ color: sub ? 'var(--text3)' : 'inherit' }}>
        {label}
        {note && <span style={{ fontSize: 9, color: 'var(--text3)', marginLeft: 6 }}>({note})</span>}
      </span>
      <span style={{ fontWeight: bold ? 700 : 500, marginLeft: 10 }}>
        {noFmt ? value : fmtM(value)}
      </span>
    </div>
  )
}

function CausaBox({ icon, label, hint, value, valueColor, highlight }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '9px 12px', borderRadius: 'var(--r-sm)',
      background: highlight ? highlight + '18' : 'var(--bg)',
      border: `0.5px solid ${highlight || 'var(--border)'}`,
      marginBottom: 8,
    }}>
      <span style={{ fontSize: 16, lineHeight: 1.2, marginTop: 1 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2, lineHeight: 1.5 }}>{hint}</div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: valueColor, whiteSpace: 'nowrap', marginTop: 1 }}>
        {typeof value === 'string' ? value : fmtD(value)}
      </div>
    </div>
  )
}

function Paso({ titulo, filas, total, totalColor, totalLabel }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 'var(--r-sm)', background: 'var(--bg)', border: '0.5px solid var(--border)', marginBottom: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{titulo}</div>
      {filas.map((f, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4, color: f.color || 'var(--text1)' }}>
          <span>{f.label}</span>
          <span style={{ fontWeight: 600 }}>{f.signed ? fmtD(f.val) : fmtM(f.val)}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--border-md)', fontWeight: 700, fontSize: 12 }}>
        <span>{totalLabel || 'Resultado'}</span>
        <span style={{ color: totalColor || (total >= 0 ? '#1D9E75' : '#E24B4A') }}>{fmtM(total)}</span>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────
export default function Conciliacion() {
  const [rango,        setRango]        = useState('mes')
  const [granularidad, setGranularidad] = useState('mensual')
  const [rangoDesde,   setRangoDesde]   = useState('')
  const [rangoHasta,   setRangoHasta]   = useState('')
  const [data,         setData]         = useState(null)
  const [loading,      setLoading]      = useState(true)

  const load = useCallback(async () => {
    if (rango === 'rango' && (!rangoDesde || !rangoHasta)) return
    setLoading(true)
    setData(null)
    try {
      const { from, to } = getRangoFechas(rango, rangoDesde, rangoHasta)

      const CIERRE_FIELDS = [
        'fecha','sys_total','gastos_total',
        'sys_efvo','sys_tc','sys_plat',
        'gastos_efvo','gastos_tc',
        'efvo_real','tc_real','plat_real',
        'dif_efvo','dif_tc','dif_plat',
        'cerrado_por',
        // saldos finales (para Total Acumulado = lo que muestra Cierre del día)
        'saldo_final_efvo','saldo_final_tc',
        'saldo_fin_uber','saldo_fin_uber_chi',
        'saldo_fin_didi','saldo_fin_didi_chi',
        'saldo_fin_rappi','saldo_fin_ola',
        // saldos iniciales del día (para reconstruir saldo inicio del período)
        'saldo_inicial_efvo','saldo_inicial_tc',
        'saldo_ini_uber','saldo_ini_uber_chi',
        'saldo_ini_didi','saldo_ini_didi_chi',
        'saldo_ini_rappi','saldo_ini_ola',
      ].join(',')

      // También: cierre inmediatamente ANTERIOR al período (para saldo de inicio fiable)
      const SALDO_FIN_FIELDS = 'fecha,saldo_final_efvo,saldo_final_tc,efvo_real,tc_real,saldo_fin_uber,saldo_fin_uber_chi,saldo_fin_didi,saldo_fin_didi_chi,saldo_fin_rappi,saldo_fin_ola'

      const [ventas, gastos, cierres, prevCierreArr, traspasos] = await Promise.all([
        fetchAllTable('ventas', 'fecha,importe,metodo_pago,canal', from, to),
        fetchAllTable('gastos', 'fecha,monto,categoria_gasto,concepto,metodo_pago', from, to),
        fetchAllTable('cierres_dia', CIERRE_FIELDS, from, to),
        sb.from('cierres_dia').select(SALDO_FIN_FIELDS)
          .lt('fecha', from).order('fecha', { ascending: false }).limit(1),
        fetchAllTable('traspasos_caja', 'fecha,origen,destino,monto,concepto', from, to),
      ])
      const prevCierre = prevCierreArr?.data?.[0] || null

      // ── 1. P&L — tablas frescas ────────────────────────────────
      const plVentasBruto = ventas.reduce((s, v) => s + (parseFloat(v.importe) || 0), 0)
      const plGratis      = ventas.filter(v => v.metodo_pago === 'Gratis' || v.canal === 'Gratis')
                                  .reduce((s, v) => s + (parseFloat(v.importe) || 0), 0)
      const plVentas      = plVentasBruto - plGratis   // solo ventas cobradas

      const gComisiones = gastos.filter(g => g.categoria_gasto === 'Gasto de ventas')
      const gAjusteCaja = gastos.filter(g => g.categoria_gasto === 'Ajuste caja')
      const gFisicos    = gastos.filter(g =>
        g.categoria_gasto !== 'Gasto de ventas' && g.categoria_gasto !== 'Ajuste caja'
      )

      const plGastosTodos   = gastos.reduce((s, g) => s + (parseFloat(g.monto) || 0), 0)
      const plComisiones    = gComisiones.reduce((s, g) => s + (parseFloat(g.monto) || 0), 0)
      const plAjusteCaja    = gAjusteCaja.reduce((s, g) => s + (parseFloat(g.monto) || 0), 0)
      const plGastosFisicos = gFisicos.reduce((s, g) => s + (parseFloat(g.monto) || 0), 0)
      const plUtilidad      = plVentas - plGastosTodos - plAjusteCaja  // mismo criterio que Resultados

      const plComisionesTc = gComisiones.filter(g =>
        (g.concepto || '').toLowerCase().includes('clip') ||
        (g.concepto || '').toLowerCase().includes('tarjeta') ||
        (g.concepto || '').toLowerCase().includes('mixto')
      ).reduce((s, g) => s + (parseFloat(g.monto) || 0), 0)
      const plComisionesPlat = plComisiones - plComisionesTc
      const plMargen = plVentas > 0 ? Math.round(plUtilidad / plVentas * 100) : 0

      // ── 2. Cierre — datos guardados en cierres_dia ─────────────
      const cierreVentas   = cierres.reduce((s, c) => s + (parseFloat(c.sys_total) || 0), 0)
      const cierreGastos   = cierres.reduce((s, c) => s + (parseFloat(c.gastos_total) || 0), 0)
      const cierreUtilidad = cierreVentas - cierreGastos

      // ── 3. Saldo de cuentas — del ÚLTIMO cierre del período ────
      // efvo_real/tc_real son saldos acumulados diarios (no ingresos diarios).
      // Solo tiene sentido leer el ÚLTIMO cierre, que coincide con lo que
      // muestra "💰 Total acumulado" en el módulo Cierre del día.
      const PLAT_FIN_FIELDS = ['saldo_fin_uber','saldo_fin_uber_chi','saldo_fin_didi','saldo_fin_didi_chi','saldo_fin_rappi','saldo_fin_ola']
      const PLAT_INI_FIELDS = ['saldo_ini_uber','saldo_ini_uber_chi','saldo_ini_didi','saldo_ini_didi_chi','saldo_ini_rappi','saldo_ini_ola']

      const lastCierre = cierres.reduce((l, c) => (!l || c.fecha > l.fecha) ? c : l, null)

      // ── Saldo FIN: del último cierre del período ────────────────
      const saldoFinEfvo = parseFloat(lastCierre?.saldo_final_efvo) || parseFloat(lastCierre?.efvo_real) || 0
      const saldoFinTc   = parseFloat(lastCierre?.saldo_final_tc)   || parseFloat(lastCierre?.tc_real)   || 0
      const saldoFinPlat = PLAT_FIN_FIELDS.reduce((s, f) => s + (parseFloat(lastCierre?.[f]) || 0), 0)
      const saldoFin     = saldoFinEfvo + saldoFinTc + saldoFinPlat

      // ── Saldo INICIO: del último cierre ANTERIOR al período ─────
      // Usamos saldo_final_* del cierre previo (más fiable que saldo_inicial_*
      // del primer cierre del período, que pueden estar mal guardados).
      const saldoIniEfvo = parseFloat(prevCierre?.saldo_final_efvo) || parseFloat(prevCierre?.efvo_real) || 0
      const saldoIniTc   = parseFloat(prevCierre?.saldo_final_tc)   || parseFloat(prevCierre?.tc_real)   || 0
      const saldoIniPlat = PLAT_FIN_FIELDS.reduce((s, f) => s + (parseFloat(prevCierre?.[f]) || 0), 0)
      const saldoIni     = saldoIniEfvo + saldoIniTc + saldoIniPlat
      const prevFecha    = prevCierre?.fecha || ''

      // ── 4. Días con/sin cierre ─────────────────────────────────
      const diasConVentasSet = new Set(ventas.map(v => v.fecha))
      const diasConCierreSet = new Set(cierres.map(c => c.fecha))
      const diasSinCierre    = [...diasConVentasSet].filter(d => !diasConCierreSet.has(d)).sort()

      // ── 5. Retroactivos ────────────────────────────────────────
      const ventasRetro = plVentas - cierreVentas      // ventas en tabla vs guardadas en cierre
      const gastosRetro = plGastosFisicos - cierreGastos

      // ── 6. Flujo de efectivo ───────────────────────────────────────
      const flujoReal     = saldoFin - saldoIni          // cambio real en cuentas
      const flujoEsperado = cierreUtilidad               // flujo esperado según cierres
      const gapFlujo      = flujoEsperado - flujoReal    // > 0: menos cash que utilidad; < 0: más cash

      // ── 7. Tablas de detalle ───────────────────────────────────
      const canalMap = {}
      ventas.forEach(v => {
        const c = v.canal || v.metodo_pago || 'Sin dato'
        canalMap[c] = (canalMap[c] || 0) + (parseFloat(v.importe) || 0)
      })
      const byCanal = Object.entries(canalMap)
        .map(([canal, importe]) => ({ canal, importe: Math.round(importe) }))
        .sort((a, b) => b.importe - a.importe)

      const catMap = {}
      gastos.forEach(g => {
        const c = g.categoria_gasto || 'Sin categoría'
        catMap[c] = (catMap[c] || 0) + (parseFloat(g.monto) || 0)
      })
      const byCategoria = Object.entries(catMap)
        .map(([categoria, monto]) => ({ categoria, monto: Math.round(monto) }))
        .sort((a, b) => b.monto - a.monto)

      // ── 8. Traspasos ──────────────────────────────────────────
      const traspasosPorFecha = {}
      traspasos.forEach(t => {
        const key = t.fecha
        if (!traspasosPorFecha[key]) traspasosPorFecha[key] = []
        traspasosPorFecha[key].push(t)
      })
      const traspasosTotales = traspasos.reduce((s, t) => s + (parseFloat(t.monto) || 0), 0)
      // Agrupar por origen→destino
      const traspMap = {}
      traspasos.forEach(t => {
        const k = `${t.origen||'?'} → ${t.destino||'?'}`
        traspMap[k] = (traspMap[k] || 0) + (parseFloat(t.monto) || 0)
      })
      const traspasosPorRuta = Object.entries(traspMap)
        .map(([ruta, monto]) => ({ ruta, monto: Math.round(monto) }))
        .sort((a, b) => b.monto - a.monto)

      const cierresPorDia = cierres
        .map(c => ({
          fecha:     c.fecha,
          ventas:    parseFloat(c.sys_total) || 0,
          gastos:    parseFloat(c.gastos_total) || 0,
          utilidad:  (parseFloat(c.sys_total) || 0) - (parseFloat(c.gastos_total) || 0),
          difEfvo:   parseFloat(c.dif_efvo) || 0,
          difTc:     parseFloat(c.dif_tc) || 0,
          difPlat:   parseFloat(c.dif_plat) || 0,
          cerradoPor: c.cerrado_por || '—',
        }))
        .sort((a, b) => b.fecha.localeCompare(a.fecha))

      const cierresConDif = cierres.filter(c =>
        Math.abs(parseFloat(c.dif_efvo) || 0) >= 1 ||
        Math.abs(parseFloat(c.dif_tc) || 0) >= 1 ||
        Math.abs(parseFloat(c.dif_plat) || 0) >= 1
      ).length

      setData({
        from, to,
        // Número 1: P&L
        plVentasBruto: Math.round(plVentasBruto),
        plGratis: Math.round(plGratis),
        plVentas: Math.round(plVentas),
        plGastosTodos: Math.round(plGastosTodos),
        plGastosFisicos: Math.round(plGastosFisicos),
        plComisiones: Math.round(plComisiones),
        plComisionesTc: Math.round(plComisionesTc),
        plComisionesPlat: Math.round(plComisionesPlat),
        plAjusteCaja: Math.round(plAjusteCaja),
        plUtilidad: Math.round(plUtilidad),
        plMargen,
        // Número 2: Cierre utilidad
        cierreVentas: Math.round(cierreVentas),
        cierreGastos: Math.round(cierreGastos),
        cierreUtilidad: Math.round(cierreUtilidad),
        cierresConDif,
        // Número 3: Saldo de cuentas (= Total acumulado en Cierre del día)
        saldoFinEfvo: Math.round(saldoFinEfvo),
        saldoFinTc:   Math.round(saldoFinTc),
        saldoFinPlat: Math.round(saldoFinPlat),
        saldoFin:     Math.round(saldoFin),
        saldoIni:     Math.round(saldoIni),
        saldoIniEfvo: Math.round(saldoIniEfvo),
        saldoIniTc:   Math.round(saldoIniTc),
        saldoIniPlat: Math.round(saldoIniPlat),
        flujoReal:    Math.round(flujoReal),
        flujoEsperado:Math.round(flujoEsperado),
        gapFlujo:     Math.round(gapFlujo),
        lastFecha:     lastCierre?.fecha || '',
        prevFecha,
        hasPrevCierre: !!prevCierre,
        // Retroactivos
        ventasRetro: Math.round(ventasRetro),
        gastosRetro: Math.round(gastosRetro),
        // Días
        diasConVentas: diasConVentasSet.size,
        diasConCierre: diasConCierreSet.size,
        diasSinCierre,
        // Detalle
        byCanal,
        byCategoria,
        cierresPorDia,
        // Traspasos
        traspasos,
        traspasosTotales: Math.round(traspasosTotales),
        traspasosPorRuta,
      })
    } catch (e) { console.error('Conciliacion error:', e) }
    setLoading(false)
  }, [rango, rangoDesde, rangoHasta])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>
  if (!data)   return null

  const {
    plVentasBruto, plGratis,
    plVentas, plGastosTodos, plGastosFisicos, plComisiones,
    plComisionesTc, plComisionesPlat, plAjusteCaja, plUtilidad, plMargen,
    cierreVentas, cierreGastos, cierreUtilidad, cierresConDif,
    saldoFinEfvo, saldoFinTc, saldoFinPlat, saldoFin,
    saldoIni, saldoIniEfvo, saldoIniTc, saldoIniPlat,
    flujoReal, flujoEsperado, gapFlujo,
    lastFecha, prevFecha, hasPrevCierre,
    ventasRetro, gastosRetro,
    diasConVentas, diasConCierre, diasSinCierre,
    byCanal, byCategoria, cierresPorDia,
    traspasos, traspasosTotales, traspasosPorRuta,
  } = data

  // P&L vs Cierre: positivo = P&L > cierre
  const diffPLvsCierre = plUtilidad - cierreUtilidad

  const fmtFecha = f => f ? new Date(f + 'T12:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long' }) : '—'

  return (
    <div>
      {/* ── SELECTOR ── */}
      <div style={{ marginBottom: 14 }}>
        <PeriodSwitcher
          rango={rango} granularidad={granularidad}
          onRango={setRango} onGranularidad={setGranularidad}
          rangoDesde={rangoDesde} rangoHasta={rangoHasta}
          onRangoChange={(d, h) => { setRangoDesde(d); setRangoHasta(h) }}
        />
      </div>

      {/* ── DOS CIFRAS PRINCIPALES ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        {/* Utilidad */}
        <div style={{ padding: '14px 16px', borderRadius: 'var(--r-lg)', background: '#EBF2FC', border: '1.5px solid #378ADD44' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#185FA5', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            📊 Ganancia del período
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#185FA5', lineHeight: 1 }}>{fmtM(plUtilidad)}</div>
          <div style={{ fontSize: 10, color: '#378ADD', marginTop: 4 }}>Ventas − gastos − ajuste − no cobrado · Margen {plMargen}%</div>
          <div style={{ fontSize: 9, color: '#378ADD', marginTop: 2 }}>Mismo número que Resultados</div>
        </div>

        {/* Dinero en cuentas */}
        <div style={{ padding: '14px 16px', borderRadius: 'var(--r-lg)', background: '#EAF3DE', border: '1.5px solid #C0DD97' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#3B6D11', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            💰 Dinero en cuentas al {fmtFecha(lastFecha)}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#3B6D11', lineHeight: 1 }}>{fmtM(saldoFin)}</div>
          <div style={{ fontSize: 10, color: '#639922', marginTop: 4 }}>
            Efectivo {fmtM(saldoFinEfvo)} · Tarjeta {fmtM(saldoFinTc)} · Plataformas {fmtM(saldoFinPlat)}
          </div>
          <div style={{ fontSize: 9, color: '#639922', marginTop: 2 }}>
            Acumulado desde inicio — igual que "Total acumulado" en Cierre del día
          </div>
        </div>
      </div>

      {/* ── ECUACIÓN MAESTRA ── */}
      {(() => {
        // La ecuación fundamental:  Saldo_inicio + P&L_utilidad = Saldo_fin
        const saldoEsperado = saldoIni + plUtilidad
        const gapMaestro    = saldoEsperado - saldoFin   // debe ser ~0
        const ok            = Math.abs(gapMaestro) < 300

        // Causas del gap P&L vs Cierre
        const gapPLvsCierre = plUtilidad - cierreUtilidad

        return (
          <div className="card" style={{ marginBottom: 12, border: `1.5px solid ${ok ? '#C0DD97' : '#EF9F2766'}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
              ⚖️ ¿Cuadra todo?
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.6 }}>
              Dinero al inicio del período + lo que ganaste = dinero que debes tener ahora.
              Si esta suma coincide con el saldo real en cuentas, todo está en orden.
            </div>

            {/* Ecuación visual */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr auto 1fr', gap: 6, alignItems: 'center', marginBottom: 16 }}>
              {/* Inicio */}
              <div style={{ textAlign: 'center', padding: '10px 8px', borderRadius: 'var(--r-md)', background: '#EBF2FC', border: '1px solid #378ADD33' }}>
                <div style={{ fontSize: 9, color: '#185FA5', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>
                  Dinero al inicio{prevFecha ? <><br/>{fmtFecha(prevFecha)}</> : ''}
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: saldoIni < 0 ? '#E24B4A' : '#185FA5' }}>{fmtM(saldoIni)}</div>
                <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>
                  {saldoIni < 0 ? 'débito pendiente' : 'saldo previo al período'}
                </div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1D9E75', textAlign: 'center' }}>+</div>
              {/* Ganancia */}
              <div style={{ textAlign: 'center', padding: '10px 8px', borderRadius: 'var(--r-md)', background: '#E9F7F1', border: '1px solid #1D9E7533' }}>
                <div style={{ fontSize: 9, color: '#166843', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Ganancia<br/>del período</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#166843' }}>{fmtM(plUtilidad)}</div>
                <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>lo que generaste</div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text3)', textAlign: 'center' }}>=</div>
              {/* Esperado */}
              <div style={{ textAlign: 'center', padding: '10px 8px', borderRadius: 'var(--r-md)', background: 'var(--bg)', border: '1px dashed var(--border-md)' }}>
                <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Deberías<br/>tener</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text2)' }}>{fmtM(saldoEsperado)}</div>
                <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>inicio + ganancia</div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text3)', textAlign: 'center' }}>≈</div>
              {/* Real */}
              <div style={{ textAlign: 'center', padding: '10px 8px', borderRadius: 'var(--r-md)', background: '#EAF3DE', border: `1.5px solid ${ok ? '#1D9E75' : '#EF9F27'}` }}>
                <div style={{ fontSize: 9, color: '#3B6D11', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Tienes<br/>{lastFecha ? fmtFecha(lastFecha) : 'ahora'}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#3B6D11' }}>{fmtM(saldoFin)}</div>
                <div style={{ fontSize: 9, color: ok ? '#3B6D11' : '#EF9F27', marginTop: 2, fontWeight: 700 }}>
                  {ok ? '✓ cuadra' : `dif ${fmtM(Math.abs(gapMaestro))}`}
                </div>
              </div>
            </div>

            {/* Veredicto */}
            <div style={{
              padding: '10px 14px', borderRadius: 'var(--r-md)',
              background: ok ? '#EAF3DE' : '#FFF9E6',
              border: `0.5px solid ${ok ? '#C0DD97' : '#EF9F27'}`,
            }}>
              {ok ? (
                <div style={{ fontSize: 12, color: '#3B6D11', fontWeight: 600 }}>
                  ✓ Todo cuadra — el dinero en cuentas coincide con lo que deberías tener.
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#8A5A00' }}>
                  <strong>Diferencia de {fmtM(Math.abs(gapMaestro))}</strong> — deberías tener {fmtM(saldoEsperado)} pero hay {fmtM(saldoFin)}.
                  {!hasPrevCierre && ' No hay cierre previo al período para calcular el saldo inicial.'}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── DESGLOSE ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div className="card">
          <div className="ct" style={{ marginBottom: 10 }}>Ingresos por canal (P&L)</div>
          <table className="tbl">
            <thead><tr><th>Canal</th><th className="num">Importe</th><th className="num">%</th></tr></thead>
            <tbody>
              {byCanal.map(r => (
                <tr key={r.canal}>
                  <td style={{ fontSize: 11 }}>{r.canal}</td>
                  <td className="num">{fmtM(r.importe)}</td>
                  <td className="num c-muted">{fmtPct(r.importe, plVentas)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 600, borderTop: '1px solid var(--border-md)' }}>
                <td>Total</td><td className="num">{fmtM(plVentas)}</td><td className="num">100%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="ct" style={{ marginBottom: 10 }}>Gastos por categoría (P&L)</div>
          <table className="tbl">
            <thead><tr><th>Categoría</th><th className="num">Monto</th><th className="num">%</th></tr></thead>
            <tbody>
              {byCategoria.map(r => {
                const isC = r.categoria === 'Gasto de ventas'
                const isA = r.categoria === 'Ajuste caja'
                return (
                  <tr key={r.categoria} style={{ background: isC ? '#FFF9E633' : isA ? '#EEF0FF33' : 'transparent' }}>
                    <td style={{ fontSize: 11 }}>
                      {isC && <span style={{ fontSize: 9, background: '#EF9F27', color: '#fff', padding: '1px 5px', borderRadius: 99, marginRight: 4 }}>↓ no en cierre</span>}
                      {isA && <span style={{ fontSize: 9, background: '#7F77DD', color: '#fff', padding: '1px 5px', borderRadius: 99, marginRight: 4 }}>↓ no en cierre</span>}
                      {r.categoria}
                    </td>
                    <td className="num">{fmtM(r.monto)}</td>
                    <td className="num c-muted">{fmtPct(r.monto, plGastosTodos)}</td>
                  </tr>
                )
              })}
              <tr style={{ fontWeight: 600, borderTop: '1px solid var(--border-md)' }}>
                <td>Total</td><td className="num">{fmtM(plGastosTodos)}</td><td className="num">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── CIERRES POR DÍA ── */}
      {cierresPorDia.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="ch">
            <div className="ct">Cierres por día — ventas y gastos guardados</div>
            <div style={{ fontSize: 10, color: 'var(--text3)' }}>
              {cierresPorDia.length} registros{cierresConDif > 0 ? ` · ${cierresConDif} con diferencias` : ''}
            </div>
          </div>
          <div style={{ overflowX: 'auto', maxHeight: 380, overflowY: 'auto' }}>
            <table className="tbl" style={{ minWidth: 520 }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)' }}>
                <tr>
                  <th>Fecha</th>
                  <th className="num">Ventas guardadas</th>
                  <th className="num">Gastos guardados</th>
                  <th className="num">Utilidad</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {cierresPorDia.map(c => {
                  const dif = Math.abs(c.difEfvo) + Math.abs(c.difTc) + Math.abs(c.difPlat)
                  return (
                    <tr key={c.fecha}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 11, fontWeight: 500 }}>
                        {new Date(c.fecha + 'T12:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </td>
                      <td className="num">{fmtM(c.ventas)}</td>
                      <td className="num">{fmtM(c.gastos)}</td>
                      <td className={`num ${c.utilidad >= 0 ? 'c-green' : 'c-red'}`} style={{ fontWeight: 600 }}>{fmtM(c.utilidad)}</td>
                      <td>
                        <span style={{
                          fontSize: 10, padding: '2px 7px', borderRadius: 99,
                          background: dif < 3 ? '#EAF3DE' : dif < 200 ? '#FFF9E6' : '#FCEBEB',
                          color:      dif < 3 ? '#3B6D11' : dif < 200 ? '#8A5A00' : '#A32D2D',
                        }}>
                          {dif < 3 ? '✓ Cuadrado' : dif < 200 ? `Dif ${fmtM(dif)}` : `Revisar ${fmtM(dif)}`}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border-md)' }}>
                  <td>{cierresPorDia.length} días</td>
                  <td className="num">{fmtM(cierreVentas)}</td>
                  <td className="num">{fmtM(cierreGastos)}</td>
                  <td className="num c-green">{fmtM(cierreUtilidad)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          {diasSinCierre.length > 0 && (
            <div style={{ marginTop: 10, padding: '8px 10px', background: '#FFF9E6', borderRadius: 'var(--r-sm)', border: '0.5px solid #EF9F27', fontSize: 10 }}>
              <strong>⚠️ {diasSinCierre.length} días con ventas sin cierre registrado:</strong>{' '}
              {diasSinCierre.map(d => fmtFecha(d)).join(', ')}
              <div style={{ color: 'var(--text3)', marginTop: 3 }}>Solo aparecen en P&L. Para cuadrar, registra el cierre de esos días.</div>
            </div>
          )}
        </div>
      )}

      {/* ── TRASPASOS ── */}
      {traspasos.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="ch">
            <div className="ct">↔️ Traspasos entre cuentas</div>
            <div style={{ fontSize: 10, color: 'var(--text3)' }}>
              {traspasos.length} movimiento{traspasos.length !== 1 ? 's' : ''} · {fmtM(traspasosTotales)} total
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 10, lineHeight: 1.6 }}>
            Los traspasos mueven dinero entre tus propias cuentas — no son ingresos ni gastos, no afectan la utilidad.
          </div>
          {/* Resumen por ruta */}
          {traspasosPorRuta.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {traspasosPorRuta.map(r => (
                <div key={r.ruta} style={{
                  padding: '6px 10px', borderRadius: 'var(--r-sm)',
                  background: 'var(--bg)', border: '0.5px solid var(--border)',
                  fontSize: 11,
                }}>
                  <span style={{ color: 'var(--text3)' }}>{r.ruta}</span>
                  <span style={{ fontWeight: 700, marginLeft: 8 }}>{fmtM(r.monto)}</span>
                </div>
              ))}
            </div>
          )}
          {/* Detalle */}
          <div style={{ overflowX: 'auto', maxHeight: 300, overflowY: 'auto' }}>
            <table className="tbl" style={{ minWidth: 420 }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)' }}>
                <tr>
                  <th>Fecha</th>
                  <th>Origen</th>
                  <th>Destino</th>
                  <th className="num">Monto</th>
                  <th>Concepto</th>
                </tr>
              </thead>
              <tbody>
                {[...traspasos].sort((a,b) => b.fecha.localeCompare(a.fecha)).map((t, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 11 }}>
                      {new Date(t.fecha + 'T12:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </td>
                    <td style={{ fontSize: 11 }}>{t.origen || '—'}</td>
                    <td style={{ fontSize: 11 }}>{t.destino || '—'}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{fmtM(t.monto)}</td>
                    <td style={{ fontSize: 10, color: 'var(--text3)' }}>{t.concepto || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border-md)' }}>
                  <td colSpan={3}>{traspasos.length} traspasos</td>
                  <td className="num">{fmtM(traspasosTotales)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── NOTA ── */}
      <div className="card" style={{ background: 'var(--bg)', border: '0.5px solid var(--border)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8 }}>📌 Cómo leer estas cifras</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 10, color: 'var(--text2)', lineHeight: 1.8 }}>
          <div>
            <strong style={{ color: '#185FA5' }}>Ganancia del período</strong><br />
            Lo que generaste: ventas cobradas menos todos los gastos. Es el mismo número que ves en Resultados. No incluye el dinero que ya tenías antes.
          </div>
          <div>
            <strong style={{ color: '#3B6D11' }}>Dinero en cuentas</strong><br />
            Efectivo en caja + lo que tienes en terminal de tarjeta + saldo pendiente en plataformas (Uber, etc.). Incluye lo que había antes del período.
          </div>
        </div>
      </div>
    </div>
  )
}
