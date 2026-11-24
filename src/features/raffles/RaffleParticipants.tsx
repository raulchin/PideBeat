import { useEffect, useState } from 'react'
import { Loading, Notice } from '../../components/Layout'
import { pageSize, readParticipants } from './raffle-api'

type Participants = Awaited<ReturnType<typeof readParticipants>>

export function RaffleParticipants({ raffleId }: { raffleId: string }) {
  const [page, setPage] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{ data: Participants | null; loading: boolean; error: string }>({ data: null, loading: true, error: '' })
  useEffect(() => {
    let active = true
    void readParticipants(raffleId, page).then(data => {
      if (active) setState({ data, loading: false, error: '' })
    }).catch(() => {
      if (active) setState({ data: null, loading: false, error: 'No se pudo consultar la lista de participantes.' })
    })
    return () => { active = false }
  }, [raffleId, page, attempt])

  function changePage(next: number) {
    setState(previous => ({ ...previous, loading: true, error: '' }))
    if (next === page) setAttempt(value => value + 1)
    else setPage(next)
  }
  const { data, loading, error } = state
  return <section className="panel min-w-0 space-y-4" aria-label="Participantes del sorteo">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold">Participantes{data ? ` (${data.count})` : ''}</h2>
      <button className="button secondary" type="button" onClick={() => changePage(0)} disabled={loading}>Actualizar participantes</button>
    </div>
    {error && <Notice error>{error}</Notice>}
    {loading ? <Loading /> : data && <>
      {!data.entries.length ? <p className="text-muted">Aún no hay participantes en esta página.</p> : <ul className="space-y-2">
        {data.entries.map(entry => <li key={entry.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-line py-2">
          <span className="min-w-0 [overflow-wrap:anywhere]">{entry.display_name}</span>
          <time className="text-xs text-muted" dateTime={entry.accepted_at}>{new Date(entry.accepted_at).toLocaleString('es')}</time>
        </li>)}
      </ul>}
      {(page > 0 || data.count > pageSize) && <div className="flex flex-wrap gap-3">
        <button className="button secondary" type="button" disabled={page === 0} onClick={() => changePage(page - 1)}>Anterior</button>
        <button className="button secondary" type="button" disabled={(page + 1) * pageSize >= data.count} onClick={() => changePage(page + 1)}>Siguiente</button>
      </div>}
    </>}
  </section>
}
