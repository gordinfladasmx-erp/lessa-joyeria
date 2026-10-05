import React from 'react'

const RANGOS = [
  { id:'hoy',         label:'Hoy' },
  { id:'semana',      label:'Semana' },
  { id:'mes',         label:'Mes' },
  { id:'mes-ant',     label:'Mes ant.' },
  { id:'trim',        label:'Trimestre' },
  { id:'12m',         label:'12 meses' },
  { id:'18m',         label:'18 meses' },
  { id:'36m',         label:'36 meses' },
  { id:'anio-actual', label:'2026' },
  { id:'2025',        label:'2025' },
  { id:'2024',        label:'2024' },
  { id:'2023',        label:'2023' },
  { id:'rango',       label:'Rango' },
]

const GRANULARIDADES = [
  { id:'diario',     label:'Diario' },
  { id:'semanal',    label:'Semanal' },
  { id:'mensual',    label:'Mensual' },
  { id:'trimestral', label:'Trimestral' },
  { id:'anual',      label:'Anual' },
]

const VALID_GRAN = {
  hoy:['diario'], semana:['diario','semanal'], mes:['diario','semanal','mensual'], 'mes-ant':['diario','semanal','mensual'],
  trim:['semanal','mensual','trimestral'],
  '12m':['mensual','trimestral'], '18m':['mensual','trimestral'], '36m':['mensual','trimestral','anual'],
  'anio-actual':['mensual','trimestral'],
  '2025':['mensual','trimestral','anual'], '2024':['mensual','trimestral','anual'], '2023':['mensual','trimestral','anual'],
  rango:['diario','semanal','mensual','trimestral','anual'],
}

const DEFAULT_GRAN = {
  hoy:'diario', semana:'diario', mes:'mensual', 'mes-ant':'mensual', trim:'mensual',
  '12m':'mensual', '18m':'mensual', '36m':'mensual',
  'anio-actual':'mensual', '2025':'mensual', '2024':'mensual', '2023':'mensual', rango:'mensual',
}

export default function PeriodSwitcher({ rango, granularidad, onRango, onGranularidad, rangoDesde, rangoHasta, onRangoChange }) {
  const validGrans = VALID_GRAN[rango] || GRANULARIDADES.map(g=>g.id)
  const handleRango = (id) => {
    onRango(id)
    if (!(VALID_GRAN[id]||[]).includes(granularidad)) onGranularidad(DEFAULT_GRAN[id]||'mensual')
  }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <div style={{ display:'flex', gap:4, alignItems:'center', flexWrap:'wrap' }}>
        <span style={{ fontSize:10, color:'var(--text3)', marginRight:4, whiteSpace:'nowrap' }}>Ver:</span>
        <div className="period-sw" style={{flexWrap:'wrap'}}>
          {RANGOS.map(r => (
            <button key={r.id} className={`psw-btn${rango===r.id?' active':''}`} onClick={()=>handleRango(r.id)}>{r.label}</button>
          ))}
        </div>
      </div>
      {rango==='rango' && (
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <span style={{ fontSize:10, color:'var(--text3)' }}>Del</span>
          <input type="date" className="form-input" style={{ width:140, fontSize:11 }}
            value={rangoDesde||''} onChange={e=>onRangoChange&&onRangoChange(e.target.value, rangoHasta)}/>
          <span style={{ fontSize:10, color:'var(--text3)' }}>al</span>
          <input type="date" className="form-input" style={{ width:140, fontSize:11 }}
            value={rangoHasta||''} onChange={e=>onRangoChange&&onRangoChange(rangoDesde, e.target.value)}/>
        </div>
      )}
      <div style={{ display:'flex', gap:4, alignItems:'center', flexWrap:'wrap' }}>
        <span style={{ fontSize:10, color:'var(--text3)', marginRight:4, whiteSpace:'nowrap' }}>Ver por:</span>
        <div className="period-sw" style={{flexWrap:'wrap'}}>
          {GRANULARIDADES.filter(g=>validGrans.includes(g.id)).map(g => (
            <button key={g.id} className={`psw-btn${granularidad===g.id?' active':''}`} onClick={()=>onGranularidad(g.id)}>{g.label}</button>
          ))}
        </div>
      </div>
    </div>
  )
}
