// Versión de la app y detección de versiones nuevas publicadas.
declare const __VERSION__: string
export const VERSION = __VERSION__

/** Nombre del script principal que está corriendo (cambia en cada publicación). */
function scriptActual(): string {
  const s = [...document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')].map(x => x.src).find(x => /\/assets\/index-/.test(x))
  return s ? s.slice(s.lastIndexOf('/assets/')) : ''
}

/** true si el servidor ya tiene otra versión distinta de la que está abierta. */
export async function hayVersionNueva(): Promise<boolean> {
  const actual = scriptActual()
  if (!actual) return false // en desarrollo no aplica
  try {
    const r = await fetch(location.pathname + '?v=' + Date.now(), { cache: 'no-store' })
    const m = (await r.text()).match(/\/assets\/index-[^"']+\.js/)
    return !!m && m[0] !== actual
  } catch { return false }
}
