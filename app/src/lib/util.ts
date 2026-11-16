// Utilidades de texto, números y fechas compartidas por la carga y las vistas.

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Repara texto con doble codificación (p. ej. "DÃ­as" → "Días"). */
export function arreglarCodificacion(s: string): string {
  if (!/[ÃÂ]/.test(s)) return s
  try {
    const bytes = Uint8Array.from([...s].map(c => c.charCodeAt(0) & 0xff))
    const t = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return t
  } catch {
    return s
  }
}

export const limpiar = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim()

/** Minúsculas, sin tildes, solo letras/números separados por un espacio. */
export const norm = (v: unknown): string =>
  arreglarCodificacion(limpiar(v)).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Igual que norm pero eliminando las letras con tilde (para textos donde la tilde se perdió: "Gastos mdicos"). */
export const normSinTildes = (v: unknown): string =>
  limpiar(v).normalize('NFC').replace(/[^\x00-\x7F]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Mayúsculas sin tildes: así se evalúan los patrones de alertas sobre el comentario. */
export const mayusSinTildes = (v: unknown): string =>
  String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

export function aNumero(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''))
  return Number.isNaN(n) ? 0 : n
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Convierte Date, serial de Excel o texto dd/mm/aaaa a 'aaaa-mm-dd hh:mm:ss' (hora local). '' si no se puede. */
export function aFechaHora(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime()))
    return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())} ${pad2(v.getHours())}:${pad2(v.getMinutes())}:${pad2(v.getSeconds())}`
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 864e5))
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`
  }
  const s = limpiar(v)
  let x = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (x) return `${x[1]}-${pad2(+x[2])}-${pad2(+x[3])} ${pad2(+(x[4] || 0))}:${x[5] || '00'}:${x[6] || '00'}`
  x = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
  if (x) {
    const y = +x[3] < 100 ? 2000 + +x[3] : +x[3]
    return `${y}-${pad2(+x[2])}-${pad2(+x[1])} ${pad2(+(x[4] || 0))}:${x[5] || '00'}:${x[6] || '00'}`
  }
  return ''
}

export const aFecha = (v: unknown): string => aFechaHora(v).slice(0, 10)

/** Tramo de mora: 0 al día, 1 = 1–30, 2 = 31–60, 3 = 61–90, 4 = 91–120, 5 = 121–150, 6 = 151+. */
export function tramoDe(dias: number): number {
  if (dias <= 0) return 0
  if (dias <= 30) return 1
  if (dias <= 60) return 2
  if (dias <= 90) return 3
  if (dias <= 120) return 4
  if (dias <= 150) return 5
  return 6
}
export const TRAMOS = ['Al día', '1–30 días', '31–60 días', '61–90 días', '91–120 días', '121–150 días', '151+ días']

/** Nombre de supervisor sin códigos ni prefijos, en formato Nombre Propio si venía todo en mayúsculas o minúsculas. */
export function limpiarSupervisor(v: unknown): string {
  let t = limpiar(v)
    .replace(/[([{][^)\]}]*[)\]}]/g, ' ')
    .replace(/^\s*(supervisor(a)?|sup\.?)\s*[:\-–]?\s*/i, '')
    .replace(/[0-9_#@/\\|]+/g, ' ')
    .replace(/^[\s\-–.,:;]+|[\s\-–.,:;]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (t && (t === t.toUpperCase() || t === t.toLowerCase()))
    t = t.toLowerCase().replace(/(^|\s)(\S)/g, (_m, a: string, b: string) => a + b.toUpperCase())
  return t
}

export function normCartera(v: unknown): '' | 'Legal' | 'Administrativa' {
  const n = norm(v)
  if (/\blegal/.test(n) || n.startsWith('leg')) return 'Legal'
  if (n.startsWith('admin')) return 'Administrativa'
  return ''
}

export const llaveCredito = (v: unknown): string => limpiar(v).toUpperCase()

// ---------- Formato ----------
export const nf = new Intl.NumberFormat('es-NI', { maximumFractionDigits: 0 })
export const nf1 = new Intl.NumberFormat('es-NI', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
export const pct = (a: number, b: number): string => (b ? nf1.format((100 * a) / b) + '%' : '—')
export const pctN = (a: number, b: number): number => (b ? (100 * a) / b : 0)
export const cordobas = (n: number): string => 'C$ ' + nf.format(Math.round(n))
export const nombreMes = (anio: number, mes: number): string => `${MESES[mes - 1]} ${anio}`

export function fechaCorta(ts: string | null | undefined): string {
  if (!ts) return ''
  const d = ts.slice(8, 10), m = ts.slice(5, 7), h = ts.slice(11, 16)
  return h ? `${d}/${m} ${h}` : `${d}/${m}`
}

export const ordenEs = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' })
