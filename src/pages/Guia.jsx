import { MARCA } from '../config'
import { GUIA_HTML } from './guiaHtml'
import '../styles/Guia.css'

export default function Guia() {
  const html = GUIA_HTML
    .replaceAll('{{NOMBRE}}', MARCA.nombre)
    .replaceAll('{{CORTO}}', MARCA.nombreCorto)
    .replaceAll('{{WORDMARK}}', MARCA.wordmark)
  return <div className="guia" dangerouslySetInnerHTML={{ __html: html }} />
}
