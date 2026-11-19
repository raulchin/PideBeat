import logo from '../assets/pidebeat-logo.webp'

export const brand = {
  name: 'PideBeat',
  logo,
  slogan: 'Pide tu canción. Vive el ritmo',
  accent: '#c5f562',
  background: '#101110',
  publicUrl: import.meta.env.VITE_PUBLIC_URL || window.location.origin,
}

export function eventUrl(code: string) {
  const url = new URL(`/e/${code}`, brand.publicUrl)
  const local = ['localhost', '127.0.0.1'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(import.meta.env.DEV && local)) {
    throw new Error('Configura VITE_PUBLIC_URL con una URL HTTPS para compartir el QR.')
  }
  return url.href
}
