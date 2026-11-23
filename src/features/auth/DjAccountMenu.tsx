import { useEffect, useId, useRef, useState } from 'react'
import { useSession } from './session'

type MenuProps = { signingOut: boolean; onSignOut: () => void }

export function DjAccountMenu(props: MenuProps) {
  const { session, loading, error } = useSession()
  if (loading || error || !session) return null

  const { user_metadata: metadata, email } = session.user
  const knownNames: unknown[] = [metadata.full_name, metadata.display_name, metadata.name, metadata.username, email]
  const label = knownNames.find((value): value is string => typeof value === 'string' && value.trim() !== '')?.trim() ?? 'DJ'
  return <AccountDropdown key={session.user.id} label={label} {...props} />
}

function AccountDropdown({ label, signingOut, onSignOut }: MenuProps & { label: string }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  function closeAndFocus() {
    setOpen(false)
    trigger.current?.focus()
  }

  return <div ref={container} className="relative"
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}
    onKeyDown={event => {
      if (event.key === 'Escape' && open) {
        event.preventDefault()
        closeAndFocus()
      }
    }}>
    <button ref={trigger} type="button" aria-label={`Menú de cuenta: ${label}`} aria-expanded={open}
      aria-controls={id} aria-busy={signingOut || undefined}
      className="flex size-11 items-center justify-center gap-2 rounded-lg border border-line bg-white/5 text-sm hover:border-lime/60 hover:bg-white/10 sm:w-auto sm:px-2"
      onClick={() => setOpen(value => !value)}>
      <UserIcon />
      <span className="hidden max-w-44 truncate sm:block">{label}</span>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="hidden text-muted sm:block">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
    <div id={id} hidden={!open} className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-line bg-ink shadow-xl">
      {open && <>
        <div className="flex items-center gap-3 border-b border-line px-3 py-3">
          <UserIcon />
          <div className="min-w-0">
            <p className="text-xs text-muted">Sesión de DJ</p>
            <p className="break-words font-semibold [overflow-wrap:anywhere]">{label}</p>
          </div>
        </div>
        <div className="p-1.5">
          <button type="button" disabled={signingOut} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left hover:bg-white/10"
            onClick={() => { closeAndFocus(); onSignOut() }}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
              <path d="M10 4H5v16h5m3-13 5 5-5 5m5-5H9" />
            </svg>
            {signingOut ? 'Cerrando sesión…' : 'Salir'}
          </button>
        </div>
      </>}
    </div>
  </div>
}

function UserIcon() {
  return <span className="grid size-7 shrink-0 place-items-center rounded-full border border-lime/25 bg-lime/10 text-lime">
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" />
    </svg>
  </span>
}
