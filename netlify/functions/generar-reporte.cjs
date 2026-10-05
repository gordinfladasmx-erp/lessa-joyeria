// Netlify function que llama a Claude API para generar análisis estratégico
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': 'https://chilakileando.netlify.app',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Solo POST' }) }

  // Verificar autenticacion
  const authHeader = event.headers.authorization || ''
  const userToken = authHeader.replace('Bearer ', '')
  if (!userToken) return { statusCode: 401, headers, body: JSON.stringify({ error: 'No autorizado' }) }

  // Verificar rol admin
  const roleRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_my_role`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${userToken}` }
  })
  const role = await roleRes.text()
  if (!role.includes('admin')) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Solo admin' }) }

  if (!ANTHROPIC_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key no configurada' }) }
  }

  try {
    const { datos, secciones } = JSON.parse(event.body || '{}')

    // Construir prompt para Claude
    const prompt = `Eres un analista financiero estratégico para un restaurante mexicano "Chilakileando la Gordi'nflada" en Aguascalientes, Mexico.

DATOS DEL NEGOCIO (periodo ${datos.periodo || 'reciente'}):
- Ventas totales: $${(datos.kpi?.ventas||0).toLocaleString('es-MX')}
- Unidades vendidas: ${(datos.kpi?.unidades||0).toLocaleString('es-MX')}
- Gastos totales: $${(datos.kpi?.gastos||0).toLocaleString('es-MX')}
- Utilidad: $${(datos.kpi?.utilidad||0).toLocaleString('es-MX')}
- Margen: ${datos.kpi?.margen||0}%
- Ticket promedio: $${(datos.kpi?.ticket||0).toLocaleString('es-MX')}

TOP 5 PRODUCTOS POR VENTAS:
${(datos.topProductos||[]).slice(0,5).map((p,i)=>`${i+1}. ${p.producto}: $${(p.importe||0).toLocaleString('es-MX')} (${p.unidades||0} uds, margen ${p.margen||0}%)`).join('\n')}

GASTOS POR CATEGORIA:
${(datos.gastosCat||[]).map(g=>`- ${g.categoria}: $${(g.monto||0).toLocaleString('es-MX')} (${g.pct||0}%)`).join('\n')}

CANALES DE VENTA:
${(datos.canales||[]).map(c=>`- ${c.canal}: $${(c.importe||0).toLocaleString('es-MX')} (${c.pct||0}%)`).join('\n')}

INSTRUCCIONES:
Genera un análisis estratégico con las siguientes secciones (en JSON estructurado):

${secciones?.includes('resumen') ? '1. resumen_ejecutivo: 3-4 oraciones con los hallazgos más importantes\n' : ''}
${secciones?.includes('fortalezas') ? '2. fortalezas: array de 3-5 puntos fuertes del negocio\n' : ''}
${secciones?.includes('alertas') ? '3. alertas: array de 3-5 puntos que requieren atención inmediata\n' : ''}
${secciones?.includes('recomendaciones') ? '4. recomendaciones: array de 3-5 acciones concretas y específicas con impacto esperado\n' : ''}
${secciones?.includes('proyeccion') ? '5. proyeccion: análisis de tendencia y proyección a 3 meses (2-3 oraciones)\n' : ''}

Responde ÚNICAMENTE con JSON válido sin markdown, sin texto adicional. Formato:
{
  "resumen_ejecutivo": "...",
  "fortalezas": ["...", "..."],
  "alertas": ["...", "..."],
  "recomendaciones": ["...", "..."],
  "proyeccion": "..."
}`

    // Llamar a Claude API
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    if (!claudeRes.ok) {
      const errText = await claudeRes.text()
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Claude API error', details: errText }) }
    }

    const claudeData = await claudeRes.json()
    const text = claudeData.content?.[0]?.text || ''

    // Parsear JSON de respuesta
    let analisis
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      analisis = JSON.parse(jsonMatch ? jsonMatch[0] : text)
    } catch(e) {
      analisis = { raw: text, error: 'No se pudo parsear JSON' }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ analisis, usage: claudeData.usage })
    }
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) }
  }
}
