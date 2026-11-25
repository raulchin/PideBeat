import { Link, Outlet, useMatch } from 'react-router'
import { useState } from 'react'
import { brand } from '../config/brand'
import { supabase } from '../lib/supabase'
import { useSession } from '../features/auth/session'
import { DjAccountMenu } from '../features/auth/DjAccountMenu'
import { BrandLogo } from './BrandLogo'
import { SiteFooter } from './SiteFooter'

export function Layout({ showFooter = true }: { showFooter?: boolean }) {
  const { session } = useSession()
  const dashboard = useMatch('/dj/dashboard')
  const eventDetail = useMatch('/dj/event/:id')
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  async function signOut() {
    if (signingOut) return
    setSigningOut(true)
    setError('')
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } catch {
      setError('No se pudo cerrar sesión. Inténtalo de nuevo.')
    } finally {
      setSigningOut(false)
    }
  }
  return <div className={showFooter ? 'min-h-screen' : 'grow'}>
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-6 sm:px-8">
      <Link to="/" className="min-w-0" aria-label={`${brand.name}, inicio`}><BrandLogo decorative /></Link>
      <nav className="flex shrink-0 items-center gap-3 text-sm sm:gap-4" aria-label="Principal">
        {session ? <>
          <Link to="/dj/dashboard">Mis eventos</Link>
          {dashboard || eventDetail
            ? <DjAccountMenu signingOut={signingOut} onSignOut={() => void signOut()} />
            : <button className="text-muted" disabled={signingOut} onClick={() => void signOut()}>Salir</button>}
        </> : <Link className="button secondary" to="/dj/login">Acceso DJ <span aria-hidden="true">↗</span></Link>}
      </nav>
    </header>
    <main className="mx-auto max-w-6xl px-5 pb-16 pt-8 sm:px-8">{error && <Notice error>{error}</Notice>}<Outlet /></main>
    {showFooter && <SiteFooter />}
  </div>
}
export function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <p role={error ? 'alert' : 'status'} className={`notice ${error ? 'notice-error' : ''}`}>{children}</p>
}
export function Loading() { return <p role="status" className="py-12 text-muted">Conectando con tu música…</p> }
