import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import { validateText, errorMessage } from '../../lib/validation'
import type { Event } from '../../types/database'
import { Loading, Notice } from '../../components/Layout'

export function DashboardPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const navigate = useNavigate()
  useEffect(() => {
    let active = true
    async function load() {
      try {
        const workspace = await supabase.rpc('ensure_personal_workspace')
        if (workspace.error) throw new Error('No se pudo preparar tu espacio. Inténtalo de nuevo.')
        const rows: Event[] = []
        for (let start = 0; ; start += 500) {
          const { data, error } = await supabase.from('events').select('*').eq('workspace_id', workspace.data)
            .order('created_at', { ascending: false }).order('id').range(start, start + 499)
          if (error) throw new Error('No se pudieron cargar tus eventos.')
          rows.push(...data)
          if (data.length < 500) break
        }
        if (active) { setEvents(rows); setError('') }
      } catch (error) { if (active) setError(errorMessage(error)) }
      finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [attempt])
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const name = String(new FormData(event.currentTarget).get('name'))
    setBusy(true); setError('')
    try {
      const { data, error } = await supabase.rpc('create_event', { p_name: validateText(name, 1) })
      if (error) throw new Error('No se pudo crear el evento. Revisa tu conexión y actualiza la lista antes de reintentar.')
      const created = Array.isArray(data) ? data[0] : data
      if (!created) throw new Error('No se pudo confirmar el evento. Actualiza la lista.')
      navigate(`/dj/event/${created.id}`)
    } catch (error) { setError(errorMessage(error)) }
    finally { setBusy(false) }
  }
  return <>
    <p className="eyebrow">TU ESPACIO / CABINA DJ</p>
    <div className="mb-10 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Mis eventos<span className="text-lime">.</span></h1><p className="mt-3 text-muted">Abre la pista. Escucha a tu público.</p></div><button className="button secondary" onClick={() => setAttempt(value => value + 1)}>Actualizar eventos</button></div>
    {error && <Notice error>{error}</Notice>}
    <div className="grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_320px]">
      <section aria-label="Tus eventos" className="space-y-4">
        {loading ? <Loading /> : !events.length ? <div className="panel py-16"><p className="mb-3 text-3xl">Tu pista está por estrenar.</p><p className="text-muted">Crea tu primer evento y comparte el QR con tus invitados.</p></div> : events.map(event => <Link key={event.id} to={`/dj/event/${event.id}`} className="panel event-card block">
          <div className="flex items-center justify-between gap-4"><span className={`badge ${event.is_active ? 'active' : ''}`}>{event.is_active ? 'EN VIVO' : 'CERRADO'}</span><span className="text-muted" aria-hidden="true">↗</span></div>
          <h2 className="my-5 break-words text-2xl font-semibold">{event.name}</h2><p className="text-xs text-muted">{new Date(event.created_at).toLocaleString('es')}</p>
        </Link>)}
      </section>
      <form onSubmit={event => void create(event)} className="panel space-y-5 md:sticky md:top-6">
        <p className="eyebrow">NUEVA SESIÓN</p><h2 className="text-2xl font-semibold">Dale nombre a la noche.</h2>
        <label>Nombre del evento<input name="name" placeholder="Ej. Viernes en la terraza" required maxLength={120} /></label>
        <button className="button primary w-full" disabled={busy}>{busy ? 'Creando…' : 'Crear evento + QR'}</button><p className="text-xs leading-relaxed text-muted">Cada evento tiene un enlace único. Solo tú puedes gestionar sus solicitudes.</p>
      </form>
    </div>
  </>
}
