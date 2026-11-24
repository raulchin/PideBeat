import { Link, useParams } from 'react-router'
import { Loading, Notice } from '../../components/Layout'
import { useRaffle } from './useRaffle'

export function RaffleWinnerPage() {
  const { id = '' } = useParams()
  return <Winner key={id} eventId={id} />
}

function Winner({ eventId }: { eventId: string }) {
  const { view, loading, error, refresh } = useRaffle(eventId)
  const link = <Link className="button secondary" to={`/dj/event/${eventId}/sorteo`}>Volver al sorteo</Link>
  return <main className="mx-auto flex min-h-dvh max-w-5xl flex-col items-center justify-center gap-6 px-6 py-12 text-center">
    {loading ? <Loading /> : error || !view?.draw || !view.raffle ? <>
      <Notice error={Boolean(error)}>{error || 'No hay un resultado disponible para proyectar.'}</Notice>
      <button type="button" className="button secondary" onClick={refresh}>Actualizar resultado</button>
    </> : <>
      <p className="eyebrow">PIDEBEAT SORTEOS · GANADOR</p>
      <h1 className="max-w-full text-5xl font-bold text-lime [overflow-wrap:anywhere] sm:text-7xl">{view.draw.winner_name}</h1>
      <p className="max-w-full text-2xl [overflow-wrap:anywhere] sm:text-4xl">{view.raffle.prize_name}</p>
    </>}
    {link}
  </main>
}
