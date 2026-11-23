import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { Layout } from '../../components/Layout'
import { DjAccountMenu } from './DjAccountMenu'
import { SessionContext } from './session'

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { signOut } } }))

function makeSession(user_metadata: Record<string, unknown> = {}, email?: string): Session {
  return {
    access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer',
    user: { id: 'dj-test', aud: 'authenticated', app_metadata: {}, user_metadata, email, created_at: '2026-11-20T00:00:00Z' },
  }
}

function menu(session: Session | null, loading = false, error = '', onSignOut = vi.fn()) {
  return <SessionContext value={{ session, loading, error }}>
    <DjAccountMenu signingOut={false} onSignOut={onSignOut} />
    <button type="button">Fuera del menú</button>
  </SessionContext>
}

function layout(path: string, session: Session | null) {
  return <MemoryRouter initialEntries={[path]}>
    <SessionContext value={{ session, loading: false, error: '' }}>
      <Routes><Route element={<Layout />}><Route path="*" element={<h1>Contenido de prueba</h1>} /></Route></Routes>
    </SessionContext>
  </MemoryRouter>
}

describe('Menú de cuenta DJ', () => {
  it('prefiere el nombre guardado al correo y muestra un icono decorativo', () => {
    const { container } = render(menu(makeSession({ full_name: '  DJ Luna  ' }, 'luna@example.test')))
    expect(screen.getByText('DJ Luna')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Menú de cuenta: DJ Luna' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Salir' })).not.toBeInTheDocument()
    expect(screen.queryByText('luna@example.test')).not.toBeInTheDocument()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it.each([
    [{ name: ' ', username: 'mezcla-luna' }, 'luna@example.test', 'mezcla-luna'],
    [{ full_name: false, username: ' ' }, 'luna@example.test', 'luna@example.test'],
    [{}, undefined, 'DJ'],
  ])('usa un nombre alternativo si faltan datos del perfil (%#)', (metadata, email, label) => {
    render(menu(makeSession(metadata, email)))
    expect(screen.getByRole('button', { name: `Menú de cuenta: ${label}` })).toBeVisible()
  })

  it('no muestra una cuenta anterior al cargar, al fallar o al salir de sesión', () => {
    const session = makeSession({}, 'luna@example.test')
    const { rerender } = render(menu(session))
    expect(screen.getByText('luna@example.test')).toBeVisible()
    rerender(menu(session, true))
    expect(screen.queryByText('luna@example.test')).not.toBeInTheDocument()
    rerender(menu(session, false, 'No se pudo recuperar la sesión.'))
    expect(screen.queryByText('luna@example.test')).not.toBeInTheDocument()
    rerender(menu(null))
    expect(screen.queryByRole('button', { name: /Menú de cuenta/ })).not.toBeInTheDocument()
  })

  it('abre con el teclado, permite salir con Tab y devuelve el foco al pulsar Escape', async () => {
    const user = userEvent.setup()
    render(menu(makeSession()))
    const trigger = screen.getByRole('button', { name: /Menú de cuenta/ })
    trigger.focus()
    await user.keyboard('{Enter}{Tab}')
    expect(screen.getByRole('button', { name: 'Salir' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('cierra al pulsar fuera sin pedir el cierre de sesión', async () => {
    const user = userEvent.setup()
    const onSignOut = vi.fn()
    render(menu(makeSession(), false, '', onSignOut))
    const trigger = screen.getByRole('button', { name: /Menú de cuenta/ })
    await user.click(trigger)
    expect(screen.getByRole('button', { name: 'Salir' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Fuera del menú' }))
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(onSignOut).not.toHaveBeenCalled()
  })

  it('coloca el menú junto a Mis eventos y conserva el error del cierre de sesión', async () => {
    const user = userEvent.setup()
    signOut.mockResolvedValueOnce({ error: new Error('Sin conexión') })
    render(layout('/dj/dashboard', makeSession({ username: 'dj-luna' })))
    const nav = within(screen.getByRole('navigation', { name: 'Principal' }))
    expect(nav.getByRole('link', { name: 'Mis eventos' })).toBeVisible()
    const trigger = nav.getByRole('button', { name: 'Menú de cuenta: dj-luna' })
    await user.click(trigger)
    await user.click(nav.getByRole('button', { name: 'Salir' }))
    expect(signOut).toHaveBeenCalledExactlyOnceWith()
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cerrar sesión')
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('no muestra la identidad del DJ en la portada', () => {
    render(layout('/', makeSession({}, 'luna@example.test')))
    expect(screen.queryByRole('button', { name: /Menú de cuenta/ })).not.toBeInTheDocument()
    expect(screen.queryByText('luna@example.test')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salir' })).toBeVisible()
  })
})
