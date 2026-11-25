import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { BrandLogo } from '../../components/BrandLogo'
import { SiteFooter } from '../../components/SiteFooter'
import { getPublicEvent, PublicError, submitSong, type Submission } from '../../lib/api'
import { errorMessage, validateText } from '../../lib/validation'
import type { PublicEvent } from '../../types/database'
import { Loading, Notice } from '../../components/Layout'
import { GuestRaffleOffer } from '../raffles/GuestRaffleOffer'

export function GuestPage() {
  const { publicCode = '' } = useParams()
  return <GuestEvent key={publicCode} code={publicCode} />
}
function GuestEvent({ code }: { code: string }) {
  const [event, setEvent] = useState<PublicEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmedRequest, setConfirmedRequest] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [pending, setPending] = useState<Submission | null>(null)
  const submitting = useRef(false)
  useEffect(() => {
    let active = true
    void getPublicEvent(code).then(data => {
      if (active) { setEvent(data); setError('') }
    }).catch(error => { if (active) setError(errorMessage(error)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [code, attempt])
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (submitting.current) return
    const form = new FormData(e.currentTarget)
    submitting.current = true; setBusy(true); setError(''); setConfirmedRequest(null)
    let payload: Submission
    try {
      payload = pending || {
        public_code: code,
        song_title: validateText(String(form.get('song_title'))),
        artist: validateText(String(form.get('artist'))),
        request_id: crypto.randomUUID(),
      }
      setPending(payload)
      await submitSong(payload)
      setConfirmedRequest(payload.request_id); setPending(null)
    } catch (error) {
      setError(errorMessage(error))
      if (error instanceof PublicError && error.code === 'EVENT_CLOSED') setEvent(current => current ? { ...current, is_active: false } : null)
      // Solo errores definitivos permiten cambiar el contenido; ante red/503 se reintenta el mismo pedido.
      if (error instanceof PublicError && ['INVALID_INPUT', 'RATE_LIMITED', 'EVENT_NOT_FOUND', 'EVENT_CLOSED'].includes(error.code)) setPending(null)
    } finally { submitting.current = false; setBusy(false) }
  }
  return <div className="guest-shell">
    <div className="guest-top"><BrandLogo /><span className="eyebrow m-0">DESDE LA PISTA</span></div>
    <main className="guest-panel">
      <div className="mb-8 flex items-end gap-1" aria-hidden="true">{[18, 35, 24, 48, 32, 56, 22, 38, 16].map((height, i) => <span key={i} className="w-2 rounded-sm bg-lime" style={{ height }} />)}</div>
      {loading ? <Loading /> : !event ? <><h1 className="text-3xl font-bold">No podemos abrir la pista.</h1>{error && <Notice error>{error}</Notice>}<button className="button secondary mt-5" onClick={() => setAttempt(value => value + 1)}>Volver a intentar</button></> : <>
        <p className="eyebrow">{event.is_active ? 'SOLICITUDES ABIERTAS' : 'SESIÓN FINALIZADA'}</p><h1 className="break-words text-3xl font-bold tracking-tight sm:text-4xl">{event.name}</h1>
        {!event.is_active ? <Notice>El DJ ha cerrado el evento. Ya no acepta solicitudes. ¡Gracias por ser parte de la noche!</Notice> : confirmedRequest ? <div className="mt-8 space-y-6">
          <Notice>¡Solicitud enviada al DJ!</Notice><p className="text-muted">Tu canción ya está en la cabina. El DJ decide qué suena y cuándo.</p>
          <GuestRaffleOffer key={confirmedRequest} code={code} requestId={confirmedRequest} />
          <button className="button primary w-full" onClick={() => { setConfirmedRequest(null); setError('') }}>Pedir otra canción</button>
        </div> : <>
          <p className="mb-8 mt-4 text-muted">¿Qué canción le falta a esta noche?</p>
          <form onSubmit={e => void submit(e)} className="space-y-5">
            <label>Canción<input name="song_title" placeholder="El tema que quieres escuchar" required minLength={2} maxLength={240} disabled={busy || Boolean(pending)} /></label>
            <label>Artista<input name="artist" placeholder="¿Quién la canta?" required minLength={2} maxLength={240} disabled={busy || Boolean(pending)} /></label>
            {error && <Notice error>{error}</Notice>}
            {pending && !busy && <p className="text-sm text-muted">Conservamos el pedido para reintentarlo sin duplicados. No cambies de red.</p>}
            <button className="button primary w-full" disabled={busy}>{busy ? 'Enviando al DJ…' : pending ? 'Reintentar solicitud' : 'Solicitar canción'} <span aria-hidden="true">↗</span></button>
          </form>
          <p className="mt-6 text-xs leading-relaxed text-muted">Sin cuenta, sin instalaciones. Solo música.<br />Las solicitudes están sujetas a la selección del DJ y a límites antispam.</p>
        </>}
      </>}
    </main>
    <SiteFooter variant="guest" />
  </div>
}
