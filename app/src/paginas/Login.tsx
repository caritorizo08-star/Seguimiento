import { useState, type FormEvent } from 'react'
import { sb } from '../lib/supabase'
import logo from '../assets/logo_oscuro.png'

export default function Login() {
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [modo, setModo] = useState<'clave' | 'recuperar'>('clave')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function entrar(e: FormEvent) {
    e.preventDefault(); setError(''); setAviso(''); setEnviando(true)
    if (modo === 'clave') {
      const { error: err } = await sb.auth.signInWithPassword({ email: email.trim(), password: clave })
      if (err) setError(err.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : err.message)
    } else {
      const { error: err } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + window.location.pathname })
      if (err) setError(err.message); else setAviso('Si el correo tiene acceso, te llegará un enlace para crear tu contraseña.')
    }
    setEnviando(false)
  }

  return (
    <div className="login">
      <div className="caja">
        <img className="logo" src={logo} alt="Instacredit" />
        <h1>Seguimiento de mora</h1>
        <p className="sub">Razones de mora y monitoreo de llamadas.</p>
        <form onSubmit={entrar}>
          {error && <div className="aviso error">{error}</div>}
          {aviso && <div className="aviso ok">{aviso}</div>}
          <div className="campo"><label htmlFor="lmail">Correo</label><input id="lmail" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></div>
          {modo === 'clave' && <div className="campo"><label htmlFor="lclave">Contraseña</label><input id="lclave" type="password" autoComplete="current-password" required value={clave} onChange={e => setClave(e.target.value)} /></div>}
          <button className="btn" type="submit" disabled={enviando}>{modo === 'clave' ? 'Entrar' : 'Enviar enlace'}</button>
          <button className="btn2" type="button" onClick={() => { setModo(modo === 'clave' ? 'recuperar' : 'clave'); setError(''); setAviso('') }}>
            {modo === 'clave' ? 'Olvidé mi contraseña / primera vez' : 'Volver'}
          </button>
        </form>
      </div>
    </div>
  )
}

/** Pantalla para definir la contraseña después de entrar por un enlace de invitación o recuperación. */
export function NuevaClave({ listo }: { listo: () => void }) {
  const [clave, setClave] = useState('')
  const [clave2, setClave2] = useState('')
  const [error, setError] = useState('')
  async function guardar(e: FormEvent) {
    e.preventDefault(); setError('')
    if (clave.length < 10) { setError('Usá al menos 10 caracteres.'); return }
    if (clave !== clave2) { setError('Las contraseñas no coinciden.'); return }
    const { error: err } = await sb.auth.updateUser({ password: clave })
    if (err) setError(err.message); else listo()
  }
  return (
    <div className="login">
      <div className="caja">
        <img className="logo" src={logo} alt="Instacredit" />
        <h1>Creá tu contraseña</h1>
        <form onSubmit={guardar}>
          {error && <div className="aviso error">{error}</div>}
          <div className="campo"><label htmlFor="nc1">Nueva contraseña</label><input id="nc1" type="password" autoComplete="new-password" value={clave} onChange={e => setClave(e.target.value)} /></div>
          <div className="campo"><label htmlFor="nc2">Repetila</label><input id="nc2" type="password" autoComplete="new-password" value={clave2} onChange={e => setClave2(e.target.value)} /></div>
          <button className="btn" type="submit">Guardar</button>
        </form>
      </div>
    </div>
  )
}
