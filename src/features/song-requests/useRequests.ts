import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { loadRequests } from '../../lib/api'
import { mergeRequests } from './request-list'
import type { SongRequest, RequestStatus } from '../../types/database'

const noArrivals: ReadonlySet<string> = new Set()

export function useRequests(eventId: string) {
  const [rows, setRows] = useState<SongRequest[]>([])
  const [connection, setConnection] = useState('Conectando…')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string[]>([])
  const [arrivals, setArrivals] = useState<{ eventId: string; ids: ReadonlySet<string> }>()
  const refreshRef = useRef<() => Promise<void>>(async () => {})
  useEffect(() => {
    let active = true
    let sequence = 0
    let changes: SongRequest[] = []
    let buffering = false
    let hasSnapshot = false
    const seen = new Set<string>()
    function track(rows: SongRequest[], notify: boolean) {
      const added: string[] = []
      for (const row of rows) {
        if (row.event_id !== eventId || seen.has(row.id)) continue
        seen.add(row.id)
        if (notify && row.status === 'PENDIENTE') added.push(row.id)
      }
      if (added.length) {
        setArrivals(previous => ({
          eventId,
          ids: new Set([...(previous?.eventId === eventId ? previous.ids : noArrivals), ...added]),
        }))
      }
    }
    async function refresh() {
      const request = ++sequence
      buffering = true
      changes = []
      try {
        const snapshot = await loadRequests(eventId)
        // Los cambios recibidos durante la consulta prevalecen sobre su instantanea.
        if (active && request === sequence) {
          const fresh = mergeRequests(snapshot, changes)
          track(fresh, hasSnapshot)
          hasSnapshot = true
          setRows(fresh)
          setError('')
        }
      } catch { if (active && request === sequence) setError('No se pudo actualizar la bandeja. Revisa tu conexión.') }
      finally { if (active && request === sequence) { setLoading(false); buffering = false; changes = [] } }
    }
    refreshRef.current = refresh
    const channel = supabase.channel(`requests:${eventId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'song_requests', filter: `event_id=eq.${eventId}` }, payload => receive(payload, true))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'song_requests', filter: `event_id=eq.${eventId}` }, payload => receive(payload, false))
      .subscribe(status => {
        if (!active) return
        setConnection(status === 'SUBSCRIBED' ? 'En tiempo real' : 'Sin conexión en vivo. Actualiza manualmente.')
        if (status === 'SUBSCRIBED') void refresh()
      })
    function receive(payload: { new: Record<string, unknown> }, insert: boolean) {
      const row = payload.new as SongRequest
      if (!active || row.event_id !== eventId) return
      track([row], insert)
      if (buffering) changes.push(row)
      setRows(current => mergeRequests(current, [row]))
    }
    void refresh()
    const resync = () => { void refresh() }
    const visibility = () => { if (document.visibilityState === 'visible') void refresh() }
    window.addEventListener('online', resync)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      active = false; refreshRef.current = async () => {}
      window.removeEventListener('online', resync); document.removeEventListener('visibilitychange', visibility)
      void supabase.removeChannel(channel)
    }
  }, [eventId])
  async function update(id: string, status: RequestStatus) {
    setUpdating(current => [...current, id]); setError('')
    try {
      const { data, error } = await supabase.from('song_requests').update({ status }).eq('id', id).eq('event_id', eventId).select().single()
      if (error || !data) throw new Error()
      // La resincronizacion evita que una consulta anterior restaure un estado obsoleto.
      await refreshRef.current()
    } catch { setError('No se pudo cambiar el estado. Actualiza la lista antes de reintentar.') }
    finally { setUpdating(current => current.filter(value => value !== id)) }
  }
  const newRequestIds = arrivals?.eventId === eventId ? arrivals.ids : noArrivals
  return { rows, connection, error, loading, updating, newRequestIds, update, refresh: () => refreshRef.current() }
}
