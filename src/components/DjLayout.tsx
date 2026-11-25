import { Outlet } from 'react-router'
import { SiteFooter } from './SiteFooter'

export function DjLayout() {
  return <div className="flex min-h-dvh flex-col">
    <Outlet />
    <SiteFooter variant="dj" />
  </div>
}
