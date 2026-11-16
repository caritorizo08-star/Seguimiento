// Motor de alertas para escoger qué llamadas escuchar.
// Es la misma lógica del dashboard original (buildAlerts), pero con las reglas leídas de la base de datos.
import type { AlertaCategoria, AlertaPatron, AlertaRegla } from './tipos'
import { mayusSinTildes, norm } from './util'

export interface FilaParaAlertas {
  credito: string
  comentario: string
  razon: string            // razón canónica; 'No especifica' si no hay
  razonOriginal: string    // texto tal cual del Excel (puede venir vacío)
  codigoResultado: string
  codigoAccion: string
  fecha: string            // 'aaaa-mm-dd hh:mm:ss' o ''
}

export interface ResultadoAlerta { mask: number; prioridad: number; notas: string; esContacto: boolean }

export interface ReglasAlertas { reglas: AlertaRegla[]; categorias: AlertaCategoria[]; patrones: AlertaPatron[] }

export const NO_ESPECIFICA = 'No especifica'
export const PRIORIDADES = ['', 'Baja', 'Media', 'Alta'] as const

/** Compila un patrón; si es inválido devuelve null (el editor de reglas lo valida antes de guardar). */
export function compilar(patron: string | null | undefined): RegExp | null {
  if (!patron) return null
  try { return new RegExp(patron) } catch { return null }
}

export function prioridadDe(mask: number, reglas: AlertaRegla[]): number {
  return reglas.reduce((p, r) => ((mask & r.bit) && r.prioridad > p ? r.prioridad : p), 0)
}

export function calcularAlertas(filas: FilaParaAlertas[], cfg: ReglasAlertas): ResultadoAlerta[] {
  const activas = cfg.reglas.filter(r => r.activa)
  const regla = (t: AlertaRegla['tipo']) => activas.filter(r => r.tipo === t)
  const rxPat = (k: AlertaPatron['clave']) => compilar(cfg.patrones.find(p => p.clave === k)?.patron)
  const rxNoContesta = rxPat('no_contesta')
  const rxRdm = rxPat('rdm')
  const rxPromesa = rxPat('promesa')
  const palabras = regla('palabras').map(r => ({ r, rx: compilar(r.patron) }))
  const rDistinta = regla('razon_distinta')[0]
  const rNoReg = regla('razon_no_registrada')[0]
  const rContacto = regla('contacto_sin_razon')[0]
  const rLlamadas = regla('llamadas_dia')[0]
  const rPromesas = regla('promesas_mes')[0]
  const categorias = cfg.categorias.filter(c => c.activa).map(c => ({ c, rx: compilar(c.patron) }))

  // Códigos de resultado de contacto: los que casi siempre llevan razón de mora
  const porCodigo = new Map<string, { n: number; rz: number; ne: number }>()
  for (const f of filas) {
    if (!f.codigoResultado) continue
    const o = porCodigo.get(f.codigoResultado) ?? { n: 0, rz: 0, ne: 0 }
    o.n++
    if (f.razonOriginal) o.rz++
    if (f.razonOriginal && norm(f.razonOriginal) === 'no especifica') o.ne++
    porCodigo.set(f.codigoResultado, o)
  }
  const codigosContacto = new Set<string>()
  porCodigo.forEach((o, k) => { if (o.n >= 20 && o.rz / o.n >= 0.9 && (o.ne + (o.n - o.rz)) / o.n < 0.8) codigosContacto.add(k) })

  const porDia = new Map<string, { n: number; ultima: number; ts: string }>()
  const promesas = new Map<string, { n: number; ultima: number; ts: string }>()
  const out: { mask: number; notas: string[]; esContacto: boolean }[] = []

  filas.forEach((f, i) => {
    const C = mayusSinTildes(f.comentario)
    const sinRazon = f.razon === NO_ESPECIFICA
    const esContacto = codigosContacto.has(f.codigoResultado) && !(rxNoContesta?.test(C) ?? false)
    let m = 0
    const notas: string[] = []

    for (const { r, rx } of palabras) {
      if ((rx && rx.test(C)) || r.razones_disparan.includes(f.razon)) m |= r.bit
    }
    const sugeridas = categorias.filter(x => x.rx?.test(C))
    if (sugeridas.length) {
      const nombres = sugeridas.map(x => x.c.nombre).join(' / ')
      if (sinRazon) { if (rNoReg) { m |= rNoReg.bit; notas.push('El comentario sugiere: ' + nombres) } }
      else if (!sugeridas.some(x => x.c.razones_compatibles.includes(f.razon))) {
        if (rDistinta) { m |= rDistinta.bit; notas.push(`El comentario sugiere: ${nombres} · registrada: ${f.razon}`) }
      }
    } else if (sinRazon && rNoReg && rxRdm?.test(C)) {
      m |= rNoReg.bit; notas.push('El comentario anota una razón (RDM/RDI)')
    }
    if (rContacto && esContacto && sinRazon && !(rNoReg && (m & rNoReg.bit))) m |= rContacto.bit

    const dia = f.fecha ? f.fecha.slice(0, 10) : 'sin-fecha'
    const esLlamada = f.codigoAccion ? /^(T|LL)/i.test(f.codigoAccion) : true
    if (esLlamada) {
      const k = f.credito + '|' + dia
      const o = porDia.get(k) ?? { n: 0, ultima: -1, ts: '' }
      o.n++; if (f.fecha >= o.ts) { o.ts = f.fecha; o.ultima = i }
      porDia.set(k, o)
    }
    if (['PRP', 'PPP', 'PRL'].includes(f.codigoResultado) || (rxPromesa?.test(C) ?? false)) {
      const o = promesas.get(f.credito) ?? { n: 0, ultima: -1, ts: '' }
      o.n++; if (f.fecha >= o.ts) { o.ts = f.fecha; o.ultima = i }
      promesas.set(f.credito, o)
    }
    out.push({ mask: m, notas, esContacto })
  })

  if (rLlamadas?.umbral) {
    porDia.forEach((o, k) => {
      if (o.n < rLlamadas.umbral!) return
      const r = out[o.ultima]; r.mask |= rLlamadas.bit
      const d = k.split('|')[1]
      r.notas.push(`${o.n} llamadas al crédito el ${d.length === 10 ? d.slice(8, 10) + '/' + d.slice(5, 7) : 'mismo día'}`)
    })
  }
  if (rPromesas?.umbral) {
    promesas.forEach(o => {
      if (o.n < rPromesas.umbral!) return
      const r = out[o.ultima]; r.mask |= rPromesas.bit
      r.notas.push(`${o.n} promesas o postergaciones en el mes`)
    })
  }

  return out.map(o => ({ mask: o.mask, prioridad: prioridadDe(o.mask, activas), notas: o.notas.join(' · '), esContacto: o.esContacto }))
}
