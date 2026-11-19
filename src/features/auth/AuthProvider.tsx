import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { SessionContext } from './session'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ session: Session | null; loading: boolean; error: string }>({
    session: null, loading: true, error: '',
  })
  useEffect(() => {
    let active = true
    let observed = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      observed = true
      if (active) setState({ session, loading: false, error: '' })
    })
    void supabase.auth.getSession().then(({ data, error }) => {
      if (active && !observed) setState({ session: data.session, loading: false, error: error ? 'No se pudo recuperar la sesión. Recarga la página.' : '' })
    }).catch(() => {
      if (active && !observed) setState({ session: null, loading: false, error: 'No se pudo recuperar la sesión. Recarga la página.' })
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])
  return <SessionContext value={state}>{children}</SessionContext>
}
