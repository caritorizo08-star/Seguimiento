// Lectura de datos desde Supabase. RLS decide qué filas ve cada usuario.
import { sb } from './supabase'
import type { AccionMora, Agente, GestionLigera, Periodo, RazonMora, Supervisor } from './tipos'

const PAGINA = 1000
const PARALELO = 6

type Filtro = (q: any) => any // eslint-disable-line @typescript-eslint/no-explicit-any

/** Trae todas las filas de una consulta, en páginas de 1000 y varias en paralelo.
 *  `orden` debe ser una columna única dentro del filtro para que las páginas no se repitan. */
export async function traerTodo<T>(tabla: string, columnas: string, filtro: Filtro = q => q, avisar?: (n: number) => void, orden = 'id_gestion'): Promise<T[]> {
  const { count, error } = await filtro(sb.from(tabla).select(columnas, { count: 'exact', head: true }))
  if (error) throw new Error(error.message)
  const total = count ?? 0
  const paginas: number[] = []
  for (let i = 0; i < total; i += PAGINA) paginas.push(i)
  const out: T[][] = []
  let hechas = 0
  for (let i = 0; i < paginas.length; i += PARALELO) {
    const res = await Promise.all(paginas.slice(i, i + PARALELO).map(async desde => {
      const { data, error: e } = await filtro(sb.from(tabla).select(columnas)).order(orden).range(desde, desde + PAGINA - 1)
      if (e) throw new Error(e.message)
      hechas += (data ?? []).length
      avisar?.(hechas)
      return { desde, data: (data ?? []) as T[] }
    }))
    res.forEach(r => { out[r.desde / PAGINA] = r.data })
  }
  return out.flat()
}

export interface Catalogos {
  supervisores: Supervisor[]
  agentes: Agente[]
  razones: RazonMora[]
  acciones: AccionMora[]
  periodos: Periodo[]
}

export async function traerCatalogos(): Promise<Catalogos> {
  const [s, a, r, ac, p] = await Promise.all([
    sb.from('supervisores').select('*').order('nombre'),
    sb.from('agentes').select('*').order('usuario'),
    sb.from('razones_mora').select('*').order('orden'),
    sb.from('acciones_mora').select('*').order('orden'),
    sb.from('periodos').select('*').order('anio', { ascending: false }).order('mes', { ascending: false }),
  ])
  const e = s.error || a.error || r.error || ac.error || p.error
  if (e) throw new Error(e.message)
  return { supervisores: s.data, agentes: a.data, razones: r.data, acciones: ac.data, periodos: p.data }
}

export const COLS_GESTION_LIGERA = 'id_gestion, credito, cliente, saldo, codigo_accion, codigo_resultado, id_agente, fecha_actividad, id_razon, id_supervisor, tipo_credito, cartera, es_contacto, alerta_mask, alerta_prioridad'
export async function traerMes(idPeriodo: number, avisar?: (m: string) => void): Promise<{ gestiones: GestionLigera[] }> {
  const gestiones = await traerTodo<GestionLigera>('gestiones', COLS_GESTION_LIGERA, q => q.eq('id_periodo', idPeriodo),
    n => avisar?.(`Descargando ${n.toLocaleString('es-NI')} gestiones…`))
  gestiones.forEach(x => { if (x.fecha_actividad) x.fecha_actividad = x.fecha_actividad.replace('T', ' ') })
  return { gestiones }
}
