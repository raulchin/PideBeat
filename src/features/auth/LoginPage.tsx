import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import { useSession } from './session'
import { Loading, Notice } from '../../components/Layout'
import { Turnstile } from './Turnstile'

export function LoginPage() {
  const { session, loading } = useSession()
  const [register, setRegister] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [token, setToken] = useState('')
  const [captchaKey, setCaptchaKey] = useState(0)
  const captcha = Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY)
  if (loading) return <Loading />
  if (session) return <Navigate to="/dj/dashboard" replace />
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = new FormData(event.currentTarget)
    setBusy(true); setError(''); setMessage('')
    try {
      const credentials = { email: String(form.get('email')).trim(), password: String(form.get('password')) }
      const options = { captchaToken: token || undefined }
      const result = register
        ? await supabase.auth.signUp({ ...credentials, options: { ...options, emailRedirectTo: `${window.location.origin}/dj/login` } })
        : await supabase.auth.signInWithPassword({ ...credentials, options })
      if (result.error) throw result.error
      if (register && !result.data.session) setMessage('Revisa tu correo para confirmar tu cuenta antes de iniciar sesión.')
    } catch {
      setError(register ? 'No se pudo crear la cuenta. Revisa los datos, el CAPTCHA y las condiciones de registro.' : 'No se pudo iniciar sesión. Comprueba el correo, la contraseña y que hayas confirmado tu cuenta.')
    } finally { setBusy(false); setToken(''); setCaptchaKey(value => value + 1) }
  }
  return <section className="mx-auto max-w-md py-8">
    <p className="eyebrow">CABINA DJ / ACCESO PRIVADO</p>
    <h1 className="mb-3 text-4xl font-bold tracking-tight">{register ? 'Tu próxima sesión empieza aquí.' : 'Vuelve a la cabina.'}</h1>
    <p className="mb-8 text-muted">Tus eventos, tu público, tu espacio.</p>
    <form onSubmit={event => void submit(event)} className="panel space-y-5">
      <label>Correo electrónico<input name="email" type="email" required autoComplete="email" maxLength={254} /></label>
      <label>Contraseña<input name="password" type="password" required minLength={register ? 12 : 1} maxLength={128} autoComplete={register ? 'new-password' : 'current-password'} /></label>
      {register && <p className="text-xs text-muted">Usa al menos 12 caracteres. Deberás confirmar tu correo.</p>}
      {captcha && <Turnstile key={captchaKey} onToken={setToken} />}
      {error && <Notice error>{error}</Notice>}{message && <Notice>{message}</Notice>}
      <button className="button primary w-full" disabled={busy || (captcha && !token)}>{busy ? 'Conectando…' : register ? 'Crear cuenta DJ' : 'Iniciar sesión'}</button>
    </form>
    {captcha && <button className="mt-6 text-sm underline underline-offset-4" onClick={() => { setRegister(!register); setError(''); setMessage('') }}>{register ? 'Ya tengo cuenta. Iniciar sesión' : 'Soy nuevo. Crear una cuenta'}</button>}
    {!captcha && <p className="mt-5 text-sm text-muted">Registro público deshabilitado. Solicita una cuenta al administrador.</p>}
  </section>
}
