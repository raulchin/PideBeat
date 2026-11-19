import { useEffect, useRef } from 'react'

type TurnstileApi = {
  render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void; 'error-callback': () => void; theme: string }) => string
  remove: (id: string) => void
}
declare global { interface Window { turnstile?: TurnstileApi } }

export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let id: string | undefined
    let active = true
    function render() {
      if (!active || !container.current || !window.turnstile || id) return
      id = window.turnstile.render(container.current, {
        sitekey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
        callback: onToken, 'expired-callback': () => onToken(''), 'error-callback': () => onToken(''), theme: 'dark',
      })
    }
    let script = document.querySelector<HTMLScriptElement>('#turnstile-script')
    if (!script) {
      script = document.createElement('script')
      script.id = 'turnstile-script'
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      document.head.append(script)
    }
    script.addEventListener('load', render)
    render()
    return () => { active = false; script.removeEventListener('load', render); if (id) window.turnstile?.remove(id) }
  }, [onToken])
  return <div ref={container} className="min-h-16" />
}
