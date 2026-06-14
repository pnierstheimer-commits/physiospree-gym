import { useApp } from './lib/state'
import { useAuth } from './lib/useAuth'
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
  const { currentPlan, activeWorkout } = useApp()

  // Harter Login-Gate: ohne Session kein Zugriff.
  if (auth.loading) return <Splash />
  if (!auth.session) return <LoginScreen sendOtp={auth.sendOtp} verifyOtp={auth.verifyOtp} />

  // Eingeloggt: aktives Workout hat Vorrang, sonst Plan, sonst Onboarding.
  if (activeWorkout) return <WorkoutScreen />
  return currentPlan ? <PlanScreen /> : <OnboardingScreen />
}

export default App
