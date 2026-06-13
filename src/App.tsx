import { useApp } from './lib/state'
import { OnboardingScreen } from './screens/OnboardingScreen'
import { PlanScreen } from './screens/PlanScreen'

function App() {
  const { currentPlan } = useApp()

  // Kein Plan -> Onboarding (inkl. Loading/Fehler während der Generierung).
  // Plan vorhanden -> Plan-Screen.
  return currentPlan ? <PlanScreen /> : <OnboardingScreen />
}

export default App
