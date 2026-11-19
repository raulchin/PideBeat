import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPublicEvent, PublicError, submitSong, type Submission } from './api'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { functions: { invoke } } }))

const submission: Submission = { public_code: 'public-code', song_title: 'Cancion', artist: 'Artista',
  request_id: 'de5c281a-e076-4c01-a5fb-dd8d319161d0' }

beforeEach(() => { invoke.mockReset() })

describe('API publica', () => {
  it('consulta el evento por codigo sin enviar identificadores privados', async () => {
    const event = { name: 'Fiesta', is_active: true }
    invoke.mockResolvedValue({ data: event, error: null })
    await expect(getPublicEvent('public-code')).resolves.toEqual(event)
    expect(invoke).toHaveBeenCalledWith('get-public-event', { body: { public_code: 'public-code' } })
  })

  it('acepta el envio solo si el servidor devuelve ok: true', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null })
    await expect(submitSong(submission)).resolves.toBeUndefined()
    expect(invoke).toHaveBeenCalledWith('submit-song-request', { body: submission })
  })

  it.each([null, {}, { ok: false }, { ok: 'true' }, { ok: 1 }])(
    'rechaza respuestas sin confirmacion explicita: %j', async data => {
      invoke.mockResolvedValue({ data, error: null })
      await expect(submitSong(submission)).rejects.toMatchObject({ code: 'UNAVAILABLE' })
    },
  )

  it.each([
    [429, 'RATE_LIMITED', 'Espera un minuto'],
    [409, 'EVENT_CLOSED', 'El DJ ha cerrado el evento'],
    [404, 'EVENT_NOT_FOUND', 'Este evento no existe'],
    [503, 'UNAVAILABLE', 'sin duplicar tu solicitud'],
  ])('traduce HTTP %i / %s a un error publico', async (status, code, message) => {
    invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ code }), {
      status, headers: { 'Content-Type': 'application/json' },
    }) } })
    const error = await submitSong(submission).catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(PublicError)
    expect(error).toMatchObject({ code, message: expect.stringContaining(message) })
  })

  it('no muestra el cuerpo interno de errores que no sean JSON', async () => {
    invoke.mockResolvedValue({ data: null, error: { context: new Response('detalle interno secreto', { status: 502 }) } })
    await expect(submitSong(submission)).rejects.toMatchObject({
      code: 'UNAVAILABLE', message: 'El servicio no está disponible. Puedes reintentar sin duplicar tu solicitud.',
    })
  })

  it('convierte los fallos de transporte del cliente en UNAVAILABLE', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('Failed to fetch') })
    await expect(submitSong(submission)).rejects.toMatchObject({ code: 'UNAVAILABLE' })
  })
})
