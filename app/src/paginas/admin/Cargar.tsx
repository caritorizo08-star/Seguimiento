import { useState } from 'react'
import { useDatos } from '../../estado'
import { leerCierre, leerGestiones, leerLibro, type LecturaCierre, type LecturaGestiones } from '../../lib/excel'
import { cargarMes, recalcularAlertas } from '../../lib/carga'
import { MESES, nf, nombreMes } from '../../lib/util'

export default function Cargar() {
  const { catalogos, recargarCatalogos, setIdPeriodo, recargarMes, idPeriodo } = useDatos()
  const [archG, setArchG] = useState<File | null>(null)
  const [archC, setArchC] = useState<File | null>(null)
  const [lecG, setLecG] = useState<LecturaGestiones | null>(null)
  const [lecC, setLecC] = useState<LecturaCierre | null>(null)
  const [leyendo, setLeyendo] = useState('')
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [reemplazar, setReemplazar] = useState(false)
  const [progreso, setProgreso] = useState<{ t: string; v: number } | null>(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const ocupado = !!leyendo || (progreso != null && progreso.v < 1 && !ok && !error)

  async function elegirGestiones(f: File | null) {
    setArchG(f); setLecG(null); setError(''); setOk('')
    if (!f) return
    setLeyendo('Leyendo ' + f.name + '… (puede tardar un minuto con archivos grandes)')
    try {
      const l = leerGestiones(await leerLibro(f))
      setLecG(l)
      if (l.mesMasComun) { setAnio(l.mesMasComun.anio); setMes(l.mesMasComun.mes) }
    } catch (e) { setError('No pude leer el archivo: ' + (e as Error).message) }
    setLeyendo('')
  }
  async function elegirCierre(f: File | null) {
    setArchC(f); setLecC(null); setError(''); setOk('')
    if (!f) return
    setLeyendo('Leyendo ' + f.name + '… (puede tardar un minuto con archivos grandes)')
    try { setLecC(leerCierre(await leerLibro(f))) } catch (e) { setError('No pude leer el archivo: ' + (e as Error).message) }
    setLeyendo('')
  }

  const existe = catalogos?.periodos.find(p => p.anio === anio && p.mes === mes)
  const listo = lecG && lecG.filas.length > 0 && (!lecC || lecC.filas.length > 0) && (!existe || reemplazar)

  async function cargar() {
    if (!lecG || !archG) return
    setError(''); setOk(''); setProgreso({ t: 'Empezando…', v: 0 })
    try {
      const id = await cargarMes({ anio, mes, archivoGestiones: archG.name, archivoCierre: archC?.name ?? null, gestiones: lecG.filas, cierre: lecC?.filas ?? null, reemplazar },
        (t, v) => setProgreso(p => ({ t, v: v ?? p?.v ?? 0 })))
      await recargarCatalogos()
      if (id === idPeriodo) recargarMes(); else setIdPeriodo(id)
      setOk(`Listo: ${nombreMes(anio, mes)} quedó cargado con ${nf.format(lecG.filas.length)} gestiones${lecC ? ` y ${nf.format(lecC.filas.length)} créditos del cierre` : ''}.`)
    } catch (e) { setError((e as Error).message) }
  }

  async function recalcular(id: number) {
    setError(''); setOk(''); setProgreso({ t: 'Empezando…', v: 0 })
    try {
      await recalcularAlertas(id, (t, v) => setProgreso(p => ({ t, v: v ?? p?.v ?? 0 })))
      if (id === idPeriodo) recargarMes()
      setOk('Alertas recalculadas con las reglas actuales.')
    } catch (e) { setError((e as Error).message) }
  }

  return (
    <>
      <div className="card">
        <h2>Cargar un mes</h2>
        <p className="sub">Elegí el reporte de gestiones diarias del mes y, si lo tenés, el cierre de cartera. Los archivos se leen en tu navegador; a la base solo se suben las columnas que usa la app (no se guardan NIT ni cédula).</p>
        {error && <div className="aviso error" style={{ marginTop: 10 }}>{error}</div>}
        {ok && <div className="aviso ok" style={{ marginTop: 10 }}>{ok}</div>}
        {leyendo && <div className="aviso" style={{ marginTop: 10 }}>{leyendo}</div>}
        <div className="grid2" style={{ marginTop: 12 }}>
          <div className="campo">
            <label htmlFor="cg">1. Gestiones diarias (Rep_GestionesDiarias .xlsx)</label>
            <input id="cg" type="file" accept=".xlsx,.xls,.csv" disabled={ocupado} onChange={e => elegirGestiones(e.target.files?.[0] ?? null)} />
            {lecG && (lecG.faltan.length
              ? <span className="peor">Faltan columnas: {lecG.faltan.join(', ')}</span>
              : <span className="sub">Hoja «{lecG.hoja}»: {nf.format(lecG.filas.length)} gestiones{lecG.descartadas ? `, ${nf.format(lecG.descartadas)} filas descartadas (sin crédito, cartera o supervisor)` : ''}.</span>)}
          </div>
          <div className="campo">
            <label htmlFor="cc">2. Cierre de cartera (opcional)</label>
            <input id="cc" type="file" accept=".xlsx,.xls,.csv" disabled={ocupado} onChange={e => elegirCierre(e.target.files?.[0] ?? null)} />
            {lecC && (lecC.faltan.length ? <span className="peor">No encontré las columnas «Llave» y «Recaudo mes actual».</span> : <span className="sub">Hoja «{lecC.hoja}»: {nf.format(lecC.filas.length)} créditos.</span>)}
          </div>
        </div>
        <div className="filtros" style={{ boxShadow: 'none', padding: 0, marginTop: 14 }}>
          <div className="campo"><label htmlFor="cm">Mes</label>
            <select id="cm" value={mes} onChange={e => setMes(+e.target.value)}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
          <div className="campo"><label htmlFor="ca">Año</label><input id="ca" type="number" min={2020} max={2100} value={anio} onChange={e => setAnio(+e.target.value)} /></div>
          {existe && <label className="chk"><input type="checkbox" checked={reemplazar} onChange={e => setReemplazar(e.target.checked)} /> {nombreMes(anio, mes)} ya está cargado: reemplazarlo (las evaluaciones se conservan)</label>}
          <button className="btn" type="button" disabled={!listo || ocupado} onClick={cargar}>Cargar {nombreMes(anio, mes)}</button>
        </div>
        {progreso && <div style={{ marginTop: 12 }}><div className="sub">{progreso.t}</div><div className="progreso"><i style={{ width: `${Math.round(100 * Math.min(1, progreso.v))}%` }} /></div></div>}
      </div>

      <div className="card">
        <h2>Meses cargados</h2>
        <p className="sub">«Recalcular alertas» vuelve a revisar los comentarios del mes con las reglas actuales (usalo después de editar las reglas).</p>
        <div className="wrap"><table>
          <thead><tr><th>Mes</th><th>Estado</th><th className="n">Gestiones</th><th className="n">Cierre</th><th>Archivos</th><th>Cargado</th><th></th></tr></thead>
          <tbody>{catalogos?.periodos.map(p => (
            <tr key={p.id_periodo}>
              <td><b>{nombreMes(p.anio, p.mes)}</b></td>
              <td>{p.estado === 'listo' ? <span className="tag verde">Listo</span> : <span className="peor">Carga incompleta</span>}</td>
              <td className="n">{nf.format(p.filas_gestiones)}</td><td className="n">{nf.format(p.filas_cierre)}</td>
              <td className="sub">{[p.archivo_gestiones, p.archivo_cierre].filter(Boolean).join(' · ')}</td>
              <td className="nw">{p.creado_en.slice(0, 10)}</td>
              <td><button className="btn2 mini" type="button" disabled={ocupado} onClick={() => recalcular(p.id_periodo)}>Recalcular alertas</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>
    </>
  )
}
