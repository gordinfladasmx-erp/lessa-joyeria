import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { fotoUrl, fotoGrandeUrl } from '../lib/store'
import { MARCA } from '../config'

function Lightbox({ sku, nombre, onCerrar }) {
  const [acercada, setAcercada] = useState(false)
  const [src, setSrc] = useState(fotoGrandeUrl(sku))

  useEffect(() => {
    const tecla = (e) => e.key === 'Escape' && onCerrar()
    document.addEventListener('keydown', tecla)
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = previo
    }
  }, [onCerrar])

  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={`Foto ampliada de ${nombre}`} onClick={onCerrar}>
      <button type="button" className="lightbox-cerrar" onClick={onCerrar} aria-label="Cerrar foto">
        <span aria-hidden="true">✕</span> Cerrar
      </button>
      <div className="lightbox-lienzo" onClick={(e) => e.stopPropagation()}>
        <img
          src={src}
          alt={nombre}
          className={acercada ? 'acercada' : ''}
          onError={() => setSrc(fotoUrl(sku))}
          onClick={() => setAcercada(!acercada)}
        />
      </div>
      <p className="lightbox-pie" onClick={(e) => e.stopPropagation()}>
        {nombre} <span>{acercada ? 'Toca la foto para alejar' : 'Toca la foto para acercar y ver más detalle'}</span>
      </p>
    </div>,
    document.body
  )
}

export function BotonAmpliar({ sku, nombre, chico = false }) {
  const [abierta, setAbierta] = useState(false)
  return (
    <>
      <button
        type="button"
        className={`btn-ampliar ${chico ? 'chico' : ''}`}
        title="Ampliar foto"
        aria-label={`Ampliar foto de ${nombre}`}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAbierta(true) }}
      >
        <svg width={chico ? 15 : 20} height={chico ? 15 : 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M21 21l-5.2-5.2" />
          <path d="M10.5 8v5M8 10.5h5" />
        </svg>
      </button>
      {abierta && <Lightbox sku={sku} nombre={nombre} onCerrar={() => setAbierta(false)} />}
    </>
  )
}

export default function Foto({ sku, nombre }) {
  const [error, setError] = useState(false)
  if (error) {
    return (
      <div className="foto-placeholder">
        <img src={MARCA.logo} alt="" />
      </div>
    )
  }
  return (
    <>
      <img src={fotoUrl(sku)} alt={nombre} loading="lazy" onError={() => setError(true)} />
      <BotonAmpliar sku={sku} nombre={nombre} />
    </>
  )
}
