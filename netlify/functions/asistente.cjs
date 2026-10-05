const SUPABASE_URL   = process.env.VITE_SUPABASE_URL
const ANON_KEY        = process.env.VITE_SUPABASE_ANON_KEY
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY

const TOOLS = [
  {
    name: 'ventas_totales',
    description: 'Suma ventas (importe en pesos y unidades vendidas) en un rango de fechas, opcionalmente filtrando por texto del nombre de producto. Usa esto para "cuanto vendimos el [fecha/rango]" o "cuanto vendimos de [producto]".',
    input_schema: {
      type: 'object',
      properties: {
        fecha_desde: { type: 'string', description: 'YYYY-MM-DD, inclusive' },
        fecha_hasta: { type: 'string', description: 'YYYY-MM-DD, inclusive' },
        producto_contiene: { type: 'string', description: 'Texto para filtrar por nombre de producto (opcional)' },
      },
      required: ['fecha_desde', 'fecha_hasta'],
    },
  },
  {
    name: 'insumos_stock',
    description: 'Busca el stock actual de uno o varios insumos/productos de almacen por nombre (busqueda parcial, sin distinguir mayusculas/acentos). Usa esto para "cuantas/cuantos [insumo] hay" o "que stock tenemos de [x]".',
    input_schema: {
      type: 'object',
      properties: { nombre_contiene: { type: 'string' } },
      required: ['nombre_contiene'],
    },
  },
  {
    name: 'gastos_totales',
    description: 'Suma gastos en un rango de fechas, opcionalmente filtrando por texto del concepto. Desglosa por metodo de pago.',
    input_schema: {
      type: 'object',
      properties: {
        fecha_desde: { type: 'string' },
        fecha_hasta: { type: 'string' },
        concepto_contiene: { type: 'string' },
      },
      required: ['fecha_desde', 'fecha_hasta'],
    },
  },
]

async function sbSelect(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  })
  if (!res.ok) throw new Error(`Supabase error ${res.status}: ${await res.text()}`)
  return res.json()
}

async function runTool(name, input) {
  if (name === 'ventas_totales') {
    let q = `ventas?select=producto,unidades,importe&fecha=gte.${input.fecha_desde}&fecha=lte.${input.fecha_hasta}`
    if (input.producto_contiene) q += `&producto=ilike.*${encodeURIComponent(input.producto_contiene)}*`
    const rows = await sbSelect(q)
    const total_importe  = rows.reduce((s, r) => s + (parseFloat(r.importe) || 0), 0)
    const total_unidades = rows.reduce((s, r) => s + (parseFloat(r.unidades) || 0), 0)
    const porProducto = {}
    rows.forEach(r => {
      const k = r.producto || '?'
      if (!porProducto[k]) porProducto[k] = { producto: k, unidades: 0, importe: 0 }
      porProducto[k].unidades += r.unidades || 0
      porProducto[k].importe  += parseFloat(r.importe) || 0
    })
    const desglose_top15 = Object.values(porProducto).sort((a, b) => b.importe - a.importe).slice(0, 15)
    return { total_importe, total_unidades, num_registros: rows.length, desglose_top15 }
  }
  if (name === 'insumos_stock') {
    const q = `insumos?select=nombre,stock_actual,unidad,stock_minimo,categoria&nombre=ilike.*${encodeURIComponent(input.nombre_contiene)}*`
    const rows = await sbSelect(q)
    return { resultados: rows }
  }
  if (name === 'gastos_totales') {
    let q = `gastos?select=monto,metodo_pago,concepto&fecha=gte.${input.fecha_desde}&fecha=lte.${input.fecha_hasta}`
    if (input.concepto_contiene) q += `&concepto=ilike.*${encodeURIComponent(input.concepto_contiene)}*`
    const rows = await sbSelect(q)
    const total_monto = rows.reduce((s, r) => s + (parseFloat(r.monto) || 0), 0)
    const por_metodo_pago = {}
    rows.forEach(r => {
      const k = r.metodo_pago || '?'
      por_metodo_pago[k] = (por_metodo_pago[k] || 0) + (parseFloat(r.monto) || 0)
    })
    return { total_monto, num_registros: rows.length, por_metodo_pago }
  }
  throw new Error('Herramienta desconocida: ' + name)
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': 'https://chilakileando.netlify.app',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) }

  const authHeader = event.headers.authorization || ''
  const userToken = authHeader.replace('Bearer ', '')
  if (!userToken) return { statusCode: 401, headers, body: JSON.stringify({ error: 'No autorizado' }) }

  const roleRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_my_role`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${userToken}` },
  })
  const roleLimpio = (await roleRes.text()).replace(/"/g, '').trim()
  if (!['admin', 'mesero', 'viewer'].includes(roleLimpio)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'No autorizado' }) }
  }

  let pregunta
  try { ({ pregunta } = JSON.parse(event.body || '{}')) } catch { /* noop */ }
  if (!pregunta || typeof pregunta !== 'string') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Falta "pregunta"' }) }
  }
  if (!ANTHROPIC_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Falta configurar ANTHROPIC_API_KEY en Netlify' }) }
  }

  const hoy = new Date().toISOString().slice(0, 10)
  const messages = [{ role: 'user', content: pregunta }]

  try {
    for (let i = 0; i < 5; i++) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: 1024,
          system: `Eres el asistente de datos de Chilakileando, un restaurante. Hoy es ${hoy}. Responde en español, breve y directo, con cifras claras (usa $ para pesos mexicanos, separador de miles). Usa las herramientas disponibles para consultar datos reales antes de responder — nunca inventes cifras. Si preguntan por una fecha relativa ("hace un año", "la semana pasada", "el mes pasado"), calcula tu mismo el rango exacto de fechas a partir de hoy antes de llamar la herramienta.`,
          tools: TOOLS,
          messages,
        }),
      })
      if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`)
      const data = await res.json()
      messages.push({ role: 'assistant', content: data.content })

      if (data.stop_reason === 'tool_use') {
        const toolResults = []
        for (const block of data.content) {
          if (block.type === 'tool_use') {
            let result
            try { result = await runTool(block.name, block.input) }
            catch (e) { result = { error: e.message } }
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
          }
        }
        messages.push({ role: 'user', content: toolResults })
        continue
      }

      const textBlock = data.content.find(b => b.type === 'text')
      return { statusCode: 200, headers, body: JSON.stringify({ respuesta: textBlock?.text || '' }) }
    }
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Demasiadas consultas encadenadas, intenta reformular la pregunta' }) }
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) }
  }
}
