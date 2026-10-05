const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': 'https://chilakileando.netlify.app',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }

  // Verificar que el llamador es un usuario autenticado (cualquier rol)
  const authHeader = event.headers.authorization || ''
  const userToken = authHeader.replace('Bearer ', '')
  if (!userToken) return { statusCode: 401, headers, body: JSON.stringify({ error: 'No autorizado' }) }

  const roleRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_my_role`, {
    headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${userToken}` }
  })
  const role = await roleRes.text()
  const roleLimpio = role.replace(/"/g, '').trim()
  if (!['admin','mesero','viewer','demo'].includes(roleLimpio)) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'No autorizado' }) }
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
    })
    const data = await res.json()
    const usuarios = (data.users || [])
      .map(u => u.email)
      .filter(e => e && e.includes('@'))
      .map(e => ({ email: e, nombre: e.split('@')[0] }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))

    return { statusCode: 200, headers, body: JSON.stringify({ usuarios }) }
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) }
  }
}
