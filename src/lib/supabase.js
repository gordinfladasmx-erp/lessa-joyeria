import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Faltan variables de entorno VITE_SUPABASE_URL y VITE_SUPABASE_KEY')
}

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    // Persiste sesión en localStorage (necesario para SPA)
    persistSession: true,
    // Refresca el token automáticamente antes de que expire
    autoRefreshToken: true,
    // Detecta la sesión desde la URL en flujos OAuth/magic-link
    detectSessionInUrl: true,
    // No exponer metadata sensible en storage key
    storageKey: 'erp_session',
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
  global: {
    headers: {
      // Identifica el cliente en logs de Supabase
      'x-app-name': 'chilakileando-erp',
    },
  },
})
