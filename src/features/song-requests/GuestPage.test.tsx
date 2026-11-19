import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPublicEvent, PublicError, submitSong } from '../../lib/api'
import { GuestPage } from './GuestPage'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../lib/api', async importOriginal => ({
  ...await importOriginal<typeof import('../../lib/api')>(),
  getPublicEvent: vi.fn(), submitSong: vi.fn(),
}))

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

async function openEvent() {
  render(<MemoryRouter initialEntries={['/e/public-code-a']}>
    <Routes><Route path="/e/:publicCode" element={<GuestPage />} /></Routes>
  </MemoryRouter>)
  await screen.findByRole('heading', { name: 'Noche de pruebas' })
}

async function fillSong() {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Canción'), '  Una cancion  ')
  await user.type(screen.getByLabelText('Artista'), '  Un artista  ')
  return user
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getPublicEvent).mockResolvedValue({ name: 'Noche de pruebas', is_active: true })
  vi.mocked(submitSong).mockResolvedValue(undefined)
})

describe('GuestPage', () => {
  it('carga el evento publico por el codigo de la URL', async () => {
    await openEvent()
    expect(getPublicEvent).toHaveBeenCalledWith('public-code-a')
    expect(screen.getByRole('button', { name: /Solicitar canción/ })).toBeEnabled()
  })

  it('solo confirma al resolver el servidor y bloquea dos submits en el mismo turno', async () => {
    const response = deferred<void>()
    vi.mocked(submitSong).mockReturnValue(response.promise)
    await openEvent()
    await fillSong()
    const form = screen.getByRole('button', { name: /Solicitar canción/ }).closest('form')!
    // Dos eventos sin esperar un render comprueban el bloqueo por referencia, no solo disabled.
    act(() => { fireEvent.submit(form); fireEvent.submit(form) })
    expect(submitSong).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('¡Solicitud enviada al DJ!')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Enviando al DJ/ })).toBeDisabled()
    expect(screen.getByLabelText('Canción')).toBeDisabled()
    expect(screen.getByLabelText('Artista')).toBeDisabled()
    expect(submitSong).toHaveBeenCalledWith({ public_code: 'public-code-a',
      song_title: 'Una cancion', artist: 'Un artista', request_id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ) })
    await act(async () => { response.resolve() })
    expect(await screen.findByText('¡Solicitud enviada al DJ!')).toHaveAttribute('role', 'status')
    expect(screen.queryByLabelText('Canción')).not.toBeInTheDocument()
  })

  it('conserva el mismo UUID y contenido en varios reintentos UNAVAILABLE', async () => {
    const response = deferred<void>()
    vi.mocked(submitSong)
      .mockRejectedValueOnce(new PublicError('UNAVAILABLE', 'Servicio no disponible'))
      .mockRejectedValueOnce(new PublicError('UNAVAILABLE', 'Servicio no disponible'))
      .mockReturnValueOnce(response.promise)
    await openEvent()
    const user = await fillSong()
    await user.click(screen.getByRole('button', { name: /Solicitar canción/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Servicio no disponible')
    const original = { ...vi.mocked(submitSong).mock.calls[0][0] }
    expect(screen.queryByText('¡Solicitud enviada al DJ!')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Canción')).toBeDisabled()
    expect(screen.getByLabelText('Artista')).toBeDisabled()
    expect(screen.getByText(/Conservamos el pedido/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Reintentar solicitud/ }))
    await screen.findByRole('button', { name: /Reintentar solicitud/ })
    await user.click(screen.getByRole('button', { name: /Reintentar solicitud/ }))
    expect(submitSong).toHaveBeenCalledTimes(3)
    expect(vi.mocked(submitSong).mock.calls.map(([payload]) => payload)).toEqual([original, original, original])
    expect(screen.queryByText('¡Solicitud enviada al DJ!')).not.toBeInTheDocument()
    await act(async () => { response.resolve() })
    await screen.findByText('¡Solicitud enviada al DJ!')
  })

  it('un error de red tampoco confirma ni pierde la solicitud pendiente', async () => {
    vi.mocked(submitSong).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await openEvent()
    const user = await fillSong()
    await user.click(screen.getByRole('button', { name: /Solicitar canción/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Revisa tu conexión')
    expect(screen.queryByText('¡Solicitud enviada al DJ!')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Reintentar solicitud/ }))
    await screen.findByText('¡Solicitud enviada al DJ!')
    expect(vi.mocked(submitSong).mock.calls[1][0]).toEqual(vi.mocked(submitSong).mock.calls[0][0])
  })

  it('permite otro pedido con un UUID nuevo solo despues de confirmar el anterior', async () => {
    await openEvent()
    const user = await fillSong()
    await user.click(screen.getByRole('button', { name: /Solicitar canción/ }))
    await user.click(await screen.findByRole('button', { name: 'Pedir otra canción' }))
    expect(screen.getByLabelText('Canción')).toHaveValue('')
    await fillSong()
    await user.click(screen.getByRole('button', { name: /Solicitar canción/ }))
    await screen.findByText('¡Solicitud enviada al DJ!')
    const calls = vi.mocked(submitSong).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[1][0].request_id).not.toBe(calls[0][0].request_id)
  })

  it('no ofrece formulario si el evento ya esta cerrado al cargar', async () => {
    vi.mocked(getPublicEvent).mockResolvedValue({ name: 'Noche de pruebas', is_active: false })
    await openEvent()
    expect(screen.getByRole('status')).toHaveTextContent('El DJ ha cerrado el evento')
    expect(screen.queryByRole('button', { name: /Solicitar canción/ })).not.toBeInTheDocument()
    expect(submitSong).not.toHaveBeenCalled()
  })

  it('retira el formulario cuando el servidor rechaza por EVENT_CLOSED', async () => {
    vi.mocked(submitSong).mockRejectedValue(new PublicError('EVENT_CLOSED', 'El DJ ha cerrado el evento.'))
    await openEvent()
    const user = await fillSong()
    await user.click(screen.getByRole('button', { name: /Solicitar canción/ }))
    expect(await screen.findByRole('status')).toHaveTextContent('El DJ ha cerrado el evento')
    expect(screen.queryByLabelText('Canción')).not.toBeInTheDocument()
    expect(screen.queryByText('¡Solicitud enviada al DJ!')).not.toBeInTheDocument()
    expect(submitSong).toHaveBeenCalledTimes(1)
  })

  it('muestra RATE_LIMITED (429) sin confirmar y permite editar antes de otro intento', async () => {
    vi.mocked(submitSong).mockRejectedValueOnce(new PublicError(
      'RATE_LIMITED', 'Has alcanzado el límite de solicitudes. Espera un minuto e inténtalo de nuevo.',
    ))
    await openEvent()
    const user = await fillSong()
    await user.click(screen.getByRole('button', { name: /Solicitar canción/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Espera un minuto')
    expect(screen.queryByText('¡Solicitud enviada al DJ!')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Canción')).toBeEnabled()
    expect(screen.getByLabelText('Artista')).toBeEnabled()
    await user.clear(screen.getByLabelText('Canción'))
    await user.type(screen.getByLabelText('Canción'), 'Otro tema')
    await user.click(screen.getByRole('button', { name: /Solicitar canción/ }))
    await screen.findByText('¡Solicitud enviada al DJ!')
    const calls = vi.mocked(submitSong).mock.calls
    expect(calls[1][0].song_title).toBe('Otro tema')
    expect(calls[1][0].request_id).not.toBe(calls[0][0].request_id)
  })

  it('valida el texto recortado antes de llamar al servidor', async () => {
    await openEvent()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Canción'), '   ')
    await user.type(screen.getByLabelText('Artista'), 'Artista')
    await user.click(screen.getByRole('button', { name: /Solicitar canción/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('entre 2 y 120')
    expect(submitSong).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Solicitar canción/ })).toBeEnabled()
  })

  it('muestra el evento inexistente y permite volver a consultar', async () => {
    vi.mocked(getPublicEvent).mockRejectedValueOnce(new PublicError('EVENT_NOT_FOUND', 'Este evento no existe.'))
    render(<MemoryRouter initialEntries={['/e/desconocido']}>
      <Routes><Route path="/e/:publicCode" element={<GuestPage />} /></Routes>
    </MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Este evento no existe.')
    expect(screen.queryByLabelText('Canción')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Volver a intentar' }))
    await screen.findByRole('heading', { name: 'Noche de pruebas' })
    await waitFor(() => expect(getPublicEvent).toHaveBeenCalledTimes(2))
    expect(getPublicEvent).toHaveBeenLastCalledWith('desconocido')
  })
})
