import { useEffect, useState } from 'react'
import { HashRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { AuthProvider, DatosProvider, useAuth, useDatos } from './estado'
import { sb } from './lib/supabase'
import { nombreMes } from './lib/util'
import Login, { NuevaClave } from './paginas/Login'
import Dashboard from './paginas/Dashboard'
import Acciones from './paginas/Acciones'
import Alertas from './paginas/Alertas'
import Monitoreo from './paginas/Monitoreo'
import Cargar from './paginas/admin/Cargar'
import Reglas from './paginas/admin/Reglas'
import Usuarios from './paginas/admin/Usuarios'
import logo from './assets/logo_claro.png'
import mascota from './assets/prestamito_pensando.png'

function Marco() {
  const { perfil, session, salir } = useAuth()
  const { catalogos, idPeriodo, setIdPeriodo, cargando, error, gestiones } = useDatos()
  const esAdmin = perfil?.rol === 'admin'
  const listos = catalogos?.periodos.filter(p => p.estado === 'listo') ?? []
  const supervisor = catalogos?.supervisores.find(s => s.id_supervisor === perfil?.id_supervisor)?.nombre

  const sinDatos = catalogos && !listos.length
  const vistaDatos = (el: React.ReactElement) => {
    if (error) return <div className="aviso error">{error}</div>
    if (sinDatos) return (
      <div className="card vacio"><img src={mascota} alt="" />
        <h2>Todavía no hay meses cargados</h2>
        <p className="sub">{esAdmin ? 'Andá a «Cargar mes» y subí el reporte de gestiones del mes.' : 'Cuando el administrador cargue el primer mes, vas a ver los datos aquí.'}</p>
      </div>)
    if (cargando || !catalogos) return <div className="card"><div className="sub">{cargando || 'Cargando…'}</div><div className="progreso"><i style={{ width: '35%' }} /></div></div>
    if (!gestiones.length) return <div className="card vacio">No hay gestiones visibles para tu usuario en este mes.</div>
    return el
  }

  return (
    <>
      <header className="cab">
        <img src={logo} alt="Instacredit" />
        <h1>Razones de mora: <em>escuchar para apoyar</em></h1>
        <div className="esp" />
        {listos.length > 0 && (
          <select aria-label="Mes" value={idPeriodo ?? ''} onChange={e => setIdPeriodo(+e.target.value)}>
            {listos.map(p => <option key={p.id_periodo} value={p.id_periodo}>{nombreMes(p.anio, p.mes)}</option>)}
          </select>
        )}
        <span className="usr">{perfil?.nombre} · {esAdmin ? 'Administrador' : 'Supervisor' + (supervisor ? ` (${supervisor})` : '')}<br /><small>{session?.user.email}</small></span>
        <button className="btn2 mini" type="button" onClick={salir}>Salir</button>
      </header>
      <nav className="tabs">
        <NavLink to="/" end>Dashboard</NavLink>
        <NavLink to="/acciones">Acciones</NavLink>
        <NavLink to="/alertas">Alertas</NavLink>
        <NavLink to="/monitoreo">Monitoreo</NavLink>
        {esAdmin && <><span className="sep" /><NavLink to="/cargar">Cargar mes</NavLink><NavLink to="/reglas">Reglas de alertas</NavLink><NavLink to="/usuarios">Usuarios</NavLink></>}
      </nav>
      <main>
        <Routes>
          <Route path="/" element={vistaDatos(<Dashboard />)} />
          <Route path="/acciones" element={vistaDatos(<Acciones />)} />
          <Route path="/alertas" element={vistaDatos(<Alertas />)} />
          <Route path="/monitoreo" element={<Monitoreo />} />
          {esAdmin && <Route path="/cargar" element={<Cargar />} />}
          {esAdmin && <Route path="/reglas" element={<Reglas />} />}
          {esAdmin && <Route path="/usuarios" element={<Usuarios />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  )
}

function Puerta() {
  const { session, perfil, cargando, error, salir } = useAuth()
  const [recuperando, setRecuperando] = useState(false)
  useEffect(() => {
    const { data } = sb.auth.onAuthStateChange(e => { if (e === 'PASSWORD_RECOVERY') setRecuperando(true) })
    try { if (sessionStorage.getItem('tipo_enlace')) setRecuperando(true) } catch { /* sin storage */ }
    return () => data.subscription.unsubscribe()
  }, [])
  if (recuperando && session) return <NuevaClave listo={() => { try { sessionStorage.removeItem('tipo_enlace') } catch { /* sin storage */ } setRecuperando(false); window.location.hash = '#/' }} />
  if (!session) return <Login />
  if (cargando) return <div className="login"><div className="caja"><p>Cargando…</p></div></div>
  if (!perfil) return (
    <div className="login"><div className="caja">
      <h1>Sin acceso</h1><p>{error}</p><button className="btn" type="button" onClick={salir}>Salir</button>
    </div></div>
  )
  return <DatosProvider><HashRouter><Marco /></HashRouter></DatosProvider>
}

export default function App() {
  return <AuthProvider><Puerta /></AuthProvider>
}
