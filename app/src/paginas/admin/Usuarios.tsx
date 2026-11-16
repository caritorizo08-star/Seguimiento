import { useEffect, useState } from 'react'
import { sb } from '../../lib/supabase'
import { useAuth, useDatos } from '../../estado'
import type { Perfil, Rol } from '../../lib/tipos'

interface Cuenta { user_id: string; email: string; creado_en: string; ultimo_ingreso: string | null; tiene_perfil: boolean }

/** Asignar rol a las cuentas de acceso. Las cuentas se crean en Supabase (Authentication → Users → Invite). */
export default function Usuarios() {
  const { catalogos } = useDatos()
  const { perfil: yo } = useAuth()
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [perfiles, setPerfiles] = useState<Map<string, Perfil>>(new Map())
  const [editando, setEditando] = useState<Record<string, Partial<Perfil>>>({})
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  async function cargar() {
    const [c, p] = await Promise.all([sb.rpc('fn_cuentas_acceso'), sb.from('perfiles').select('*')])
    if (c.error || p.error) setError((c.error || p.error)!.message)
    setCuentas(c.data ?? [])
    setPerfiles(new Map((p.data ?? []).map((x: Perfil) => [x.user_id, x])))
  }
  useEffect(() => { cargar() }, [])

  const valor = (id: string, email: string): Perfil => ({ ...(perfiles.get(id) ?? { user_id: id, nombre: email.split('@')[0], rol: 'supervisor', id_supervisor: null, activo: true }), ...editando[id] } as Perfil)
  const cambiar = (id: string, c: Partial<Perfil>) => setEditando({ ...editando, [id]: { ...editando[id], ...c } })

  async function guardar(id: string, email: string) {
    setError(''); setOk('')
    const p = valor(id, email)
    if (p.rol === 'supervisor' && !p.id_supervisor) { setError('Elegí a qué supervisor corresponde esta cuenta.'); return }
    if (id === yo?.user_id && (p.rol !== 'admin' || !p.activo)) { setError('No podés quitarte a vos mismo el rol de administrador.'); return }
    const { error: e } = await sb.from('perfiles').upsert({ user_id: id, nombre: p.nombre, rol: p.rol, id_supervisor: p.rol === 'admin' ? null : p.id_supervisor, activo: p.activo })
    if (e) { setError(e.message); return }
    const { [id]: _quitado, ...resto } = editando
    setEditando(resto)
    setOk(`Acceso de ${email} guardado.`)
    cargar()
  }

  return (
    <div className="card">
      <h2>Usuarios y permisos</h2>
      <p className="sub">Para dar acceso a alguien nuevo: en Supabase, <b>Authentication → Users → Invite user</b> con su correo. Cuando aparezca aquí, asignale rol. El administrador ve todo; el supervisor ve solo sus agentes y créditos. Los agentes no entran a la app.</p>
      {error && <div className="aviso error" style={{ marginTop: 10 }}>{error}</div>}
      {ok && <div className="aviso ok" style={{ marginTop: 10 }}>{ok}</div>}
      <div className="wrap" style={{ marginTop: 10 }}><table>
        <thead><tr><th>Correo</th><th>Nombre</th><th>Rol</th><th>Supervisor</th><th>Activo</th><th>Último ingreso</th><th></th></tr></thead>
        <tbody>{cuentas.map(c => {
          const p = valor(c.user_id, c.email)
          return (
            <tr key={c.user_id}>
              <td>{c.email}{!c.tiene_perfil && <div className="peor">Sin acceso asignado</div>}</td>
              <td><input value={p.nombre} aria-label="Nombre" onChange={e => cambiar(c.user_id, { nombre: e.target.value })} /></td>
              <td><select value={p.rol} aria-label="Rol" onChange={e => cambiar(c.user_id, { rol: e.target.value as Rol })}><option value="admin">Administrador</option><option value="supervisor">Supervisor</option></select></td>
              <td>{p.rol === 'supervisor' && (
                <select value={p.id_supervisor ?? ''} aria-label="Supervisor" onChange={e => cambiar(c.user_id, { id_supervisor: e.target.value ? +e.target.value : null })}>
                  <option value="">— Elegí —</option>{catalogos?.supervisores.map(s => <option key={s.id_supervisor} value={s.id_supervisor}>{s.nombre}</option>)}
                </select>)}</td>
              <td><input type="checkbox" checked={p.activo} aria-label="Activo" onChange={e => cambiar(c.user_id, { activo: e.target.checked })} /></td>
              <td className="nw">{c.ultimo_ingreso?.slice(0, 10) ?? 'Nunca'}</td>
              <td><button className="btn mini" type="button" disabled={c.tiene_perfil && !editando[c.user_id]} onClick={() => guardar(c.user_id, c.email)}>Guardar</button></td>
            </tr>
          )
        })}</tbody>
      </table></div>
      {!catalogos?.supervisores.length && <p className="sub">Todavía no hay supervisores: se crean solos al cargar el primer mes.</p>}
    </div>
  )
}
