import React from 'react'

const fmt = v => v == null ? '—' : typeof v === 'number'
  ? '$' + Math.round(v).toLocaleString('es-MX')
  : v

const fmtGhost = (value, prefix, suffix) => {
  if (value == null) return null
  if (typeof value === 'number') return prefix + Math.round(value).toLocaleString('es-MX') + suffix
  return value + suffix
}

export default function KpiCard({ label, value, sub, vs, prefix = '', suffix = '', loading, ghost }) {
  const vsClass = vs == null ? '' : vs >= 0 ? ' up' : ' dn'
  const vsText  = vs == null ? '' : `${vs >= 0 ? '+' : ''}${vs}% vs anterior`
  return (
    <div className="mc" style={{ position: 'relative', overflow: 'hidden' }}>
      <div className="mc-label">{label}</div>
      {loading
        ? <div className="spinner" style={{ margin: '6px 0' }} />
        : <div className="mc-value">{prefix}{typeof value === 'number' ? fmt(value).replace('$','') : (value ?? '—')}{suffix}</div>
      }
      {(sub || vsText) && !loading && (
        <div className={`mc-sub${vsClass}`}>{sub || vsText}</div>
      )}
      {ghost != null && !loading && (
        <div style={{
          position: 'absolute', bottom: 6, right: 8,
          fontSize: 12, fontWeight: 700,
          color: 'var(--text1)', opacity: 0.28,
          lineHeight: 1, pointerEvents: 'none',
          userSelect: 'none', letterSpacing: -0.5,
        }}>
          {fmtGhost(ghost, prefix, suffix)}
        </div>
      )}
    </div>
  )
}
