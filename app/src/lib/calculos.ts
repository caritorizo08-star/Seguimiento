// Cálculos del dashboard sobre los datos del mes ya descargados.
import type { Filtros } from '../estado'
import type { GestionLigera } from './tipos'

export const rzKey = (id: number | null) => id ?? 0 // 0 = No especifica

/** Filtros de cartera, supervisor y tipo (los que aplican a todo). */
export function filtrarBase(g: GestionLigera[], f: Filtros): GestionLigera[] {
  const sups = new Set(f.supervisores)
  return g.filter(x =>
    (!f.cartera || x.cartera === f.cartera) &&
    (!sups.size || sups.has(x.id_supervisor)) &&
    (!f.tipo || x.tipo_credito === f.tipo))
}

/** Dashboard: además filtra las gestiones por razón (y quita "No especifica" si así se pidió). */
export function filtrarGestiones(g: GestionLigera[], f: Filtros): GestionLigera[] {
  const rz = new Set(f.razones)
  return filtrarBase(g, f).filter(x =>
    (!rz.size || rz.has(rzKey(x.id_razon))) &&
    (!f.excluirNoEspecifica || x.id_razon !== null || rz.has(0)))
}

/** Vistas por crédito: créditos que dieron alguna de las razones elegidas en el mes. null = sin filtro. */
export function creditosPorRazon(base: GestionLigera[], f: Filtros): Set<string> | null {
  if (!f.razones.length) return null
  const rz = new Set(f.razones)
  return new Set(base.filter(x => rz.has(rzKey(x.id_razon))).map(x => x.credito))
}

export interface ResumenCredito {
  credito: string
  cliente: string
  id_supervisor: number          // supervisor de la última gestión
  cartera: string
  tipo: string
  saldo: number
  gestiones: number
  primeraRazon: number | null    // primera razón real del mes
  ultimaRazon: number | null     // razón real más reciente
  razones: Set<number>           // razones reales del mes
  ultimaFecha: string
  ultimoResultado: string
  alertas: number
  maxPrioridad: number
}

/** Agrupa las gestiones por crédito (ordenadas por fecha). */
export function porCredito(g: GestionLigera[]): Map<string, ResumenCredito> {
  const orden = [...g].sort((a, b) => (a.fecha_actividad ?? '').localeCompare(b.fecha_actividad ?? ''))
  const m = new Map<string, ResumenCredito>()
  for (const x of orden) {
    let r = m.get(x.credito)
    if (!r) {
      r = { credito: x.credito, cliente: x.cliente ?? '', id_supervisor: x.id_supervisor, cartera: x.cartera, tipo: x.tipo_credito ?? '', saldo: x.saldo ?? 0,
        gestiones: 0, primeraRazon: null, ultimaRazon: null, razones: new Set(), ultimaFecha: '', ultimoResultado: '', alertas: 0, maxPrioridad: 0 }
      m.set(x.credito, r)
    }
    r.gestiones++
    r.id_supervisor = x.id_supervisor
    r.cartera = x.cartera
    if (x.saldo) r.saldo = x.saldo
    if (x.id_razon !== null) { if (r.primeraRazon === null) r.primeraRazon = x.id_razon; r.ultimaRazon = x.id_razon; r.razones.add(x.id_razon) }
    r.ultimaFecha = x.fecha_actividad ?? r.ultimaFecha
    r.ultimoResultado = x.codigo_resultado ?? ''
    if (x.alerta_mask) { r.alertas++; r.maxPrioridad = Math.max(r.maxPrioridad, x.alerta_prioridad) }
  }
  return m
}

export function contar<T>(xs: T[], clave: (x: T) => string | number): Map<string | number, number> {
  const m = new Map<string | number, number>()
  for (const x of xs) { const k = clave(x); m.set(k, (m.get(k) ?? 0) + 1) }
  return m
}

