import { useEffect, useMemo, useState } from 'react'
import { useAuth, useDatos } from '../estado'
import { Filtros, useResumenFiltros } from '../componentes/Filtros'
import { Evaluacion, marcarEscuchada, nivelDe, type LlamadaAEvaluar } from '../componentes/Evaluacion'
import { creditosPorRazon, filtrarBase } from '../lib/calculos'
import { PRIORIDADES } from '../lib/alertas'
import { exportarExcel } from '../lib/excel'
import { sb } from '../lib/supabase'
import type { AlertaRegla, GestionLigera, Monitoreo } from '../lib/tipos'
import { fechaCorta, nf, ordenEs, pct, pctN } from '../lib/util'

type EstadoMon = '' | 'pendiente' | 'escuchada' | 'evaluada'

export default function Alertas() {
  const { gestiones, catalogos, filtros, idPeriodo } = useDatos()
  const { perfil } = useAuth()
  const resumen = useResumenFiltros()
  const [reglas, setReglas] = useState<AlertaRegla[]>([])
  const [monitoreos, setMonitoreos] = useState<Map<number, Monitoreo>>(new Map())
  const [bit, setBit] = useState(0)
  const [prio, setPrio] = useState(0)
  const [agente, setAgente] = useState<number | null>(null)
  const [estado, setEstado] = useState<EstadoMon>('')
  const [buscar, setBuscar] = useState('')
  const [limite, setLimite] = useState(100)
  const [textos, setTextos] = useState<Map<number, { comentario: string | null; alerta_notas: string | null; razon_original: string | null }>>(new Map())
  const [evaluando, setEvaluando] = useState<{ l: LlamadaAEvaluar; previo: Monitoreo | null } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { sb.from('alerta_reglas').select('*').order('orden').then(({ data }) => setReglas(data ?? [])) }, [])
  useEffect(() => {
    if (idPeriodo == null) return
    sb.from('monitoreos').select('*').eq('id_periodo', idPeriodo).then(({ data, error: e }) => {
      if (e) setError(e.message)
      else setMonitoreos(new Map((data ?? []).filter(m => m.id_gestion != null).map(m => [m.id_gestion as number, m])))
    })
  }, [idPeriodo])

  const base = useMemo(() => {
    const b = filtrarBase(gestiones, filtros)
    const permitidos = creditosPorRazon(b, filtros)
    return permitidos ? b.filter(g => permitidos.has(g.credito)) : b
  }, [gestiones, filtros])
  const conAlerta = useMemo(() => base.filter(g => g.alerta_mask > 0), [base])

  const q = buscar.trim().toUpperCase()
  const estadoDe = (g: GestionLigera): EstadoMon => monitoreos.get(g.id_gestion)?.estado ?? 'pendiente'
  const lista = useMemo(() => conAlerta
    .filter(g => (!bit || (g.alerta_mask & bit)) && (!prio || g.alerta_prioridad === prio) && (agente == null || g.id_agente === agente) && (!q || g.credito.includes(q)) && (!estado || estadoDe(g) === estado))
    .sort((a, b) => b.alerta_prioridad - a.alerta_prioridad || (b.fecha_actividad ?? '').localeCompare(a.fecha_actividad ?? '')),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [conAlerta, bit, prio, agente, q, estado, monitoreos])
  const visibles = lista.slice(0, limite)

  // Comentarios de las filas visibles (se descargan bajo demanda)
  const faltan = visibles.filter(g => !textos.has(g.id_gestion)).map(g => g.id_gestion)
  const claveFaltan = faltan.join(',')
  useEffect(() => {
    if (!faltan.length) return
    let vivo = true
    ;(async () => {
      const nuevos = new Map(textos)
      for (let i = 0; i < faltan.length; i += 200) {
        const { data, error: e } = await sb.from('gestiones').select('id_gestion, comentario, alerta_notas, razon_original').in('id_gestion', faltan.slice(i, i + 200))
        if (e) { setError(e.message); return }
        ;(data ?? []).forEach(d => nuevos.set(d.id_gestion, d))
      }
      if (vivo) setTextos(nuevos)
    })()
    return () => { vivo = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveFaltan])

  if (!catalogos) return null
  const nombreAg = (id: number | null) => catalogos.agentes.find(a => a.id_agente === id)?.usuario ?? 'Sin usuario'
  const nombreSup = (id: number) => catalogos.supervisores.find(s => s.id_supervisor === id)?.nombre ?? ''
  const nombreRazon = (id: number | null) => (id === null ? 'No especifica' : catalogos.razones.find(r => r.id_razon === id)?.nombre ?? '')
  const activas = reglas.filter(r => r.activa)
  const etiquetas = (mask: number) => activas.filter(r => mask & r.bit).map(r => r.nombre)
  const kp = [3, 2, 1].map(p => conAlerta.filter(g => g.alerta_prioridad === p).length)

  // Por agente
  type Ag = { g: number; c: number; p: number[]; csr: number; sup: number }
  const porAg = new Map<number, Ag>()
  let totC = 0, totCsr = 0
  for (const g of base) {
    const k = g.id_agente ?? -1
    const o = porAg.get(k) ?? { g: 0, c: 0, p: [0, 0, 0, 0], csr: 0, sup: g.id_supervisor }
    o.g++; o.sup = g.id_supervisor
    if (g.es_contacto) { o.c++; totC++; if (g.id_razon === null) { o.csr++; totCsr++ } }
    if (g.alerta_prioridad) o.p[g.alerta_prioridad]++
    porAg.set(k, o)
  }
  const tCsr = pctN(totCsr, totC)
  const filasAg = [...porAg.entries()].sort((a, b) => b[1].p[3] - a[1].p[3] || b[1].p[2] - a[1].p[2] || ordenEs(nombreAg(a[0]), nombreAg(b[0])))

  const llamada = (g: GestionLigera): LlamadaAEvaluar | null => g.id_agente == null || idPeriodo == null ? null : ({
    id_gestion: g.id_gestion, id_periodo: idPeriodo, credito: g.credito, id_agente: g.id_agente, id_supervisor: g.id_supervisor,
    agente: nombreAg(g.id_agente), fecha: fechaCorta(g.fecha_actividad),
  })
  async function escuchada(g: GestionLigera) {
    const l = llamada(g); if (!l) return
    try { const m = await marcarEscuchada(l); setMonitoreos(new Map(monitoreos).set(g.id_gestion, m)) } catch (e) { setError((e as Error).message) }
  }
  const puedeEvaluar = perfil?.rol === 'admin' || perfil?.rol === 'supervisor'

  function exportar() {
    exportarExcel('llamadas_para_escuchar', ['Prioridad', 'Fecha y hora', 'Crédito', 'Agente', 'Supervisor', 'Acción', 'Resultado', 'Razón registrada', 'Alertas', 'Detalle', 'Comentario', 'Monitoreo', 'Puntaje'],
      lista.map(g => { const t = textos.get(g.id_gestion); const m = monitoreos.get(g.id_gestion)
        return [PRIORIDADES[g.alerta_prioridad], g.fecha_actividad ?? '', g.credito, nombreAg(g.id_agente), nombreSup(g.id_supervisor), g.codigo_accion ?? '', g.codigo_resultado ?? '', nombreRazon(g.id_razon), etiquetas(g.alerta_mask).join(' · '), t?.alerta_notas ?? '', t?.comentario ?? '', m?.estado ?? 'pendiente', m?.puntaje ?? null] }))
  }

  return (
    <>
      <Filtros />
      {error && <div className="aviso error">{error}</div>}
      <div className="kpis">
        <div className="kpi rojo"><span>Alertas de prioridad alta</span><b>{nf.format(kp[0])}</b><small>{activas.filter(r => r.prioridad === 3).map(r => r.nombre.toLowerCase()).join(', ')}</small></div>
        <div className="kpi naranja"><span>Alertas de prioridad media</span><b>{nf.format(kp[1])}</b><small>{activas.filter(r => r.prioridad === 2).map(r => r.nombre.toLowerCase()).join(', ')}</small></div>
        <div className="kpi cielo"><span>Alertas de prioridad baja</span><b>{nf.format(kp[2])}</b><small>{activas.filter(r => r.prioridad === 1).map(r => r.nombre.toLowerCase()).join(', ')}</small></div>
        <div className="kpi verde"><span>Llamadas escuchadas</span><b>{nf.format([...monitoreos.values()].length)}</b><small>{nf.format([...monitoreos.values()].filter(m => m.estado === 'evaluada').length)} evaluadas este mes</small></div>
      </div>

      <div className="card">
        <div className="cabeza">
          <div><h2>Llamadas para escuchar</h2><p className="sub">{resumen}. {nf.format(lista.length)} llamadas, de la más urgente a la menos urgente y de la más reciente a la más antigua. Las alertas salen de leer el comentario de cada gestión: son una guía para escoger qué escuchar, no una conclusión.</p></div>
          <button className="btn" type="button" onClick={exportar}>Exportar a Excel</button>
        </div>
        <div className="filtros" style={{ boxShadow: 'none', padding: 0 }}>
          <div className="campo"><label htmlFor="atipo">Alerta</label>
            <select id="atipo" value={bit} onChange={e => setBit(+e.target.value)}>
              <option value={0}>Todas las alertas ({nf.format(conAlerta.length)})</option>
              {activas.map(r => <option key={r.bit} value={r.bit}>{PRIORIDADES[r.prioridad]} · {r.nombre} ({nf.format(conAlerta.filter(g => g.alerta_mask & r.bit).length)})</option>)}
            </select></div>
          <div className="campo"><label htmlFor="aprio">Prioridad</label>
            <select id="aprio" value={prio} onChange={e => setPrio(+e.target.value)}><option value={0}>Todas</option><option value={3}>Alta</option><option value={2}>Media</option><option value={1}>Baja</option></select></div>
          <div className="campo"><label htmlFor="ausr">Agente</label>
            <select id="ausr" value={agente ?? ''} onChange={e => setAgente(e.target.value === '' ? null : +e.target.value)}>
              <option value="">Todos los agentes</option>
              {[...porAg.keys()].filter(k => k >= 0).sort((a, b) => ordenEs(nombreAg(a), nombreAg(b))).map(k => <option key={k} value={k}>{nombreAg(k)}</option>)}
            </select></div>
          <div className="campo"><label htmlFor="aest">Monitoreo</label>
            <select id="aest" value={estado} onChange={e => setEstado(e.target.value as EstadoMon)}><option value="">Todas</option><option value="pendiente">Sin escuchar</option><option value="escuchada">Escuchadas sin evaluar</option><option value="evaluada">Evaluadas</option></select></div>
          <div className="campo"><label htmlFor="abus">Crédito</label><input id="abus" value={buscar} onChange={e => setBuscar(e.target.value)} /></div>
        </div>
        <div className="wrap" style={{ marginTop: 10 }}><table>
          <thead><tr><th>Prioridad</th><th>Fecha y hora</th><th>Crédito</th><th>Agente</th><th>Supervisor</th><th>Acción · resultado</th><th>Razón registrada</th><th>Alerta</th><th>Comentario</th><th>Monitoreo</th></tr></thead>
          <tbody>{visibles.map(g => {
            const t = textos.get(g.id_gestion); const m = monitoreos.get(g.id_gestion); const l = llamada(g)
            return (
              <tr key={g.id_gestion}>
                <td><span className={'prio p' + g.alerta_prioridad}>{PRIORIDADES[g.alerta_prioridad]}</span></td>
                <td className="nw">{fechaCorta(g.fecha_actividad)}</td>
                <td className="nw"><b>{g.credito}</b></td>
                <td>{nombreAg(g.id_agente)}</td>
                <td>{nombreSup(g.id_supervisor)}</td>
                <td className="nw">{g.codigo_accion} · {g.codigo_resultado}</td>
                <td>{nombreRazon(g.id_razon)}</td>
                <td>{etiquetas(g.alerta_mask).map(e => <div key={e}>{e}</div>)}{t?.alerta_notas && <div className="sub">{t.alerta_notas}</div>}</td>
                <td className="coment">{t ? t.comentario : '…'}</td>
                <td className="nw">
                  {m?.estado === 'evaluada' && <div><span className="puntaje">{m.puntaje}</span> <span className="sub">{nivelDe(m.puntaje)}</span></div>}
                  {m?.estado === 'escuchada' && <div><span className="tag verde">Escuchada</span></div>}
                  {puedeEvaluar && l && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      {!m && <button className="btn2 mini" type="button" onClick={() => escuchada(g)}>Escuchada</button>}
                      {(!m || m.creado_por === perfil?.user_id || perfil?.rol === 'admin') && <button className="btn mini" type="button" onClick={() => setEvaluando({ l, previo: m ?? null })}>{m?.estado === 'evaluada' ? 'Editar' : 'Evaluar'}</button>}
                    </div>
                  )}
                </td>
              </tr>
            )
          })}</tbody>
        </table></div>
        {!lista.length && <p className="vacio">No hay alertas con estos filtros.</p>}
        {lista.length > limite && <p style={{ textAlign: 'center' }}><button className="btn2" type="button" onClick={() => setLimite(limite + 100)}>Ver 100 más</button></p>}
      </div>

      <div className="card">
        <h2>Alertas por agente</h2>
        <p className="sub">Tocá un agente para ver solo sus llamadas. «Contactos sin razón» es el porcentaje de gestiones con contacto en las que no se registró la razón; en rojo, los que están 3 puntos o más por encima del total ({pct(totCsr, totC)}).</p>
        <div className="wrap"><table>
          <thead><tr><th>Agente</th><th>Supervisor</th><th className="n">Gestiones</th><th className="n">Contactos</th><th className="n">Alta</th><th className="n">Media</th><th className="n">Baja</th><th className="n">Contactos sin razón</th></tr></thead>
          <tbody>{filasAg.map(([k, o]) => (
            <tr key={k} className={'click' + (agente === k ? ' on' : '')} onClick={() => setAgente(agente === k ? null : k)}>
              <td>{nombreAg(k < 0 ? null : k)}</td><td>{nombreSup(o.sup)}</td><td className="n">{nf.format(o.g)}</td><td className="n">{nf.format(o.c)}</td>
              <td className="n">{o.p[3] || ''}</td><td className="n">{o.p[2] || ''}</td><td className="n">{o.p[1] || ''}</td>
              <td className={'n ' + (o.c >= 30 && pctN(o.csr, o.c) - tCsr >= 3 ? 'peor' : '')}>{pct(o.csr, o.c)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>

      {evaluando && (
        <Evaluacion llamada={evaluando.l} previo={evaluando.previo} cerrar={() => setEvaluando(null)}
          guardado={m => { if (m.id_gestion != null) setMonitoreos(new Map(monitoreos).set(m.id_gestion, m)) }} />
      )}
    </>
  )
}
