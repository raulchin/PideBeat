import { publicCall, PublicError } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import type { Database, PublicRaffle } from '../../types/database'

export async function findPublicRaffle(public_code: string, request_id: string) {
  const { raffle } = await publicCall<{ raffle: PublicRaffle | null }>('public-raffle', { action: 'lookup', public_code, request_id })
  return raffle
}

export function enterRaffle(body: {
  public_code: string; request_id: string; browser_id: string; name: string; accepted: true; terms_version: number
}) {
  return publicCall<{ status: 'ENTERED' | 'ALREADY_ENTERED' }>('public-raffle', { action: 'enter', ...body })
}

export function raffleEntryError(error: unknown) {
  const code = error instanceof PublicError ? error.code : ''
  if (code === 'RAFFLE_CLOSED' || code === 'RAFFLE_NOT_AVAILABLE') return 'El sorteo no está aceptando inscripciones.'
  if (code === 'RAFFLE_TERMS_CHANGED') return 'Las condiciones cambiaron. Vuelve a abrir la invitación antes de participar.'
  if (code === 'RAFFLE_RATE_LIMITED') return 'Hay muchas inscripciones desde esta red. Espera un minuto e inténtalo de nuevo.'
  if (code === 'INVALID_ENTRY') return 'Revisa el apodo y acepta las condiciones para participar.'
  return 'No se pudo confirmar tu participación. Tu solicitud musical sigue enviada.'
}

export async function readRaffle(eventId: string) {
  const { data, error } = await supabase.from('raffles').select('*').eq('event_id', eventId).maybeSingle()
  if (error) throw new Error('No se pudo consultar el sorteo de este evento.')
  return data
}

export async function readDraw(raffleId: string) {
  const { data, error } = await supabase.from('raffle_draws').select('winner_name, drawn_at, eligible_count')
    .eq('raffle_id', raffleId).maybeSingle()
  if (error) throw new Error('No se pudo consultar el resultado del sorteo.')
  return data
}

export const pageSize = 30
export async function readParticipants(raffleId: string, page: number) {
  const { data, count, error } = await supabase.from('raffle_entries')
    .select('id, display_name, accepted_at', { count: 'exact' }).eq('raffle_id', raffleId)
    .order('accepted_at', { ascending: false }).order('id').range(page * pageSize, (page + 1) * pageSize - 1)
  if (error) throw new Error('No se pudo consultar la lista de participantes.')
  return { entries: data, count: count ?? 0 }
}

const operationErrors: Record<string, string> = {
  INVALID_RAFFLE: 'Revisa los campos y elige una fecha de cierre futura.',
  RAFFLE_CLOSED: 'El evento o las inscripciones ya están cerrados.',
  RAFFLE_LOCKED: 'No se puede editar un sorteo activado.',
  RAFFLE_NOT_FOUND: 'No se encontró el sorteo o no tienes permiso.',
  RAFFLE_STILL_OPEN: 'Cierra las inscripciones antes de realizar el sorteo.',
  RAFFLE_EMPTY: 'No hay participantes; no se eligió ganador.',
  RAFFLE_NOT_OPENED: 'Primero activa el sorteo.',
}

function assertOperation(error: { message: string } | null) {
  if (error) throw new Error(operationErrors[error.message] ?? 'No se pudo confirmar el cambio. Actualiza antes de reintentar.')
}

export async function saveRaffle(args: Database['public']['Functions']['save_raffle']['Args']) {
  assertOperation((await supabase.rpc('save_raffle', args)).error)
}

export async function manageRaffle(action: 'activate_raffle' | 'close_raffle' | 'draw_raffle', eventId: string) {
  assertOperation((await supabase.rpc(action, { p_event_id: eventId })).error)
}
