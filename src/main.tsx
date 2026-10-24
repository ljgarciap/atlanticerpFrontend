import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './i18n'
import { installImpersonationTabSync } from './lib/impersonationTabSync'

// Apply stored theme before first paint to avoid flash
const storedTheme = localStorage.getItem('atlanticerp_theme')
if (storedTheme === 'dark') document.documentElement.classList.add('dark')

// SCRUM-1158 — las demás pestañas se recargan al entrar o salir de «Ver como usuario» en otra (ver lib/impersonationTabSync.ts).
installImpersonationTabSync()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
