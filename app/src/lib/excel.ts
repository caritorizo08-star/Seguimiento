// Lectura de los Excel mensuales: Rep_GestionesDiarias y Cierre de cartera.
// Todo se procesa en el navegador; el archivo nunca se sube tal cual.
import * as XLSX from 'xlsx'
import { aFecha, aFechaHora, aNumero, limpiar, limpiarSupervisor, llaveCredito, norm, normCartera, tramoDe } from './util'

type Celda = unknown
type Matriz = Celda[][]

export async function leerLibro(file: File): Promise<XLSX.WorkBook> {
  const buf = await file.arrayBuffer()
  return XLSX.read(new Uint8Array(buf), { type: 'array', dense: true, cellDates: true, cellHTML: false, cellFormula: false, cellStyles: false })
}

function matriz(wb: XLSX.WorkBook, hoja: string): Matriz {
  return XLSX.utils.sheet_to_json<Celda[]>(wb.Sheets[hoja], { header: 1, raw: true, defval: null, blankrows: false })
}

type Alias = Record<string, (string | RegExp)[]>

/** Busca la fila de encabezado (en las primeras 15) y devuelve la columna de cada campo. */
function mapearEncabezado(m: Matriz, alias: Alias, obligatorios: string[]) {
  let mejor = { fila: -1, mapa: {} as Record<string, number>, puntos: -1 }
  for (let f = 0; f < Math.min(15, m.length); f++) {
    const hdr = (m[f] ?? []).map(h => norm(h))
    const mapa: Record<string, number> = {}
    for (const [campo, lista] of Object.entries(alias)) {
      const c = hdr.findIndex(h => h && lista.some(a => (typeof a === 'string' ? h === a : a.test(h))))
      if (c >= 0) mapa[campo] = c
    }
    const puntos = Object.keys(mapa).length
    if (puntos > mejor.puntos) mejor = { fila: f, mapa, puntos }
  }
  const faltan = obligatorios.filter(c => mejor.mapa[c] === undefined)
  return { ...mejor, faltan }
}

// ---------------- Gestiones ----------------
const ALIAS_GESTIONES: Alias = {
  credito: ['credito', 'llave', 'numero de credito', 'no credito', 'prestamo'],
  cliente: ['nombre cliente', 'nombre del cliente', 'cliente'],
  saldo: ['saldo del credito', 'saldo'],
  accion: ['codigo accion', 'codigo de accion', 'accion'],
  resultado: ['codigo resultado', 'codigo de resultado', 'resultado'],
  comentario: ['comentarios', 'comentario', 'observaciones', 'nota', 'notas'],
  usuario: ['usuario registro', 'usuario de registro', 'usuario', 'gestor', 'agente'],
  fecha: ['fecha actividad', 'fecha de actividad', 'fecha gestion', 'fecha'],
  fechaPromesa: ['fecha promesa', 'fecha de promesa'],
  montoPromesa: ['monto promesa', 'monto de promesa'],
  razon: ['razon mora', 'razon de mora'],
  supervisor: ['supervisor gestion', 'supervisor'],
  unidad: ['unidad'],
  tipo: ['tipo credito', 'tipo de credito'],
  cartera: ['cartera'],
}
const OBLIG_GESTIONES = ['credito', 'supervisor', 'cartera', 'comentario', 'usuario', 'fecha']

export interface GestionLeida {
  credito: string
  cliente: string
  saldo: number
  accion: string
  resultado: string
  comentario: string
  usuario: string
  fecha: string
  fechaPromesa: string
  montoPromesa: number
  razonOriginal: string
  supervisor: string
  unidad: string
  tipo: string
  cartera: 'Legal' | 'Administrativa'
}

export interface LecturaGestiones { hoja: string; filas: GestionLeida[]; descartadas: number; mesMasComun: { anio: number; mes: number } | null; faltan: string[] }

/** Toma la hoja que tenga todas las columnas obligatorias y más filas. */
export function leerGestiones(wb: XLSX.WorkBook, hojaForzada?: string): LecturaGestiones {
  let mejor: { hoja: string; m: Matriz; enc: ReturnType<typeof mapearEncabezado> } | null = null
  for (const hoja of hojaForzada ? [hojaForzada] : wb.SheetNames) {
    const m = matriz(wb, hoja)
    const enc = mapearEncabezado(m, ALIAS_GESTIONES, OBLIG_GESTIONES)
    const cand = { hoja, m, enc }
    if (!mejor) { mejor = cand; continue }
    const ok = enc.faltan.length === 0, okM = mejor.enc.faltan.length === 0
    if ((ok && !okM) || (ok === okM && m.length > mejor.m.length)) mejor = cand
  }
  if (!mejor) return { hoja: '', filas: [], descartadas: 0, mesMasComun: null, faltan: OBLIG_GESTIONES }
  const { hoja, m, enc } = mejor
  if (enc.faltan.length) return { hoja, filas: [], descartadas: 0, mesMasComun: null, faltan: enc.faltan }
  const c = enc.mapa
  const v = (r: Celda[], k: string) => (c[k] === undefined ? null : r[c[k]])
  const filas: GestionLeida[] = []
  let descartadas = 0
  const meses = new Map<string, number>()
  for (const r of m.slice(enc.fila + 1)) {
    if (!r) continue
    const credito = llaveCredito(v(r, 'credito'))
    const cartera = normCartera(v(r, 'cartera'))
    const supervisor = limpiarSupervisor(v(r, 'supervisor'))
    if (!credito || !cartera || !supervisor) { if (r.some(x => limpiar(x))) descartadas++; continue }
    const fecha = aFechaHora(v(r, 'fecha'))
    if (fecha) { const k = fecha.slice(0, 7); meses.set(k, (meses.get(k) ?? 0) + 1) }
    filas.push({
      credito, cartera, supervisor, fecha,
      cliente: limpiar(v(r, 'cliente')),
      saldo: aNumero(v(r, 'saldo')),
      accion: limpiar(v(r, 'accion')).toUpperCase(),
      resultado: limpiar(v(r, 'resultado')).toUpperCase(),
      comentario: String(v(r, 'comentario') ?? '').trim(),
      usuario: limpiar(v(r, 'usuario')) || 'Sin usuario',
      fechaPromesa: aFecha(v(r, 'fechaPromesa')),
      montoPromesa: aNumero(v(r, 'montoPromesa')),
      razonOriginal: limpiar(v(r, 'razon')),
      unidad: limpiar(v(r, 'unidad')),
      tipo: limpiar(v(r, 'tipo')).toUpperCase() || 'SIN TIPO',
    })
  }
  let mesMasComun: LecturaGestiones['mesMasComun'] = null
  const top = [...meses.entries()].sort((a, b) => b[1] - a[1])[0]
  if (top) mesMasComun = { anio: +top[0].slice(0, 4), mes: +top[0].slice(5, 7) }
  return { hoja, filas, descartadas, mesMasComun, faltan: [] }
}

// ---------------- Cierre de cartera ----------------
const ALIAS_CIERRE: Alias = {
  llave: ['llave', 'credito', 'numero de credito'],
  cliente: ['nombre cliente', 'nombre del cliente'],
  bucketInicio: ['due actual inicio de mes', 'de inicio mes'],
  saldoInicio: [/^saldo del cr\w*dito al inicio de mes$/],
  saldo: [/^saldo del cr\w*dito$/],
  vencido: ['valor vencido'],
  cuota: ['valor de la cuota'],
  meta: ['recaudo meta'],
  recaudo: ['recaudo mes actual'],
  cuo: ['cuo'],
  rodamiento: ['rodamiento'],
  estatusPromesa: ['estatus ult promesa', 'estatus ultima promesa'],
  fechaPromesa: ['fecha ultima promesa'],
  promesas: ['promesa'],
  gestiones: ['gestiones'],
  contactos: ['contacto'],
  rpc: ['rpc'],
  dsg: ['dsg'],
  supervisor: ['supervisor'],
  unidad: ['unidad'],
  usuarioAsignado: ['usuario asignado'],
  tipo: [/^tipo de cr\w*dito$/],
  producto: ['producto motor', 'producto'],
  tipoCartera: ['tipo de cartera'],
  estatus: ['estatus'],
  deCierre: ['de cierre'],
}
const OBLIG_CIERRE = ['llave', 'recaudo']

export interface CierreLeido {
  credito: string; cliente: string; supervisor: string; unidad: string; usuarioAsignado: string; tipo: string; producto: string
  tipoCartera: string; diasInicio: number | null; tramoInicio: number | null; tramoCierre: number | null
  saldoInicio: number; saldo: number; vencido: number; cuota: number; meta: number; recaudo: number
  pagoVsCuota: string; rodamiento: string; estatusPromesa: string; fechaPromesa: string
  promesas: number; gestiones: number; contactos: number; rpc: number; dsg: number | null; estatus: string
}

export interface LecturaCierre { hoja: string; filas: CierreLeido[]; faltan: string[] }

export function leerCierre(wb: XLSX.WorkBook): LecturaCierre {
  for (const hoja of wb.SheetNames) {
    const m = matriz(wb, hoja)
    const enc = mapearEncabezado(m, ALIAS_CIERRE, OBLIG_CIERRE)
    if (enc.faltan.length) continue
    const c = enc.mapa
    const v = (r: Celda[], k: string) => (c[k] === undefined ? null : r[c[k]])
    const cuerpo = m.slice(enc.fila + 1).filter(r => r && llaveCredito(r[c.llave]))
    // Columna de días de mora al inicio: entre las candidatas, la que trae la mora real de los más atrasados
    const hdr = (m[enc.fila] ?? []).map(h => norm(h))
    const candidatas = hdr.map((h, i) => (/^d\w*as de mora( sin congelar)? inicio de mes$/.test(h) ? i : -1)).filter(i => i >= 0)
    let colDias: number | undefined
    let mejor = -1
    for (const col of candidatas) {
      const k = cuerpo.reduce((n, r) => n + (aNumero(r[col]) > 150 ? 1 : 0), 0)
      if (k > mejor) { mejor = k; colDias = col }
    }
    const filas: CierreLeido[] = []
    const vistos = new Set<string>()
    for (const r of cuerpo) {
      const credito = llaveCredito(v(r, 'llave'))
      if (vistos.has(credito)) continue
      vistos.add(credito)
      let diasInicio: number | null = null, tramoInicio: number | null = null
      if (colDias !== undefined && limpiar(r[colDias]) !== '') { diasInicio = Math.round(aNumero(r[colDias])); tramoInicio = tramoDe(diasInicio) }
      else if (c.bucketInicio !== undefined && limpiar(v(r, 'bucketInicio')) !== '') tramoInicio = Math.max(0, Math.min(6, Math.round(aNumero(v(r, 'bucketInicio')))))
      const dc = limpiar(v(r, 'deCierre'))
      const sup = limpiar(v(r, 'supervisor'))
      const cuoTxt = limpiar(v(r, 'cuo')).replace(/\s+/g, '').toUpperCase()
      const prod = limpiar(v(r, 'producto'))
      filas.push({
        credito,
        cliente: limpiar(v(r, 'cliente')),
        supervisor: /^sin supervisor$/i.test(sup) ? '' : limpiarSupervisor(sup),
        unidad: limpiar(v(r, 'unidad')),
        usuarioAsignado: limpiar(v(r, 'usuarioAsignado')),
        tipo: limpiar(v(r, 'tipo')).toUpperCase(),
        producto: prod === '0' ? '' : prod,
        tipoCartera: limpiar(v(r, 'tipoCartera')).toUpperCase(),
        diasInicio, tramoInicio,
        tramoCierre: dc === '' ? null : Math.max(0, Math.min(7, Math.round(aNumero(dc)))),
        saldoInicio: aNumero(v(r, 'saldoInicio')),
        saldo: aNumero(v(r, 'saldo')),
        vencido: aNumero(v(r, 'vencido')),
        cuota: aNumero(v(r, 'cuota')),
        meta: aNumero(v(r, 'meta')),
        recaudo: aNumero(v(r, 'recaudo')),
        pagoVsCuota: cuoTxt === '>=CUO' ? '>=CUO' : cuoTxt === '<CUO' ? '< CUO' : cuoTxt === 'SINPAGO' ? 'Sin pago' : '',
        rodamiento: limpiar(v(r, 'rodamiento')).toUpperCase(),
        estatusPromesa: limpiar(v(r, 'estatusPromesa')),
        fechaPromesa: aFecha(v(r, 'fechaPromesa')),
        promesas: aNumero(v(r, 'promesas')),
        gestiones: aNumero(v(r, 'gestiones')),
        contactos: aNumero(v(r, 'contactos')),
        rpc: aNumero(v(r, 'rpc')),
        dsg: c.dsg === undefined ? null : aNumero(v(r, 'dsg')),
        estatus: limpiar(v(r, 'estatus')),
      })
    }
    return { hoja, filas, faltan: [] }
  }
  return { hoja: '', filas: [], faltan: OBLIG_CIERRE }
}

/** Exporta filas a un .xlsx y lo descarga en el navegador. */
export function exportarExcel(nombre: string, encabezado: string[], filas: (string | number | null)[][]) {
  const ws = XLSX.utils.aoa_to_sheet([encabezado, ...filas])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Datos')
  XLSX.writeFile(wb, nombre.endsWith('.xlsx') ? nombre : nombre + '.xlsx')
}
