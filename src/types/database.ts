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
type Table<Row> = { Row: Row; Insert: never; Update: never; Relationships: [] }
export type Database = {
  public: {
    Tables: {
      events: Table<Event>
      song_requests: Omit<Table<SongRequest>, 'Update'> & { Update: { status?: RequestStatus } }
      workspaces: Table<{ id: string; name: string; created_at: string }>
      workspace_members: Table<{ workspace_id: string; user_id: string; role: string; created_at: string }>
    }
    Views: { [_ in never]: never }
    Functions: {
      ensure_personal_workspace: { Args: Record<string, never>; Returns: string }
      create_event: { Args: { p_name: string }; Returns: Event }
      close_event: { Args: { p_event_id: string }; Returns: undefined }
      rename_event: { Args: { p_event_id: string; p_name: string }; Returns: string }
      delete_event: { Args: { p_event_id: string }; Returns: undefined }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
