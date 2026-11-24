import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Notice } from '../../components/Layout'
import { validateText } from '../../lib/validation'
import type { PublicRaffle } from '../../types/database'
import { enterRaffle, findPublicRaffle, raffleEntryError } from './raffle-api'

let fallbackBrowserId: string | undefined
function browserId() {
  const storageKey = 'pidebeat.raffle-browser'
  fallbackBrowserId ??= crypto.randomUUID()
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(saved)) return saved
    localStorage.setItem(storageKey, fallbackBrowserId)
  } catch { /* Si el navegador bloquea el almacenamiento, se conserva solo en esta página. */ }
  return fallbackBrowserId
}

export function GuestRaffleOffer({ code, requestId }: { code: string; requestId: string }) {
  const [raffle, setRaffle] = useState<PublicRaffle | null>(null)
  const [choice, setChoice] = useState<'offer' | 'form' | 'declined' | 'entered' | 'already'>('offer')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const saving = useRef(false)
  useEffect(() => {
    let active = true
    void findPublicRaffle(code, requestId).then(data => { if (active) setRaffle(data) }).catch(() => {
      // La invitación es opcional: su indisponibilidad no cambia el éxito de la canción.
    })
    return () => { active = false }
  }, [code, requestId])

  async function submit(event: FormEvent<HTMLFormElement>, offer: PublicRaffle) {
    event.preventDefault()
    if (saving.current) return
    const form = new FormData(event.currentTarget)
    if (form.get('accepted') !== 'on') {
      setError('Acepta las condiciones solo si quieres participar.')
      return
    }
    let name: string
    try { name = validateText(String(form.get('alias') ?? '')); if ([...name].length > 60) throw new Error() }
    catch { setError('Escribe un nombre o apodo de 2 a 60 caracteres.'); return }
    saving.current = true; setBusy(true); setError('')
    try {
      const result = await enterRaffle({ public_code: code, request_id: requestId, browser_id: browserId(),
        name, accepted: true, terms_version: offer.terms_version })
      if (result.status !== 'ENTERED' && result.status !== 'ALREADY_ENTERED') throw new Error()
      setChoice(result.status === 'ENTERED' ? 'entered' : 'already')
    } catch (error) { setError(raffleEntryError(error)) }
    finally { saving.current = false; setBusy(false) }
  }

  if (!raffle || choice === 'declined') return null
  if (choice === 'entered' || choice === 'already') return <Notice>
    {choice === 'entered' ? '¡Tu participación en el sorteo quedó registrada!' : 'Ya hay una participación registrada para este sorteo. No se creó otra.'}
  </Notice>

  return <section className="panel min-w-0 space-y-4" aria-label="Sorteo del evento">
    <p className="eyebrow">PIDEBEAT SORTEOS · OPCIONAL</p>
    <h2 className="text-xl font-semibold [overflow-wrap:anywhere]">{raffle.prize_name}</h2>
    {raffle.description && <p className="whitespace-pre-wrap text-sm text-muted [overflow-wrap:anywhere]">{raffle.description}</p>}
    <p className="text-sm text-muted">Inscripciones hasta {new Date(raffle.closes_at).toLocaleString('es')}.</p>
    {choice === 'offer' ? <div className="flex flex-wrap gap-3">
      <button type="button" className="button secondary" onClick={() => setChoice('form')}>Quiero participar en el sorteo</button>
      <button type="button" className="button secondary" onClick={() => setChoice('declined')}>No, gracias</button>
    </div> : <form className="space-y-4" onSubmit={event => void submit(event, raffle)}>
      <label>Nombre o apodo<input name="alias" required minLength={2} maxLength={120} autoComplete="off" disabled={busy} /></label>
      <div className="rounded-lg border border-line p-3 text-sm">
        <p className="font-semibold">Condiciones del sorteo</p>
        <p id="raffle-terms" className="mt-2 whitespace-pre-wrap text-muted [overflow-wrap:anywhere]">{raffle.terms}</p>
        <p id="raffle-privacy" className="mt-2 text-muted">Si ganas, el DJ podrá proyectar tu nombre o apodo.</p>
      </div>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="accepted" required disabled={busy} aria-describedby="raffle-terms raffle-privacy"
          className="mt-0 size-5 min-h-0 shrink-0 accent-lime" /> Acepto las condiciones y quiero participar.
      </label>
      {error && <Notice error>{error}</Notice>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="button primary" disabled={busy}>{busy ? 'Registrando…' : 'Confirmar participación'}</button>
        <button type="button" className="button secondary" disabled={busy} onClick={() => setChoice('declined')}>No, gracias</button>
      </div>
    </form>}
  </section>
}
