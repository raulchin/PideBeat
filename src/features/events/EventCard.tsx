import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Notice } from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { errorMessage, validateText } from '../../lib/validation'
import type { Event } from '../../types/database'

type Props = {
  event: Event
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

export function EventCard({ event, onRename, onDelete }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [action, setAction] = useState<'rename' | 'delete' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const menu = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const saving = useRef(false)

  useEffect(() => {
    if (!menuOpen) return
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [menuOpen])

  useEffect(() => {
    if (action) form.current?.querySelector<HTMLElement>('[data-initial-focus]')?.focus()
  }, [action])

  function closeControls() {
    setAction(null)
    setMenuOpen(false)
    setError('')
    trigger.current?.focus()
  }

  async function save(submit: FormEvent<HTMLFormElement>) {
    submit.preventDefault()
    if (!action || saving.current) return
    saving.current = true
    setBusy(true)
    setError('')
    try {
      if (action === 'rename') {
        const name = validateText(String(new FormData(submit.currentTarget).get('name') ?? ''), 1)
        const { data, error } = await supabase.rpc('rename_event', { p_event_id: event.id, p_name: name })
        if (error || !data) throw new Error('No se pudo guardar el nombre. Actualiza la lista antes de reintentar.')
        onRename(event.id, data)
      } else {
        const { error } = await supabase.rpc('delete_event', { p_event_id: event.id })
        if (error) throw new Error('No se pudo confirmar el borrado. Actualiza la lista antes de reintentar.')
        onDelete(event.id)
        return
      }
      closeControls()
    } catch (error) {
      setError(errorMessage(error))
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  return <article className="panel event-card relative">
    <div className="flex items-start justify-between gap-3">
      <span className={`badge ${event.is_active ? 'active' : ''}`}>{event.is_active ? 'EN VIVO' : 'CERRADO'}</span>
      <Link to={`/dj/event/${event.id}?modo=cabina`} aria-label={`Modo Cabina para ${event.name}`}
        className="absolute top-3 right-16 z-10 inline-flex min-h-11 items-center rounded-lg border border-line bg-ink px-2 text-xs text-lime hover:border-lime">Modo Cabina</Link>
      <div ref={menu} className="absolute right-4 top-3 z-10"
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false) }}
        onKeyDown={event => { if (event.key === 'Escape' && menuOpen) closeControls() }}>
        <button ref={trigger} type="button" aria-label={`Opciones de ${event.name}`} aria-expanded={menuOpen}
          aria-controls={`event-options-${event.id}`} aria-disabled={busy || undefined}
          className="flex size-11 items-center justify-center rounded-lg text-xl leading-none text-muted hover:bg-white/10 hover:text-white"
          onClick={() => {
            if (saving.current) return
            if (action) closeControls()
            else setMenuOpen(open => !open)
          }}>⋮</button>
        <div id={`event-options-${event.id}`} hidden={!menuOpen}
          className="absolute right-0 top-full w-44 rounded-lg border border-line bg-ink p-1 shadow-xl">
          <button type="button" className="block min-h-11 w-full rounded px-3 text-left text-sm hover:bg-white/10"
            onClick={() => { setMenuOpen(false); setAction('rename') }}>Editar nombre</button>
          <button type="button" className="block min-h-11 w-full rounded px-3 text-left text-sm text-red-300 hover:bg-white/10"
            onClick={() => { setMenuOpen(false); setAction('delete') }}>Eliminar evento</button>
        </div>
      </div>
    </div>
    <h2 className="my-5 break-words text-2xl font-semibold">
      <Link to={`/dj/event/${event.id}`} className={!action ? 'after:absolute after:inset-0' : undefined}>{event.name}</Link>
    </h2>
    <time dateTime={event.created_at} className="text-xs text-muted">{new Date(event.created_at).toLocaleString('es')}</time>
    {action && <form ref={form} className="mt-5 space-y-4 border-t border-line pt-5" aria-label={action === 'rename' ? 'Editar nombre' : 'Confirmar eliminación'}
      onSubmit={event => void save(event)} onKeyDown={event => { if (event.key === 'Escape' && !saving.current) closeControls() }}>
      {action === 'rename'
        ? <label>Nuevo nombre del evento<input name="name" defaultValue={event.name} required maxLength={240} disabled={busy} data-initial-focus /></label>
        : <p className="break-words text-sm">Vas a eliminar <strong>{event.name}</strong> y todas sus solicitudes. Si hay un sorteo, también se eliminarán sus participantes y el resultado. El enlace del QR dejará de funcionar. Esta acción no se puede deshacer.</p>}
      {error && <Notice error>{error}</Notice>}
      <div className="flex flex-wrap gap-3">
        <button className="button secondary" type="button" disabled={busy} onClick={closeControls}
          data-initial-focus={action === 'delete' ? true : undefined}>Cancelar</button>
        <button className={`button ${action === 'rename' ? 'primary' : 'danger'}`} disabled={busy}>
          {action === 'rename' ? (busy ? 'Guardando…' : 'Guardar nombre') : (busy ? 'Eliminando…' : 'Eliminar definitivamente')}
        </button>
      </div>
    </form>}
  </article>
}
