import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { sb } from '../../lib/supabase'
import { useAuth, useDatos } from '../../estado'
import type { Perfil, Rol } from '../../lib/tipos'

interface Cuenta { user_id: string; email: string; creado_en: string; ultimo_ingreso: string | null; tiene_perfil: boolean }

/** Llama a la Edge Function que crea usuarios y cambia claves (usa la clave de servicio en el servidor). */
async function adminUsuarios(cuerpo: Record<string, unknown>): Promise<void> {
  const { data, error } = await sb.functions.invoke('admin-usuarios', { body: cuerpo })
  if (error) {
    let msg = error.message
    try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) msg = j.error } catch { /* sin cuerpo */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
}

/** Clave temporal legible: 12 caracteres sin letras que se confundan. */
function generarClave(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const n = crypto.getRandomValues(new Uint32Array(12))
  return [...n].map(x => abc[x % abc.length]).join('')
}

export default function Administrador() {
  const { catalogos } = useDatos()
  const { perfil: yo } = useAuth()
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [perfiles, setPerfiles] = useState<Map<string, Perfil>>(new Map())
  const [editando, setEditando] = useState<Record<string, Partial<Perfil>>>({})
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  // Formulario de alta
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState<Rol>('supervisor')
  const [idSup, setIdSup] = useState<number | ''>('')
  const [clave, setClave] = useState(generarClave)
  const [creando, setCreando] = useState(false)
  const [restablecer, setRestablecer] = useState<{ id: string; email: string; clave: string } | null>(null)

  const cargar = useCallback(async () => {
    const [c, p] = await Promise.all([sb.rpc('fn_cuentas_acceso'), sb.from('perfiles').select('*')])
    if (c.error || p.error) setError((c.error || p.error)!.message)
    setCuentas(c.data ?? [])
    setPerfiles(new Map((p.data ?? []).map((x: Perfil) => [x.user_id, x])))
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function crear(e: FormEvent) {
    e.preventDefault(); setError(''); setOk('')
    if (rol === 'supervisor' && !idSup) { setError('Elegí a qué supervisor corresponde este usuario.'); return }
    setCreando(true)
    try {
      await adminUsuarios({ accion: 'crear', nombre, email, clave, rol, id_supervisor: rol === 'supervisor' ? idSup : null })
      setOk(`Usuario creado: ${email}. Clave temporal: ${clave} — entregásela por un medio seguro; al entrar la primera vez deberá cambiarla.`)
      setNombre(''); setEmail(''); setIdSup(''); setClave(generarClave())
      cargar()
    } catch (err) { setError((err as Error).message) }
    setCreando(false)
  }

  async function confirmarRestablecer() {
    if (!restablecer) return
    setError(''); setOk('')
    try {
      await adminUsuarios({ accion: 'restablecer', user_id: restablecer.id, clave: restablecer.clave })
      setOk(`Clave temporal de ${restablecer.email}: ${restablecer.clave} — deberá cambiarla al entrar.`)
      setRestablecer(null); cargar()
    } catch (err) { setError((err as Error).message) }
  }

  const valor = (id: string, mail: string): Perfil => ({ ...(perfiles.get(id) ?? { user_id: id, nombre: mail.split('@')[0], rol: 'supervisor', id_supervisor: null, activo: true, debe_cambiar_clave: false }), ...editando[id] } as Perfil)
  const cambiar = (id: string, c: Partial<Perfil>) => setEditando({ ...editando, [id]: { ...editando[id], ...c } })

  async function guardar(id: string, mail: string) {
    setError(''); setOk('')
    const p = valor(id, mail)
    if (p.rol === 'supervisor' && !p.id_supervisor) { setError('Elegí a qué supervisor corresponde esta cuenta.'); return }
    if (id === yo?.user_id && (p.rol !== 'admin' || !p.activo)) { setError('No podés quitarte a vos mismo el rol de administrador.'); return }
    const { error: e } = await sb.from('perfiles').upsert({ user_id: id, nombre: p.nombre, rol: p.rol, id_supervisor: p.rol === 'admin' ? null : p.id_supervisor, activo: p.activo })
    if (e) { setError(e.message); return }
    const { [id]: _quitado, ...resto } = editando
    setEditando(resto)
    setOk(`Cambios de ${mail} guardados.`)
    cargar()
  }

  const supervisores = catalogos?.supervisores ?? []
  return (
    <>
      <div className="card">
        <h2>Crear usuario</h2>
        <p className="sub">El usuario entra con la clave temporal y la app le pide cambiarla por una propia. El administrador ve todo; el supervisor ve solo sus agentes y créditos.</p>
        {error && <div className="aviso error" style={{ marginTop: 10 }}>{error}</div>}
        {ok && <div className="aviso ok" style={{ marginTop: 10 }}>{ok}</div>}
        <form onSubmit={crear} className="filtros" style={{ boxShadow: 'none', padding: 0, marginTop: 12 }}>
          <div className="campo"><label htmlFor="un">Nombre</label><input id="un" required value={nombre} onChange={e => setNombre(e.target.value)} /></div>
          <div className="campo"><label htmlFor="ue">Correo</label><input id="ue" type="email" required autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div className="campo"><label htmlFor="ur">Perfil</label>
            <select id="ur" value={rol} onChange={e => setRol(e.target.value as Rol)}><option value="supervisor">Supervisor</option><option value="admin">Administrador</option></select></div>
          {rol === 'supervisor' && (
            <div className="campo"><label htmlFor="us">Supervisor</label>
              <select id="us" required value={idSup} onChange={e => setIdSup(e.target.value ? +e.target.value : '')}>
                <option value="">— Elegí —</option>{supervisores.map(s => <option key={s.id_supervisor} value={s.id_supervisor}>{s.nombre}</option>)}
              </select></div>
          )}
          <div className="campo"><label htmlFor="uc">Clave temporal</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <input id="uc" required minLength={8} autoComplete="off" value={clave} onChange={e => setClave(e.target.value)} />
              <button className="btn2 mini" type="button" title="Generar otra" onClick={() => setClave(generarClave())}>↻</button>
            </div></div>
          <button className="btn" type="submit" disabled={creando}>{creando ? 'Creando…' : 'Crear usuario'}</button>
        </form>
        {!supervisores.length && <p className="sub">Todavía no hay supervisores: se crean solos al cargar el primer mes.</p>}
      </div>

      <div className="card">
        <h2>Usuarios</h2>
        <div className="wrap" style={{ marginTop: 10 }}><table>
          <thead><tr><th>Correo</th><th>Nombre</th><th>Perfil</th><th>Supervisor</th><th>Activo</th><th>Último ingreso</th><th></th></tr></thead>
          <tbody>{cuentas.map(c => {
            const p = valor(c.user_id, c.email)
            const per = perfiles.get(c.user_id)
            return (
              <tr key={c.user_id}>
                <td>{c.email}
                  {!c.tiene_perfil && <div className="peor">Sin acceso asignado</div>}
                  {per?.debe_cambiar_clave && <div className="sub">Con clave temporal</div>}</td>
                <td><input value={p.nombre} aria-label="Nombre" onChange={e => cambiar(c.user_id, { nombre: e.target.value })} /></td>
                <td><select value={p.rol} aria-label="Perfil" onChange={e => cambiar(c.user_id, { rol: e.target.value as Rol })}><option value="admin">Administrador</option><option value="supervisor">Supervisor</option></select></td>
                <td>{p.rol === 'supervisor' && (
                  <select value={p.id_supervisor ?? ''} aria-label="Supervisor" onChange={e => cambiar(c.user_id, { id_supervisor: e.target.value ? +e.target.value : null })}>
                    <option value="">— Elegí —</option>{supervisores.map(s => <option key={s.id_supervisor} value={s.id_supervisor}>{s.nombre}</option>)}
                  </select>)}</td>
                <td><input type="checkbox" checked={p.activo} aria-label="Activo" onChange={e => cambiar(c.user_id, { activo: e.target.checked })} /></td>
                <td className="nw">{c.ultimo_ingreso?.slice(0, 10) ?? 'Nunca'}</td>
                <td className="nw">
                  <button className="btn mini" type="button" disabled={c.tiene_perfil && !editando[c.user_id]} onClick={() => guardar(c.user_id, c.email)}>Guardar</button>{' '}
                  {c.user_id !== yo?.user_id && <button className="btn2 mini" type="button" onClick={() => setRestablecer({ id: c.user_id, email: c.email, clave: generarClave() })}>Restablecer clave</button>}
                  {restablecer?.id === c.user_id && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
                      <input aria-label="Nueva clave temporal" value={restablecer.clave} onChange={e => setRestablecer({ ...restablecer, clave: e.target.value })} style={{ width: 140 }} />
                      <button className="btn mini" type="button" onClick={confirmarRestablecer}>Confirmar</button>
                      <button className="btn2 mini" type="button" onClick={() => setRestablecer(null)}>×</button>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}</tbody>
        </table></div>
        <p className="sub">Desactivar a alguien le quita el acceso a los datos de inmediato (su cuenta queda, pero sin permisos).</p>
      </div>
    </>
  )
}
