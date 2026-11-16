import { useEffect, useState } from 'react'
import { sb } from '../../lib/supabase'
import { compilar, PRIORIDADES } from '../../lib/alertas'
import type { AlertaCategoria, AlertaPatron, AlertaRegla, TipoRegla } from '../../lib/tipos'
import { mayusSinTildes } from '../../lib/util'

const TIPOS: Record<TipoRegla, string> = {
  palabras: 'Palabras en el comentario',
  razon_distinta: 'Razón registrada distinta a la que sugiere el comentario',
  razon_no_registrada: 'El comentario sugiere una razón pero quedó «No especifica»',
  contacto_sin_razon: 'Hubo contacto con el titular y no se registró razón',
  llamadas_dia: 'Muchas llamadas al mismo crédito en un día',
  promesas_mes: 'Muchas promesas o postergaciones en el mes',
}

/** Editor de reglas de alertas. Solo admin (RLS impide que otro rol guarde). */
export default function Reglas() {
  const [reglas, setReglas] = useState<AlertaRegla[]>([])
  const [cats, setCats] = useState<AlertaCategoria[]>([])
  const [pats, setPats] = useState<AlertaPatron[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [prueba, setPrueba] = useState('')

  async function cargar() {
    const [r, c, p] = await Promise.all([
      sb.from('alerta_reglas').select('*').order('orden'),
      sb.from('alerta_categorias').select('*').order('nombre'),
      sb.from('alerta_patrones').select('*').order('clave'),
    ])
    const e = r.error || c.error || p.error
    if (e) setError(e.message)
    setReglas(r.data ?? []); setCats(c.data ?? []); setPats(p.data ?? [])
  }
  useEffect(() => { cargar() }, [])

  const setR = (id: number, cambios: Partial<AlertaRegla>) => setReglas(reglas.map(r => (r.id_regla === id ? { ...r, ...cambios } : r)))
  const setC = (id: number, cambios: Partial<AlertaCategoria>) => setCats(cats.map(c => (c.id_categoria === id ? { ...c, ...cambios } : c)))
  const setP = (k: string, cambios: Partial<AlertaPatron>) => setPats(pats.map(p => (p.clave === k ? { ...p, ...cambios } : p)))
  const invalido = (p: string | null) => !!p && compilar(p) === null

  async function guardar() {
    setError(''); setOk('')
    const malos = [...reglas.filter(r => invalido(r.patron)).map(r => r.nombre), ...cats.filter(c => invalido(c.patron)).map(c => c.nombre), ...pats.filter(p => invalido(p.patron)).map(p => p.clave)]
    if (malos.length) { setError('Hay patrones con errores de sintaxis: ' + malos.join(', ')); return }
    for (const r of reglas) {
      const { error: e } = await sb.from('alerta_reglas').update({ nombre: r.nombre, prioridad: r.prioridad, patron: r.patron || null, razones_disparan: r.razones_disparan, umbral: r.umbral, activa: r.activa }).eq('id_regla', r.id_regla)
      if (e) { setError(`${r.nombre}: ${e.message}`); return }
    }
    for (const c of cats) {
      const { error: e } = await sb.from('alerta_categorias').update({ nombre: c.nombre, patron: c.patron, razones_compatibles: c.razones_compatibles, activa: c.activa }).eq('id_categoria', c.id_categoria)
      if (e) { setError(`${c.nombre}: ${e.message}`); return }
    }
    for (const p of pats) {
      const { error: e } = await sb.from('alerta_patrones').update({ patron: p.patron }).eq('clave', p.clave)
      if (e) { setError(`${p.clave}: ${e.message}`); return }
    }
    setOk('Reglas guardadas. Para aplicarlas a un mes ya cargado, usá «Recalcular alertas» en «Cargar mes».')
    cargar()
  }

  const P = mayusSinTildes(prueba)
  const coincide = (p: string | null) => { const rx = compilar(p); return !!prueba && !!rx && rx.test(P) }
  const lista = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean)

  return (
    <>
      <div className="card">
        <div className="cabeza">
          <div><h2>Reglas de alertas</h2><p className="sub">Los patrones son expresiones regulares que se buscan en el comentario de la gestión, pasado a MAYÚSCULAS y sin tildes. Separá alternativas con «|». Ejemplo: <code>QUEJ|DENUNCI|ABOGAD</code>.</p></div>
          <button className="btn" type="button" onClick={guardar}>Guardar cambios</button>
        </div>
        {error && <div className="aviso error">{error}</div>}
        {ok && <div className="aviso ok">{ok}</div>}
        <div className="campo" style={{ marginBottom: 12 }}>
          <label htmlFor="rprueba">Probar con un comentario</label>
          <input id="rprueba" placeholder="Pegá un comentario para ver qué reglas lo marcarían" value={prueba} onChange={e => setPrueba(e.target.value)} />
        </div>
        <div className="wrap"><table>
          <thead><tr><th>Activa</th><th>Alerta</th><th>Prioridad</th><th>Tipo</th><th>Patrón / umbral</th><th>Razones que también disparan</th></tr></thead>
          <tbody>{reglas.map(r => (
            <tr key={r.id_regla} style={coincide(r.patron) ? { outline: '2px solid var(--amarillo)' } : undefined}>
              <td><input type="checkbox" checked={r.activa} aria-label={'Activa: ' + r.nombre} onChange={e => setR(r.id_regla, { activa: e.target.checked })} /></td>
              <td><input value={r.nombre} aria-label="Nombre" onChange={e => setR(r.id_regla, { nombre: e.target.value })} style={{ minWidth: 220 }} /></td>
              <td><select value={r.prioridad} aria-label="Prioridad" onChange={e => setR(r.id_regla, { prioridad: +e.target.value as 1 | 2 | 3 })}>{[3, 2, 1].map(p => <option key={p} value={p}>{PRIORIDADES[p]}</option>)}</select></td>
              <td className="sub">{TIPOS[r.tipo]}</td>
              <td>
                {r.tipo === 'palabras' && <textarea value={r.patron ?? ''} aria-label="Patrón" onChange={e => setR(r.id_regla, { patron: e.target.value })} style={{ minWidth: 320, minHeight: 60, borderColor: invalido(r.patron) ? 'var(--rojo)' : undefined }} />}
                {(r.tipo === 'llamadas_dia' || r.tipo === 'promesas_mes') && <label className="chk">desde <input type="number" min={2} value={r.umbral ?? ''} onChange={e => setR(r.id_regla, { umbral: +e.target.value })} style={{ width: 70 }} /> {r.tipo === 'llamadas_dia' ? 'llamadas el mismo día' : 'promesas en el mes'}</label>}
                {['razon_distinta', 'razon_no_registrada'].includes(r.tipo) && <span className="sub">Usa las categorías de abajo</span>}
                {r.tipo === 'contacto_sin_razon' && <span className="sub">Usa los códigos de resultado de contacto y el patrón «no contesta»</span>}
                {coincide(r.patron) && <div className="mejor">✓ coincide</div>}
              </td>
              <td>{r.tipo === 'palabras' && <input value={r.razones_disparan.join(', ')} aria-label="Razones" onChange={e => setR(r.id_regla, { razones_disparan: lista(e.target.value) })} style={{ minWidth: 200 }} />}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>

      <div className="card">
        <h2>Categorías: razón que sugiere el comentario</h2>
        <p className="sub">Si el comentario coincide con una categoría y la razón registrada no está entre las compatibles, se marca «Razón registrada distinta». Si quedó «No especifica», se marca «Razón en el comentario pero no registrada».</p>
        <div className="wrap"><table>
          <thead><tr><th>Activa</th><th>Categoría</th><th>Patrón</th><th>Razones registradas compatibles (separadas por coma)</th></tr></thead>
          <tbody>{cats.map(c => (
            <tr key={c.id_categoria} style={coincide(c.patron) ? { outline: '2px solid var(--amarillo)' } : undefined}>
              <td><input type="checkbox" checked={c.activa} aria-label={'Activa: ' + c.nombre} onChange={e => setC(c.id_categoria, { activa: e.target.checked })} /></td>
              <td><input value={c.nombre} aria-label="Nombre" onChange={e => setC(c.id_categoria, { nombre: e.target.value })} /></td>
              <td><textarea value={c.patron} aria-label="Patrón" onChange={e => setC(c.id_categoria, { patron: e.target.value })} style={{ minWidth: 320, minHeight: 60, borderColor: invalido(c.patron) ? 'var(--rojo)' : undefined }} /></td>
              <td><textarea value={c.razones_compatibles.join(', ')} aria-label="Razones compatibles" onChange={e => setC(c.id_categoria, { razones_compatibles: lista(e.target.value) })} style={{ minWidth: 260, minHeight: 60 }} /></td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>

      <div className="card">
        <h2>Patrones auxiliares</h2>
        <div className="wrap"><table>
          <thead><tr><th>Uso</th><th>Patrón</th></tr></thead>
          <tbody>{pats.map(p => (
            <tr key={p.clave}><td className="sub">{p.descripcion}</td>
              <td><textarea value={p.patron} aria-label={p.descripcion} onChange={e => setP(p.clave, { patron: e.target.value })} style={{ minWidth: 380, minHeight: 50, borderColor: invalido(p.patron) ? 'var(--rojo)' : undefined }} />{coincide(p.patron) && <div className="mejor">✓ coincide</div>}</td></tr>
          ))}</tbody>
        </table></div>
      </div>
    </>
  )
}
