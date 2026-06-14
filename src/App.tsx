import { useEffect, useRef } from 'react'
import { useApp } from './lib/state'
import { useAuth } from './lib/useAuth'
import { fullSync, pushChanges } from './lib/sync'
import { LoginScreen } from './screens/LoginScreen'
import { OnboardingScreen } from './screens/OnboardingScreen'
import { PlanScreen } from './screens/PlanScreen'
import { WorkoutScreen } from './screens/WorkoutScreen'

function Splash() {
  return (
    <div className="ps-screen">
      <div className="ps-shell">
        <div className="ps-center">
          <div className="ps-brand">Physiospree</div>
          <div className="ps-spinner" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}

function App() {
  const auth = useAuth()
  const { state, replaceState, resetState, currentPlan, activeWorkout } = useApp()
  const userId = auth.user?.id ?? null

  // Verhindert mehrfaches Sync pro Login (syncedFor = bereits gesyncte userId).
  const syncedFor = useRef<string | null>(null)

  // Nach Login: einmalig fullSync (push lokal, pull server, merge). Normalfall
  // hinter dem Gate = leerer localStorage -> es werden die Server-Daten geladen.
  // `state` in den Deps, aber der Guard sorgt für genau einen Sync-Durchlauf.
  useEffect(() => {
    if (!userId) {
      syncedFor.current = null
      return
    }
    if (syncedFor.current === userId) return
    syncedFor.current = userId
    void fullSync(userId, state)
      .then((res) => {
        if (res.state) replaceState(res.state)
      })
      .catch(() => {
        /* offline-tolerant (Regel 9): lokal weiterarbeiten */
      })
  }, [userId, state, replaceState])

  // Debounced push bei jeder State-Änderung (nur eingeloggt, non-blocking).
  useEffect(() => {
    if (!userId) return
    const t = setTimeout(() => {
      void pushChanges(userId, state).catch(() => {})
    }, 1500)
    return () => clearTimeout(t)
  }, [userId, state])

  // Logout: abmelden, lokalen State leeren -> Gate routet zurück zum Login.
  const handleSignOut = () => {
    void auth.signOut().finally(() => {
      resetState()
    })
  }

  // Harter Login-Gate: ohne Session kein Zugriff.
  if (auth.loading) return <Splash />
  if (!auth.session) return <LoginScreen sendOtp={auth.sendOtp} verifyOtp={auth.verifyOtp} />

  // Eingeloggt: aktives Workout hat Vorrang, sonst Plan, sonst Onboarding.
  if (activeWorkout) return <WorkoutScreen />
  return currentPlan ? (
    <PlanScreen onSignOut={handleSignOut} />
  ) : (
    <OnboardingScreen onSignOut={handleSignOut} />
  )
}

export default App
