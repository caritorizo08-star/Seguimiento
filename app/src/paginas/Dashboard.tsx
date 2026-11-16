import { Fragment, useMemo, useState } from 'react'
import { useDatos } from '../estado'
import { Filtros, useResumenFiltros } from '../componentes/Filtros'
import { DetalleCredito } from '../componentes/DetalleCredito'
import { filtrarGestiones, porCredito, rzKey } from '../lib/calculos'
import { exportarExcel } from '../lib/excel'
import { cordobas, nf, ordenEs, pct } from '../lib/util'

export default function Dashboard() {
  const { gestiones, catalogos, filtros } = useDatos()
  const resumen = useResumenFiltros()
  const [vista, setVista] = useState<'g' | 'c'>('g')
  const [orden, setOrden] = useState<'saldo' | 'alertas' | 'gestiones' | 'credito'>('saldo')
  const [abierto, setAbierto] = useState<string | null>(null)
  const [limite, setLimite] = useState(100)
  const [buscar, setBuscar] = useState('')

  const g = useMemo(() => filtrarGestiones(gestiones, filtros), [gestiones, filtros])
  const creditos = useMemo(() => porCredito(g), [g])
  if (!catalogos) return null

  const nombreRazon = (k: number) => (k === 0 ? 'No especifica' : catalogos.razones.find(r => r.id_razon === k)?.nombre ?? '?')
  const nombreSup = (id: number) => catalogos.supervisores.find(s => s.id_supervisor === id)?.nombre ?? '?'

  // Conteo por razón: gestiones o créditos distintos
  const porRazon = new Map<number, Set<string> | number>()
  for (const x of g) {
    const k = rzKey(x.id_razon)
    if (vista === 'g') porRazon.set(k, ((porRazon.get(k) as number) ?? 0) + 1)
    else { const s = (porRazon.get(k) as Set<string>) ?? new Set<string>(); s.add(x.credito); porRazon.set(k, s) }
  }
  const val = (v: Set<string> | number | undefined) => (v === undefined ? 0 : typeof v === 'number' ? v : v.size)
  const filasRazon = [...porRazon.entries()].map(([k, v]) => ({ k, n: val(v) })).sort((a, b) => b.n - a.n)
  const totalRazon = filasRazon.reduce((s, r) => s + r.n, 0)
  const maxRazon = filasRazon[0]?.n ?? 1

  // Razón × supervisor
  const sups = [...new Set(g.map(x => x.id_supervisor))].sort((a, b) => ordenEs(nombreSup(a), nombreSup(b)))
  const cruce = new Map<string, Set<string> | number>()
  for (const x of g) {
    const key = rzKey(x.id_razon) + '|' + x.id_supervisor
    if (vista === 'g') cruce.set(key, ((cruce.get(key) as number) ?? 0) + 1)
    else { const s = (cruce.get(key) as Set<string>) ?? new Set<string>(); s.add(x.credito); cruce.set(key, s) }
  }

  // Tipo de crédito
  const tipos = [...new Set(g.map(x => x.tipo_credito ?? 'SIN TIPO'))].sort(ordenEs)
  const resumenTipo = tipos.map(t => {
    const gs = g.filter(x => (x.tipo_credito ?? 'SIN TIPO') === t)
    const cs = new Set(gs.map(x => x.credito))
    const saldo = [...cs].reduce((s, c) => s + (creditos.get(c)?.saldo ?? 0), 0)
    return { t, n: gs.length, c: cs.size, saldo }
  })
  const cruceTipo = new Map<string, number>()
  for (const x of g) { const key = rzKey(x.id_razon) + '|' + (x.tipo_credito ?? 'SIN TIPO'); cruceTipo.set(key, (cruceTipo.get(key) ?? 0) + 1) }

  // Detalle por cuenta
  const q = buscar.trim().toUpperCase()
  const lista = [...creditos.values()].filter(c => !q || c.credito.includes(q) || c.cliente.toUpperCase().includes(q))
  lista.sort((a, b) => orden === 'saldo' ? b.saldo - a.saldo : orden === 'alertas' ? b.alertas - a.alertas || b.maxPrioridad - a.maxPrioridad
    : orden === 'gestiones' ? b.gestiones - a.gestiones : a.credito.localeCompare(b.credito))
  const saldoTotal = [...creditos.values()].reduce((s, c) => s + c.saldo, 0)
  const conRazon = g.filter(x => x.id_razon !== null).length

  function exportar() {
    exportarExcel('detalle_por_cuenta', ['Crédito', 'Cliente', 'Cartera', 'Tipo', 'Supervisor (última gestión)', 'Gestiones', 'Razones del mes', 'Saldo (C$)', 'Alertas'],
      lista.map(c => [c.credito, c.cliente, c.cartera, c.tipo, nombreSup(c.id_supervisor), c.gestiones, [...c.razones].map(nombreRazon).join(', ') || 'No especifica', Math.round(c.saldo), c.alertas]))
  }

  return (
    <>
      <Filtros conExcluir />
      <div className="kpis">
        <div className="kpi"><span>Gestiones</span><b>{nf.format(g.length)}</b><small>{resumen}</small></div>
        <div className="kpi verde"><span>Créditos gestionados</span><b>{nf.format(creditos.size)}</b><small>{cordobas(saldoTotal)} de saldo</small></div>
        <div className="kpi cielo"><span>Gestiones con razón de mora</span><b>{pct(conRazon, g.length)}</b><small>{nf.format(conRazon)} de {nf.format(g.length)}</small></div>
      </div>

      <div className="card">
        <div className="cabeza">
          <div><h2>Razones de mora</h2><p className="sub">{vista === 'g' ? 'Número de gestiones' : 'Créditos distintos'} por razón registrada.</p></div>
          <div className="seg"><button type="button" className={vista === 'g' ? 'on' : ''} onClick={() => setVista('g')}>Gestiones</button><button type="button" className={vista === 'c' ? 'on' : ''} onClick={() => setVista('c')}>Créditos</button></div>
        </div>
        <div className="barras">
          {filasRazon.map(r => (
            <div className="barra" key={r.k}><div>{nombreRazon(r.k)}</div><div className="t"><i style={{ width: `${(100 * r.n) / maxRazon}%` }} /></div><div className="v">{nf.format(r.n)}<em>{pct(r.n, totalRazon)}</em></div></div>
          ))}
          {!filasRazon.length && <p className="sub">No hay gestiones con estos filtros.</p>}
        </div>
      </div>

      <div className="card">
        <h2>Razón por supervisor</h2>
        <p className="sub">{vista === 'g' ? 'Gestiones' : 'Créditos distintos'} de cada razón según el supervisor de la gestión.</p>
        <div className="wrap"><table>
          <thead><tr><th>Razón de mora</th>{sups.map(s => <th key={s} className="n">{nombreSup(s)}</th>)}<th className="n">Total</th></tr></thead>
          <tbody>{filasRazon.map(r => (
            <tr key={r.k}><td>{nombreRazon(r.k)}</td>{sups.map(s => <td key={s} className="n">{nf.format(val(cruce.get(r.k + '|' + s)))}</td>)}<td className="n"><b>{nf.format(r.n)}</b></td></tr>
          ))}</tbody>
        </table></div>
      </div>

      <div className="card">
        <h2>Resumen por tipo de crédito</h2>
        <div className="wrap"><table>
          <thead><tr><th>Tipo de crédito</th><th className="n">Gestiones</th><th className="n">% del total</th><th className="n">Créditos distintos</th><th className="n">Saldo (C$)</th></tr></thead>
          <tbody>{resumenTipo.map(r => <tr key={r.t}><td>{r.t}</td><td className="n">{nf.format(r.n)}</td><td className="n">{pct(r.n, g.length)}</td><td className="n">{nf.format(r.c)}</td><td className="n">{nf.format(Math.round(r.saldo))}</td></tr>)}</tbody>
        </table></div>
      </div>

      <div className="card">
        <h2>Razón de mora por tipo de crédito</h2>
        <p className="sub">Número de gestiones.</p>
        <div className="wrap"><table>
          <thead><tr><th>Razón de mora</th>{tipos.map(t => <th key={t} className="n">{t}</th>)}<th className="n">Total</th></tr></thead>
          <tbody>{filasRazon.map(r => {
            const fila = tipos.map(t => cruceTipo.get(r.k + '|' + t) ?? 0)
            return <tr key={r.k}><td>{nombreRazon(r.k)}</td>{fila.map((n, i) => <td key={tipos[i]} className="n">{nf.format(n)}</td>)}<td className="n"><b>{nf.format(fila.reduce((a, b) => a + b, 0))}</b></td></tr>
          })}</tbody>
        </table></div>
      </div>

      <div className="card">
        <div className="cabeza">
          <div><h2>Detalle por cuenta</h2><p className="sub">{nf.format(lista.length)} créditos. Tocá un crédito para ver sus gestiones del mes.</p></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="campo"><label htmlFor="dbus">Buscar crédito o cliente</label><input id="dbus" value={buscar} onChange={e => setBuscar(e.target.value)} /></div>
            <div className="campo"><label htmlFor="dord">Ordenar por</label>
              <select id="dord" value={orden} onChange={e => setOrden(e.target.value as typeof orden)}>
                <option value="saldo">Saldo</option><option value="alertas">Alertas</option><option value="gestiones">Número de gestiones</option><option value="credito">Crédito</option>
              </select></div>
            <button className="btn" type="button" onClick={exportar}>Exportar a Excel</button>
          </div>
        </div>
        <div className="wrap"><table>
          <thead><tr><th>Crédito</th><th>Cliente</th><th>Tipo</th><th>Supervisor (última gestión)</th><th className="n">Gestiones</th><th>Razones del mes</th><th className="n">Saldo (C$)</th><th className="n">Alertas</th></tr></thead>
          <tbody>{lista.slice(0, limite).map(c => (
            <Fragment key={c.credito}>
              <tr className={'click' + (abierto === c.credito ? ' on' : '')} tabIndex={0} aria-expanded={abierto === c.credito}
                onClick={() => setAbierto(abierto === c.credito ? null : c.credito)} onKeyDown={e => { if (e.key === 'Enter') setAbierto(abierto === c.credito ? null : c.credito) }}>
                <td className="nw"><b>{abierto === c.credito ? '▾' : '▸'} {c.credito}</b></td><td>{c.cliente}</td><td>{c.tipo}</td><td>{nombreSup(c.id_supervisor)}</td>
                <td className="n">{c.gestiones}</td><td>{[...c.razones].map(k => <span key={k} className="tag">{nombreRazon(k)}</span>)}</td>
                <td className="n">{nf.format(Math.round(c.saldo))}</td><td className="n">{c.alertas ? <span className={'prio p' + c.maxPrioridad}>{c.alertas}</span> : ''}</td>
              </tr>
              {abierto === c.credito && <DetalleCredito credito={c.credito} columnas={8} />}
            </Fragment>
          ))}</tbody>
        </table></div>
        {lista.length > limite && <p style={{ textAlign: 'center' }}><button className="btn2" type="button" onClick={() => setLimite(limite + 200)}>Ver 200 más</button></p>}
      </div>
    </>
  )
}
