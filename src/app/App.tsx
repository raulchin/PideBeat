import { Link, Navigate, Outlet, Route, Routes } from 'react-router'
import { Layout, Loading, Notice } from '../components/Layout'
import { BrandLogo } from '../components/BrandLogo'
import { configured } from '../lib/supabase'
import { useSession } from '../features/auth/session'
import { LoginPage } from '../features/auth/LoginPage'
import { DashboardPage } from '../features/events/DashboardPage'
import { EventPage } from '../features/events/EventPage'
import { GuestPage } from '../features/song-requests/GuestPage'
import { RafflePage } from '../features/raffles/RafflePage'
import { RaffleWinnerPage } from '../features/raffles/RaffleWinnerPage'

function PrivateRoute() {
  const { session, loading, error } = useSession()
  if (loading) return <Loading />
  if (error) return <Notice error>{error}</Notice>
  return session ? <Outlet key={session.user.id} /> : <Navigate to="/dj/login" replace />
}
function HomePage() {
  return <section className="relative py-10 sm:py-20">
    <p className="eyebrow">TU PÚBLICO TAMBIÉN TIENE RITMO</p>
    <div className="grid items-center gap-12 md:grid-cols-[1.2fr_1fr]">
      <div><h1 className="hero-title">Pide tu canción.<br /><span className="text-lime">Vive el ritmo.</span></h1><p className="mb-8 mt-7 max-w-md text-lg leading-relaxed text-muted">Del público a la cabina, sin interrumpir la sesión. Un QR, una canción y toda la noche por delante.</p><Link className="button primary" to="/dj/dashboard">Abrir mi cabina <span aria-hidden="true">↗</span></Link><p className="mt-5 text-xs text-muted">Para DJs. Desde el navegador. Sin apps.</p></div>
      <div className="record-art" aria-hidden="true"><div className="record"><div className="record-label"><span>PIDE<br />BEAT</span><i /></div></div><div className="record-tag">EL PRÓXIMO TEMA<br /><strong>lo pide la pista.</strong></div></div>
    </div>
    <div className="mt-20 grid gap-7 border-t border-line pt-8 sm:grid-cols-3">{[['01', 'Crea tu evento', 'Ponle nombre a tu sesión y recibe un QR único.'], ['02', 'Comparte el ritmo', 'Tu público escanea y pide canción, sin registrarse.'], ['03', 'Tú llevas la mezcla', 'Recibe las solicitudes en vivo y decide qué suena.']].map(([number, title, text]) => <div key={number}><span className="font-mono text-xs text-lime">/ {number}</span><h2 className="mb-2 mt-4 text-lg font-semibold">{title}</h2><p className="max-w-xs text-sm leading-relaxed text-muted">{text}</p></div>)}</div>
  </section>
}
function ConfigurationPage() {
  return <main className="mx-auto max-w-xl px-6 py-20"><div className="mb-8"><BrandLogo /></div><h1 className="text-3xl font-bold">Prepara tu cabina.</h1><Notice>Falta conectar Supabase. Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en .env.local y reinicia el servidor.</Notice><p className="mt-5 text-muted">El README incluye las migraciones, las funciones y la guía de despliegue. No se usan datos simulados.</p></main>
}
export function App() {
  if (!configured) return <ConfigurationPage />
  return <Routes>
    <Route path="/e/:publicCode" element={<GuestPage />} />
    <Route element={<PrivateRoute />}>
      <Route path="/dj/event/:id/sorteo/ganador" element={<RaffleWinnerPage />} />
    </Route>
    <Route element={<Layout />}>
      <Route index element={<HomePage />} />
      <Route path="/dj/login" element={<LoginPage />} />
      <Route element={<PrivateRoute />}>
        <Route path="/dj/dashboard" element={<DashboardPage />} />
        <Route path="/dj/event/:id" element={<EventPage />} />
        <Route path="/dj/event/:id/sorteo" element={<RafflePage />} />
      </Route>
      <Route path="*" element={<section className="py-20"><p className="eyebrow">404 / FUERA DE LA PISTA</p><h1 className="mb-8 text-4xl font-bold">Esta página no está en la sesión.</h1><Link className="button primary" to="/">Volver al inicio</Link></section>} />
    </Route>
  </Routes>
}
