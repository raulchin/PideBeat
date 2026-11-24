import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { Loading, Notice } from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import type { Raffle } from '../../types/database'
import { manageRaffle, saveRaffle } from './raffle-api'
import { RaffleParticipants } from './RaffleParticipants'
import { useRaffle } from './useRaffle'
import { useSession } from '../auth/session'

export function RafflePage() {
  const { id = '' } = useParams()
  return <RaffleEvent key={id} eventId={id} />
}

function RaffleEvent({ eventId }: { eventId: string }) {
  const userId = useSession().session?.user.id
  const [state, setState] = useState<{ event: { name: string; is_active: boolean } | null; loading: boolean }>({ event: null, loading: true })
  useEffect(() => {
    let active = true
    async function load() {
      try {
        const event = await supabase.from('events').select('name, is_active, workspace_id').eq('id', eventId).maybeSingle()
        if (event.error || !event.data || !userId || !active) throw new Error()
        const member = await supabase.from('workspace_members').select('role')
          .eq('workspace_id', event.data.workspace_id).eq('user_id', userId).maybeSingle()
        if (member.error || member.data?.role !== 'owner') throw new Error()
        if (active) setState({ event: event.data, loading: false })
      } catch { if (active) setState({ event: null, loading: false }) }
    }
    void load()
    return () => { active = false }
  }, [eventId, userId])
  return <>
    <Link className="text-sm text-muted" to={`/dj/event/${eventId}`}>← Volver al evento</Link>
    <p className="eyebrow mt-6">PARTICIPACIÓN VOLUNTARIA</p>
    <h1 className="mb-4 text-4xl font-bold">PideBeat Sorteos</h1>
    {state.loading ? <Loading /> : !state.event ? <Notice error>No se pudo cargar el evento o no tienes acceso.</Notice> : <>
      <p className="mb-8 text-muted [overflow-wrap:anywhere]">{state.event.name}</p>
      <RaffleManagement eventId={eventId} eventActive={state.event.is_active} />
    </>}
  </>
}

function RaffleManagement({ eventId, eventActive }: { eventId: string; eventActive: boolean }) {
  const { view, loading, error: loadError, refresh } = useRaffle(eventId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const saving = useRef(false)
  const raffle = view?.raffle
  const draw = view?.draw
  useEffect(() => {
    if (!raffle?.opened_at || raffle.closed_at || draw || !eventActive) return
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [raffle, draw, eventActive])
  const open = Boolean(raffle?.opened_at && !raffle.closed_at && eventActive && Date.parse(raffle.closes_at) > now)

  async function run(operation: () => Promise<void>) {
    if (saving.current) return
    saving.current = true; setBusy(true); setError('')
    try { await operation(); setNow(Date.now()); refresh() }
    catch (error) { setError(error instanceof Error ? error.message : 'No se pudo completar la operación.') }
    finally { saving.current = false; setBusy(false) }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    void run(() => saveRaffle({
      p_event_id: eventId, p_prize_name: String(form.get('prize') ?? ''), p_description: String(form.get('description') ?? ''),
      p_terms: String(form.get('terms') ?? ''), p_closes_at: new Date(String(form.get('closes') ?? '')).toISOString(),
    }))
  }

  if (loading) return <Loading />
  if (loadError || !view) return <><Notice error>{loadError || 'No se pudo cargar el sorteo.'}</Notice>
    <button type="button" className="button secondary" onClick={refresh}>Reintentar</button></>
  return <div className="grid items-start gap-6 lg:grid-cols-2">
    <section className="panel min-w-0 space-y-4" aria-label="Configuración del sorteo">
      {error && <Notice error>{error}</Notice>}
    {!raffle?.opened_at && !eventActive ? <Notice>El evento está cerrado. No se pueden abrir inscripciones.</Notice> : !raffle?.opened_at ? <>
        <h2 className="text-xl font-semibold">{raffle ? 'Sorteo en borrador' : 'Crear sorteo'}</h2>
        <RaffleForm raffle={raffle ?? null} busy={busy} save={save}
          activate={raffle && eventActive ? () => void run(() => manageRaffle('activate_raffle', eventId)) : undefined} />
      </> : <>
        <span className={`badge ${open ? 'active' : ''}`}>{draw ? 'SORTEO REALIZADO' : open ? 'INSCRIPCIONES ABIERTAS' : 'INSCRIPCIONES CERRADAS'}</span>
        <h2 className="text-2xl font-semibold [overflow-wrap:anywhere]">{raffle.prize_name}</h2>
        <p className="whitespace-pre-wrap text-muted [overflow-wrap:anywhere]">{raffle.description}</p>
        <p className="text-sm">Cierre programado: {new Date(raffle.closes_at).toLocaleString('es')}</p>
        <details className="text-sm"><summary className="cursor-pointer py-2">Ver condiciones</summary>
          <p className="whitespace-pre-wrap text-muted [overflow-wrap:anywhere]">{raffle.terms}</p></details>
        {draw ? <>
          <Notice>Ganó <strong>{draw.winner_name}</strong> entre {draw.eligible_count} {draw.eligible_count === 1 ? 'participación' : 'participaciones'}.</Notice>
          <Link className="button primary" to={`/dj/event/${eventId}/sorteo/ganador`}>Proyectar ganador</Link>
        </> : <div className="flex flex-wrap gap-3">
          {open ? <button type="button" className="button secondary" disabled={busy}
            onClick={() => { if (window.confirm('¿Cerrar definitivamente las inscripciones?')) void run(() => manageRaffle('close_raffle', eventId)) }}>Cerrar inscripciones</button>
            : <button type="button" className="button primary" disabled={busy}
              onClick={() => { if (window.confirm('¿Elegir un ganador? El resultado quedará guardado.')) void run(() => manageRaffle('draw_raffle', eventId)) }}>Realizar sorteo</button>}
          <button type="button" className="button secondary" disabled={busy} onClick={refresh}>Actualizar sorteo</button>
        </div>}
      </>}
    </section>
    {raffle?.opened_at && <RaffleParticipants raffleId={raffle.id} />}
  </div>
}

function localDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function RaffleForm({ raffle, busy, save, activate }: {
  raffle: Raffle | null; busy: boolean; save: (event: FormEvent<HTMLFormElement>) => void; activate?: () => void
}) {
  return <>
    <form className="space-y-4" onSubmit={save}>
      <label>Nombre del premio<input name="prize" required maxLength={120} defaultValue={raffle?.prize_name} disabled={busy} /></label>
      <label>Descripción del premio<textarea name="description" maxLength={500} rows={3} defaultValue={raffle?.description}
        disabled={busy} className="mt-2 block w-full rounded-lg border border-line bg-ink p-3" /></label>
      <label>Condiciones del sorteo<textarea name="terms" required maxLength={1000} rows={4} defaultValue={raffle?.terms}
        disabled={busy} className="mt-2 block w-full rounded-lg border border-line bg-ink p-3" /></label>
      <label>Cierre de inscripciones (hora local)<input name="closes" type="datetime-local" required
        defaultValue={localDate(raffle?.closes_at)} disabled={busy} /></label>
      <button className="button primary" type="submit" disabled={busy}>{busy ? 'Procesando…' : 'Guardar borrador'}</button>
    </form>
    {activate && <div className="space-y-3 border-t border-line pt-4">
      <p className="text-sm text-muted">La activación usa el borrador guardado. Guarda cualquier cambio antes de activar. Después no se podrán editar el premio, las condiciones ni el plazo.</p>
      <button type="button" className="button secondary" disabled={busy}
        onClick={() => { if (window.confirm('¿Activar el borrador guardado y abrir las inscripciones?')) activate() }}>Activar sorteo</button>
    </div>}
  </>
}
