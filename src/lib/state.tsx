/**
 * App-State: AppProvider + useApp.
 *
 * Offline-First (CLAUDE.md Regel 9): localStorage ist die primäre
 * Laufzeitquelle. Persistiert wird ein PersistedState inkl. stateUpdatedAt,
 * das den späteren Sync (Regel 5) treibt.
 *
 * WICHTIG (Regel 1): State wird AUSSCHLIESSLICH über funktionale Updater
 * geändert. Die exponierten Helfer kapseln das — niemals den aktuellen State
 * direkt referenzieren.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { SCHEMA_VERSION, STORAGE_KEY } from '../shared/constants';
import type {
  ParsedMarker,
  PersistedState,
  PlannedSession,
  PlanResponse,
  UserProfile,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '../shared/types';
import { generatePlan, parseMarkers } from './services/planService';
import { ensureScheduledDays } from './services/scheduleService';

// ---------------------------------------------------------------------------
// Initialer / leerer State
// ---------------------------------------------------------------------------

function emptyState(): PersistedState {
  return {
    schemaVersion: SCHEMA_VERSION,
    stateUpdatedAt: new Date().toISOString(),
    lastSyncedAt: null,
    profile: null,
    frameworks: [],
    workouts: [],
    checkins: [],
    markers: [],
    coachActions: [],
    exercises: [],
    currentPlan: null,
    parsedMarkers: [],
    chatMessages: [],
  };
}

function loadState(): PersistedState {
  if (typeof localStorage === 'undefined') return emptyState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as PersistedState;
    // Einfache Vorwärtskompatibilität: bei Versionssprung Felder mergen.
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      return { ...emptyState(), ...parsed, schemaVersion: SCHEMA_VERSION };
    }
    return parsed;
  } catch {
    return emptyState();
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface AppContextValue {
  state: PersistedState;
  /**
   * Funktionaler State-Updater (Regel 1). Der Mutator erhält den vorherigen
   * State und gibt den (Teil-)Patch zurück; stateUpdatedAt wird automatisch
   * gesetzt.
   */
  update: (mutator: (prev: PersistedState) => Partial<PersistedState>) => void;
  /** Kompletten State ersetzen (z. B. nach Sync-Import). */
  replaceState: (next: PersistedState) => void;
  /** State auf leer zurücksetzen. */
  resetState: () => void;

  // --- Plan (KI-Pfad, Regel 8) ---
  /** Aktuell aktiver Plan oder null. */
  currentPlan: PlanResponse | null;
  /** Läuft gerade eine Plananfrage? (transient, nicht persistiert) */
  planLoading: boolean;
  /** Letzter Planfehler oder null. (transient, nicht persistiert) */
  planError: string | null;
  /**
   * Speichert einen fertigen Plan: Framework + Detail-Wochen + Actions, und
   * extrahiert die Marker (noch ohne Anwendung — Phase 3).
   */
  setPlan: (plan: PlanResponse) => void;
  /** Entfernt den aktuellen Plan. */
  clearPlan: () => void;
  /** Fordert einen Plan über den planService an und pflegt loading/error/plan. */
  requestPlan: (profile: UserProfile) => Promise<void>;
  /**
   * Ersetzt die Sessions einer Woche (z. B. nach Drag-and-Drop-Umplanung der
   * Wochentage). Persistiert über den normalen State-/Sync-Pfad.
   */
  updateWeekSessions: (weekId: string, sessions: PlannedSession[]) => void;
  /**
   * Füllt fehlende `scheduledDay`-Felder einmalig per Auto-Verteilung
   * (scheduleService). No-op, wenn alle Sessions bereits terminiert sind.
   */
  ensureSchedule: () => void;

  // --- Workout-Player ---
  // activeWorkout/workoutHistory sind aus `state.workouts` abgeleitet
  // (status === 'in_progress' = aktiv). So bleibt die Persistenz im
  // bestehenden Feld, ohne types.ts/constants.ts zu ändern.
  /** Laufendes Workout (status 'in_progress') oder null. */
  activeWorkout: Workout | null;
  /** Abgeschlossene/abgebrochene Workouts. */
  workoutHistory: Workout[];
  /** Startet ein Workout aus einer geplanten Einheit. */
  startWorkout: (session: PlannedSession) => void;
  /** Speichert/aktualisiert einen Satz der aktiven Übung (per Satznummer). */
  logSet: (exerciseIndex: number, set: WorkoutSet) => void;
  /** Schließt das aktive Workout ab (→ Historie). */
  completeWorkout: () => void;
  /** Bricht das aktive Workout ab; Teildaten bleiben als 'skipped' erhalten. */
  abortWorkout: () => void;

  // --- Marker-Anwendung (Feedback-Loop, Phase 3) ---
  /** Wendet Coach-Marker auf den aktuellen Plan an (LOAD_ADJUSTMENT, DELOAD). */
  applyMarkers: (markers: ParsedMarker[]) => void;
}

/** Übungsname aus dem notes-Feld ("Name — cue"). */
function exerciseNameFromNotes(notes: string | undefined): string {
  if (!notes) return '';
  const i = notes.indexOf(' — ');
  return i === -1 ? notes : notes.slice(0, i);
}

const AppContext = createContext<AppContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(loadState);

  // Transient: gehört nicht in localStorage (ein Reload ist nie "mitten im
  // Laden", und alte Fehler sollen nicht wieder auftauchen).
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  // Persistenz: bei jeder State-Änderung in localStorage schreiben.
  // Debounced über requestIdleCallback-Fallback, um Schreibstürme zu dämpfen.
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Speicher voll / blockiert — Offline-Logik darf nicht crashen.
      }
    }, 150);
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
    };
  }, [state]);

  const update = useCallback<AppContextValue['update']>((mutator) => {
    // Regel 1: immer funktional. stateUpdatedAt wird hier zentral gepflegt.
    setState((prev) => {
      const patch = mutator(prev);
      return {
        ...prev,
        ...patch,
        stateUpdatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const replaceState = useCallback<AppContextValue['replaceState']>((next) => {
    setState(() => ({ ...next }));
  }, []);

  const resetState = useCallback<AppContextValue['resetState']>(() => {
    setState(() => emptyState());
  }, []);

  // --- Plan-Actions (Regel 1: immer funktionaler Updater) ---

  /** Persistiert einen Plan + extrahierte Marker. updatedAt = lokaler Schreibzeitpunkt (Regel 5). */
  const storePlan = useCallback(
    (plan: PlanResponse) => {
      const now = new Date().toISOString();
      update(() => ({
        currentPlan: {
          ...plan,
          framework: { ...plan.framework, updatedAt: now },
        },
        parsedMarkers: parseMarkers(plan.actions),
      }));
    },
    [update],
  );

  const setPlan = useCallback<AppContextValue['setPlan']>(
    (plan) => {
      storePlan(plan);
      setPlanError(null);
      setPlanLoading(false);
    },
    [storePlan],
  );

  const clearPlan = useCallback<AppContextValue['clearPlan']>(() => {
    update(() => ({ currentPlan: null, parsedMarkers: [] }));
    setPlanError(null);
  }, [update]);

  /** Sessions einer Woche ersetzen (Drag-and-Drop). Bumpt Woche + Framework. */
  const updateWeekSessions = useCallback<AppContextValue['updateWeekSessions']>(
    (weekId, sessions) => {
      update((prev) => {
        if (!prev.currentPlan) return {};
        const now = new Date().toISOString();
        const fw = prev.currentPlan.framework;
        const weeks = fw.weeks.map((w) =>
          w.id === weekId ? { ...w, sessions, updatedAt: now } : w,
        );
        const framework = { ...fw, weeks, updatedAt: now };
        return {
          currentPlan: { ...prev.currentPlan, framework },
          frameworks: prev.frameworks.map((f) => (f.id === framework.id ? framework : f)),
        };
      });
    },
    [update],
  );

  /** Auto-Verteilung fehlender Wochentage (einmalig, no-op wenn nichts fehlt). */
  const ensureSchedule = useCallback<AppContextValue['ensureSchedule']>(() => {
    update((prev) => {
      if (!prev.currentPlan) return {};
      const { framework, changed } = ensureScheduledDays(prev.currentPlan.framework);
      if (!changed) return {};
      const now = new Date().toISOString();
      const fw = { ...framework, updatedAt: now };
      return {
        currentPlan: { ...prev.currentPlan, framework: fw },
        frameworks: prev.frameworks.map((f) => (f.id === fw.id ? fw : f)),
      };
    });
  }, [update]);

  const requestPlan = useCallback<AppContextValue['requestPlan']>(
    async (profile) => {
      setPlanLoading(true);
      setPlanError(null);
      try {
        const plan = await generatePlan(profile);
        storePlan(plan);
      } catch (err) {
        setPlanError(
          err instanceof Error ? err.message : 'Unbekannter Fehler bei der Planerstellung.',
        );
      } finally {
        setPlanLoading(false);
      }
    },
    [storePlan],
  );

  // --- Workout-Actions (Regel 1: funktionaler Updater) ---

  const startWorkout = useCallback<AppContextValue['startWorkout']>(
    (session) => {
      const now = new Date().toISOString();
      update((prev) => {
        const userId = prev.currentPlan?.framework.userId ?? uuidv4();
        const workoutId = uuidv4();
        const exercises: WorkoutExercise[] = [...session.exercises]
          .sort((a, b) => a.order - b.order)
          .map((pe, idx) => ({
            id: uuidv4(),
            updatedAt: now,
            deletedAt: null,
            workoutId,
            exerciseId: pe.exerciseId,
            order: idx,
            sets: [],
            notes: pe.notes,
          }));
        const workout: Workout = {
          id: workoutId,
          updatedAt: now,
          deletedAt: null,
          userId,
          plannedSessionId: session.id,
          date: now,
          name: session.name,
          status: 'in_progress',
          startedAt: now,
          exercises,
          checkin: null,
        };
        // Nur ein aktives Workout: evtl. vorhandenes (unfertiges) verwerfen.
        const others = prev.workouts.filter((w) => w.status !== 'in_progress');
        return { workouts: [...others, workout] };
      });
    },
    [update],
  );

  const logSet = useCallback<AppContextValue['logSet']>(
    (exerciseIndex, set) => {
      update((prev) => {
        const idx = prev.workouts.findIndex((w) => w.status === 'in_progress');
        if (idx === -1) return {};
        const now = new Date().toISOString();
        const active = prev.workouts[idx];
        const exercises = active.exercises.map((ex, i) => {
          if (i !== exerciseIndex) return ex;
          const pos = ex.sets.findIndex((s) => s.setNumber === set.setNumber);
          const sets =
            pos === -1
              ? [...ex.sets, set]
              : ex.sets.map((s, j) => (j === pos ? set : s));
          sets.sort((a, b) => a.setNumber - b.setNumber);
          return { ...ex, updatedAt: now, sets };
        });
        const updated: Workout = { ...active, updatedAt: now, exercises };
        return { workouts: prev.workouts.map((w, i) => (i === idx ? updated : w)) };
      });
    },
    [update],
  );

  const completeWorkout = useCallback<AppContextValue['completeWorkout']>(() => {
    update((prev) => {
      const idx = prev.workouts.findIndex((w) => w.status === 'in_progress');
      if (idx === -1) return {};
      const now = new Date().toISOString();
      const done: Workout = {
        ...prev.workouts[idx],
        status: 'completed',
        completedAt: now,
        updatedAt: now,
      };
      return { workouts: prev.workouts.map((w, i) => (i === idx ? done : w)) };
    });
  }, [update]);

  const abortWorkout = useCallback<AppContextValue['abortWorkout']>(() => {
    update((prev) => {
      const idx = prev.workouts.findIndex((w) => w.status === 'in_progress');
      if (idx === -1) return {};
      const now = new Date().toISOString();
      const active = prev.workouts[idx];
      const hasData = active.exercises.some((ex) => ex.sets.length > 0);
      // Teildaten behalten: mit Sätzen als 'skipped' archivieren, sonst verwerfen.
      const workouts = hasData
        ? prev.workouts.map((w, i) =>
            i === idx ? { ...w, status: 'skipped' as const, updatedAt: now } : w,
          )
        : prev.workouts.filter((_, i) => i !== idx);
      return { workouts };
    });
  }, [update]);

  const applyMarkers = useCallback<AppContextValue['applyMarkers']>(
    (markers) => {
      if (markers.length === 0) return;
      update((prev) => {
        if (!prev.currentPlan) return {};
        const now = new Date().toISOString();
        const framework = prev.currentPlan.framework;
        let weeks = framework.weeks;

        for (const m of markers) {
          if (m.kind === 'LOAD_ADJUSTMENT') {
            // Last der passenden Übung (nach Name) um delta anpassen.
            const name = typeof m.payload.exerciseName === 'string' ? m.payload.exerciseName : '';
            const delta = typeof m.payload.delta === 'number' ? m.payload.delta : 0;
            if (!name || !delta) continue;
            weeks = weeks.map((w) => ({
              ...w,
              sessions: w.sessions.map((s) => ({
                ...s,
                exercises: s.exercises.map((pe) =>
                  exerciseNameFromNotes(pe.notes) === name &&
                  typeof pe.suggestedLoadKg === 'number'
                    ? { ...pe, suggestedLoadKg: pe.suggestedLoadKg + delta, updatedAt: now }
                    : pe,
                ),
              })),
            }));
          } else if (m.kind === 'DELOAD') {
            // Nächste Woche als Deload markieren + RPE senken.
            const target = framework.currentWeekIndex + 1;
            weeks = weeks.map((w) =>
              w.weekIndex !== target
                ? w
                : {
                    ...w,
                    isDeload: true,
                    updatedAt: now,
                    sessions: w.sessions.map((s) => ({
                      ...s,
                      exercises: s.exercises.map((pe) => ({ ...pe, targetRPE: 6, updatedAt: now })),
                    })),
                  },
            );
          }
          // TODO(Phase 4): SESSION_ADJUSTMENT, EXERCISE_SWAP, EXERCISE_UPGRADE,
          // PHASE_SHIFT, ILLNESS_RECOVERY, VACATION_MODE.
        }

        return {
          currentPlan: {
            ...prev.currentPlan,
            framework: { ...framework, weeks, updatedAt: now },
          },
          // Angewendete Marker zusätzlich protokollieren (auditierbar).
          parsedMarkers: [...prev.parsedMarkers, ...markers],
        };
      });
    },
    [update],
  );

  const activeWorkout = state.workouts.find((w) => w.status === 'in_progress') ?? null;
  const workoutHistory = state.workouts.filter(
    (w) => w.status === 'completed' || w.status === 'skipped',
  );

  const value = useMemo<AppContextValue>(
    () => ({
      state,
      update,
      replaceState,
      resetState,
      currentPlan: state.currentPlan,
      planLoading,
      planError,
      setPlan,
      clearPlan,
      requestPlan,
      updateWeekSessions,
      ensureSchedule,
      activeWorkout,
      workoutHistory,
      startWorkout,
      logSet,
      completeWorkout,
      abortWorkout,
      applyMarkers,
    }),
    [
      state,
      update,
      replaceState,
      resetState,
      planLoading,
      planError,
      setPlan,
      clearPlan,
      requestPlan,
      updateWeekSessions,
      ensureSchedule,
      activeWorkout,
      workoutHistory,
      startWorkout,
      logSet,
      completeWorkout,
      abortWorkout,
      applyMarkers,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp muss innerhalb von <AppProvider> verwendet werden.');
  }
  return ctx;
}
