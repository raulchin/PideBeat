import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import { Link, MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { SessionContext } from '../features/auth/session'

vi.mock('../lib/supabase', () => ({ configured: true, supabase: {} }))
vi.mock('../features/events/DashboardPage', () => ({
  DashboardPage: () => <Link to="/dj/event/evento-a">Abrir evento</Link>,
}))
vi.mock('../features/events/EventPage', () => ({
  EventPage: () => <Link to="/dj/event/evento-a/sorteo">Abrir sorteo</Link>,
}))
vi.mock('../features/raffles/RafflePage', () => ({
  RafflePage: () => <Link to="/dj/event/evento-a/sorteo/ganador">Proyectar ganador</Link>,
}))
vi.mock('../features/raffles/RaffleWinnerPage', () => ({
  RaffleWinnerPage: () => <main><Link to="/dj/dashboard">Volver al dashboard</Link></main>,
}))

const dj: Session = {
  access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer',
  user: { id: 'dj-test', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-11-25T00:00:00Z' },
}
const credits = 'Desarrollado por Ing. Raúl Chin (DJ-Dev)'

function open(path: string, session: Session | null = dj) {
  return render(<MemoryRouter initialEntries={[path]}>
    <SessionContext value={{ session, loading: false, error: '' }}><App /></SessionContext>
  </MemoryRouter>)
}

describe('Pie común de las rutas privadas del DJ', () => {
  it('muestra un único pie de créditos en el dashboard con el año de la fecha actual', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(2029, 5, 15))
      open('/dj/dashboard')
      const footer = screen.getByRole('contentinfo')
      expect(footer).toHaveTextContent(credits)
      expect(footer).toHaveTextContent('Con el apoyo de inteligencia artificial')
      expect(footer).toHaveTextContent('© 2029 PideBeat')
    } finally {
      vi.useRealTimers()
    }
  })

  it('mantiene el mismo pie al navegar por evento, sorteo y proyección', async () => {
    const user = userEvent.setup()
    open('/dj/dashboard')
    const footer = screen.getByRole('contentinfo')
    for (const name of ['Abrir evento', 'Abrir sorteo', 'Proyectar ganador']) {
      await user.click(screen.getByRole('link', { name }))
      expect(screen.getByRole('contentinfo')).toBe(footer)
      expect(footer).toHaveTextContent(credits)
      expect(screen.getByRole('main')).not.toContainElement(footer)
    }
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Volver al dashboard' }))
    expect(screen.getByRole('contentinfo')).toBe(footer)
  })

  it('redirige a un invitado al acceso sin mostrar los créditos privados', async () => {
    open('/dj/event/evento-a/sorteo/ganador', null)
    expect(await screen.findByRole('heading', { name: 'Vuelve a la cabina.' })).toBeVisible()
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Sin instalaciones. Solo ritmo.')
    expect(screen.queryByText(credits)).not.toBeInTheDocument()
  })
})
