import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppProvider } from './lib/state.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
)

// Service Worker registrieren (nach dem Mount, damit er den Start nicht
// verzögert). Network-first für Navigationen + skipWaiting → zuverlässiges
// Update ohne Neuinstallation, dazu Offline-Öffnen. Fehler bewusst geschluckt:
// der SW darf den App-Start nie stören.
//
// Nur im Production-Build: im Vite-Dev-Server würde das Asset-Caching (SWR)
// gerade bearbeitete Module aus dem Cache ausliefern.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
