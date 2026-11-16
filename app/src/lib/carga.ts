// Carga de un mes: gestiones → Supabase. Solo la ejecuta un administrador (lo impone RLS).
import { sb } from './supabase'
import { traerTodo } from './datos'
import { calcularAlertas, NO_ESPECIFICA, type ReglasAlertas } from './alertas'
import type { GestionLeida } from './excel'
import type { Agente, RazonMora, Supervisor } from './tipos'
import { norm, normSinTildes } from './util'

export type Progreso = (mensaje: string, avance?: number) => void

const LOTE = 1000
const PARALELO = 4

async function enLotes<T>(filas: T[], tabla: string, avisar: (hechas: number) => void) {
  let hechas = 0
  const lotes: T[][] = []
  for (let i = 0; i < filas.length; i += LOTE) lotes.push(filas.slice(i, i + LOTE))
  for (let i = 0; i < lotes.length; i += PARALELO) {
    await Promise.all(lotes.slice(i, i + PARALELO).map(async l => {
      const { error } = await sb.from(tabla).insert(l as never[])
      if (error) throw new Error(`Error guardando en ${tabla}: ${error.message}`)
      hechas += l.length
      avisar(hechas)
    }))
  }
}

export async function cargarReglas(): Promise<ReglasAlertas> {
  const [r, c, p] = await Promise.all([
    sb.from('alerta_reglas').select('*').order('orden'),
    sb.from('alerta_categorias').select('*').order('nombre'),
    sb.from('alerta_patrones').select('*'),
  ])
  const e = r.error || c.error || p.error
  if (e) throw new Error(e.message)
  return { reglas: r.data ?? [], categorias: c.data ?? [], patrones: p.data ?? [] }
}

/** Devuelve el id de razón canónica para un texto del Excel (null = No especifica). Crea razones nuevas si hace falta. */
async function mapaRazones(textos: string[]): Promise<{ id: (t: string) => number | null; nombre: (t: string) => string }> {
  const { data, error } = await sb.from('razones_mora').select('*')
  if (error) throw new Error(error.message)
  const razones = (data ?? []) as RazonMora[]
  const idx = new Map<string, RazonMora>()
  const indexar = (r: RazonMora) => { idx.set(norm(r.nombre), r); idx.set(normSinTildes(r.nombre), r) }
  razones.forEach(indexar)
  const esNoEspecifica = (t: string) => !t || ['no especifica', 'noe', 'ne', 'n e', 'no aplica'].includes(norm(t))
  const buscar = (t: string) => idx.get(norm(t)) ?? idx.get(normSinTildes(t))
  const nuevas = [...new Set(textos.filter(t => !esNoEspecifica(t) && !buscar(t)))]
  if (nuevas.length) {
    const { data: ins, error: e2 } = await sb.from('razones_mora').insert(nuevas.map(n => ({ nombre: n, orden: 100 }))).select('*')
    if (e2) throw new Error(e2.message)
    ;(ins as RazonMora[]).forEach(indexar)
  }
  return {
    id: t => (esNoEspecifica(t) ? null : buscar(t)?.id_razon ?? null),
    nombre: t => (esNoEspecifica(t) ? NO_ESPECIFICA : buscar(t)?.nombre ?? NO_ESPECIFICA),
  }
}

async function mapaSupervisores(nombres: string[]): Promise<Map<string, number>> {
  const { data, error } = await sb.from('supervisores').select('*')
  if (error) throw new Error(error.message)
  const m = new Map<string, number>()
  ;(data as Supervisor[]).forEach(s => m.set(norm(s.nombre), s.id_supervisor))
  const nuevos = [...new Map(nombres.filter(n => n && !m.has(norm(n))).map(n => [norm(n), n])).values()]
  if (nuevos.length) {
    const { data: ins, error: e2 } = await sb.from('supervisores').insert(nuevos.map(nombre => ({ nombre }))).select('*')
    if (e2) throw new Error(e2.message)
    ;(ins as Supervisor[]).forEach(s => m.set(norm(s.nombre), s.id_supervisor))
  }
  return m
}

/** Crea agentes nuevos y actualiza su supervisor al de su gestión más reciente del mes. */
async function mapaAgentes(gestiones: GestionLeida[], sups: Map<string, number>): Promise<Map<string, number>> {
  const ultimo = new Map<string, { fecha: string; sup: string }>()
  for (const g of gestiones) {
    const u = ultimo.get(g.usuario)
    if (!u || g.fecha >= u.fecha) ultimo.set(g.usuario, { fecha: g.fecha, sup: g.supervisor })
  }
  const { data, error } = await sb.from('agentes').select('*')
  if (error) throw new Error(error.message)
  const m = new Map<string, number>()
  const existentes = new Map((data as Agente[]).map(a => [a.usuario.toLowerCase(), a]))
  const filas = [...ultimo.entries()].map(([usuario, u]) => ({
    usuario: existentes.get(usuario.toLowerCase())?.usuario ?? usuario,
    id_supervisor: sups.get(norm(u.sup)) ?? null,
  }))
  for (let i = 0; i < filas.length; i += LOTE) {
    const { data: up, error: e2 } = await sb.from('agentes').upsert(filas.slice(i, i + LOTE), { onConflict: 'usuario' }).select('id_agente, usuario')
    if (e2) throw new Error(e2.message)
    ;(up as Pick<Agente, 'id_agente' | 'usuario'>[]).forEach(a => m.set(a.usuario.toLowerCase(), a.id_agente))
  }
  return m
}

export interface OpcionesCarga {
  anio: number
  mes: number
  archivoGestiones: string
  gestiones: GestionLeida[]
  reemplazar: boolean
}

export async function cargarMes(o: OpcionesCarga, avisar: Progreso): Promise<number> {
  avisar('Revisando si el mes ya existe…')
  const { data: existe, error: e0 } = await sb.from('periodos').select('id_periodo').eq('anio', o.anio).eq('mes', o.mes).maybeSingle()
  if (e0) throw new Error(e0.message)
  if (existe && !o.reemplazar) throw new Error('Ese mes ya está cargado. Marcá «Reemplazar» para volver a cargarlo.')

  avisar('Actualizando catálogos (supervisores, agentes, razones)…')
  const sups = await mapaSupervisores(o.gestiones.map(g => g.supervisor))
  const agentes = await mapaAgentes(o.gestiones, sups)
  const razones = await mapaRazones(o.gestiones.map(g => g.razonOriginal))

  avisar('Calculando alertas…')
  const cfg = await cargarReglas()
  const alertas = calcularAlertas(o.gestiones.map(g => ({
    credito: g.credito, comentario: g.comentario, razon: razones.nombre(g.razonOriginal), razonOriginal: g.razonOriginal,
    codigoResultado: g.resultado, codigoAccion: g.accion, fecha: g.fecha,
  })), cfg)

  let idPeriodo: number
  if (existe) {
    idPeriodo = existe.id_periodo
    avisar('Borrando los datos anteriores de ese mes…')
    await sb.from('periodos').update({ estado: 'cargando' }).eq('id_periodo', idPeriodo)
    const d1 = await sb.from('gestiones').delete().eq('id_periodo', idPeriodo)
    if (d1.error) throw new Error(d1.error.message)
  } else {
    const { data, error } = await sb.from('periodos').insert({ anio: o.anio, mes: o.mes, estado: 'cargando' }).select('id_periodo').single()
    if (error) throw new Error(error.message)
    idPeriodo = data.id_periodo
  }

  const filasG = o.gestiones.map((g, i) => ({
    id_periodo: idPeriodo,
    credito: g.credito,
    cliente: g.cliente || null,
    saldo: g.saldo,
    codigo_accion: g.accion || null,
    codigo_resultado: g.resultado || null,
    comentario: g.comentario || null,
    id_agente: agentes.get(g.usuario.toLowerCase()) ?? null,
    fecha_actividad: g.fecha || null,
    fecha_promesa: g.fechaPromesa || null,
    monto_promesa: g.montoPromesa,
    razon_original: g.razonOriginal || null,
    id_razon: razones.id(g.razonOriginal),
    id_supervisor: sups.get(norm(g.supervisor))!,
    unidad: g.unidad || null,
    tipo_credito: g.tipo,
    cartera: g.cartera,
    es_contacto: alertas[i].esContacto,
    alerta_mask: alertas[i].mask,
    alerta_prioridad: alertas[i].prioridad,
    alerta_notas: alertas[i].notas || null,
  }))
  await enLotes(filasG, 'gestiones', n => avisar(`Guardando gestiones: ${n.toLocaleString('es-NI')} de ${filasG.length.toLocaleString('es-NI')}`, n / filasG.length))

  const { error: e9 } = await sb.from('periodos').update({
    estado: 'listo',
    archivo_gestiones: o.archivoGestiones,
    filas_gestiones: filasG.length,
  }).eq('id_periodo', idPeriodo)
  if (e9) throw new Error(e9.message)
  avisar('Listo.', 1)
  return idPeriodo
}

/** Vuelve a calcular las alertas de un mes con las reglas actuales (después de editarlas). */
export async function recalcularAlertas(idPeriodo: number, avisar: Progreso) {
  avisar('Descargando gestiones del mes…')
  const filas = await traerTodo<{
    id_gestion: number; credito: string; comentario: string | null; razon_original: string | null; id_razon: number | null
    codigo_resultado: string | null; codigo_accion: string | null; fecha_actividad: string | null; alerta_mask: number; alerta_prioridad: number; alerta_notas: string | null; es_contacto: boolean
  }>('gestiones', 'id_gestion, credito, comentario, razon_original, id_razon, codigo_resultado, codigo_accion, fecha_actividad, alerta_mask, alerta_prioridad, alerta_notas, es_contacto', q => q.eq('id_periodo', idPeriodo), n => avisar(`Descargando gestiones: ${n.toLocaleString('es-NI')}`))
  filas.sort((a, b) => a.id_gestion - b.id_gestion)
  const { data: rz } = await sb.from('razones_mora').select('id_razon, nombre')
  const nombreRazon = new Map((rz ?? []).map((r: { id_razon: number; nombre: string }) => [r.id_razon, r.nombre]))
  const cfg = await cargarReglas()
  avisar('Calculando alertas…')
  const res = calcularAlertas(filas.map(f => ({
    credito: f.credito, comentario: f.comentario ?? '', razon: f.id_razon ? nombreRazon.get(f.id_razon) ?? NO_ESPECIFICA : NO_ESPECIFICA,
    razonOriginal: f.razon_original ?? '', codigoResultado: f.codigo_resultado ?? '', codigoAccion: f.codigo_accion ?? '',
    fecha: (f.fecha_actividad ?? '').replace('T', ' '),
  })), cfg)
  const cambios = filas.map((f, i) => ({ f, r: res[i] })).filter(({ f, r }) =>
    f.alerta_mask !== r.mask || f.alerta_prioridad !== r.prioridad || (f.alerta_notas ?? '') !== r.notas || f.es_contacto !== r.esContacto)
  for (let i = 0; i < cambios.length; i += LOTE) {
    const l = cambios.slice(i, i + LOTE)
    const { error } = await sb.rpc('fn_actualizar_alertas', {
      p_ids: l.map(x => x.f.id_gestion),
      p_masks: l.map(x => x.r.mask),
      p_prioridades: l.map(x => x.r.prioridad),
      p_notas: l.map(x => x.r.notas || null),
      p_contactos: l.map(x => x.r.esContacto),
    })
    if (error) throw new Error(error.message)
    avisar(`Actualizando alertas: ${Math.min(i + LOTE, cambios.length).toLocaleString('es-NI')} de ${cambios.length.toLocaleString('es-NI')}`, (i + LOTE) / cambios.length)
  }
  avisar(`Listo. ${cambios.length.toLocaleString('es-NI')} gestiones cambiaron de alerta.`, 1)
}
