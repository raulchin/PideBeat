import { useEffect, useState } from 'react'
import { readDraw, readRaffle } from './raffle-api'
import type { Raffle } from '../../types/database'

type View = { raffle: Raffle | null; draw: Awaited<ReturnType<typeof readDraw>> }

export function useRaffle(eventId: string) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{ view: View | null; loading: boolean; error: string }>({ view: null, loading: true, error: '' })
  useEffect(() => {
    let active = true
    async function load() {
      try {
        const raffle = await readRaffle(eventId)
        const draw = raffle ? await readDraw(raffle.id) : null
        if (active) setState({ view: { raffle, draw }, loading: false, error: '' })
      } catch (error) {
        if (active) setState({ view: null, loading: false, error: error instanceof Error ? error.message : 'No se pudo cargar el sorteo.' })
      }
    }
    void load()
    return () => { active = false }
  }, [eventId, attempt])
  function refresh() {
    setState(previous => ({ ...previous, loading: true, error: '' }))
    setAttempt(value => value + 1)
  }
  return { ...state, refresh }
}
