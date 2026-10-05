const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' }

  try {
    const authHeader = event.headers.authorization || ''
    const userToken = authHeader.replace('Bearer ', '')
    if (!userToken) return { statusCode: 401, headers, body: JSON.stringify({ error: 'No autorizado' }) }

    // Verificar rol del usuario
    const roleRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_my_role`, {
      headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${userToken}` }
    })
    const role = await roleRes.text()
    if (!role.includes('admin')) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Solo admin', roleRaw: role }) }

    const { action, userId, userData } = JSON.parse(event.body || '{}')

    let res, data
    if (action === 'list') {
      res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`, {
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      })
    } else if (action === 'create') {
      res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      })
    } else if (action === 'delete') {
      res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
      })
    } else if (action === 'update_password') {
      res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: userData.password })
      })
    } else if (action === 'update_modulos') {
      res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_metadata: { modulos_permitidos: userData.modulos_permitidos } })
      })
    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Acción no válida' }) }
    }

    data = await res.json()
    return { statusCode: res.status, headers, body: JSON.stringify(data) }

  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message, stack: e.stack }) }
  }
}
// Sat Jul 25 23:23:00 CST 2026
