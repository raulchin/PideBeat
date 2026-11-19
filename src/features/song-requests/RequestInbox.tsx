import { useRequests } from './useRequests'
import { Loading, Notice } from '../../components/Layout'
import type { RequestStatus } from '../../types/database'

const labels: Record<RequestStatus, string> = { PENDIENTE: 'Pendiente', ATENDIDA: 'Atendida', RECHAZADA: 'Rechazada' }
export function RequestInbox({ eventId }: { eventId: string }) {
  const { rows, loading, connection, error, updating, update, refresh } = useRequests(eventId)
  return <section aria-label="Bandeja de solicitudes" className="min-w-0">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-2xl font-semibold">Desde la pista <span className="text-muted">/ {rows.length}</span></h2><p role="status" className="mt-2 text-xs text-muted">{connection}</p></div><button className="button secondary" onClick={() => void refresh()}>Actualizar lista</button></div>
    {error && <Notice error>{error}</Notice>}
    {loading ? <Loading /> : !rows.length ? <div className="panel py-14"><p className="mb-3 text-xl">La primera canción está por llegar.</p><p className="text-sm text-muted">Comparte el QR. Las solicitudes aparecerán aquí sin recargar.</p></div> : <ul className="space-y-3">{rows.map((row, index) => <li className="panel request-card" key={row.id}>
      <div className="flex gap-4"><span className="pt-1 font-mono text-sm text-muted">{String(index + 1).padStart(2, '0')}</span><div className="min-w-0 flex-1"><h3 className="break-words text-xl font-semibold">{row.song_title}</h3><p className="mt-1 break-words text-muted">{row.artist}</p></div></div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><time className="text-xs text-muted" dateTime={row.created_at}>{new Date(row.created_at).toLocaleString('es')}</time><label className="text-xs">Estado de {row.song_title}<select value={row.status} disabled={updating.includes(row.id)} onChange={event => void update(row.id, event.target.value as RequestStatus)}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
    </li>)}</ul>}
  </section>
}
