import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './i18n'

// Apply stored theme before first paint to avoid flash
const storedTheme = localStorage.getItem('atlanticerp_theme')
if (storedTheme === 'dark') document.documentElement.classList.add('dark')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
