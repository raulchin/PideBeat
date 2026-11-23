import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Event } from '../../types/database'
import { EventCard } from './EventCard'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))

const event: Event = {
  id: 'id-evento',
  workspace_id: 'workspace',
  name: 'Fiesta original',
  public_code: 'a'.repeat(32),
  is_active: true,
  created_at: '2026-11-19T16:00:00Z',
  closed_at: null,
}

function setup() {
  const user = userEvent.setup()
  const onRename = vi.fn()
  const onDelete = vi.fn()
  render(<MemoryRouter><EventCard event={event} onRename={onRename} onDelete={onDelete} /></MemoryRouter>)
  const options = screen.getByRole('button', { name: 'Opciones de Fiesta original' })
  return { user, options, onRename, onDelete }
}

beforeEach(() => rpc.mockReset())

describe('Opciones de la tarjeta de evento', () => {
  it('mantiene el enlace y permite abrir y cerrar las opciones con el teclado', async () => {
    const { user, options } = setup()
    expect(screen.getByRole('link', { name: event.name })).toHaveAttribute('href', `/dj/event/${event.id}`)
    expect(screen.queryByRole('button', { name: 'Editar nombre' })).not.toBeInTheDocument()
    options.focus()
    await user.keyboard('{Enter}')
    expect(options).toHaveAttribute('aria-expanded', 'true')
    await user.tab()
    expect(screen.getByRole('button', { name: 'Editar nombre' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(options).toHaveFocus()
    expect(options).toHaveAttribute('aria-expanded', 'false')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('guarda solo el nombre normalizado del evento y espera la respuesta', async () => {
    const { user, options, onRename, onDelete } = setup()
    let resolve!: (result: { data: string; error: null }) => void
    rpc.mockReturnValue(new Promise(done => { resolve = done }))
    await user.click(options)
    await user.click(screen.getByRole('button', { name: 'Editar nombre' }))
    const input = screen.getByRole('textbox', { name: 'Nuevo nombre del evento' })
    expect(input).toHaveFocus()
    expect(input).toHaveValue(event.name)
    await user.clear(input)
    await user.type(input, '  Fiesta nueva  ')
    await user.click(screen.getByRole('button', { name: 'Guardar nombre' }))
    expect(rpc).toHaveBeenCalledExactlyOnceWith('rename_event', { p_event_id: event.id, p_name: 'Fiesta nueva' })
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled()
    expect(onRename).not.toHaveBeenCalled()
    await act(async () => { resolve({ data: 'Fiesta nueva', error: null }) })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: event.name })).toHaveAttribute('href', `/dj/event/${event.id}`)
    expect(onRename).toHaveBeenCalledExactlyOnceWith(event.id, 'Fiesta nueva')
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('solo borra al confirmar y conserva la tarjeta si falla', async () => {
    const { user, options, onDelete } = setup()
    await user.click(options)
    await user.click(screen.getByRole('button', { name: 'Eliminar evento' }))
    expect(screen.getByText(/El enlace del QR dejará de funcionar/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(rpc).not.toHaveBeenCalled()

    rpc.mockResolvedValueOnce({ error: { code: 'PT404' } })
    rpc.mockResolvedValueOnce({ error: null })
    await user.click(options)
    await user.click(screen.getByRole('button', { name: 'Eliminar evento' }))
    const confirm = screen.getByRole('button', { name: 'Eliminar definitivamente' })
    await user.click(confirm)
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo confirmar el borrado')
    expect(onDelete).not.toHaveBeenCalled()
    await user.click(confirm)
    expect(rpc).toHaveBeenLastCalledWith('delete_event', { p_event_id: event.id })
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(event.id)
  })
})
