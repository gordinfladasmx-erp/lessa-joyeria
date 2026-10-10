// Configuracion de la tienda. Para crear otra tienda con este mismo codigo, solo se cambia este archivo
// (y los logos en /public). Todo lo demas toma estos valores.
export const MARCA = {
  nombre: 'Lessa Joyería',          // nombre completo
  nombreCorto: 'Lessa',             // como se nombra en frases: "Lessa te confirmará..."
  subtitulo: 'joyería',             // texto pequeño debajo del logo grande del inicio ('' para no mostrarlo)
  logo: '/logo.png',                // cuadrado, para el menu, el login y los recibos
  wordmark: '/lessa-wordmark.png',  // logo grande sin fondo para la portada
  logoAncho: false,                 // true si el logo del menu es horizontal (no cuadrado)
  wordmarkMultiplicar: false,       // true si el logo tiene fondo blanco (se mezcla con el fondo de la portada)
  eslogan: 'El arte de lucir accesorios de calidad',
  descripcionPortada: 'Colecciones únicas e innovadoras para cada momento. Envíos locales y a toda la república.',
  anio: 2026,
  creditos: 'Powered by Aria by BP&S - Anthropic IA',
  claveCarrito: 'lessa_cart',
  archivoPrefijo: 'lessa',
}

export const CONTACTO = {
  whatsapp: '524493876360',               // con lada de pais, solo digitos
  whatsappVisible: '+52 449 387 6360',
  email: 'lessa.joyeria07@gmail.com',
  instagram: '@lessa_joyeria',
  instagramUrl: 'https://www.instagram.com/lessa_joyeria',
  web: 'https://lessa-joyeria.netlify.app',
  clabe: '638180010154516719',
}

// Colores de la marca. Se aplican como variables CSS al abrir la pagina.
export const COLORES = {
  primary: '#A01848',        // color principal historico (botones, titulos)
  primaryLight: '#E8C4D6',
  marca: '#970B3E',          // color principal de la portada y acentos
  marcaOscura: '#7d0933',
  marcaSuave: '#fbf4f7',     // fondos suaves
  marcaSuave2: '#fbeef3',
  heroFondo: '#F8D8D9',      // fondo de la foto/logo en la portada
  ctaA: '#FF7A00',           // degradado del boton "Agregar" de destacados
  ctaB: '#FF2E63',
  franja: '#231F1C',         // franja oscura de beneficios
  fondo: '#FAF7F2',          // fondo crema general
}
