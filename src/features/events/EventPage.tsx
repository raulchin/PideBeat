import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { supabase } from '../../lib/supabase'
import type { Event } from '../../types/database'
import { Loading, Notice } from '../../components/Layout'
import { EventQr } from './EventQr'
import { RequestInbox } from '../song-requests/RequestInbox'

export function EventPage() {
  const { id = '' } = useParams()
  return <EventDetail key={id} id={id} />
}
function EventDetail({ id }: { id: string }) {
  const [event, setEvent] = useState<Event | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    void supabase.from('events').select('*').eq('id', id).single().then(({ data, error }) => {
      if (!active) return
      if (error) setError('No se pudo cargar el evento: no existe, no tienes acceso o falló la conexión.')
      else { setEvent(data); setError('') }
      setLoading(false)
    })
    return () => { active = false }
  }, [id, attempt])
  async function close() {
    if (busy || !window.confirm('¿Cerrar el evento? No podrás recibir más solicitudes ni reabrirlo.')) return
    setBusy(true); setError('')
    try {
      const { error } = await supabase.rpc('close_event', { p_event_id: id })
      if (error) throw error
      setEvent(current => current ? { ...current, is_active: false } : null)
    } catch { setError('No se pudo confirmar el cierre. Actualiza el evento para comprobar su estado.') }
    finally { setBusy(false) }
  }
  if (loading) return <Loading />
  return <>
    <Link className="text-sm text-muted" to="/dj/dashboard">← Mis eventos</Link>
    {error && <Notice error>{error}</Notice>}
    {!event ? <button className="button secondary mt-6" onClick={() => setAttempt(value => value + 1)}>Reintentar</button> : <>
      <div className="mb-10 mt-6 flex flex-wrap items-start justify-between gap-5"><div className="min-w-0"><span className={`badge ${event.is_active ? 'active' : ''}`}>{event.is_active ? 'EN VIVO / RECIBIENDO SOLICITUDES' : 'EVENTO CERRADO'}</span><h1 className="mt-4 break-words text-4xl font-bold tracking-tight sm:text-5xl">{event.name}</h1></div>{event.is_active && <button className="button danger" disabled={busy} onClick={() => void close()}>{busy ? 'Cerrando…' : 'Cerrar evento'}</button>}</div>
      <div className="grid items-start gap-10 lg:grid-cols-[340px_minmax(0,1fr)]"><EventQr code={event.public_code} /><RequestInbox eventId={id} /></div>
    </>}
  </>
}
