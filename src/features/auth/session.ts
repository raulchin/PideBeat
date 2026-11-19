import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'
export const SessionContext = createContext<{ session: Session | null; loading: boolean; error: string }>({
  session: null, loading: true, error: '',
})
export const useSession = () => useContext(SessionContext)
