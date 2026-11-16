// Edge Function: administración de usuarios de la app Seguimiento.
// Solo la puede usar un administrador activo. Usa la clave de servicio (variable de entorno
// que Supabase pone en el servidor); esa clave nunca se envía al navegador.
//
// Acciones (POST JSON):
//   { accion: 'crear', nombre, email, clave, rol, id_supervisor }
//   { accion: 'restablecer', user_id, clave }
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Clave de servicio que Supabase inyecta en el servidor (nombre clásico o el del sistema nuevo de claves). */
function claveServicio(): string {
  const directa = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY')
  if (directa) return directa
  const varias = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (varias) {
    try { const o = JSON.parse(varias); const v = Array.isArray(o) ? o[0] : Object.values(o)[0]; if (typeof v === 'string') return v } catch { /* no es JSON */ }
    return varias.split(',')[0].trim()
  }
  return ''
}

const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const servicio = claveServicio()
  if (!servicio) return responder({ error: 'La función no tiene acceso a la clave de servicio del proyecto.' }, 500)
  const admin = createClient(url, servicio, { auth: { persistSession: false, autoRefreshToken: false } })

  // 1. ¿Quién llama? Debe ser un administrador activo.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return responder({ error: 'Falta la sesión.' }, 401)
  const { data: quien, error: eQuien } = await admin.auth.getUser(token)
  if (eQuien || !quien.user) return responder({ error: 'Sesión no válida.' }, 401)
  const { data: perfil } = await admin.from('perfiles').select('rol, activo').eq('user_id', quien.user.id).maybeSingle()
  if (!perfil || perfil.rol !== 'admin' || !perfil.activo) return responder({ error: 'Solo un administrador puede gestionar usuarios.' }, 403)

  let b: Record<string, unknown>
  try { b = await req.json() } catch { return responder({ error: 'Datos inválidos.' }, 400) }
  const clave = String(b.clave ?? '')
  if (clave.length < 8) return responder({ error: 'La clave temporal debe tener al menos 8 caracteres.' }, 400)

  if (b.accion === 'crear') {
    const email = String(b.email ?? '').trim().toLowerCase()
    const nombre = String(b.nombre ?? '').trim()
    const rol = String(b.rol ?? '')
    const idSupervisor = b.id_supervisor == null || b.id_supervisor === '' ? null : Number(b.id_supervisor)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return responder({ error: 'Correo no válido.' }, 400)
    if (!nombre) return responder({ error: 'Falta el nombre.' }, 400)
    if (rol !== 'admin' && rol !== 'supervisor') return responder({ error: 'Perfil no válido.' }, 400)
    if (rol === 'supervisor' && !idSupervisor) return responder({ error: 'Elegí el supervisor que corresponde a este usuario.' }, 400)

    const { data: creado, error: eCrear } = await admin.auth.admin.createUser({ email, password: clave, email_confirm: true, user_metadata: { nombre } })
    if (eCrear || !creado.user) {
      const msg = eCrear?.message ?? ''
      return responder({ error: /already|registered|exists/i.test(msg) ? 'Ya existe un usuario con ese correo.' : 'No se pudo crear el usuario: ' + msg }, 400)
    }
    const { error: ePerfil } = await admin.from('perfiles').insert({
      user_id: creado.user.id, nombre, rol, id_supervisor: rol === 'admin' ? null : idSupervisor, activo: true, debe_cambiar_clave: true,
    })
    if (ePerfil) {
      await admin.auth.admin.deleteUser(creado.user.id) // no dejar cuentas sin perfil
      return responder({ error: 'No se pudo guardar el perfil: ' + ePerfil.message }, 400)
    }
    return responder({ ok: true, user_id: creado.user.id })
  }

  if (b.accion === 'restablecer') {
    const userId = String(b.user_id ?? '')
    if (userId === quien.user.id) return responder({ error: 'Para cambiar tu propia clave usá «Cambiar contraseña».' }, 400)
    const { error: e1 } = await admin.auth.admin.updateUserById(userId, { password: clave })
    if (e1) return responder({ error: 'No se pudo cambiar la clave: ' + e1.message }, 400)
    await admin.from('perfiles').update({ debe_cambiar_clave: true }).eq('user_id', userId)
    return responder({ ok: true })
  }

  return responder({ error: 'Acción desconocida.' }, 400)
})
