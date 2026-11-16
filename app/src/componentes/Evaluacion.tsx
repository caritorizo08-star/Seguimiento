import { useEffect, useRef, useState } from 'react'
import { sb } from '../lib/supabase'
import type { CriterioEvaluacion, Monitoreo, TramoCriterio } from '../lib/tipos'

export const TRAMOS_EVAL: { k: TramoCriterio; t: string; rango: string }[] = [
  { k: 'grave', t: 'Fallas graves', rango: '1 – 1.9' },
  { k: 'mejora', t: 'Por mejorar', rango: '2 – 2.9' },
  { k: 'minimo', t: 'Mínimo esperado', rango: '3' },
  { k: 'sobresaliente', t: 'Sobresaliente', rango: '3.1 – 4.9' },
  { k: 'extraordinario', t: 'Extraordinario', rango: '5' },
]

export function nivelDe(p: number | null): string {
  if (p == null) return ''
  if (p < 2) return 'Falla grave'
  if (p < 3) return 'Por mejorar'
  if (p === 3) return 'Cumple lo mínimo'
  if (p < 5) return 'Sobresaliente'
  return 'Extraordinario'
}

export interface LlamadaAEvaluar { id_gestion: number | null; id_periodo: number; credito: string; id_agente: number; id_supervisor: number; agente: string; fecha: string }

/** Registra que la llamada se escuchó (sin evaluar todavía). */
export async function marcarEscuchada(l: LlamadaAEvaluar): Promise<Monitoreo> {
  const { data, error } = await sb.from('monitoreos').insert({
    id_gestion: l.id_gestion, id_periodo: l.id_periodo, credito: l.credito, id_agente: l.id_agente, id_supervisor: l.id_supervisor, estado: 'escuchada',
  }).select('*').single()
  if (error) throw new Error(error.message)
  return data
}

type Marca = '' | 'si' | 'no'

export function Evaluacion({ llamada, previo, cerrar, guardado }: { llamada: LlamadaAEvaluar; previo: Monitoreo | null; cerrar: () => void; guardado: (m: Monitoreo) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [criterios, setCriterios] = useState<CriterioEvaluacion[]>([])
  const [marcas, setMarcas] = useState<Record<number, Marca>>(() => {
    const m: Record<number, Marca> = {}
    previo?.criterios_cumplidos.forEach(id => { m[id] = 'si' })
    previo?.criterios_fallados.forEach(id => { m[id] = 'no' })
    return m
  })
  const [puntaje, setPuntaje] = useState<string>(previo?.puntaje != null ? String(previo.puntaje) : '')
  const [fortalezas, setFortalezas] = useState(previo?.fortalezas ?? '')
  const [oportunidades, setOportunidades] = useState(previo?.oportunidades ?? '')
  const [compromiso, setCompromiso] = useState(previo?.compromiso ?? '')
  const [retro, setRetro] = useState(previo?.retro_dada_en ?? '')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { ref.current?.showModal() }, [])
  useEffect(() => {
    sb.from('criterios_evaluacion').select('*').eq('activo', true).order('orden').then(({ data, error: e }) => {
      if (e) setError(e.message); else setCriterios(data ?? [])
    })
  }, [])

  const p = puntaje === '' ? null : Number(puntaje)
  const valido = p != null && !Number.isNaN(p) && p >= 1 && p <= 5

  async function guardar() {
    if (!valido) { setError('El puntaje debe estar entre 1 y 5.'); return }
    setGuardando(true); setError('')
    const fila = {
      estado: 'evaluada' as const,
      puntaje: Math.round(p! * 10) / 10,
      criterios_cumplidos: Object.entries(marcas).filter(([, v]) => v === 'si').map(([k]) => +k),
      criterios_fallados: Object.entries(marcas).filter(([, v]) => v === 'no').map(([k]) => +k),
      fortalezas: fortalezas.trim() || null,
      oportunidades: oportunidades.trim() || null,
      compromiso: compromiso.trim() || null,
      retro_dada_en: retro || null,
    }
    const q = previo
      ? sb.from('monitoreos').update(fila).eq('id_monitoreo', previo.id_monitoreo).select('*').single()
      : sb.from('monitoreos').insert({ ...fila, id_gestion: llamada.id_gestion, id_periodo: llamada.id_periodo, credito: llamada.credito, id_agente: llamada.id_agente, id_supervisor: llamada.id_supervisor }).select('*').single()
    const { data, error: e } = await q
    setGuardando(false)
    if (e) { setError(e.message); return }
    guardado(data)
    ref.current?.close()
  }

  return (
    <dialog ref={ref} onClose={cerrar} aria-labelledby="evtit">
      <div className="dcab">
        <div><h2 id="evtit">Evaluar llamada</h2><div style={{ fontSize: 13, opacity: .9 }}>{llamada.agente} · crédito {llamada.credito} · {llamada.fecha}</div></div>
        <button className="btn2 mini" type="button" onClick={() => ref.current?.close()}>Cerrar</button>
      </div>
      <div className="dcuerpo">
        {error && <div className="aviso error">{error}</div>}
        <p className="sub" style={{ marginTop: 0 }}>Marcá cada criterio como cumplido (✓) o no cumplido (✗) si aplica a esta llamada. El puntaje lo definís vos con la escala de la ficha de coaching.</p>
        {TRAMOS_EVAL.map(tr => {
          const lista = criterios.filter(c => c.tramo === tr.k)
          if (!lista.length) return null
          return (
            <div key={tr.k}>
              <h3 style={{ marginTop: 10 }}>{tr.t} <span className="tag">{tr.rango}</span></h3>
              <div className="criterios">
                {lista.map(c => (
                  <div className="criterio" key={c.id_criterio}>
                    <span>{c.descripcion}</span>
                    <div className="seg" role="group" aria-label={c.descripcion}>
                      {(['si', 'no', ''] as Marca[]).map(v => (
                        <button key={v || 'na'} type="button" className={(marcas[c.id_criterio] ?? '') === v ? 'on' : ''} onClick={() => setMarcas({ ...marcas, [c.id_criterio]: v })}>
                          {v === 'si' ? '✓' : v === 'no' ? '✗' : 'N/A'}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        <div className="grid2">
          <div className="campo">
            <label htmlFor="evp">Puntaje (1 a 5)</label>
            <input id="evp" type="number" min={1} max={5} step={0.1} value={puntaje} onChange={e => setPuntaje(e.target.value)} />
            {valido && <span className="sub">{nivelDe(p)}</span>}
          </div>
          <div className="campo">
            <label htmlFor="evr">Retroalimentación dada el</label>
            <input id="evr" type="date" value={retro} onChange={e => setRetro(e.target.value)} />
          </div>
        </div>
        <div className="grid2" style={{ marginTop: 10 }}>
          <div className="campo"><label htmlFor="evf">Fortalezas</label><textarea id="evf" value={fortalezas} onChange={e => setFortalezas(e.target.value)} /></div>
          <div className="campo"><label htmlFor="evo">Oportunidades de mejora</label><textarea id="evo" value={oportunidades} onChange={e => setOportunidades(e.target.value)} /></div>
        </div>
        <div className="campo" style={{ marginTop: 10 }}><label htmlFor="evc">Compromiso del agente</label><textarea id="evc" value={compromiso} onChange={e => setCompromiso(e.target.value)} /></div>
      </div>
      <div className="dpie">
        <button className="btn2" type="button" onClick={() => ref.current?.close()}>Cancelar</button>
        <button className="btn" type="button" disabled={guardando || !valido} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar evaluación'}</button>
      </div>
    </dialog>
  )
}
