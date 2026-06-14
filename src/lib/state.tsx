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
  AppTab,
  ChatMessage,
  ChatMessageStatus,
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
import { requestChatReply, toParsedMarkers } from './services/chatService';
import { applyMarkerToWeeks } from './services/markerService';

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
    activeTab: 'today',
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

  // --- Coach-Chat (Block 3) ---
  /** Persistenter Chat-Verlauf (append-only). */
  chatMessages: ChatMessage[];
  /** Läuft gerade eine Chat-Anfrage? (transient) */
  chatLoading: boolean;
  /** Letzter Chat-Fehler oder null. (transient) */
  chatError: string | null;
  /**
   * Sendet eine Nutzer-Nachricht: hängt sie an, ruft den Coach, hängt dessen
   * Antwort an (mit ggf. Marker-Vorschlag, Status 'pending_confirm').
   */
  sendChatMessage: (content: string) => Promise<void>;
  /**
   * Bestätigt die Marker einer Coach-Nachricht -> anwenden + status 'confirmed'.
   * `scope` steuert EXERCISE_SWAP (nur diese Woche vs. dauerhaft).
   */
  confirmChatMarker: (messageId: string, scope?: 'this_week' | 'permanent') => void;
  /** Verwirft die Marker einer Coach-Nachricht -> status 'rejected' (nicht angewendet). */
  rejectChatMarker: (messageId: string) => void;

  // --- Bottom-Nav ---
  /** Aktiver Tab. */
  activeTab: AppTab;
  /** Wechselt den Tab (persistiert über den State). */
  setActiveTab: (tab: AppTab) => void;
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
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

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
        // Profil app-weit verfügbar machen (Greeting, ProfileScreen) + Sync.
        update(() => ({ profile }));
      } catch (err) {
        setPlanError(
          err instanceof Error ? err.message : 'Unbekannter Fehler bei der Planerstellung.',
        );
      } finally {
        setPlanLoading(false);
      }
    },
    [storePlan, update],
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
      const active = prev.workouts[idx];
      // Gesamtdauer in Minuten aus startedAt -> jetzt (Fallback: date).
      const startMs = Date.parse(active.startedAt ?? active.date);
      const totalDuration = Number.isNaN(startMs)
        ? active.totalDuration
        : Math.max(0, Math.round((Date.parse(now) - startMs) / 60000));
      const done: Workout = {
        ...active,
        status: 'completed',
        completedAt: now,
        totalDuration,
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
        // Plan-Transformationen liegen im markerService (Regel 3/4). Jeder
        // Marker faltet die Wochen weiter.
        let weeks = framework.weeks;
        for (const m of markers) {
          weeks = applyMarkerToWeeks(weeks, framework, m, now);
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

  // --- Coach-Chat-Actions (Regel 1: funktionale Updater; append-only) ---

  const addChatMessage = useCallback(
    (msg: ChatMessage) => {
      update((prev) => ({ chatMessages: [...prev.chatMessages, msg] }));
    },
    [update],
  );

  const updateChatMessageStatus = useCallback(
    (id: string, status: ChatMessageStatus) => {
      const now = new Date().toISOString();
      update((prev) => ({
        chatMessages: prev.chatMessages.map((m) =>
          m.id === id ? { ...m, status, updatedAt: now } : m,
        ),
      }));
    },
    [update],
  );

  const sendChatMessage = useCallback<AppContextValue['sendChatMessage']>(
    async (content) => {
      const text = content.trim();
      if (!text || chatLoading) return;
      if (!state.currentPlan) {
        setChatError('Kein Plan geladen — der Coach-Chat braucht einen aktiven Plan.');
        return;
      }
      const now = new Date().toISOString();
      const userMsg: ChatMessage = {
        id: uuidv4(),
        role: 'user',
        content: text,
        createdAt: now,
        updatedAt: now,
        status: 'sent',
      };
      addChatMessage(userMsg);
      setChatLoading(true);
      setChatError(null);
      try {
        const framework = state.currentPlan.framework;
        const currentWeek =
          framework.weeks.find((w) => w.weekIndex === framework.currentWeekIndex) ?? null;
        const recentWorkouts = state.workouts
          .filter((w) => w.status === 'completed')
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 5);

        const reply = await requestChatReply({
          messages: [...state.chatMessages, userMsg].slice(-10),
          currentPlan: framework,
          currentWeek,
          recentWorkouts,
          userProfile: state.profile,
        });

        const coachNow = new Date().toISOString();
        const coachId = uuidv4();
        const markers = toParsedMarkers(reply.proposedMarkers ?? [], coachId);
        const coachMsg: ChatMessage =
          markers.length > 0
            ? {
                id: coachId,
                role: 'coach',
                content: reply.content,
                createdAt: coachNow,
                updatedAt: coachNow,
                proposedMarkers: markers,
                status: 'pending_confirm',
              }
            : {
                id: coachId,
                role: 'coach',
                content: reply.content,
                createdAt: coachNow,
                updatedAt: coachNow,
                status: 'sent',
              };
        addChatMessage(coachMsg);
      } catch (err) {
        setChatError(err instanceof Error ? err.message : 'Unbekannter Fehler im Coach-Chat.');
      } finally {
        setChatLoading(false);
      }
    },
    [state.currentPlan, state.workouts, state.chatMessages, state.profile, chatLoading, addChatMessage],
  );

  const confirmChatMarker = useCallback<AppContextValue['confirmChatMarker']>(
    (messageId, scope) => {
      const msg = state.chatMessages.find((m) => m.id === messageId);
      if (!msg?.proposedMarkers || msg.proposedMarkers.length === 0) return;
      // Scope-Wahl (nur diese Woche / dauerhaft) als payload.scope an
      // EXERCISE_SWAP-Marker durchreichen.
      const markers = scope
        ? msg.proposedMarkers.map((m) =>
            m.kind === 'EXERCISE_SWAP' ? { ...m, payload: { ...m.payload, scope } } : m,
          )
        : msg.proposedMarkers;
      applyMarkers(markers); // wendet unterstützte Marker an + protokolliert
      updateChatMessageStatus(messageId, 'confirmed');
    },
    [state.chatMessages, applyMarkers, updateChatMessageStatus],
  );

  const rejectChatMarker = useCallback<AppContextValue['rejectChatMarker']>(
    (messageId) => {
      updateChatMessageStatus(messageId, 'rejected'); // Marker NICHT angewendet
    },
    [updateChatMessageStatus],
  );

  const setActiveTab = useCallback<AppContextValue['setActiveTab']>(
    (tab) => {
      update(() => ({ activeTab: tab }));
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
      chatMessages: state.chatMessages,
      chatLoading,
      chatError,
      sendChatMessage,
      confirmChatMarker,
      rejectChatMarker,
      activeTab: state.activeTab,
      setActiveTab,
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
      chatLoading,
      chatError,
      sendChatMessage,
      confirmChatMarker,
      rejectChatMarker,
      setActiveTab,
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
