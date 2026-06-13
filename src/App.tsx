import { useApp } from './lib/state'
import { OnboardingScreen } from './screens/OnboardingScreen'
import { PlanScreen } from './screens/PlanScreen'
import { WorkoutScreen } from './screens/WorkoutScreen'

function App() {
  const { currentPlan, activeWorkout } = useApp()

  // Aktives Workout hat Vorrang. Sonst: kein Plan -> Onboarding, sonst Plan.
  if (activeWorkout) return <WorkoutScreen />
  return currentPlan ? <PlanScreen /> : <OnboardingScreen />
}

export default App
