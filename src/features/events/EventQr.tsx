import { useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { eventUrl } from '../../config/brand'
import { Notice } from '../../components/Layout'

export function EventQr({ code }: { code: string }) {
  const holder = useRef<HTMLDivElement>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  let url: string
  try { url = eventUrl(code) } catch (error) { return <Notice error>{(error as Error).message}</Notice> }
  async function copy() {
    try { await navigator.clipboard.writeText(url); setMessage('Enlace copiado.'); setError('') }
    catch { setError('No se pudo copiar. Selecciona el enlace y cópialo manualmente.') }
  }
  function download() {
    const svg = holder.current?.querySelector('svg')
    if (!svg) return
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' })
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl; anchor.download = `pidebeat-${code}.svg`; anchor.click()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  }
  return <section className="panel space-y-5">
    <p className="eyebrow">EL ACCESO A TU PISTA</p><h2 className="text-2xl font-semibold">Escanea. Pide. Disfruta.</h2>
    <div ref={holder} className="mx-auto w-fit rounded-xl bg-white p-3"><QRCodeSVG value={url} size={224} marginSize={4} level="M" title="Escanea para pedir una canción" /></div>
    <label>Enlace para invitados<input aria-label="Enlace para invitados" readOnly value={url} onFocus={event => event.currentTarget.select()} className="text-xs" /></label>
    <div className="flex flex-wrap gap-3"><button className="button primary flex-1" onClick={() => void copy()}>Copiar enlace</button><button className="button secondary flex-1" onClick={download}>Descargar QR</button></div>
    {message && <Notice>{message}</Notice>}{error && <Notice error>{error}</Notice>}
    <p className="text-xs text-muted">Descarga el SVG para imprimirlo o proyectarlo. No requiere cuenta para tus invitados.</p>
  </section>
}
