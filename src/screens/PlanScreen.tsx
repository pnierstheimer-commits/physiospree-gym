/**
 * PlanScreen — Plan-Anzeige mit Roadmap + Wochentags-Planung.
 *
 * Aufbau (von oben nach unten): Framework-Header (Ziel/Split/Woche X von Y) →
 * 12-Wochen-Roadmap (alle Wochen kompakt) → Tagesplanung der ausgewählten Woche
 * (Drag-and-Drop Mo–So) → Detail der angetippten Einheit. Nur eine Woche ist
 * gleichzeitig „offen" (selectedWeek), Default = aktuelle Woche.
 *
 * UI-only (Regel 3): keine Trainingsentscheidungen. Auto-Verteilung der
 * Wochentage und Reorder laufen über State-Actions (scheduleService).
 * Übungsname steckt in `notes` ("Name — cue"), da `exerciseId` Platzhalter ist.
 */

import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../lib/state';
import { requestNextWindow, shouldGenerateNextWindow } from '../lib/services/windowService';
import { needsScheduling } from '../lib/services/scheduleService';
import { WeekRoadmap } from '../components/WeekRoadmap';
import { WeekDayPlanner } from '../components/WeekDayPlanner';
import type {
  BlockPhase,
  CoachAction,
  Goal,
  PlannedExercise,
  PlannedSession,
  Workout,
  WorkoutExercise,
} from '../shared/types';
import './screens.css';

const GOAL_LABEL: Record<Goal, string> = {
  strength: 'Maximalkraft',
  hypertrophy: 'Hypertrophie',
  endurance: 'Kraftausdauer',
  general_fitness: 'Allgemein',
  rehab: 'Reha',
};

const PHASE_LABEL: Record<BlockPhase, string> = {
  accumulation: 'Akkumulation',
  intensification: 'Intensivierung',
  peak: 'Realisierung',
  deload: 'Deload',
};

/** Split steckt in der plan_created-Action-Payload. */
function extractSplit(actions: CoachAction[]): string | null {
  for (const a of actions) {
    const s = a.payload?.split;
    if (typeof s === 'string' && s.trim()) return s.trim();
  }
  return null;
}

/** Trennt Übungsname und Cue aus dem notes-Feld ("Name — cue"). */
function splitExercise(notes: string | undefined): { name: string; cue: string | null } {
  if (!notes) return { name: 'Übung', cue: null };
  const sep = ' — ';
  const idx = notes.indexOf(sep);
  if (idx === -1) return { name: notes, cue: null };
  return { name: notes.slice(0, idx), cue: notes.slice(idx + sep.length) };
}

function formatSpec(ex: PlannedExercise): string {
  const [min, max] = ex.targetReps;
  const reps = min === max ? `${min}` : `${min}–${max}`;
  let head = `${ex.targetSets} × ${reps}`;
  if (typeof ex.suggestedLoadKg === 'number') head += ` @ ${ex.suggestedLoadKg} kg`;
  return [head, `Pause ${ex.restSeconds}s`, `RPE ${ex.targetRPE}`].join(' · ');
}

function isCalibration(name: string): boolean {
  return /kalibr/i.test(name);
}

/** Deutsche kg-Schreibweise (42.5 -> "42,5"). */
function fmtKg(n: number): string {
  return String(n).replace('.', ',');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

/** Durchschnitts-RPE aus den Arbeitssätzen (Auswertung wird nicht persistiert). */
function avgRpe(w: Workout): number | null {
  const rpes = w.exercises.flatMap((e) =>
    e.sets.filter((s) => !s.isWarmup && typeof s.rpe === 'number').map((s) => s.rpe as number),
  );
  if (rpes.length === 0) return null;
  return Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10;
}

/** Kompakte Ist-Werte einer geloggten Übung. */
function loggedSetsLine(we: WorkoutExercise): string {
  const sets = [...we.sets].sort((a, b) => a.setNumber - b.setNumber);
  if (sets.length === 0) return 'keine Sätze';
  const reps = sets.map((s) => s.reps).join('/');
  const rpe = sets[0].rpe;
  return `${fmtKg(sets[0].weightKg)} kg × ${reps}${rpe != null ? ` @ RPE ${rpe}` : ''}`;
}

interface Progression {
  name: string;
  weights: number[];
  count: number;
}

/** Last-Verlauf je Übung über die abgeschlossenen Workouts (nur Veränderungen). */
function computeProgressions(history: Workout[]): Progression[] {
  const completed = history
    .filter((w) => w.status === 'completed')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const byName = new Map<string, number[]>();
  for (const w of completed) {
    for (const we of w.exercises) {
      const name = splitExercise(we.notes).name;
      const working = we.sets.filter((s) => !s.isWarmup).map((s) => s.weightKg);
      if (working.length === 0) continue;
      const top = Math.max(...working);
      const arr = byName.get(name) ?? [];
      arr.push(top);
      byName.set(name, arr);
    }
  }

  const out: Progression[] = [];
  for (const [name, all] of byName) {
    const seq: number[] = [];
    for (const v of all) if (seq.length === 0 || seq[seq.length - 1] !== v) seq.push(v);
    if (seq.length >= 2 && seq[0] !== seq[seq.length - 1]) {
      out.push({ name, weights: seq, count: all.length });
    }
  }
  return out;
}

/** Detailansicht einer angetippten Einheit (Übungen + Training starten). */
function SessionDetail({
  session,
  onStart,
}: {
  session: PlannedSession;
  onStart: (s: PlannedSession) => void;
}) {
  const calib = isCalibration(session.name);
  const exercises = [...session.exercises].sort((a, b) => a.order - b.order);
  return (
    <div className={`ps-day ps-day-detail${calib ? ' is-calibration' : ''}`}>
      <div className="ps-day-head">
        <span className="ps-day-title">{session.name}</span>
        {calib && <span className="ps-pill ps-pill-yellow">Kalibrierung</span>}
      </div>
      <div className="ps-exlist">
        {exercises.map((ex) => {
          const { name, cue } = splitExercise(ex.notes);
          return (
            <div key={ex.id} className="ps-ex">
              <span className="ps-ex-name">{name}</span>
              <span className="ps-ex-spec">{formatSpec(ex)}</span>
              {cue && <span className="ps-ex-cue">{cue}</span>}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="ps-btn ps-btn-primary ps-start-btn"
        onClick={() => onStart(session)}
      >
        Training starten
      </button>
    </div>
  );
}

export function PlanScreen({ onSignOut }: { onSignOut?: () => void } = {}) {
  const {
    currentPlan,
    clearPlan,
    startWorkout,
    setPlan,
    workoutHistory,
    updateWeekSessions,
    ensureSchedule,
  } = useApp();

  const initialWeek = currentPlan?.framework.currentWeekIndex ?? 0;
  const [selectedWeek, setSelectedWeek] = useState(initialWeek);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [openHistory, setOpenHistory] = useState(false);
  const [openWorkoutId, setOpenWorkoutId] = useState<string | null>(null);
  const [windowState, setWindowState] = useState<'idle' | 'generating' | 'error'>('idle');
  const [windowError, setWindowError] = useState<string | null>(null);

  // Auto-Verteilung fehlender Wochentage beim Laden (einmalig, deferred ->
  // kein sync setState im Effect). Guard verhindert No-op-Writes.
  useEffect(() => {
    if (currentPlan && needsScheduling(currentPlan.framework)) {
      const id = setTimeout(ensureSchedule, 0);
      return () => clearTimeout(id);
    }
  }, [currentPlan, ensureSchedule]);

  const runWindow = useCallback(() => {
    if (!currentPlan) return;
    setWindowState('generating');
    setWindowError(null);
    requestNextWindow(currentPlan, workoutHistory)
      .then((updated) => {
        setPlan(updated);
        setWindowState('idle');
      })
      .catch((err) => {
        setWindowError(err instanceof Error ? err.message : 'Unbekannter Fehler.');
        setWindowState('error');
      });
  }, [currentPlan, workoutHistory, setPlan]);

  // Nach dem Laden prüfen, ob das nächste Fenster fällig ist (StrictMode-fest
  // über windowState, runWindow deferred).
  useEffect(() => {
    if (!currentPlan || windowState !== 'idle') return;
    if (!shouldGenerateNextWindow(currentPlan, workoutHistory)) return;
    const id = setTimeout(runWindow, 0);
    return () => clearTimeout(id);
  }, [currentPlan, workoutHistory, windowState, runWindow]);

  if (!currentPlan) {
    return (
      <div className="ps-screen">
        <div className="ps-shell">
          <div className="ps-empty">Kein Plan geladen.</div>
        </div>
      </div>
    );
  }

  const fw = currentPlan.framework;
  const split = extractSplit(currentPlan.actions);
  const weeks = [...fw.weeks].sort((a, b) => a.weekIndex - b.weekIndex);
  const currentWeekObj = weeks.find((w) => w.weekIndex === fw.currentWeekIndex);
  const selectedWeekObj =
    weeks.find((w) => w.weekIndex === selectedWeek) ?? currentWeekObj ?? weeks[0] ?? null;
  const selectedSession =
    selectedWeekObj?.sessions.find((s) => s.id === selectedSessionId) ?? null;

  const progressions = computeProgressions(workoutHistory);
  const recentWorkouts = [...workoutHistory]
    .filter((w) => w.status === 'completed')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);
  const firstWeekNo = (weeks[0]?.weekIndex ?? 0) + 1;

  const onSelectWeek = (weekIndex: number) => {
    setSelectedWeek(weekIndex);
    setSelectedSessionId(null);
  };
  const onSelectSession = (s: PlannedSession) =>
    setSelectedSessionId((prev) => (prev === s.id ? null : s.id));

  const onNewPlan = () => {
    if (window.confirm('Plan verwerfen? Dein aktueller Plan geht verloren.')) {
      clearPlan();
    }
  };

  return (
    <div className="ps-screen">
      <div className="ps-shell">
        {/* A) Framework-Header */}
        <div className="ps-plan-title">{fw.name}</div>
        <div className="ps-pills">
          <span className="ps-pill">{GOAL_LABEL[fw.goal]}</span>
          {split && <span className="ps-pill">{split}</span>}
          <span className="ps-pill ps-pill-muted">{fw.cycleLengthWeeks} Wochen</span>
        </div>
        <div className="ps-plan-sub">
          Woche {fw.currentWeekIndex + 1} von {fw.totalWeeks}
          {currentWeekObj && ` · ${PHASE_LABEL[currentWeekObj.phase]}`}
        </div>

        {windowState === 'generating' && (
          <div className="ps-window-banner">
            <div className="ps-spinner ps-spinner-sm" aria-hidden="true" />
            <span>Woche {firstWeekNo} abgeschlossen. Nächste 2 Wochen werden generiert …</span>
          </div>
        )}
        {windowState === 'error' && (
          <div className="ps-window-banner is-error">
            <div>
              <div>Konnte nächste Wochen nicht laden.</div>
              {windowError && <small className="ps-window-detail">{windowError}</small>}
            </div>
            <button type="button" className="ps-window-retry" onClick={runWindow}>
              Nochmal versuchen
            </button>
          </div>
        )}

        {/* B) Zyklus-Roadmap */}
        <div className="ps-section-label">Zyklus-Übersicht</div>
        <WeekRoadmap
          weeks={weeks}
          currentWeek={fw.currentWeekIndex}
          selectedWeek={selectedWeek}
          onSelectWeek={onSelectWeek}
        />

        {/* C) Tagesplanung der ausgewählten Woche */}
        {selectedWeekObj ? (
          <>
            <div className="ps-section-label">
              Woche {selectedWeekObj.weekIndex + 1} — Tagesplanung
              {selectedWeekObj.isDeload && (
                <span className="ps-pill ps-pill-yellow ps-section-pill">Deload</span>
              )}
            </div>
            {selectedWeekObj.sessions.length === 0 ? (
              <div className="ps-empty">Diese Woche ist noch nicht ausgeplant.</div>
            ) : (
              <>
                <WeekDayPlanner
                  week={selectedWeekObj}
                  onReorder={(sessions) => updateWeekSessions(selectedWeekObj.id, sessions)}
                  selectedSessionId={selectedSessionId}
                  onSelectSession={onSelectSession}
                />
                {selectedSession ? (
                  <SessionDetail session={selectedSession} onStart={startWorkout} />
                ) : (
                  <div className="ps-day-hint">Tippe eine Einheit für Details &amp; Start.</div>
                )}
              </>
            )}
          </>
        ) : (
          <div className="ps-empty">Keine Detailwochen vorhanden.</div>
        )}

        {progressions.length > 0 && (
          <>
            <div className="ps-prog-title">Progression</div>
            <div className="ps-prog-list">
              {progressions.map((p) => {
                const up = p.weights[p.weights.length - 1] > p.weights[0];
                return (
                  <div key={p.name} className={`ps-prog${up ? ' is-up' : ''}`}>
                    <span className="ps-prog-name">{p.name}:</span>{' '}
                    <span className="ps-prog-seq">{p.weights.map(fmtKg).join(' → ')} kg</span>{' '}
                    <span className="ps-prog-count">({p.count} Einheiten)</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Letzte Workouts */}
        {recentWorkouts.length > 0 && (
          <div className={`ps-history${openHistory ? ' is-open' : ''}`}>
            <button
              type="button"
              className="ps-history-head"
              onClick={() => setOpenHistory((o) => !o)}
              aria-expanded={openHistory}
            >
              <span>Letzte Workouts</span>
              <span className="ps-chevron">▾</span>
            </button>
            {openHistory && (
              <div className="ps-history-list">
                {recentWorkouts.map((w) => {
                  const rpe = avgRpe(w);
                  const expanded = openWorkoutId === w.id;
                  return (
                    <div key={w.id} className="ps-hist-card">
                      <button
                        type="button"
                        className="ps-hist-row"
                        onClick={() => setOpenWorkoutId((id) => (id === w.id ? null : w.id))}
                      >
                        <span className="ps-hist-date">{formatDate(w.date)}</span>
                        <span className="ps-hist-name">{w.name}</span>
                        <span className="ps-hist-rpe">{rpe != null ? `Ø RPE ${rpe}` : '—'}</span>
                      </button>
                      {expanded && (
                        <div className="ps-hist-details">
                          {[...w.exercises]
                            .sort((a, b) => a.order - b.order)
                            .map((we) => (
                              <div key={we.id} className="ps-hist-ex">
                                <span className="ps-hist-ex-name">
                                  {splitExercise(we.notes).name}
                                </span>
                                <span className="ps-hist-ex-sets">{loggedSetsLine(we)}</span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Neuer Plan / Abmelden */}
        <div className="ps-actions">
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-quiet" onClick={onNewPlan}>
            Neuen Plan erstellen
          </button>
          {onSignOut && (
            <button type="button" className="ps-btn ps-btn-ghost ps-btn-quiet" onClick={onSignOut}>
              Abmelden
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
