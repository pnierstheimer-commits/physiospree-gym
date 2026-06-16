import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from './lib/state'
import { useAuth } from './lib/useAuth'
import { fullSync, pushChanges } from './lib/sync'
import { LoginScreen } from './screens/LoginScreen'
import { OnboardingScreen } from './screens/OnboardingScreen'
import { PlanScreen } from './screens/PlanScreen'
import { WorkoutScreen } from './screens/WorkoutScreen'
import { TodayScreen } from './screens/TodayScreen'
import { CoachScreen } from './screens/CoachScreen'
import { JournalScreen } from './screens/JournalScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { WaitingScreen } from './screens/WaitingScreen'
import { LegalScreen, type LegalPage } from './screens/legal/LegalScreen'
import { BottomNav } from './components/BottomNav'
import type { ReactNode } from 'react'

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
  const { state, update, replaceState, resetState, currentPlan, activeWorkout, activeTab, planLoading } =
    useApp()
  const userId = auth.user?.id ?? null

  // Legal-Overlay (transient, nicht persistiert): aus dem Profil geöffnet,
  // rendert als Vollbild-Screen ohne BottomNav.
  const [legalPage, setLegalPage] = useState<LegalPage | null>(null)

  // Pending-dirty-Flag (P3): true sobald lokale Änderungen anliegen, bleibt
  // gesetzt bis ein Push erfolgreich war. Als Ref gehalten — kein Render nötig
  // (React rät von setState-in-Effect / Ref-Mutation im Render ab).
  const pendingPush = useRef(false)
  // Immer aktueller State für Listener-Callbacks (ohne Re-Registrierung).
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])
  // Verhindert überlappende Syncs (Reconnect + Foreground gleichzeitig).
  const syncing = useRef(false)
  // Genau ein Login-/App-Start-Sync pro userId.
  const syncedFor = useRef<string | null>(null)

  // Voller Sync: pull -> merge (LWW) -> push(merged, guarded) — siehe sync.ts.
  // Aktualisiert den lokalen State und löscht das Pending-Flag bei Erfolg.
  const runFullSync = useCallback(
    async (uid: string) => {
      if (syncing.current) return
      syncing.current = true
      try {
        const res = await fullSync(uid, stateRef.current)
        if (res.state) replaceState(res.state)
        if (res.ok) pendingPush.current = false
      } catch {
        /* offline-tolerant (Regel 9): lokal weiterarbeiten */
      } finally {
        syncing.current = false
      }
    },
    [replaceState],
  )

  // Nach Login (oder App-Start mit Session): genau einmal voll synchronisieren.
  useEffect(() => {
    if (!userId) {
      syncedFor.current = null
      return
    }
    if (syncedFor.current === userId) return
    syncedFor.current = userId
    void runFullSync(userId)
  }, [userId, runFullSync])

  // Debounced Push bei jeder State-Änderung (guarded -> kein Clobber, P1).
  // Setzt das Pending-Flag; löscht es erst nach erfolgreichem Push (P3).
  useEffect(() => {
    if (!userId) return
    pendingPush.current = true
    const snapshot = state // gepushter Snapshot (für den High-Water-Mark)
    const since = snapshot.lastSyncedAt ?? null // P2: nur Delta seit letztem Push
    const t = setTimeout(() => {
      void pushChanges(userId, snapshot, since)
        .then((res) => {
          if (!res.ok) return
          pendingPush.current = false
          // P2: lastSyncedAt auf den High-Water-Mark des Snapshots heben — nur
          // wenn tatsächlich etwas geschrieben wurde (sonst Schreib-Loop).
          if (res.pushed > 0 && snapshot.lastSyncedAt !== snapshot.stateUpdatedAt) {
            update(() => ({ lastSyncedAt: snapshot.stateUpdatedAt }))
          }
        })
        .catch(() => {})
    }, 1500)
    return () => clearTimeout(t)
  }, [userId, state, update])

  // P3: Reconnect (online) + Rückkehr in den Vordergrund (visibilitychange,
  // wichtig für die PWA auf dem iPhone) -> voller Sync (pull-merge-push).
  useEffect(() => {
    if (!userId) return
    const onOnline = () => void runFullSync(userId)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void runFullSync(userId)
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId, runFullSync])

  // Logout: abmelden, lokalen State leeren -> Gate routet zurück zum Login.
  const handleSignOut = () => {
    void auth.signOut().finally(() => {
      resetState()
    })
  }

  // Harter Login-Gate: ohne Session kein Zugriff.
  if (auth.loading) return <Splash />
  if (!auth.session) return <LoginScreen sendOtp={auth.sendOtp} verifyOtp={auth.verifyOtp} />

  // Aktives Workout hat Vorrang und blendet die Bottom-Nav aus (Fokus beim Training).
  if (activeWorkout) return <WorkoutScreen />

  // Plan-Generierung: Vollbild-WaitingScreen (ohne Nav), bis der Plan eintrifft.
  if (planLoading) return <WaitingScreen />

  // Legal-Seiten: eigener Vollbild-Screen ohne Nav, Back kehrt zum Profil zurück.
  if (legalPage) return <LegalScreen page={legalPage} onBack={() => setLegalPage(null)} />

  // Tab-gesteuerte Screens + immer sichtbare Bottom-Nav.
  let screen: ReactNode
  switch (activeTab) {
    case 'plan':
      screen = currentPlan ? <PlanScreen /> : <OnboardingScreen onSignOut={handleSignOut} />
      break
    case 'coach':
      screen = <CoachScreen />
      break
    case 'journal':
      screen = <JournalScreen />
      break
    case 'profile':
      screen = (
        <ProfileScreen
          email={auth.user?.email ?? null}
          onSignOut={handleSignOut}
          onOpenLegal={setLegalPage}
        />
      )
      break
    case 'today':
    default:
      screen = <TodayScreen />
      break
  }

  return (
    <div className="ps-tabbed">
      {screen}
      <BottomNav />
    </div>
  )
}

export default App
