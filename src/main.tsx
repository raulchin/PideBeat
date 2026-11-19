import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { AuthProvider } from './features/auth/AuthProvider'
import { App } from './app/App'
import { brand } from './config/brand'
import './styles/index.css'

document.documentElement.style.setProperty('--color-lime', brand.accent)
document.documentElement.style.setProperty('--color-ink', brand.background)
createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter></StrictMode>,
)
