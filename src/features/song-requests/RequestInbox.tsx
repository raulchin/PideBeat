import { useRequests } from './useRequests'
import { Loading, Notice } from '../../components/Layout'
import type { RequestStatus, SongRequest } from '../../types/database'
import { CabinSound } from './CabinSound'

const labels: Record<RequestStatus, string> = { PENDIENTE: 'Pendiente', ATENDIDA: 'Atendida', RECHAZADA: 'Rechazada' }
export function RequestInbox({ eventId, cabin = false }: { eventId: string; cabin?: boolean }) {
  const { rows, loading, connection, error, updating, newRequestIds, update, refresh } = useRequests(eventId)
  const newPending = cabin ? rows.filter(row => row.status === 'PENDIENTE' && newRequestIds.has(row.id)).length : 0
  return <section aria-label="Bandeja de solicitudes" className="min-w-0">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 className={`${cabin ? 'text-3xl' : 'text-2xl'} font-semibold`}>Desde la pista <span className="text-muted">/ {rows.length}</span></h2>
        <p role="status" className={`mt-2 ${cabin ? 'text-sm' : 'text-xs'} text-muted`}>{connection}</p>
      </div>
      <button type="button" className="button secondary" onClick={() => void refresh()}>Actualizar lista</button>
    </div>
    {cabin && <div className="mb-6">
      <CabinSound arrivalCount={newRequestIds.size} />
      <p role="status" className="mt-4 text-sm text-lime">{newPending} {newPending === 1 ? 'solicitud nueva' : 'solicitudes nuevas'}</p>
    </div>}
    {error && <Notice error>{error}</Notice>}
    {loading ? <Loading /> : !rows.length ? <div className="panel py-14"><p className="mb-3 text-xl">La primera canción está por llegar.</p><p className="text-sm text-muted">Comparte el QR. Las solicitudes aparecerán aquí sin recargar.</p></div> : cabin ?
      <ul className="grid items-start gap-4 lg:grid-cols-2">{rows.map(row => <CabinRequest key={row.id} row={row}
        isNew={newRequestIds.has(row.id) && row.status === 'PENDIENTE'}
        updating={updating.includes(row.id)} update={status => void update(row.id, status)} />)}</ul>
      : <ul className="space-y-3">{rows.map((row, index) => <li className="panel request-card" key={row.id}>
      <div className="flex gap-4"><span className="pt-1 font-mono text-sm text-muted">{String(index + 1).padStart(2, '0')}</span><div className="min-w-0 flex-1"><h3 className="break-words text-xl font-semibold">{row.song_title}</h3><p className="mt-1 break-words text-muted">{row.artist}</p></div></div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><time className="text-xs text-muted" dateTime={row.created_at}>{new Date(row.created_at).toLocaleString('es')}</time><label className="text-xs">Estado de {row.song_title}<select value={row.status} disabled={updating.includes(row.id)} onChange={event => void update(row.id, event.target.value as RequestStatus)}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
    </li>)}</ul>}
  </section>
}

function CabinRequest({ row, isNew, updating, update }: {
  row: SongRequest; isNew: boolean; updating: boolean; update: (status: RequestStatus) => void
}) {
  return <li className={`panel min-w-0 ${isNew ? 'border-lime bg-lime/5' : ''}`}>
    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
      {isNew && <span className="rounded bg-lime px-2 py-1 font-bold text-ink">Nueva</span>}
      <span className="rounded border border-line px-2 py-1 text-muted">{labels[row.status]}</span>
    </div>
    <h3 className="text-2xl font-semibold sm:text-3xl [overflow-wrap:anywhere]">{row.song_title}</h3>
    <p className="mt-1 text-lg text-muted [overflow-wrap:anywhere]">{row.artist}</p>
    <time className="mt-2 block text-sm text-muted" dateTime={row.created_at}>{new Date(row.created_at).toLocaleString('es')}</time>
    <div role="group" className="mt-4 flex flex-wrap gap-3" aria-label={`Acciones para ${row.song_title}`} aria-busy={updating}>
      <button type="button" className="button primary flex-1" disabled={updating || row.status === 'ATENDIDA'}
        onClick={() => update('ATENDIDA')}>Marcar atendida</button>
      <button type="button" className="button danger flex-1" disabled={updating || row.status === 'RECHAZADA'}
        onClick={() => update('RECHAZADA')}>Rechazar</button>
    </div>
  </li>
}
