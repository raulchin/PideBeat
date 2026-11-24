export type Event = {
  id: string
  workspace_id: string
  name: string
  public_code: string
  is_active: boolean
  created_at: string
  closed_at: string | null
}
export type RequestStatus = 'PENDIENTE' | 'ATENDIDA' | 'RECHAZADA'
export type SongRequest = {
  id: string
  event_id: string
  song_title: string
  artist: string
  status: RequestStatus
  created_at: string
}
export type PublicEvent = Pick<Event, 'name' | 'is_active'>
export type Raffle = {
  id: string
  event_id: string
  prize_name: string
  description: string
  terms: string
  terms_version: number
  closes_at: string
  created_at: string
  opened_at: string | null
  closed_at: string | null
}
export type PublicRaffle = Pick<Raffle, 'prize_name' | 'description' | 'terms' | 'terms_version' | 'closes_at'>
export type RaffleEntry = { id: string; raffle_id: string; display_name: string; accepted_at: string; terms_version: number }
export type RaffleDraw = {
  raffle_id: string; winner_entry_id: string; winner_name: string; eligible_count: number; drawn_by: string; drawn_at: string
}
type Table<Row> = { Row: Row; Insert: never; Update: never; Relationships: [] }
export type Database = {
  public: {
    Tables: {
      events: Table<Event>
      song_requests: Omit<Table<SongRequest>, 'Update'> & { Update: { status?: RequestStatus } }
      workspaces: Table<{ id: string; name: string; created_at: string }>
      workspace_members: Table<{ workspace_id: string; user_id: string; role: string; created_at: string }>
      raffles: Table<Raffle>
      raffle_entries: Table<RaffleEntry>
      raffle_draws: Table<RaffleDraw>
    }
    Views: { [_ in never]: never }
    Functions: {
      ensure_personal_workspace: { Args: Record<string, never>; Returns: string }
      create_event: { Args: { p_name: string }; Returns: Event }
      close_event: { Args: { p_event_id: string }; Returns: undefined }
      rename_event: { Args: { p_event_id: string; p_name: string }; Returns: string }
      delete_event: { Args: { p_event_id: string }; Returns: undefined }
      save_raffle: { Args: { p_event_id: string; p_prize_name: string; p_description: string; p_terms: string; p_closes_at: string }; Returns: undefined }
      activate_raffle: { Args: { p_event_id: string }; Returns: undefined }
      close_raffle: { Args: { p_event_id: string }; Returns: undefined }
      draw_raffle: { Args: { p_event_id: string }; Returns: RaffleDraw }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
