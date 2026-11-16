import { useState } from 'react'
import { useDatos } from '../../estado'
import { leerGestiones, leerLibro, type LecturaGestiones } from '../../lib/excel'
import { cargarMes, recalcularAlertas } from '../../lib/carga'
import { MESES, nf, nombreMes } from '../../lib/util'

export default function Cargar() {
  const { catalogos, recargarCatalogos, setIdPeriodo, recargarMes, idPeriodo } = useDatos()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [lectura, setLectura] = useState<LecturaGestiones | null>(null)
  const [leyendo, setLeyendo] = useState('')
  const [anio, setAnio] = useState(() => new Date().getFullYear())
  const [mes, setMes] = useState(() => new Date().getMonth() + 1)
  const [reemplazar, setReemplazar] = useState(false)
  const [progreso, setProgreso] = useState<{ t: string; v: number } | null>(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const ocupado = !!leyendo || (progreso != null && progreso.v < 1 && !ok && !error)

  async function elegir(f: File | null) {
    setArchivo(f); setLectura(null); setError(''); setOk('')
    if (!f) return
    setLeyendo('Leyendo ' + f.name + '… (puede tardar un poco con archivos grandes)')
    try {
      const l = leerGestiones(await leerLibro(f))
      setLectura(l)
      if (l.mesMasComun) { setAnio(l.mesMasComun.anio); setMes(l.mesMasComun.mes) }
    } catch (e) { setError('No pude leer el archivo: ' + (e as Error).message) }
    setLeyendo('')
  }

  const existe = catalogos?.periodos.find(p => p.anio === anio && p.mes === mes)
  const listo = lectura && lectura.filas.length > 0 && (!existe || reemplazar)

  async function cargar() {
    if (!lectura || !archivo) return
    setError(''); setOk(''); setProgreso({ t: 'Empezando…', v: 0 })
    try {
      const id = await cargarMes({ anio, mes, archivoGestiones: archivo.name, gestiones: lectura.filas, reemplazar },
        (t, v) => setProgreso(p => ({ t, v: v ?? p?.v ?? 0 })))
      await recargarCatalogos()
      if (id === idPeriodo) recargarMes(); else setIdPeriodo(id)
      setOk(`Listo: ${nombreMes(anio, mes)} quedó cargado con ${nf.format(lectura.filas.length)} gestiones.`)
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
        <p className="sub">Elegí el reporte de gestiones diarias del mes (Rep_GestionesDiarias). El archivo se lee en tu navegador; a la base solo se suben las columnas que usa la app (no se guarda el NIT).</p>
        {error && <div className="aviso error" style={{ marginTop: 10 }}>{error}</div>}
        {ok && <div className="aviso ok" style={{ marginTop: 10 }}>{ok}</div>}
        {leyendo && <div className="aviso" style={{ marginTop: 10 }}>{leyendo}</div>}
        <div className="campo" style={{ marginTop: 12 }}>
          <label htmlFor="cg">Gestiones diarias (.xlsx)</label>
          <input id="cg" type="file" accept=".xlsx,.xls,.csv" disabled={ocupado} onChange={e => elegir(e.target.files?.[0] ?? null)} />
          {lectura && (lectura.faltan.length
            ? <span className="peor">Faltan columnas: {lectura.faltan.join(', ')}</span>
            : <span className="sub">Hoja «{lectura.hoja}»: {nf.format(lectura.filas.length)} gestiones{lectura.descartadas ? `, ${nf.format(lectura.descartadas)} filas descartadas (sin crédito, cartera o supervisor)` : ''}.</span>)}
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
          <thead><tr><th>Mes</th><th>Estado</th><th className="n">Gestiones</th><th>Archivo</th><th>Cargado</th><th></th></tr></thead>
          <tbody>{catalogos?.periodos.map(p => (
            <tr key={p.id_periodo}>
              <td><b>{nombreMes(p.anio, p.mes)}</b></td>
              <td>{p.estado === 'listo' ? <span className="tag verde">Listo</span> : <span className="peor">Carga incompleta</span>}</td>
              <td className="n">{nf.format(p.filas_gestiones)}</td>
              <td className="sub">{p.archivo_gestiones}</td>
              <td className="nw">{p.creado_en.slice(0, 10)}</td>
              <td><button className="btn2 mini" type="button" disabled={ocupado} onClick={() => recalcular(p.id_periodo)}>Recalcular alertas</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>
    </>
  )
}
