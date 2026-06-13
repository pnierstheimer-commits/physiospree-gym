import { useApp } from './lib/state'
import './App.css'

function App() {
  const { state } = useApp()

  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        padding: '2rem',
        maxWidth: 640,
        margin: '0 auto',
      }}
    >
      <h1>Physiospree Gym — Phase 0 abgeschlossen</h1>
      <p>KI-Kraftcoach fürs Fitnessstudio.</p>
      <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
        Schema v{state.schemaVersion} · zuletzt geändert{' '}
        {new Date(state.stateUpdatedAt).toLocaleString('de-DE')}
      </p>
    </main>
  )
}

export default App
