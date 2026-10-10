import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { MARCA, COLORES } from './config'
import './index.css'

const raiz = document.documentElement
const variables = {
  '--primary': COLORES.primary, '--primary-light': COLORES.primaryLight, '--marca': COLORES.marca,
  '--marca-oscura': COLORES.marcaOscura, '--marca-suave': COLORES.marcaSuave, '--marca-suave2': COLORES.marcaSuave2,
  '--hero-fondo': COLORES.heroFondo, '--cta-a': COLORES.ctaA, '--cta-b': COLORES.ctaB,
  '--franja': COLORES.franja, '--fondo': COLORES.fondo,
}
Object.entries(variables).forEach(([k, v]) => raiz.style.setProperty(k, v))
document.title = MARCA.nombre

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
