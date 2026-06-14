/**
 * PlanScreen — echte Plan-Anzeige.
 *
 * Zwei Ebenen: (A) Framework-Übersicht mit abgeleiteter Block-Liste,
 * (B) Detail-Wochen als Akkordeon (eine Woche offen). UI-only (Regel 3):
 * keine Trainingsentscheidungen, nur Darstellung der bereits geplanten Daten.
 *
 * Datenlage: `PlanFramework` persistiert keine Block-Metadaten (das Coach-JSON
 * `blocks` wird im Generator verworfen). Die Block-Übersicht wird daher aus den
 * Wochen-Phasen abgeleitet (`PlanWeek.phase`/`intensityFactor`/`isDeload`).
 * Der Übungsname steckt in `notes` ("Name — cue"), da `exerciseId` ein
 * Platzhalter ist. "Level" ist nirgends persistiert und wird weggelassen.
 */

import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../lib/state';
import { requestNextWindow, shouldGenerateNextWindow } from '../lib/services/windowService';
import type {
  BlockPhase,
  CoachAction,
  Goal,
  PlannedExercise,
  PlanWeek,
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

const PHASE_FOCUS: Record<BlockPhase, string> = {
  accumulation: 'Volumen aufbauen',
  intensification: 'Intensität steigern',
  peak: 'Leistung realisieren',
  deload: 'Erholung',
};

/** Volumen-Label, abgeleitet aus der (bereits vom Coach gesetzten) Phase. */
const PHASE_VOLUME: Record<BlockPhase, string> = {
  accumulation: 'hoch',
  intensification: 'mittel',
  peak: 'niedrig',
  deload: 'reduziert',
};

interface DerivedBlock {
  phase: BlockPhase;
  startWeek: number;
  endWeek: number;
  intensityFactor: number;
  isDeload: boolean;
  containsCurrent: boolean;
}

/** Gruppiert die Detail-Wochen zu Blöcken (gleiche Phase = ein Block). */
function deriveBlocks(weeks: PlanWeek[], currentWeekIndex: number): DerivedBlock[] {
  const sorted = [...weeks].sort((a, b) => a.weekIndex - b.weekIndex);
  const blocks: DerivedBlock[] = [];
  for (const w of sorted) {
    const last = blocks[blocks.length - 1];
    if (last && last.phase === w.phase && last.isDeload === w.isDeload) {
      last.endWeek = w.weekIndex;
    } else {
      blocks.push({
        phase: w.phase,
        startWeek: w.weekIndex,
        endWeek: w.weekIndex,
        intensityFactor: w.intensityFactor,
        isDeload: w.isDeload,
        containsCurrent: false,
      });
    }
  }
  for (const b of blocks) {
    b.containsCurrent = currentWeekIndex >= b.startWeek && currentWeekIndex <= b.endWeek;
  }
  return blocks;
}

function weekRange(b: DerivedBlock): string {
  const start = b.startWeek + 1;
  const end = b.endWeek + 1;
  return start === end ? `Woche ${start}` : `Woche ${start}–${end}`;
}

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

export function PlanScreen() {
  const { currentPlan, clearPlan, startWorkout, setPlan, workoutHistory } = useApp();
  // Default: erste Woche offen; -1 = alle zu (Akkordeon).
  const [openWeek, setOpenWeek] = useState(0);
  const [openHistory, setOpenHistory] = useState(false);
  const [openWorkoutId, setOpenWorkoutId] = useState<string | null>(null);
  const [windowState, setWindowState] = useState<'idle' | 'generating' | 'error'>('idle');
  const [windowError, setWindowError] = useState<string | null>(null);

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

  // Nach dem Laden prüfen, ob das nächste Fenster fällig ist. Guard über
  // windowState (StrictMode-fest), runWindow deferred (kein sync setState).
  // Nach Erfolg hat der Plan das nächste Fenster -> shouldGenerate wird false.
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
  const blocks = deriveBlocks(fw.weeks, fw.currentWeekIndex);
  const weeks = [...fw.weeks].sort((a, b) => a.weekIndex - b.weekIndex);

  const progressions = computeProgressions(workoutHistory);
  const recentWorkouts = [...workoutHistory]
    .filter((w) => w.status === 'completed')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);
  const firstWeekNo = (weeks[0]?.weekIndex ?? 0) + 1;

  const toggleWeek = (i: number) => setOpenWeek((prev) => (prev === i ? -1 : i));

  const onNewPlan = () => {
    if (window.confirm('Plan verwerfen? Dein aktueller Plan geht verloren.')) {
      clearPlan();
    }
  };

  return (
    <div className="ps-screen">
      <div className="ps-shell">
        {/* A) Framework-Übersicht */}
        <div className="ps-plan-title">{fw.name}</div>
        <div className="ps-pills">
          <span className="ps-pill">{GOAL_LABEL[fw.goal]}</span>
          {split && <span className="ps-pill">{split}</span>}
          <span className="ps-pill ps-pill-muted">{fw.cycleLengthWeeks} Wochen</span>
        </div>

        {windowState === 'generating' && (
          <div className="ps-window-banner">
            <div className="ps-spinner ps-spinner-sm" aria-hidden="true" />
            <span>
              Woche {firstWeekNo} abgeschlossen. Nächste 2 Wochen werden generiert …
            </span>
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

        <div className="ps-section-label">Blöcke</div>
        <div className="ps-blocks">
          {blocks.map((b, i) => (
            <div
              key={i}
              className={
                'ps-block' +
                (b.containsCurrent ? ' is-current' : '') +
                (b.isDeload ? ' is-deload' : '')
              }
            >
              <div className="ps-block-head">
                <span className="ps-block-name">{PHASE_LABEL[b.phase]}</span>
                <span className="ps-block-range">{weekRange(b)}</span>
              </div>
              <div className="ps-block-focus">{PHASE_FOCUS[b.phase]}</div>
              <div className="ps-block-meta">
                <span className="ps-meta">
                  Volumen <strong>{b.isDeload ? 'reduziert' : PHASE_VOLUME[b.phase]}</strong>
                </span>
                <span className="ps-meta">
                  Intensität <strong>×{b.intensityFactor.toFixed(2)}</strong>
                </span>
                {b.isDeload && <span className="ps-pill ps-pill-yellow">Deload</span>}
                {b.containsCurrent && <span className="ps-pill ps-pill-muted">Aktuell</span>}
              </div>
            </div>
          ))}
        </div>

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

        {/* B) Detail-Wochen */}
        <div className="ps-section-label">Wochen im Detail</div>
        {weeks.length === 0 ? (
          <div className="ps-empty">Keine Detailwochen vorhanden.</div>
        ) : (
          <div className="ps-weeks">
            {weeks.map((week, i) => {
              const open = openWeek === i;
              const sessions = [...week.sessions].sort((a, b) => a.dayIndex - b.dayIndex);
              return (
                <div key={week.id} className={`ps-week${open ? ' is-open' : ''}`}>
                  <button
                    type="button"
                    className="ps-week-head"
                    onClick={() => toggleWeek(i)}
                    aria-expanded={open}
                  >
                    <span className="ps-week-title">Woche {week.weekIndex + 1}</span>
                    <span className="ps-week-meta">
                      {week.isDeload && <span className="ps-pill ps-pill-yellow">Deload</span>}
                      <span>{sessions.length} Einheiten</span>
                      <span className="ps-chevron">▾</span>
                    </span>
                  </button>
                  <div className="ps-week-body">
                    <div className="ps-week-inner">
                      {sessions.map((session) => {
                        const calib = isCalibration(session.name);
                        const exercises = [...session.exercises].sort((a, b) => a.order - b.order);
                        return (
                          <div
                            key={session.id}
                            className={`ps-day${calib ? ' is-calibration' : ''}`}
                          >
                            <div className="ps-day-head">
                              <span className="ps-day-title">
                                Tag {session.dayIndex + 1} — {session.name}
                              </span>
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
                              onClick={() => startWorkout(session)}
                            >
                              Training starten
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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

        {/* Neuer Plan */}
        <div className="ps-actions">
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-quiet" onClick={onNewPlan}>
            Neuen Plan erstellen
          </button>
        </div>
      </div>
    </div>
  );
}
