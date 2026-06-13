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
import { SCHEMA_VERSION, STORAGE_KEY } from '../shared/constants';
import type { PersistedState, PlanResponse, UserProfile } from '../shared/types';
import { generatePlan, parseMarkers } from './services/planService';

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
    }),
    [state, update, replaceState, resetState, planLoading, planError, setPlan, clearPlan, requestPlan],
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
