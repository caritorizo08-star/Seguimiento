import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY en las variables de entorno.')
}

// Sesión en sessionStorage: al cerrar la pestaña se cierra la sesión (equipo compartido / datos de clientes).
export const sb = createClient(supabaseUrl, supabaseKey, {
  auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true },
})
