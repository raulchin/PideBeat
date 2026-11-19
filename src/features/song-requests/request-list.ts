import type { SongRequest } from '../../types/database'
export function mergeRequests(current: SongRequest[], incoming: SongRequest[]) {
  const map = new Map(current.map(row => [row.id, row]))
  for (const row of incoming) map.set(row.id, row)
  return [...map.values()].sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
}
