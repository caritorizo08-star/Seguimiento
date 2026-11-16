import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth, useDatos } from '../estado'
import { ordenEs } from '../lib/util'

interface Opcion { v: number; t: string }

export function Multi({ titulo, opciones, valor, cambiar, todos }: { titulo: string; opciones: Opcion[]; valor: number[]; cambiar: (v: number[]) => void; todos: string }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const cerrar = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false) }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [])
  const sel = new Set(valor)
  const texto = !valor.length ? todos : valor.length === 1 ? opciones.find(o => o.v === valor[0])?.t ?? '1 elegido' : `${valor.length} elegidos`
  return (
    <div className="campo multi" ref={ref}>
      <span>{titulo}</span>
      <button type="button" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>{texto} ▾</button>
      {abierto && (
        <div className="lista" role="listbox">
          <label><input type="checkbox" checked={!valor.length} onChange={() => cambiar([])} /> {todos}</label>
          {opciones.map(o => (
            <label key={o.v}>
              <input type="checkbox" checked={sel.has(o.v)} onChange={() => cambiar(sel.has(o.v) ? valor.filter(x => x !== o.v) : [...valor, o.v])} /> {o.t}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

/** Barra de filtros común a Dashboard, Acciones, Resultados y Alertas. */
export function Filtros({ conRazon = true, conExcluir = false }: { conRazon?: boolean; conExcluir?: boolean }) {
  const { catalogos, gestiones, filtros: f, setFiltros } = useDatos()
  const { perfil } = useAuth()
  const supsMes = useMemo(() => new Set(gestiones.map(g => g.id_supervisor)), [gestiones])
  const tipos = useMemo(() => [...new Set(gestiones.map(g => g.tipo_credito ?? ''))].filter(Boolean).sort(ordenEs), [gestiones])
  if (!catalogos) return null
  const supervisores = catalogos.supervisores.filter(s => supsMes.has(s.id_supervisor)).map(s => ({ v: s.id_supervisor, t: s.nombre }))
  const razones = [{ v: 0, t: 'No especifica' }, ...catalogos.razones.map(r => ({ v: r.id_razon, t: r.nombre }))]
  return (
    <div className="filtros">
      <div className="campo">
        <label htmlFor="fcart">Cartera</label>
        <select id="fcart" value={f.cartera} onChange={e => setFiltros({ ...f, cartera: e.target.value as typeof f.cartera })}>
          <option value="">Todas</option><option>Legal</option><option>Administrativa</option>
        </select>
      </div>
      {perfil?.rol === 'admin' && <Multi titulo="Supervisor" opciones={supervisores} valor={f.supervisores} cambiar={v => setFiltros({ ...f, supervisores: v })} todos="Todos los supervisores" />}
      <div className="campo">
        <label htmlFor="ftipo">Tipo de crédito</label>
        <select id="ftipo" value={f.tipo} onChange={e => setFiltros({ ...f, tipo: e.target.value })}>
          <option value="">Todos</option>{tipos.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>
      {conRazon && <Multi titulo="Razón de mora" opciones={razones} valor={f.razones} cambiar={v => setFiltros({ ...f, razones: v })} todos="Todas las razones" />}
      {conExcluir && (
        <label className="chk"><input type="checkbox" checked={f.excluirNoEspecifica} onChange={e => setFiltros({ ...f, excluirNoEspecifica: e.target.checked })} /> Excluir «No especifica»</label>
      )}
    </div>
  )
}

/** Texto corto que resume los filtros activos, para los subtítulos. */
export function useResumenFiltros(): string {
  const { catalogos, filtros: f } = useDatos()
  if (!catalogos) return ''
  const sup = !f.supervisores.length ? 'todos los supervisores' : f.supervisores.length === 1 ? catalogos.supervisores.find(s => s.id_supervisor === f.supervisores[0])?.nombre ?? '' : `${f.supervisores.length} supervisores`
  const rz = !f.razones.length ? 'todas las razones' : f.razones.length === 1 ? (f.razones[0] === 0 ? 'No especifica' : catalogos.razones.find(r => r.id_razon === f.razones[0])?.nombre ?? '') : `${f.razones.length} razones`
  return [f.cartera || 'todas las carteras', sup, f.tipo || 'todos los tipos', rz].join(' · ')
}
