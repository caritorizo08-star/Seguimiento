import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { sb } from './lib/supabase'
import { traerCatalogos, traerMes, type Catalogos } from './lib/datos'
import type { GestionLigera, Perfil } from './lib/tipos'

// ---------------- Sesión ----------------
interface Auth { session: Session | null; perfil: Perfil | null; cargando: boolean; error: string; salir: () => Promise<void> }
const AuthCtx = createContext<Auth>(null as never)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => { setSession(data.session); if (!data.session) setCargando(false) })
    const { data } = sb.auth.onAuthStateChange((_e, s) => { setSession(s); if (!s) { setPerfil(null); setCargando(false) } })
    return () => data.subscription.unsubscribe()
  }, [])

  const uid = session?.user.id
  useEffect(() => {
    if (!uid) return
    setCargando(true)
    sb.from('perfiles').select('*').eq('user_id', uid).maybeSingle().then(({ data, error: e }) => {
      if (e) setError(e.message)
      else if (!data) setError('Tu cuenta todavía no tiene un rol asignado. Pedile al administrador que te dé acceso.')
      else if (!data.activo) setError('Tu acceso está desactivado. Consultá con el administrador.')
      else setError('')
      setPerfil(data && data.activo ? data : null)
      setCargando(false)
    })
  }, [uid])

  const salir = useCallback(async () => { await sb.auth.signOut() }, [])
  return <AuthCtx.Provider value={{ session, perfil, cargando, error, salir }}>{children}</AuthCtx.Provider>
}

// ---------------- Datos del mes y filtros ----------------
export interface Filtros {
  cartera: '' | 'Legal' | 'Administrativa'
  supervisores: number[]
  tipo: string
  razones: number[]          // 0 = No especifica
  excluirNoEspecifica: boolean
}
export const FILTROS_INICIALES: Filtros = { cartera: '', supervisores: [], tipo: '', razones: [], excluirNoEspecifica: true }

interface Datos {
  catalogos: Catalogos | null
  idPeriodo: number | null
  setIdPeriodo: (id: number) => void
  gestiones: GestionLigera[]
  cargando: string
  error: string
  filtros: Filtros
  setFiltros: (f: Filtros) => void
  recargarCatalogos: () => Promise<void>
  recargarMes: () => void
}
const DatosCtx = createContext<Datos>(null as never)
export const useDatos = () => useContext(DatosCtx)

export function DatosProvider({ children }: { children: ReactNode }) {
  const [catalogos, setCatalogos] = useState<Catalogos | null>(null)
  const [idPeriodo, setIdPeriodo] = useState<number | null>(null)
  const [mes, setMes] = useState<{ id: number; gestiones: GestionLigera[] } | null>(null)
  const [cargando, setCargando] = useState('')
  const [error, setError] = useState('')
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIALES)
  const [version, setVersion] = useState(0)

  const recargarCatalogos = useCallback(async () => {
    try {
      const c = await traerCatalogos()
      setCatalogos(c)
      setIdPeriodo(prev => prev ?? c.periodos.find(p => p.estado === 'listo')?.id_periodo ?? null)
    } catch (e) { setError((e as Error).message) }
  }, [])
  useEffect(() => { recargarCatalogos() }, [recargarCatalogos])

  useEffect(() => {
    if (idPeriodo == null) return
    let vivo = true
    setCargando('Descargando datos del mes…'); setError('')
    traerMes(idPeriodo, m => vivo && setCargando(m))
      .then(r => { if (vivo) { setMes({ id: idPeriodo, ...r }); setCargando('') } })
      .catch(e => { if (vivo) { setError((e as Error).message); setCargando('') } })
    return () => { vivo = false }
  }, [idPeriodo, version])

  const valor = useMemo<Datos>(() => ({
    catalogos, idPeriodo, setIdPeriodo: (id: number) => { setIdPeriodo(id); setFiltros(FILTROS_INICIALES) },
    gestiones: mes && mes.id === idPeriodo ? mes.gestiones : [],
    cargando, error, filtros, setFiltros, recargarCatalogos,
    recargarMes: () => setVersion(v => v + 1),
  }), [catalogos, idPeriodo, mes, cargando, error, filtros, recargarCatalogos])
  return <DatosCtx.Provider value={valor}>{children}</DatosCtx.Provider>
}
