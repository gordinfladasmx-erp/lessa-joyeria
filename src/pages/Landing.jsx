import { Link } from 'react-router-dom'
import '../styles/Landing.css'

export default function Landing() {
  return (
    <div className="landing">
      <div className="hero">
        <div className="hero-content">
          <h1>Lessa Joyería</h1>
          <p>Joyería de calidad para momentos especiales</p>
          <Link to="/catalogo" className="btn-primary">
            Ver catálogo
          </Link>
        </div>
      </div>

      <div className="features">
        <div className="feature">
          <div className="icon">✦</div>
          <h3>Diseños exclusivos</h3>
          <p>Colecciones únicas en acero y plata</p>
        </div>
        <div className="feature">
          <div className="icon">💎</div>
          <h3>Calidad garantizada</h3>
          <p>Materiales premium certificados</p>
        </div>
        <div className="feature">
          <div className="icon">🚚</div>
          <h3>Envío rápido</h3>
          <p>Entrega en 24-48 horas</p>
        </div>
      </div>

      <div className="contact-section" style={{marginBottom: '3rem'}}>
        <h2>¿Preguntas?</h2>
        <p>Contactanos por WhatsApp o email</p>
        <div className="contact-buttons">
          <a href="https://wa.me/524493876270" className="btn-whatsapp">
            💬 WhatsApp
          </a>
          <a href="mailto:alessandra.reyes04@gmail.com" className="btn-email">
            ✉ Email
          </a>
        </div>
      </div>

      <div style={{textAlign: 'center', padding: '2rem', borderTop: '1px solid #ddd'}}>
        <Link to="/admin" style={{color: '#999', textDecoration: 'none', fontSize: '0.9rem'}}>Administración</Link>
      </div>
    </div>
  )
}
