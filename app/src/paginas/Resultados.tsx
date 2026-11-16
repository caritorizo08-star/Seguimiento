import { useMemo, useState } from 'react'
import { useDatos } from '../estado'
import { Filtros, useResumenFiltros } from '../componentes/Filtros'
import { creditosPorRazon, filtrarBase, porCredito, rzKey } from '../lib/calculos'
import { exportarExcel } from '../lib/excel'
import type { Cierre } from '../lib/tipos'
import { cordobas, nf, nombreMes, ordenEs, pct, pctN, TRAMOS } from '../lib/util'

const MIN_N = 30

interface Acum { n: number; saldo: number; algo: number; cuota: number; mejoro: number; desmejoro: number; conProm: number; cumplida: number; incPago: number; cobrado: number; meta: number }
const nuevo = (): Acum => ({ n: 0, saldo: 0, algo: 0, cuota: 0, mejoro: 0, desmejoro: 0, conProm: 0, cumplida: 0, incPago: 0, cobrado: 0, meta: 0 })

function sumar(a: Acum, c: Cierre, mesPeriodo: string) {
  a.n++
  a.saldo += c.saldo_inicio ?? 0
  const rec = c.recaudo_mes ?? 0
  if (rec > 0) a.algo++
  if (c.pago_vs_cuota === '>=CUO') a.cuota++
  if (c.rodamiento === 'MEJORA' || c.rodamiento === 'CANCELADO') a.mejoro++
  if (c.rodamiento === 'DESMEJORA') a.desmejoro++
  if (c.fecha_ultima_promesa?.slice(0, 7) === mesPeriodo) {
    a.conProm++
    if (c.estatus_ult_promesa === 'Cumplida') a.cumplida++
    else if (c.estatus_ult_promesa === 'Incumplida' && rec > 0) a.incPago++
  }
  a.cobrado += rec
  a.meta += c.recaudo_meta ?? 0
}

/** Celda de porcentaje con color: 3 puntos o más mejor/peor que el total; gris si hay menos de 30 créditos. */
function Celda({ a, b, total, mejorEsMas = true }: { a: number; b: number; total: number; mejorEsMas?: boolean }) {
  const v = pctN(a, b)
  const dif = v - total
  const cls = b < MIN_N ? 'poco' : Math.abs(dif) >= 3 ? ((dif > 0) === mejorEsMas ? 'mejor' : 'peor') : ''
  return <td className={'n ' + cls}>{pct(a, b)}</td>
}

export default function Resultados() {
  const { gestiones, cierre, catalogos, filtros, idPeriodo } = useDatos()
  const resumen = useResumenFiltros()
  const [tramo, setTramo] = useState<string>('mora')
  const [porUnidad, setPorUnidad] = useState(false)
  const [conJuridico, setConJuridico] = useState(false)
  const [excluirNE, setExcluirNE] = useState(true)

  const base = useMemo(() => filtrarBase(gestiones, filtros), [gestiones, filtros])
  const creditos = useMemo(() => porCredito(base), [base])
  const permitidos = useMemo(() => creditosPorRazon(base, filtros), [base, filtros])
  const conRazonTodos = useMemo(() => new Set(gestiones.filter(g => g.id_razon !== null).map(g => g.credito)), [gestiones])
  const enBase = useMemo(() => new Set(gestiones.map(g => g.credito)), [gestiones])

  if (!catalogos) return null
  const periodo = catalogos.periodos.find(p => p.id_periodo === idPeriodo)
  if (!cierre.length) return <div className="card vacio">Este mes no tiene cierre de cartera cargado. Cargalo desde «Cargar mes» para ver los resultados.</div>
  const mesPeriodo = periodo ? `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}` : ''
  const nombreRazon = (k: number) => (k === 0 ? 'No especifica' : catalogos.razones.find(r => r.id_razon === k)?.nombre ?? '?')
  const ci = new Map(cierre.map(c => [c.credito, c]))

  // ---- Resultados por razón (cada crédito con su primera razón del mes) ----
  const pasaTramo = (c: Cierre) => tramo === 'all' ? true : tramo === 'mora' ? (c.tramo_inicio ?? 0) >= 1 : c.tramo_inicio === +tramo
  const porRazon = new Map<number, Acum>()
  const porRazonTramo = new Map<string, Acum>()
  const total = nuevo()
  for (const cr of creditos.values()) {
    if (permitidos && !permitidos.has(cr.credito)) continue
    const c = ci.get(cr.credito)
    if (!c) continue
    const k = rzKey(cr.primeraRazon)
    if (c.tramo_inicio != null) {
      const kt = k + '|' + c.tramo_inicio
      const at = porRazonTramo.get(kt) ?? nuevo(); sumar(at, c, mesPeriodo); porRazonTramo.set(kt, at)
    }
    if (!pasaTramo(c)) continue
    const a = porRazon.get(k) ?? nuevo(); sumar(a, c, mesPeriodo); porRazon.set(k, a)
    sumar(total, c, mesPeriodo)
  }
  const filas = [...porRazon.entries()].sort((a, b) => b[1].n - a[1].n)
  const tAlgo = pctN(total.algo, total.n), tCuota = pctN(total.cuota, total.n), tMejoro = pctN(total.mejoro, total.n), tDesm = pctN(total.desmejoro, total.n)
  const tramoTodos: Record<number, Acum> = {}
  porRazonTramo.forEach((a, k) => { const t = +k.split('|')[1]; const x = tramoTodos[t] ?? nuevo(); Object.keys(a).forEach(key => { (x as unknown as Record<string, number>)[key] += (a as unknown as Record<string, number>)[key] }); tramoTodos[t] = x })

  // ---- Cobertura de la cartera en mora (no usa los filtros de arriba) ----
  const nombreSup = (id: number | null) => (id == null ? 'Sin Supervisor' : catalogos.supervisores.find(s => s.id_supervisor === id)?.nombre ?? '?')
  type Cob = { n: number; saldo: number; conRazon: number; sinRazonContacto: number; sinRazonSinContacto: number; otros: number; sinGestion: number }
  const cob = new Map<string, Cob>()
  const cobTot: Cob = { n: 0, saldo: 0, conRazon: 0, sinRazonContacto: 0, sinRazonSinContacto: 0, otros: 0, sinGestion: 0 }
  for (const c of cierre) {
    if ((c.tramo_inicio ?? 0) < 1) continue
    if (!conJuridico && c.tipo_cartera === 'JUR') continue
    const k = porUnidad ? (c.unidad || 'Sin unidad') : nombreSup(c.id_supervisor)
    const o = cob.get(k) ?? { n: 0, saldo: 0, conRazon: 0, sinRazonContacto: 0, sinRazonSinContacto: 0, otros: 0, sinGestion: 0 }
    for (const x of [o, cobTot]) {
      x.n++; x.saldo += c.saldo_inicio ?? 0
      if (conRazonTodos.has(c.credito)) x.conRazon++
      else if (enBase.has(c.credito)) { if ((c.rpc ?? 0) > 0) x.sinRazonContacto++; else x.sinRazonSinContacto++ }
      else if ((c.gestiones ?? 0) > 0) x.otros++
      else x.sinGestion++
    }
    cob.set(k, o)
  }
  const filasCob = [...cob.entries()].sort((a, b) => ordenEs(a[0], b[0]))

  // ---- Cobro por razón ----
  const cobro = filas.filter(([k]) => !(excluirNE && k === 0))
  const cobroTotal = cobro.reduce((s, [, a]) => s + a.cobrado, 0)

  const tramoTxt = tramo === 'mora' ? 'en mora al inicio del mes (1 día o más)' : tramo === 'all' ? 'todos los tramos' : TRAMOS[+tramo]
  return (
    <>
      <Filtros />
      <div className="card">
        <div className="cabeza">
          <div><h2>Resultados al cierre por razón de mora</h2><p className="sub">{resumen} · {tramoTxt}. Cada crédito cuenta una vez, con su primera razón de mora del mes{periodo ? ` (${nombreMes(periodo.anio, periodo.mes)})` : ''}.</p></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div className="campo"><label htmlFor="rtr">Tramo al inicio del mes</label>
              <select id="rtr" value={tramo} onChange={e => setTramo(e.target.value)}>
                <option value="mora">En mora (1 día o más)</option><option value="all">Todos los tramos</option>
                {TRAMOS.map((t, i) => <option key={t} value={i}>{t}</option>)}
              </select></div>
            <button className="btn2" type="button" onClick={() => exportarExcel('resultados_por_razon', ['Razón de mora', 'Créditos', 'Saldo al inicio (C$)', '% pagó algo', '% pagó la cuota o más', '% mejoró o canceló', '% desmejoró'],
              filas.map(([k, a]) => [nombreRazon(k), a.n, Math.round(a.saldo), +pctN(a.algo, a.n).toFixed(1), +pctN(a.cuota, a.n).toFixed(1), +pctN(a.mejoro, a.n).toFixed(1), +pctN(a.desmejoro, a.n).toFixed(1)]))}>Exportar</button>
          </div>
        </div>
        <div className="wrap"><table>
          <thead><tr><th>Razón de mora</th><th className="n">Créditos</th><th className="n">% de los créditos</th><th className="n">Saldo al inicio (C$)</th><th className="n">Pagó algo en el mes</th><th className="n">Pagó la cuota o más</th><th className="n">Mejoró o canceló</th><th className="n">Desmejoró</th></tr></thead>
          <tbody>{filas.map(([k, a]) => (
            <tr key={k}><td>{nombreRazon(k)}</td><td className="n">{nf.format(a.n)}</td><td className="n">{pct(a.n, total.n)}</td><td className="n">{nf.format(Math.round(a.saldo))}</td>
              <Celda a={a.algo} b={a.n} total={tAlgo} /><Celda a={a.cuota} b={a.n} total={tCuota} /><Celda a={a.mejoro} b={a.n} total={tMejoro} /><Celda a={a.desmejoro} b={a.n} total={tDesm} mejorEsMas={false} /></tr>
          ))}</tbody>
          <tfoot><tr><td>Total</td><td className="n">{nf.format(total.n)}</td><td className="n">100%</td><td className="n">{nf.format(Math.round(total.saldo))}</td><td className="n">{pct(total.algo, total.n)}</td><td className="n">{pct(total.cuota, total.n)}</td><td className="n">{pct(total.mejoro, total.n)}</td><td className="n">{pct(total.desmejoro, total.n)}</td></tr></tfoot>
        </table></div>
        <p className="sub">Verde o rojo: 3 puntos o más mejor o peor que el total. En gris: menos de {MIN_N} créditos, el porcentaje no es confiable. «Mejoró o canceló» y «Desmejoró» salen del rodamiento del cierre.</p>
      </div>

      <div className="card">
        <h2>Por tramo de mora al inicio del mes</h2>
        <p className="sub">Porcentaje que pagó algo en el mes; abajo, el número de créditos. Esta tabla no usa el filtro de tramo.</p>
        <div className="wrap"><table>
          <thead><tr><th>Razón de mora</th>{TRAMOS.map(t => <th key={t} className="n">{t}</th>)}</tr></thead>
          <tbody>{filas.map(([k]) => (
            <tr key={k}><td>{nombreRazon(k)}</td>{TRAMOS.map((_t, i) => {
              const a = porRazonTramo.get(k + '|' + i); const tt = tramoTodos[i]
              if (!a) return <td key={i} className="n poco">—</td>
              const dif = pctN(a.algo, a.n) - pctN(tt?.algo ?? 0, tt?.n ?? 0)
              const cls = a.n < MIN_N ? 'poco' : Math.abs(dif) >= 3 ? (dif > 0 ? 'mejor' : 'peor') : ''
              return <td key={i} className={'n ' + cls}>{pct(a.algo, a.n)}<div className="sub" style={{ margin: 0 }}>{nf.format(a.n)}</div></td>
            })}</tr>
          ))}</tbody>
        </table></div>
      </div>

      <div className="card">
        <h2>Promesas de pago</h2>
        <p className="sub">Créditos de la primera tabla (mismos filtros y tramo). Se cuenta la última promesa del cierre, solo si su fecha es del mes{periodo ? ` (${nombreMes(periodo.anio, periodo.mes)})` : ''}. Un cliente puede incumplir la promesa y aun así pagar una parte.</p>
        <div className="wrap"><table>
          <thead><tr><th>Razón de mora</th><th className="n">Créditos</th><th className="n">Con promesa en el mes</th><th className="n">Promesa cumplida</th><th className="n">Incumplieron pero pagaron algo</th><th className="n">Sin promesa en el mes</th></tr></thead>
          <tbody>{filas.map(([k, a]) => (
            <tr key={k}><td>{nombreRazon(k)}</td><td className="n">{nf.format(a.n)}</td><td className="n">{pct(a.conProm, a.n)}</td><td className="n">{pct(a.cumplida, a.conProm)}</td><td className="n">{pct(a.incPago, a.conProm)}</td><td className="n">{pct(a.n - a.conProm, a.n)}</td></tr>
          ))}</tbody>
          <tfoot><tr><td>Total</td><td className="n">{nf.format(total.n)}</td><td className="n">{pct(total.conProm, total.n)}</td><td className="n">{pct(total.cumplida, total.conProm)}</td><td className="n">{pct(total.incPago, total.conProm)}</td><td className="n">{pct(total.n - total.conProm, total.n)}</td></tr></tfoot>
        </table></div>
      </div>

      <div className="card">
        <div className="cabeza">
          <div><h2>Cobro por razón de mora</h2><p className="sub">Cuánto se cobró en el mes a los créditos de cada razón (primera razón del mes), según el cierre.</p></div>
          <label className="chk"><input type="checkbox" checked={excluirNE} onChange={e => setExcluirNE(e.target.checked)} /> Excluir «No especifica»</label>
        </div>
        <div className="wrap"><table>
          <thead><tr><th>Razón de mora</th><th className="n">Créditos</th><th className="n">Saldo al inicio (C$)</th><th className="n">Cobrado en el mes (C$)</th><th className="n">% del cobro</th><th className="n">Meta de recaudo (C$)</th><th className="n">% de la meta</th></tr></thead>
          <tbody>{[...cobro].sort((a, b) => b[1].cobrado - a[1].cobrado).map(([k, a]) => (
            <tr key={k}><td>{nombreRazon(k)}</td><td className="n">{nf.format(a.n)}</td><td className="n">{nf.format(Math.round(a.saldo))}</td><td className="n"><b>{nf.format(Math.round(a.cobrado))}</b></td><td className="n">{pct(a.cobrado, cobroTotal)}</td><td className="n">{nf.format(Math.round(a.meta))}</td><td className="n">{pct(a.cobrado, a.meta)}</td></tr>
          ))}</tbody>
          <tfoot><tr><td>Total</td><td className="n">{nf.format(cobro.reduce((s, [, a]) => s + a.n, 0))}</td><td></td><td className="n">{cordobas(cobroTotal)}</td><td></td><td></td><td></td></tr></tfoot>
        </table></div>
      </div>

      <div className="card">
        <div className="cabeza">
          <div><h2>Cobertura de la cartera en mora</h2><p className="sub">Todos los créditos del cierre en mora al inicio del mes{conJuridico ? ', incluido el cobro jurídico' : ', sin el cobro jurídico'}. Los filtros de arriba no se aplican aquí. «Con contacto» = el cierre registra contacto con el titular (RPC) en el mes; «otros canales» = créditos con gestiones en el cierre que no están en la base de gestiones.</p></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="seg"><button type="button" className={!porUnidad ? 'on' : ''} onClick={() => setPorUnidad(false)}>Supervisor asignado</button><button type="button" className={porUnidad ? 'on' : ''} onClick={() => setPorUnidad(true)}>Unidad</button></div>
            <label className="chk"><input type="checkbox" checked={conJuridico} onChange={e => setConJuridico(e.target.checked)} /> Incluir cobro jurídico</label>
          </div>
        </div>
        <div className="wrap"><table>
          <thead><tr><th>{porUnidad ? 'Unidad' : 'Supervisor asignado'}</th><th className="n">Créditos en mora</th><th className="n">Saldo (C$)</th><th className="n">Con razón registrada</th><th className="n">Sin razón, con contacto</th><th className="n">Sin razón, sin contacto</th><th className="n">Otros canales</th><th className="n">Sin gestión</th></tr></thead>
          <tbody>{filasCob.map(([k, o]) => (
            <tr key={k}><td>{k}</td><td className="n">{nf.format(o.n)}</td><td className="n">{nf.format(Math.round(o.saldo))}</td><td className="n">{pct(o.conRazon, o.n)}</td><td className="n">{pct(o.sinRazonContacto, o.n)}</td><td className="n">{pct(o.sinRazonSinContacto, o.n)}</td><td className="n">{pct(o.otros, o.n)}</td><td className="n">{pct(o.sinGestion, o.n)}</td></tr>
          ))}</tbody>
          <tfoot><tr><td>Total</td><td className="n">{nf.format(cobTot.n)}</td><td className="n">{nf.format(Math.round(cobTot.saldo))}</td><td className="n">{pct(cobTot.conRazon, cobTot.n)}</td><td className="n">{pct(cobTot.sinRazonContacto, cobTot.n)}</td><td className="n">{pct(cobTot.sinRazonSinContacto, cobTot.n)}</td><td className="n">{pct(cobTot.otros, cobTot.n)}</td><td className="n">{pct(cobTot.sinGestion, cobTot.n)}</td></tr></tfoot>
        </table></div>
      </div>
    </>
  )
}
