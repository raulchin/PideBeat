import { supabase } from './supabase'
import type { PublicEvent, SongRequest } from '../types/database'

export class PublicError extends Error {
  constructor(public code: string, message: string) { super(message) }
}
const messages: Record<string, string> = {
  INVALID_INPUT: 'Revisa la canción y el artista: entre 2 y 120 caracteres.',
  EVENT_NOT_FOUND: 'Este evento no existe. Comprueba el enlace del QR.',
  EVENT_CLOSED: 'El DJ ha cerrado el evento. Ya no acepta solicitudes.',
  RATE_LIMITED: 'Has alcanzado el límite de solicitudes. Espera un minuto e inténtalo de nuevo.',
  IDEMPOTENCY_CONFLICT: 'No podemos confirmar este reintento. Mantén la misma red y vuelve a intentarlo.',
  UNAVAILABLE: 'El servicio no está disponible. Puedes reintentar sin duplicar tu solicitud.',
  ORIGIN_NOT_ALLOWED: 'Este dominio no está autorizado. Contacta con el organizador.',
}
export async function publicCall<T>(name: string, body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body })
  if (error) {
    let code = 'UNAVAILABLE'
    if (error.context instanceof Response) {
      const response = await error.context.json().catch(() => null) as { code?: string } | null
      code = response?.code || code
    }
    throw new PublicError(code, messages[code] || messages.UNAVAILABLE)
  }
  if (!data) throw new PublicError('UNAVAILABLE', messages.UNAVAILABLE)
  return data
}
export const getPublicEvent = (public_code: string) => publicCall<PublicEvent>('get-public-event', { public_code })
export type Submission = { public_code: string; song_title: string; artist: string; request_id: string }
export async function submitSong(body: Submission) {
  const data = await publicCall<{ ok: boolean }>('submit-song-request', body)
  if (data.ok !== true) throw new PublicError('UNAVAILABLE', messages.UNAVAILABLE)
}

export async function loadRequests(eventId: string): Promise<SongRequest[]> {
  const rows: SongRequest[] = []
  for (let start = 0; ; start += 500) {
    const { data, error } = await supabase.from('song_requests').select('*')
      .eq('event_id', eventId).order('created_at', { ascending: false }).order('id').range(start, start + 499)
    if (error) throw new Error('No se pudo cargar la bandeja. Intenta actualizar la lista.')
    rows.push(...data)
    if (data.length < 500) return rows
  }
}
