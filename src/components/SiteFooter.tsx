import { brand } from '../config/brand'

const developer = 'DJ-Dev'

export function SiteFooter({ variant = 'standard' }: { variant?: 'standard' | 'dj' | 'guest' }) {
  if (variant === 'guest') {
    return <footer className="space-y-1 border-t border-line px-2 pt-4 text-center text-xs leading-relaxed text-muted">
      <p>{brand.name} · Creado por {developer}</p>
      <p>Con apoyo de IA</p>
    </footer>
  }

  if (variant === 'dj') {
    return <footer className="mx-auto w-full max-w-6xl px-5 pb-8 sm:px-8">
      <div className="panel space-y-1.5 text-center text-xs leading-relaxed text-muted">
        <svg aria-hidden="true" className="mx-auto mb-2 text-lime" width="24" height="24" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M3 10v4m4-7v10m5-14v18m5-15v12m4-8v4" />
        </svg>
        <p className="text-base font-semibold text-white">{brand.name}</p>
        <p className="text-sm">Desarrollado por Ing. Raúl Chin ({developer})</p>
        <p>Con el apoyo de inteligencia artificial</p>
        <p>© {new Date().getFullYear()} {brand.name}</p>
      </div>
    </footer>
  }

  return <footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 border-t border-line px-5 py-6 text-xs text-muted sm:px-8">
    <span>{brand.name} / La música la hacemos entre todos.</span>
    <span>Sin instalaciones. Solo ritmo.</span>
  </footer>
}
