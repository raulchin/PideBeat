import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CabinSound } from './CabinSound'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))

const start = vi.fn()
const close = vi.fn().mockResolvedValue(undefined)
const ramp = vi.fn()
const resume = vi.fn()
let currentTime: number

class MockAudioContext {
  state = 'suspended'
  get currentTime() { return currentTime }
  destination = {}
  close = close
  async resume() { await resume(); this.state = 'running' }
  createOscillator() { return { frequency: { setValueAtTime: vi.fn() }, connect: vi.fn(), start, stop: vi.fn() } }
  createGain() { return { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: ramp }, connect: vi.fn() } }
}

beforeEach(() => {
  vi.clearAllMocks()
  currentTime = 1
  resume.mockResolvedValue(undefined)
  vi.stubGlobal('AudioContext', MockAudioContext)
})
afterEach(() => vi.unstubAllGlobals())

describe('Notificación sonora de cabina', () => {
  it('requiere un gesto, no reproduce avisos anteriores y permite silenciar los siguientes', async () => {
    const user = userEvent.setup()
    const { rerender, unmount } = render(<CabinSound arrivalCount={2} />)
    rerender(<CabinSound arrivalCount={3} />)
    expect(resume).not.toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()

    const button = screen.getByRole('button', { name: /Sonido de solicitudes/ })
    await user.click(button)
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'))
    expect(start).not.toHaveBeenCalled()
    rerender(<CabinSound arrivalCount={4} />)
    expect(start).toHaveBeenCalledTimes(1)
    await user.click(button)
    currentTime = 2
    rerender(<CabinSound arrivalCount={5} />)
    expect(start).toHaveBeenCalledTimes(1)
    unmount()
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('usa el volumen elegido y limita avisos consecutivos demasiado rápidos', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<CabinSound arrivalCount={0} />)
    const slider = screen.getByRole('slider', { name: 'Volumen' })
    fireEvent.change(slider, { target: { value: '100' } })
    const button = screen.getByRole('button', { name: /Sonido de solicitudes/ })
    await user.click(button)
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'))
    rerender(<CabinSound arrivalCount={1} />)
    expect(ramp).toHaveBeenCalledWith(0.15, 1.025)
    rerender(<CabinSound arrivalCount={3} />)
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('informa si el navegador no permite activar el audio', async () => {
    resume.mockRejectedValueOnce(new Error('Bloqueado'))
    const user = userEvent.setup()
    render(<CabinSound arrivalCount={0} />)
    const button = screen.getByRole('button', { name: /Sonido de solicitudes/ })
    await user.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent('no pudo activar el sonido')
    expect(button).not.toBeDisabled()
    expect(button).toHaveAttribute('aria-pressed', 'false')
  })
})
