import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { loadRequests } from '../../lib/api'
import type { Event, RequestStatus, SongRequest } from '../../types/database'
import { SessionContext } from '../auth/session'

const { from, channel, removeChannel } = vi.hoisted(() => ({ from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ configured: true, supabase: { from, channel, removeChannel } }))
vi.mock('../../lib/api', async original => ({ ...await original<typeof import('../../lib/api')>(), loadRequests: vi.fn() }))
vi.mock('../../config/brand', async original => ({
  ...await original<typeof import('../../config/brand')>(),
  eventUrl: (code: string) => `https://pidebeat.example/e/${code}`,
}))

const session: Session = {
  access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer',
  user: { id: 'dj', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-11-23T20:00:00Z' },
}
const event: Event = {
  id: 'evento-a', workspace_id: 'workspace-a', name: 'Noche en la cabina', public_code: 'a'.repeat(32),
  is_active: true, created_at: '2026-11-23T20:00:00Z', closed_at: null,
}

function request(id: string, title: string): SongRequest {
  return { id, event_id: event.id, song_title: title, artist: 'Artista de prueba', status: 'PENDIENTE',
    created_at: '2026-11-23T20:01:00Z' }
}

const path = `/dj/event/${event.id}`

function setup(initialPath: string, activeSession: Session | null = session) {
  const user = userEvent.setup()
  render(<MemoryRouter initialEntries={[initialPath]}>
    <SessionContext value={{ session: activeSession, loading: false, error: '' }}><App /></SessionContext>
  </MemoryRouter>)
  return user
}

let rows: SongRequest[]
const listeners = new Map<string, (payload: { new: SongRequest }) => void>()
const filters = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  listeners.clear()
  rows = [request('historial', 'Una solicitud anterior')]
  vi.mocked(loadRequests).mockImplementation(async () => rows)
  const live = {
    on: (_type: string, filter: { event: string }, callback: (payload: { new: SongRequest }) => void) => {
      listeners.set(filter.event, callback)
      return live
    },
    subscribe: (callback: (s: string) => void) => { callback('SUBSCRIBED'); return live },
  }
  channel.mockReturnValue(live)
  from.mockImplementation((table: string) => table === 'events' ? {
    select: () => ({
      eq: (_column: string, id: string) => ({
        single: async () => id === event.id ? { data: event, error: null } : { data: null, error: {} },
      }),
    }),
  } : {
    update: ({ status }: { status: RequestStatus }) => ({
      eq: (column: string, id: string) => ({
        eq: (scope: string, eventId: string) => ({
          select: () => ({ single: async () => {
            filters(column, id, scope, eventId)
            rows = rows.map(row => row.id === id && row.event_id === eventId ? { ...row, status } : row)
            return { data: rows.find(row => row.id === id && row.event_id === eventId), error: null }
          } }),
        }),
      }),
    }),
  })
})

describe('Modo Cabina del evento', () => {
  it('conserva una sola suscripción y permite regresar al panel y a Mis eventos', async () => {
    const user = setup(path)
    await screen.findByRole('heading', { name: 'Una solicitud anterior' })
    const footer = screen.getByRole('contentinfo')
    expect(footer).toHaveTextContent('Desarrollado por Ing. Raúl Chin (DJ-Dev)')
    expect(screen.getByRole('button', { name: 'Imprimir QR' })).toBeVisible()
    await user.click(screen.getByRole('link', { name: 'Modo Cabina' }))
    expect(screen.getByText('MODO CABINA DJ')).toBeVisible()
    expect(screen.getByRole('contentinfo')).toBe(footer)
    expect(screen.getByRole('link', { name: /Volver a Mis eventos/ })).toHaveAttribute('href', '/dj/dashboard')
    expect(screen.queryByRole('button', { name: 'Cerrar evento' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Imprimir QR' })).not.toBeInTheDocument()
    expect(screen.getByText('0 solicitudes nuevas')).toBeVisible()
    await user.click(screen.getByRole('link', { name: 'Volver al panel' }))
    expect(screen.getByRole('button', { name: 'Cerrar evento' })).toBeVisible()
    expect(screen.getByRole('contentinfo')).toBe(footer)
    expect(channel).toHaveBeenCalledExactlyOnceWith(`requests:${event.id}`)
    expect(removeChannel).not.toHaveBeenCalled()
  })

  it('destaca únicamente llegadas nuevas y confirma ambos cambios de estado desde el servidor', async () => {
    const user = setup(`${path}?modo=cabina`)
    await screen.findByRole('heading', { name: 'Una solicitud anterior' })
    const live = request('nueva', 'Una canción en vivo')
    rows = [live, ...rows]
    act(() => listeners.get('INSERT')?.({ new: live }))
    const actions = screen.getByRole('group', { name: 'Acciones para Una canción en vivo' })
    expect(screen.getByText('1 solicitud nueva')).toBeVisible()
    expect(screen.getByText('Nueva')).toBeVisible()
    await user.click(within(actions).getByRole('button', { name: 'Marcar atendida' }))
    await waitFor(() => expect(screen.getByText('Atendida')).toBeVisible())
    expect(screen.queryByText('Nueva')).not.toBeInTheDocument()
    await user.click(within(actions).getByRole('button', { name: 'Rechazar' }))
    await waitFor(() => expect(screen.getByText('Rechazada')).toBeVisible())
    expect(filters).toHaveBeenCalledTimes(2)
    expect(filters).toHaveBeenLastCalledWith('id', 'nueva', 'event_id', event.id)
  })

  it('no carga una bandeja para un evento inaccesible', async () => {
    const user = setup('/dj/event/otro-dj?modo=cabina')
    expect(await screen.findByRole('alert')).toHaveTextContent('no tienes acceso')
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(channel).not.toHaveBeenCalled()
    expect(loadRequests).not.toHaveBeenCalled()
  })

  it('redirige al acceso antes de consultar datos si no hay sesión', async () => {
    setup(`${path}?modo=cabina`, null)
    expect(await screen.findByRole('heading', { name: 'Vuelve a la cabina.' })).toBeVisible()
    expect(from).not.toHaveBeenCalled()
    expect(channel).not.toHaveBeenCalled()
  })
})
