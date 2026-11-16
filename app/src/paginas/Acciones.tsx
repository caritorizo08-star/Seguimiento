import { useMemo, useState } from 'react'
import { useDatos } from '../estado'
import { Filtros } from '../componentes/Filtros'
import { creditosPorRazon, filtrarBase, porCredito } from '../lib/calculos'
import { exportarExcel } from '../lib/excel'
import { cordobas, fechaCorta, nf } from '../lib/util'

const OTRAS = { id_accion: 'otras', nombre_corto: 'Otras razones', titulo: 'Revisar caso por caso', descripcion: 'Razones que no tienen una acción definida. Revisarlas con el supervisor.', color: '#5B6170', orden: 99 }

/** Cada crédito queda en una sola acción, según su razón de mora más reciente; sin razón → "Volver a llamar". */
export default function Acciones() {
  const { gestiones, catalogos, filtros } = useDatos()
  const [sel, setSel] = useState<string>('')
  const [limite, setLimite] = useState(200)
  const base = useMemo(() => filtrarBase(gestiones, filtros), [gestiones, filtros])
  const creditos = useMemo(() => {
    const permitidos = creditosPorRazon(base, filtros)
    return [...porCredito(base).values()].filter(c => !permitidos || permitidos.has(c.credito))
  }, [base, filtros])
  if (!catalogos) return null

  const acciones = [...catalogos.acciones, OTRAS]
  const accionDe = (idRazon: number | null) => {
    if (idRazon === null) return 'sinrazon'
    return catalogos.razones.find(r => r.id_razon === idRazon)?.id_accion ?? 'otras'
  }
  const grupos = new Map<string, typeof creditos>()
  for (const c of creditos) { const a = accionDe(c.ultimaRazon); grupos.set(a, [...(grupos.get(a) ?? []), c]) }
  const visibles = acciones.filter(a => grupos.get(a.id_accion)?.length)
  const actual = sel && grupos.get(sel) ? sel : visibles[0]?.id_accion ?? ''
  const lista = (grupos.get(actual) ?? []).slice().sort((a, b) => b.saldo - a.saldo)
  const nombreRazon = (id: number | null) => (id === null ? 'No especifica' : catalogos.razones.find(r => r.id_razon === id)?.nombre ?? '')
  const nombreSup = (id: number) => catalogos.supervisores.find(s => s.id_supervisor === id)?.nombre ?? ''
  const acc = acciones.find(a => a.id_accion === actual)

  function exportar(todas: boolean) {
    const filas = (todas ? creditos : lista).map(c => [
      acciones.find(a => a.id_accion === accionDe(c.ultimaRazon))?.nombre_corto ?? '', c.credito, c.cliente, nombreRazon(c.ultimaRazon), nombreSup(c.id_supervisor), c.cartera, c.tipo,
      Math.round(c.saldo), c.gestiones, fechaCorta(c.ultimaFecha), c.ultimoResultado,
    ])
    exportarExcel(todas ? 'acciones_todas' : 'acciones_' + actual, ['Acción', 'Crédito', 'Cliente', 'Razón de mora (última)', 'Supervisor', 'Cartera', 'Tipo de crédito', 'Saldo (C$)', 'Gestiones', 'Última gestión', 'Código resultado'], filas)
  }

  return (
    <>
      <Filtros />
      <div className="card">
        <div className="cabeza">
          <div><h2>Acciones a tomar</h2><p className="sub">{nf.format(creditos.length)} créditos distintos. Cada crédito queda en una sola acción, según su razón de mora más reciente; los que nunca dieron razón quedan en «Volver a llamar».</p></div>
          <button className="btn2" type="button" onClick={() => exportar(true)}>Exportar todas a Excel</button>
        </div>
        <div className="acciones">
          {visibles.map(a => {
            const n = grupos.get(a.id_accion)!.length
            const claro = ['#93BF02', '#F2C20C'].includes(a.color.toUpperCase())
            return (
              <div key={a.id_accion} className={'accion' + (a.id_accion === actual ? ' on' : '')} style={{ background: a.color, color: claro ? 'var(--navy)' : '#fff' }}
                role="button" tabIndex={0} onClick={() => { setSel(a.id_accion); setLimite(200) }} onKeyDown={e => { if (e.key === 'Enter') setSel(a.id_accion) }}>
                <b>{nf.format(n)}</b><h4>{a.titulo}</h4><p>{a.descripcion}</p>
              </div>
            )
          })}
        </div>
      </div>
      {acc && (
        <div className="card">
          <div className="cabeza">
            <div><h2>{acc.titulo}</h2><p className="sub">{nf.format(lista.length)} créditos · {cordobas(lista.reduce((s, c) => s + c.saldo, 0))} de saldo. Ordenados por saldo.</p></div>
            <button className="btn" type="button" onClick={() => exportar(false)}>Exportar a Excel</button>
          </div>
          <div className="wrap"><table>
            <thead><tr><th>Crédito</th><th>Cliente</th><th>Razón (última)</th><th>Supervisor</th><th>Cartera</th><th>Tipo</th><th className="n">Saldo (C$)</th><th className="n">Gestiones</th><th>Última gestión</th><th>Resultado</th></tr></thead>
            <tbody>{lista.slice(0, limite).map(c => (
              <tr key={c.credito}><td className="nw"><b>{c.credito}</b></td><td>{c.cliente}</td><td>{nombreRazon(c.ultimaRazon)}</td><td>{nombreSup(c.id_supervisor)}</td><td>{c.cartera}</td><td>{c.tipo}</td>
                <td className="n">{nf.format(Math.round(c.saldo))}</td><td className="n">{c.gestiones}</td><td className="nw">{fechaCorta(c.ultimaFecha)}</td><td>{c.ultimoResultado}</td></tr>
            ))}</tbody>
          </table></div>
          {lista.length > limite && <p style={{ textAlign: 'center' }}><button className="btn2" type="button" onClick={() => setLimite(limite + 300)}>Ver 300 más</button></p>}
        </div>
      )}
    </>
  )
}
