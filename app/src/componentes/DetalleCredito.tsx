import { useEffect, useState } from 'react'
import { sb } from '../lib/supabase'
import { useDatos } from '../estado'
import type { GestionDetalle } from '../lib/tipos'
import { PRIORIDADES } from '../lib/alertas'
import { cordobas, fechaCorta } from '../lib/util'

/** Gestiones del mes de un crédito, con comentario (se descargan al abrir). */
export function DetalleCredito({ credito, columnas }: { credito: string; columnas: number }) {
  const { idPeriodo, catalogos } = useDatos()
  const [filas, setFilas] = useState<GestionDetalle[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (idPeriodo == null) return
    sb.from('gestiones').select('*').eq('id_periodo', idPeriodo).eq('credito', credito).order('fecha_actividad').then(({ data, error: e }) => {
      if (e) setError(e.message); else setFilas(data ?? [])
    })
  }, [credito, idPeriodo])
  const agente = (id: number | null) => catalogos?.agentes.find(a => a.id_agente === id)?.usuario ?? ''
  const razon = (id: number | null) => (id ? catalogos?.razones.find(r => r.id_razon === id)?.nombre : 'No especifica')
  return (
    <tr className="det"><td colSpan={columnas} style={{ background: 'var(--navy-tinte)' }}>
      {error && <div className="aviso error">{error}</div>}
      {!filas && !error && <span className="sub">Cargando gestiones…</span>}
      {filas && (
        <div className="wrap"><table>
          <thead><tr><th>Fecha</th><th>Agente</th><th>Acción · resultado</th><th>Razón</th><th>Promesa</th><th>Alerta</th><th>Comentario</th></tr></thead>
          <tbody>{filas.map(g => (
            <tr key={g.id_gestion}>
              <td className="nw">{fechaCorta(g.fecha_actividad?.replace('T', ' '))}</td>
              <td>{agente(g.id_agente)}</td>
              <td className="nw">{g.codigo_accion} · {g.codigo_resultado}</td>
              <td>{razon(g.id_razon)}</td>
              <td className="nw">{g.fecha_promesa ? `${fechaCorta(g.fecha_promesa)} · ${cordobas(g.monto_promesa ?? 0)}` : ''}</td>
              <td>{g.alerta_prioridad ? <span className={'prio p' + g.alerta_prioridad}>{PRIORIDADES[g.alerta_prioridad]}</span> : ''}{g.alerta_notas && <div className="sub">{g.alerta_notas}</div>}</td>
              <td className="coment">{g.comentario}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </td></tr>
  )
}
