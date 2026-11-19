import { describe, expect, it } from 'vitest'
import type { SongRequest } from '../../types/database'
import { mergeRequests } from './request-list'

function request(id: string, overrides: Partial<SongRequest> = {}): SongRequest {
  return { id, event_id: 'event-a', song_title: 'Cancion', artist: 'Artista',
    status: 'PENDIENTE', created_at: '2026-11-18T10:00:00.000Z', ...overrides }
}

describe('mergeRequests', () => {
  it('combina listas vacias', () => {
    expect(mergeRequests([], [])).toEqual([])
  })

  it('deduplica por id incluso dentro de cada lista y prevalece el ultimo entrante', () => {
    const pending = request('a')
    const attended = request('a', { status: 'ATENDIDA' })
    const rejected = request('a', { status: 'RECHAZADA', song_title: 'Otro tema' })
    expect(mergeRequests([pending, attended], [pending, rejected])).toEqual([rejected])
    expect(mergeRequests([pending, attended], [])).toEqual([attended])
  })

  it.each(['ATENDIDA', 'RECHAZADA', 'PENDIENTE'] as const)(
    'sustituye el estado por %s sin duplicar la solicitud', status => {
      const incoming = request('a', { status })
      expect(mergeRequests([request('a', { status: 'ATENDIDA' })], [incoming])).toEqual([incoming])
    },
  )

  it('ordena de mas reciente a mas antigua y desempata por id ascendente', () => {
    const oldest = request('old', { created_at: '2026-11-17T23:59:59.000Z' })
    const newest = request('new', { created_at: '2026-11-19T00:00:00.000Z' })
    expect(mergeRequests([request('b'), oldest], [newest, request('a')]).map(row => row.id))
      .toEqual(['new', 'a', 'b', 'old'])
  })

  it('no confunde solicitudes distintas con el mismo contenido', () => {
    expect(mergeRequests([request('a')], [request('b')])).toHaveLength(2)
  })

  it('no modifica arrays ni objetos de entrada', () => {
    const current = [request('b'), request('a')]
    const incoming = [request('b', { status: 'ATENDIDA' })]
    const before = structuredClone({ current, incoming })
    current.forEach(Object.freeze)
    incoming.forEach(Object.freeze)
    Object.freeze(current)
    Object.freeze(incoming)
    expect(mergeRequests(current, incoming).map(row => row.id)).toEqual(['a', 'b'])
    expect({ current, incoming }).toEqual(before)
  })
})
