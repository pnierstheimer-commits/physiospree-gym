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
import type { PersistedState } from '../shared/types';

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
}

const AppContext = createContext<AppContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(loadState);

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

  const value = useMemo<AppContextValue>(
    () => ({ state, update, replaceState, resetState }),
    [state, update, replaceState, resetState],
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
