import { useEffect, useState } from 'react'
import { useAuth, useDatos } from '../estado'
import { Evaluacion, nivelDe } from '../componentes/Evaluacion'
import { sb } from '../lib/supabase'
import { exportarExcel } from '../lib/excel'
import type { CriterioEvaluacion, Monitoreo as Mon } from '../lib/tipos'
import { fechaCorta, nf, nf1, nombreMes, ordenEs } from '../lib/util'

/** Seguimiento al agente: historial de llamadas escuchadas y evaluadas. */
export default function Monitoreo() {
  const { catalogos } = useDatos()
  const { perfil } = useAuth()
  const [mons, setMons] = useState<Mon[]>([])
  const [criterios, setCriterios] = useState<CriterioEvaluacion[]>([])
  const [periodo, setPeriodo] = useState<number | ''>('')
  const [agente, setAgente] = useState<number | null>(null)
  const [editar, setEditar] = useState<Mon | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      sb.from('monitoreos').select('*').order('creado_en', { ascending: false }).limit(5000),
      sb.from('criterios_evaluacion').select('*').order('orden'),
    ]).then(([m, c]) => {
      if (m.error || c.error) setError((m.error || c.error)!.message)
      setMons(m.data ?? []); setCriterios(c.data ?? [])
    })
  }, [])
  if (!catalogos) return null

  const nombreAg = (id: number) => catalogos.agentes.find(a => a.id_agente === id)?.usuario ?? '?'
  const nombreSup = (id: number) => catalogos.supervisores.find(s => s.id_supervisor === id)?.nombre ?? ''
  const nombrePer = (id: number) => { const p = catalogos.periodos.find(x => x.id_periodo === id); return p ? nombreMes(p.anio, p.mes) : '' }
  const criterio = (id: number) => criterios.find(c => c.id_criterio === id)?.descripcion ?? '?'

  const filtrados = mons.filter(m => periodo === '' || m.id_periodo === periodo)
  type Res = { n: number; ev: Mon[]; sinRetro: number; sup: number; fallas: Map<number, number> }
  const porAg = new Map<number, Res>()
  for (const m of filtrados) {
    const o: Res = porAg.get(m.id_agente) ?? { n: 0, ev: [], sinRetro: 0, sup: m.id_supervisor, fallas: new Map() }
    o.n++
    if (m.estado === 'evaluada') { o.ev.push(m); if (!m.retro_dada_en) o.sinRetro++; m.criterios_fallados.forEach(c => o.fallas.set(c, (o.fallas.get(c) ?? 0) + 1)) }
    porAg.set(m.id_agente, o)
  }
  const prom = (xs: Mon[]) => (xs.length ? xs.reduce((s, m) => s + (m.puntaje ?? 0), 0) / xs.length : null)
  const filas = [...porAg.entries()].sort((a, b) => ordenEs(nombreAg(a[0]), nombreAg(b[0])))
  const evaluadas = filtrados.filter(m => m.estado === 'evaluada')
  const historial = agente == null ? [] : filtrados.filter(m => m.id_agente === agente)

  function exportar() {
    exportarExcel('monitoreo_llamadas', ['Mes', 'Fecha registro', 'Agente', 'Supervisor', 'Crédito', 'Estado', 'Puntaje', 'Nivel', 'Criterios no cumplidos', 'Fortalezas', 'Oportunidades', 'Compromiso', 'Retro dada el'],
      filtrados.map(m => [nombrePer(m.id_periodo), m.creado_en.slice(0, 10), nombreAg(m.id_agente), nombreSup(m.id_supervisor), m.credito, m.estado, m.puntaje, nivelDe(m.puntaje),
        m.criterios_fallados.map(criterio).join(' | '), m.fortalezas, m.oportunidades, m.compromiso, m.retro_dada_en]))
  }

  return (
    <>
      {error && <div className="aviso error">{error}</div>}
      <div className="filtros">
        <div className="campo"><label htmlFor="mper">Mes</label>
          <select id="mper" value={periodo} onChange={e => setPeriodo(e.target.value === '' ? '' : +e.target.value)}>
            <option value="">Todos los meses</option>{catalogos.periodos.map(p => <option key={p.id_periodo} value={p.id_periodo}>{nombreMes(p.anio, p.mes)}</option>)}
          </select></div>
        <button className="btn" type="button" onClick={exportar}>Exportar a Excel</button>
      </div>
      <div className="kpis">
        <div className="kpi"><span>Llamadas escuchadas</span><b>{nf.format(filtrados.length)}</b></div>
        <div className="kpi verde"><span>Evaluadas</span><b>{nf.format(evaluadas.length)}</b><small>promedio {prom(evaluadas) == null ? '—' : nf1.format(prom(evaluadas)!)}</small></div>
        <div className="kpi naranja"><span>Evaluaciones sin retroalimentación</span><b>{nf.format(evaluadas.filter(m => !m.retro_dada_en).length)}</b><small>todavía no se registra la retro al agente</small></div>
      </div>
      <div className="card">
        <h2>Seguimiento por agente</h2>
        <p className="sub">Tocá un agente para ver su historial. «Tendencia» compara el promedio de sus 3 evaluaciones más recientes con las anteriores.</p>
        <div className="wrap"><table>
          <thead><tr><th>Agente</th><th>Supervisor</th><th className="n">Escuchadas</th><th className="n">Evaluadas</th><th className="n">Promedio</th><th className="n">Última</th><th>Tendencia</th><th className="n">Sin retro</th><th>Criterio que más falla</th></tr></thead>
          <tbody>{filas.map(([k, o]) => {
            const recientes = o.ev.slice(0, 3), previas = o.ev.slice(3)
            const pr = prom(recientes), pp = prom(previas)
            const tend = pr == null || pp == null ? '' : pr - pp >= 0.3 ? '▲ mejora' : pp - pr >= 0.3 ? '▼ baja' : '= estable'
            const top = [...o.fallas.entries()].sort((a, b) => b[1] - a[1])[0]
            return (
              <tr key={k} className={'click' + (agente === k ? ' on' : '')} onClick={() => setAgente(agente === k ? null : k)}>
                <td><b>{nombreAg(k)}</b></td><td>{nombreSup(o.sup)}</td><td className="n">{o.n}</td><td className="n">{o.ev.length}</td>
                <td className="n">{prom(o.ev) == null ? '—' : nf1.format(prom(o.ev)!)}</td><td className="n">{o.ev[0]?.puntaje ?? '—'}</td>
                <td className={tend.startsWith('▲') ? 'mejor' : tend.startsWith('▼') ? 'peor' : ''}>{tend}</td>
                <td className={'n ' + (o.sinRetro ? 'peor' : '')}>{o.sinRetro || ''}</td>
                <td className="sub">{top ? `${criterio(top[0])} (${top[1]})` : ''}</td>
              </tr>
            )
          })}</tbody>
        </table></div>
        {!filas.length && <p className="vacio">Todavía no hay llamadas escuchadas. Se registran desde la pestaña «Alertas».</p>}
      </div>
      {agente != null && (
        <div className="card">
          <h2>Historial de {nombreAg(agente)}</h2>
          <div className="wrap"><table>
            <thead><tr><th>Fecha</th><th>Mes</th><th>Crédito</th><th>Estado</th><th className="n">Puntaje</th><th>No cumplió</th><th>Fortalezas</th><th>Oportunidades</th><th>Compromiso</th><th>Retro</th><th></th></tr></thead>
            <tbody>{historial.map(m => (
              <tr key={m.id_monitoreo}>
                <td className="nw">{fechaCorta(m.creado_en.replace('T', ' '))}</td><td>{nombrePer(m.id_periodo)}</td><td className="nw">{m.credito}</td>
                <td>{m.estado === 'evaluada' ? nivelDe(m.puntaje) : 'Escuchada'}</td><td className="n puntaje">{m.puntaje ?? ''}</td>
                <td className="sub">{m.criterios_fallados.map(c => <div key={c}>• {criterio(c)}</div>)}</td>
                <td className="sub">{m.fortalezas}</td><td className="sub">{m.oportunidades}</td><td className="sub">{m.compromiso}</td>
                <td className="nw">{m.retro_dada_en ?? <span className="peor">Pendiente</span>}</td>
                <td>{(perfil?.rol === 'admin' || m.creado_por === perfil?.user_id) && <button className="btn mini" type="button" onClick={() => setEditar(m)}>{m.estado === 'evaluada' ? 'Editar' : 'Evaluar'}</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}
      {editar && (
        <Evaluacion previo={editar} cerrar={() => setEditar(null)}
          llamada={{ id_gestion: editar.id_gestion, id_periodo: editar.id_periodo, credito: editar.credito, id_agente: editar.id_agente, id_supervisor: editar.id_supervisor, agente: nombreAg(editar.id_agente), fecha: editar.creado_en.slice(0, 10) }}
          guardado={m => setMons(mons.map(x => (x.id_monitoreo === m.id_monitoreo ? m : x)))} />
      )}
    </>
  )
}
