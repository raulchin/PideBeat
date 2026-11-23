import { useEffect, useRef, useState } from 'react'
import { Notice } from '../../components/Layout'

function playChime(audio: AudioContext, volume: number) {
  const start = audio.currentTime
  const tone = audio.createOscillator()
  const gain = audio.createGain()
  tone.frequency.setValueAtTime(660, start)
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(volume * 0.0015, start + 0.025)
  gain.gain.linearRampToValueAtTime(0, start + 0.22)
  tone.connect(gain)
  gain.connect(audio.destination)
  tone.onended = () => { tone.disconnect(); gain.disconnect() }
  tone.start(start)
  tone.stop(start + 0.22)
}

export function CabinSound({ arrivalCount }: { arrivalCount: number }) {
  const [enabled, setEnabled] = useState(false)
  const [starting, setStarting] = useState(false)
  const [volume, setVolume] = useState(60)
  const [error, setError] = useState('')
  const audio = useRef<AudioContext | null>(null)
  const observed = useRef(arrivalCount)
  const lastBeep = useRef(-Infinity)

  useEffect(() => () => {
    const context = audio.current
    audio.current = null
    // El cierre puede coincidir con la suspensión del audio al salir de la vista.
    if (context) void context.close().catch(() => {})
  }, [])

  useEffect(() => {
    const isNew = arrivalCount > observed.current
    observed.current = arrivalCount
    const context = audio.current
    if (!isNew || !enabled || !volume || context?.state !== 'running') return
    if (context.currentTime - lastBeep.current < 0.4) return
    lastBeep.current = context.currentTime
    playChime(context, volume)
  }, [arrivalCount, enabled, volume])

  async function toggle() {
    if (enabled) {
      setEnabled(false)
      return
    }
    setStarting(true)
    setError('')
    let context: AudioContext | null = null
    try {
      // Crear o reactivar el audio dentro del clic para respetar el bloqueo de reproducción automática.
      context = audio.current ?? new AudioContext()
      audio.current = context
      await context.resume()
      if (audio.current !== context) return
      if (context.state !== 'running') throw new Error()
      setEnabled(true)
    } catch {
      if (!context || audio.current === context) setError('El navegador no pudo activar el sonido. Vuelve a intentarlo.')
    } finally {
      if (!context || audio.current === context) setStarting(false)
    }
  }

  return <div>
    <div className="flex flex-wrap items-center gap-4">
      <button type="button" className="button secondary" aria-pressed={enabled} disabled={starting}
        onClick={() => void toggle()}>Sonido de solicitudes: {starting ? 'activando…' : enabled ? 'activado' : 'desactivado'}</button>
      <label className="flex items-center gap-2">
        <span>Volumen</span>
        <input type="range" min="0" max="100" step="10" value={volume}
          className="m-0 min-h-11 w-28 border-0 bg-transparent p-0 accent-lime"
          onChange={event => setVolume(Number(event.target.value))} />
        <span aria-hidden="true" className="w-10 text-muted tabular-nums">{volume}%</span>
      </label>
    </div>
    {error && <Notice error>{error}</Notice>}
  </div>
}
