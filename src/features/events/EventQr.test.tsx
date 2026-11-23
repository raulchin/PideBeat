import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventUrl } from '../../config/brand'
import { EventQr } from './EventQr'

vi.mock('../../config/brand', () => ({ brand: { name: 'PideBeat' }, eventUrl: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: {} }))

const publicCode = 'a'.repeat(32)
const publicUrl = `https://pidebeat.example/e/${publicCode}`

beforeEach(() => {
  vi.mocked(eventUrl).mockReset().mockReturnValue(publicUrl)
})

afterEach(() => vi.restoreAllMocks())

describe('Impresión del QR del evento', () => {
  it('abre la impresión del navegador sin abrir otra ventana', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const user = userEvent.setup()
    render(<EventQr code={publicCode} eventName="Fiesta de prueba" />)

    await user.click(screen.getByRole('button', { name: 'Imprimir QR' }))
    expect(print).toHaveBeenCalledTimes(1)
    expect(open).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Copiar enlace' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Descargar QR' })).toBeVisible()
  })

  it('prepara una hoja separada con el mismo QR y solo los datos públicos del evento', () => {
    const eventName = 'Noche <de música>'
    const { container, unmount } = render(<EventQr code={publicCode} eventName={eventName} />)
    const sheet = document.querySelector<HTMLElement>('body > .event-qr-print')!

    expect(container).not.toContainElement(sheet)
    expect(within(sheet).getByRole('heading', { name: eventName })).toBeInTheDocument()
    const link = screen.getByRole('textbox', { name: 'Enlace para invitados' })
    expect(link).toHaveValue(publicUrl)
    expect(within(sheet).getByText(publicUrl)).toBeInTheDocument()
    expect(sheet.querySelector('svg')?.outerHTML).toBe(container.querySelector('svg')?.outerHTML)
    expect(within(sheet).queryByRole('button')).not.toBeInTheDocument()

    unmount()
    expect(document.querySelector('.event-qr-print')).not.toBeInTheDocument()
  })

  it('ofrece descargar el QR si no se puede abrir la impresión', async () => {
    vi.spyOn(window, 'print').mockImplementation(() => { throw new Error('No disponible') })
    const user = userEvent.setup()
    render(<EventQr code={publicCode} eventName="Fiesta de prueba" />)

    await user.click(screen.getByRole('button', { name: 'Imprimir QR' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Puedes descargar el QR')
    expect(screen.getByRole('button', { name: 'Descargar QR' })).toBeEnabled()
  })

  it('no habilita la impresión si no hay un enlace válido', () => {
    vi.mocked(eventUrl).mockImplementation(() => { throw new Error('Configura una URL HTTPS.') })
    render(<EventQr code={publicCode} eventName="Fiesta de prueba" />)

    expect(screen.getByRole('alert')).toHaveTextContent('Configura una URL HTTPS.')
    expect(screen.queryByRole('button', { name: 'Imprimir QR' })).not.toBeInTheDocument()
    expect(document.querySelector('.event-qr-print')).not.toBeInTheDocument()
  })
})
