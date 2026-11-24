import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPublicEvent, submitSong } from '../../lib/api'
import { GuestPage } from '../song-requests/GuestPage'
import { enterRaffle, findPublicRaffle } from './raffle-api'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../lib/api', async original => ({
  ...await original<typeof import('../../lib/api')>(), getPublicEvent: vi.fn(), submitSong: vi.fn(),
}))
vi.mock('./raffle-api', async original => ({
  ...await original<typeof import('./raffle-api')>(), findPublicRaffle: vi.fn(), enterRaffle: vi.fn(),
}))

const code = 'a'.repeat(32)
const cta = 'Quiero participar en el sorteo'

beforeEach(() => {
  vi.resetAllMocks()
  window.localStorage.clear()
  vi.mocked(getPublicEvent).mockResolvedValue({ name: 'Fiesta', is_active: true })
  vi.mocked(submitSong).mockResolvedValue()
  vi.mocked(findPublicRaffle).mockResolvedValue({
    prize_name: 'Entrada doble', description: 'Un premio de prueba', terms: 'Una sola participación.',
    terms_version: 2, closes_at: '2026-11-24T22:00:00Z',
  })
})

async function sendSong() {
  const user = userEvent.setup()
  render(<MemoryRouter initialEntries={[`/e/${code}`]}><Routes><Route path="/e/:publicCode" element={<GuestPage />} /></Routes></MemoryRouter>)
  await user.type(await screen.findByRole('textbox', { name: 'Canción' }), 'Una canción')
  await user.type(screen.getByRole('textbox', { name: 'Artista' }), 'Un artista')
  expect(screen.queryByRole('button', { name: cta })).not.toBeInTheDocument()
  expect(findPublicRaffle).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: /Solicitar canción/ }))
  return user
}

describe('Inscripción voluntaria después de una canción', () => {
  it('permite rechazar la oferta sin escribir una participación ni perder la canción', async () => {
    const user = await sendSong()
    expect(await screen.findByRole('button', { name: cta })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'No, gracias' }))
    expect(enterRaffle).not.toHaveBeenCalled()
    expect(localStorage.getItem('pidebeat.raffle-browser')).toBeNull()
    expect(screen.getByText('¡Solicitud enviada al DJ!')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Pedir otra canción' })).toBeEnabled()
  })

  it('solo escribe tras aceptar de forma explícita y reutiliza el recibo de la canción', async () => {
    vi.mocked(enterRaffle).mockResolvedValue({ status: 'ENTERED' })
    const user = await sendSong()
    await user.click(await screen.findByRole('button', { name: cta }))
    const consent = screen.getByRole('checkbox')
    const confirm = screen.getByRole('button', { name: 'Confirmar participación' })
    expect(consent).not.toBeChecked()
    await user.type(screen.getByRole('textbox', { name: 'Nombre o apodo' }), '  Luna  ')
    await user.click(confirm)
    expect(enterRaffle).not.toHaveBeenCalled()
    await user.click(consent)
    await user.click(confirm)
    expect(await screen.findByText(/participación en el sorteo quedó registrada/)).toBeVisible()
    const requestId = vi.mocked(submitSong).mock.calls[0][0].request_id
    expect(findPublicRaffle).toHaveBeenCalledExactlyOnceWith(code, requestId)
    expect(enterRaffle).toHaveBeenCalledExactlyOnceWith({
      public_code: code, request_id: requestId, browser_id: localStorage.getItem('pidebeat.raffle-browser'),
      accepted: true, name: 'Luna', terms_version: 2,
    })
  })

  it('no ofrece inscribirse si el sorteo falla, pero confirma la canción', async () => {
    vi.mocked(findPublicRaffle).mockRejectedValue(new Error('No disponible'))
    await sendSong()
    expect(await screen.findByText('¡Solicitud enviada al DJ!')).toBeVisible()
    expect(screen.queryByRole('button', { name: cta })).not.toBeInTheDocument()
    expect(enterRaffle).not.toHaveBeenCalled()
  })

  it('no consulta sorteos después de un envío musical fallido', async () => {
    vi.mocked(submitSong).mockRejectedValue(new Error('Sin conexión'))
    await sendSong()
    expect(await screen.findByRole('alert')).toBeVisible()
    expect(findPublicRaffle).not.toHaveBeenCalled()
    expect(screen.queryByText('¡Solicitud enviada al DJ!')).not.toBeInTheDocument()
  })
})
