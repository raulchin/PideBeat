import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadRequests } from '../../lib/api'
import type { SongRequest } from '../../types/database'
import { useRequests } from './useRequests'

type Receive = (payload: { new: Record<string, unknown> }) => void
type Subscription = (status: string) => void
const realtime = vi.hoisted(() => ({ channel: vi.fn(), removeChannel: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: realtime }))
vi.mock('../../lib/api', () => ({ loadRequests: vi.fn() }))

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function request(id: string, overrides: Partial<SongRequest> = {}): SongRequest {
  return { id, event_id: 'event-a', song_title: 'Cancion', artist: 'Artista',
    status: 'PENDIENTE', created_at: '2026-11-18T10:00:00.000Z', ...overrides }
}

function channelMock() {
  const handlers = new Map<string, Receive>()
  let subscription: Subscription = () => {}
  const channel = {
    on: vi.fn((_kind: string, filter: { event: string }, receive: Receive) => {
      handlers.set(filter.event, receive)
      return channel
    }),
    subscribe: vi.fn((callback: Subscription) => { subscription = callback; return channel }),
  }
  return { channel,
    status: (status: string) => subscription(status),
    emit: (event: 'INSERT' | 'UPDATE', row: SongRequest) => handlers.get(event)?.({ new: { ...row } }),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(loadRequests).mockResolvedValue([])
  realtime.removeChannel.mockResolvedValue('ok')
})

describe('useRequests', () => {
  it('consulta la bandeja y limita las suscripciones al evento actual', async () => {
    const live = channelMock()
    realtime.channel.mockReturnValue(live.channel)
    vi.mocked(loadRequests).mockResolvedValue([request('a')])
    const { result } = renderHook(() => useRequests('event-a'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rows).toEqual([request('a')])
    expect(loadRequests).toHaveBeenCalledWith('event-a')
    expect(realtime.channel).toHaveBeenCalledWith('requests:event-a')
    for (const event of ['INSERT', 'UPDATE']) {
      expect(live.channel.on).toHaveBeenCalledWith('postgres_changes', {
        event, schema: 'public', table: 'song_requests', filter: 'event_id=eq.event-a',
      }, expect.any(Function))
    }
    act(() => { live.emit('INSERT', request('foreign', { event_id: 'event-b' })) })
    expect(result.current.rows).toEqual([request('a')])
  })

  it('los cambios Realtime prevalecen sobre una instantanea antigua sin duplicados', async () => {
    const snapshot = deferred<SongRequest[]>()
    const live = channelMock()
    realtime.channel.mockReturnValue(live.channel)
    vi.mocked(loadRequests).mockReturnValue(snapshot.promise)
    const { result } = renderHook(() => useRequests('event-a'))
    const updated = request('a', { status: 'ATENDIDA' })
    const newest = request('b', { created_at: '2026-11-18T11:00:00.000Z' })
    act(() => {
      live.emit('UPDATE', updated)
      live.emit('INSERT', newest)
      live.emit('INSERT', newest)
    })
    await act(async () => { snapshot.resolve([request('a')]) })
    expect(result.current.rows).toEqual([newest, updated])
    expect(result.current.loading).toBe(false)
  })

  it('resincroniza al suscribirse y al reconectar conservando el refresco manual', async () => {
    const live = channelMock()
    realtime.channel.mockReturnValue(live.channel)
    const { result } = renderHook(() => useRequests('event-a'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => { live.status('CHANNEL_ERROR') })
    expect(result.current.connection).toBe('Sin conexión en vivo. Actualiza manualmente.')
    vi.mocked(loadRequests).mockResolvedValue([request('missed')])
    act(() => { live.status('SUBSCRIBED') })
    await waitFor(() => expect(result.current.rows).toEqual([request('missed')]))
    expect(result.current.connection).toBe('En tiempo real')
    act(() => { live.status('TIMED_OUT') })
    act(() => { live.status('SUBSCRIBED') })
    await waitFor(() => expect(loadRequests).toHaveBeenCalledTimes(3))
    await act(async () => { await result.current.refresh() })
    expect(loadRequests).toHaveBeenCalledTimes(4)
  })

  it('refresca al recuperar red y visibilidad y limpia canales y listeners al desmontar', async () => {
    const live = channelMock()
    realtime.channel.mockReturnValue(live.channel)
    const windowRemoval = vi.spyOn(window, 'removeEventListener')
    const documentRemoval = vi.spyOn(document, 'removeEventListener')
    const { result, unmount } = renderHook(() => useRequests('event-a'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(loadRequests).toHaveBeenCalledTimes(3)
    unmount()
    expect(realtime.removeChannel).toHaveBeenCalledWith(live.channel)
    expect(windowRemoval).toHaveBeenCalledWith('online', expect.any(Function))
    expect(documentRemoval).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      document.dispatchEvent(new Event('visibilitychange'))
      live.status('SUBSCRIBED')
      live.emit('INSERT', request('late'))
    })
    expect(loadRequests).toHaveBeenCalledTimes(3)
    windowRemoval.mockRestore()
    documentRemoval.mockRestore()
  })

  it('descarta la carga y los mensajes del canal anterior al cambiar de evento', async () => {
    const first = channelMock()
    const second = channelMock()
    const oldSnapshot = deferred<SongRequest[]>()
    realtime.channel.mockReturnValueOnce(first.channel).mockReturnValueOnce(second.channel)
    vi.mocked(loadRequests).mockReturnValueOnce(oldSnapshot.promise)
      .mockResolvedValueOnce([request('b', { event_id: 'event-b' })])
    const { result, rerender } = renderHook(({ id }) => useRequests(id), { initialProps: { id: 'event-a' } })
    rerender({ id: 'event-b' })
    await waitFor(() => expect(result.current.rows[0]?.id).toBe('b'))
    await act(async () => {
      first.emit('INSERT', request('late'))
      first.status('SUBSCRIBED')
      oldSnapshot.resolve([request('a')])
    })
    expect(result.current.rows).toEqual([request('b', { event_id: 'event-b' })])
    expect(realtime.removeChannel).toHaveBeenCalledWith(first.channel)
    expect(loadRequests).toHaveBeenCalledTimes(2)
  })

  it('no deja que una instantanea anterior sobrescriba un refresco mas reciente', async () => {
    const first = deferred<SongRequest[]>()
    const second = deferred<SongRequest[]>()
    realtime.channel.mockReturnValue(channelMock().channel)
    vi.mocked(loadRequests).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => useRequests('event-a'))
    let refresh!: Promise<void>
    act(() => { refresh = result.current.refresh() })
    const updated = request('a', { status: 'RECHAZADA' })
    await act(async () => { second.resolve([updated]); await refresh })
    await act(async () => { first.resolve([request('a')]) })
    expect(result.current.rows).toEqual([updated])
  })

  it('muestra el fallo de consulta y permite recuperarse mediante refresco manual', async () => {
    realtime.channel.mockReturnValue(channelMock().channel)
    vi.mocked(loadRequests).mockRejectedValueOnce(new Error('red'))
    const { result } = renderHook(() => useRequests('event-a'))
    await waitFor(() => expect(result.current.error).toContain('No se pudo actualizar la bandeja'))
    expect(result.current.loading).toBe(false)
    vi.mocked(loadRequests).mockResolvedValue([request('a')])
    await act(async () => { await result.current.refresh() })
    expect(result.current.error).toBe('')
    expect(result.current.rows).toEqual([request('a')])
  })

  it('ignora el error tardio de una consulta superada por otra exitosa', async () => {
    const obsolete = deferred<SongRequest[]>()
    realtime.channel.mockReturnValue(channelMock().channel)
    vi.mocked(loadRequests).mockReturnValueOnce(obsolete.promise).mockResolvedValueOnce([request('a')])
    const { result } = renderHook(() => useRequests('event-a'))
    await act(async () => { await result.current.refresh() })
    expect(result.current.rows).toEqual([request('a')])
    await act(async () => { obsolete.reject(new Error('fallo de consulta obsoleta')) })
    expect(result.current.error).toBe('')
  })

  it('mantiene loading hasta que termina la consulta vigente', async () => {
    const obsolete = deferred<SongRequest[]>()
    const current = deferred<SongRequest[]>()
    realtime.channel.mockReturnValue(channelMock().channel)
    vi.mocked(loadRequests).mockReturnValueOnce(obsolete.promise).mockReturnValueOnce(current.promise)
    const { result, unmount } = renderHook(() => useRequests('event-a'))
    act(() => { void result.current.refresh() })
    await act(async () => { obsolete.resolve([]) })
    const loadingWhileCurrentPending = result.current.loading
    await act(async () => { current.resolve([]) })
    unmount()
    expect(loadingWhileCurrentPending).toBe(true)
  })
})
