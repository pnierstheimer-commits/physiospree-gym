/**
 * WorkoutScreen — Workout-Player.
 *
 * Eine Gruppe im Fokus: klassische Einzelübung (alle Sätze nacheinander),
 * Supersatz (A1/A2 im Wechsel, Pause nach dem Paar) oder Zirkel (Z1→Z2→Z3 je
 * ein Satz, kurze Wechselpause, Rundenpause). Erkennung über den Prefix im
 * Übungsnamen (exerciseGroupService). UI-only (Regel 3); Satz-Daten bleiben
 * pro Übung gespeichert (Regel 6) — die Gruppierung ist nur Anzeige + Flow.
 *
 * Daten: `activeWorkout` (state) hält die geloggten Sätze, die geplante Einheit
 * (Ziele) wird über `plannedSessionId` aus `currentPlan` aufgelöst. Übungsname
 * steckt in `notes` ("[Prefix] Name — cue").
 */

import { useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useApp } from '../lib/state';
import {
  convertCoachMarkers,
  evaluateWorkout,
  type CoachEvaluation,
  type CoachEvaluationItem,
  type Verdict,
} from '../lib/services/coachService';
import {
  groupExercises,
  parsePrefix,
  type ExerciseGroup,
} from '../lib/services/exerciseGroupService';
import { isCalibrationSession } from '../lib/services/planMeta';
import { ExerciseInfo } from '../components/ExerciseInfo';
import type { Workout, WorkoutExercise, WorkoutSet } from '../shared/types';
import './screens.css';

const RPE_OPTIONS = [6, 7, 8, 9, 10];
/** Feste Zirkel-Pausen (Sekunden). */
const CIRCUIT_SWITCH_REST = 15;
const CIRCUIT_ROUND_REST = 60;

const VERDICT_META: Record<Verdict, { label: string; tone: 'green' | 'red' | 'yellow' }> = {
  in_range: { label: 'Im Ziel', tone: 'green' },
  above_range: { label: 'Reps am Limit', tone: 'green' },
  below_range: { label: 'Zu schwer', tone: 'red' },
  rpe_low: { label: 'Mehr Intensität', tone: 'yellow' },
  stagnation: { label: 'Stagnation', tone: 'yellow' },
};

interface SetInput {
  weight: string;
  reps: string;
  rpe: number | null;
}

interface ExView {
  index: number;
  name: string;
  cue: string | null;
  /** Prefix-Buchstabe ('A','Z') oder null bei klassisch. */
  label: string | null;
  we: WorkoutExercise;
  targetSets: number;
  repMin: number;
  repMax: number;
  targetRPE: number;
  restSeconds: number;
  suggestedLoadKg: number | null;
}

/** 'pos' = Zirkel-Wechsel (nächste Übung), 'round' = nächste Runde, null = klassische Pause. */
type Advance = 'pos' | 'round' | null;
interface Timer {
  secondsLeft: number;
  key: string;
  advance: Advance;
}

/** Trennt Übungsname und Cue aus dem notes-Feld ("Name — cue"). */
function splitExercise(notes: string | undefined): { name: string; cue: string | null } {
  if (!notes) return { name: 'Übung', cue: null };
  const idx = notes.indexOf(' — ');
  if (idx === -1) return { name: notes, cue: null };
  return { name: notes.slice(0, idx), cue: notes.slice(idx + 3) };
}

function setComplete(v: SetInput): boolean {
  return /^\d+$/.test(v.reps.trim()) && Number(v.reps) > 0 && v.rpe != null;
}

function formatTime(s: number): string {
  if (s < 60) return String(s);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

/** Gesamtzeit-Uhr im Format mm:ss. */
function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Kompakte Ist-Werte einer Übung: "40 kg × 15/15/14 @ RPE 9". */
function formatSetsSummary(sets: WorkoutSet[]): string {
  if (sets.length === 0) return 'Keine Sätze erfasst';
  const sorted = [...sets].sort((a, b) => a.setNumber - b.setNumber);
  const load = sorted[0].weightKg;
  const reps = sorted.map((s) => s.reps).join('/');
  const rpe = sorted[0].rpe;
  return `${load} kg × ${reps}${rpe != null ? ` @ RPE ${rpe}` : ''}`;
}

/** Ziel-Zeile einer Übung: "3 × 8–12 @ 40 kg · RPE 8". */
function targetText(ev: ExView): string {
  const reps = ev.repMin === ev.repMax ? `${ev.repMin}` : `${ev.repMin}–${ev.repMax}`;
  if (!ev.repMin && !ev.repMax) return `${ev.targetSets} Sätze`;
  return (
    `${ev.targetSets} × ${reps}` +
    (ev.suggestedLoadKg != null ? ` @ ${ev.suggestedLoadKg} kg` : '') +
    ` · RPE ${ev.targetRPE}`
  );
}

/** Adjustment-Zeile mit Pfeil + Delta. */
function adjustmentLine(item: CoachEvaluationItem): string {
  if (item.adjustment === 'maintain' || item.newLoad == null) return '→ Gewicht bleibt';
  const delta = item.newLoad - item.currentLoad;
  const sign = delta >= 0 ? '+' : '−';
  const mag = Math.abs(Math.round(delta * 100) / 100);
  return item.adjustment === 'increase'
    ? `↑ Nächste Woche: ${item.newLoad} kg (${sign}${mag})`
    : `↓ Runter auf ${item.newLoad} kg (${sign}${mag})`;
}

export function WorkoutScreen() {
  const { activeWorkout, currentPlan, logSet, completeWorkout, abortWorkout, applyMarkers } =
    useApp();

  // Gruppen-basierte Navigation: groupIndex + (für Supersatz/Zirkel) round + pos.
  const [groupIndex, setGroupIndex] = useState(0);
  const [round, setRound] = useState(1);
  const [pos, setPos] = useState(0);
  const [phase, setPhase] = useState<'train' | 'summary' | 'evaluating' | 'evaluation'>('train');
  const [inputs, setInputs] = useState<Record<string, SetInput>>({});
  const [timer, setTimer] = useState<Timer | null>(null);
  const [evaluation, setEvaluation] = useState<CoachEvaluation | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);
  // Gesamtzeit-Uhr: tickt jede Sekunde, abgeleitet aus startedAt.
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Warnung bei Reload/Schließen während eines aktiven Workouts.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Pause-/Wechsel-Timer. Bei 0: Supersatz/Zirkel rückt automatisch weiter
  // (advance), klassische Pause bleibt auf "Pause vorbei" stehen.
  useEffect(() => {
    if (!timer || timer.secondsLeft <= 0) return;
    const id = setTimeout(() => {
      if (timer.secondsLeft <= 1) {
        if (timer.advance === 'pos') {
          setPos((p) => p + 1);
          setTimer(null);
        } else if (timer.advance === 'round') {
          setRound((r) => r + 1);
          setPos(0);
          setTimer(null);
        } else {
          setTimer((t) => (t ? { ...t, secondsLeft: 0 } : t)); // klassisch: stehen bleiben
        }
      } else {
        setTimer((t) => (t ? { ...t, secondsLeft: t.secondsLeft - 1 } : t));
      }
    }, 1000);
    return () => clearTimeout(id);
  }, [timer]);

  const planned = useMemo(() => {
    if (!activeWorkout || !currentPlan) return null;
    for (const w of currentPlan.framework.weeks) {
      const s = w.sessions.find((x) => x.id === activeWorkout.plannedSessionId);
      if (s) return s;
    }
    return null;
  }, [activeWorkout, currentPlan]);

  if (!activeWorkout) return null;

  const plannedExs = planned ? [...planned.exercises].sort((a, b) => a.order - b.order) : [];
  const exViews: ExView[] = activeWorkout.exercises.map((we, i) => {
    const pe = plannedExs[i];
    const split = splitExercise(we.notes);
    const { letter, name } = parsePrefix(split.name);
    return {
      index: i,
      name,
      cue: split.cue,
      label: letter,
      we,
      targetSets: pe?.targetSets ?? Math.max(we.sets.length, 1),
      repMin: pe ? pe.targetReps[0] : 0,
      repMax: pe ? pe.targetReps[1] : 0,
      targetRPE: pe?.targetRPE ?? 0,
      restSeconds: pe?.restSeconds ?? 90,
      suggestedLoadKg: pe?.suggestedLoadKg ?? null,
    };
  });

  // Fallback (kein Prefix) -> lauter 'single'-Gruppen = klassischer Flow.
  const groups = groupExercises(exViews.map((e) => e.label));
  const groupIdx = Math.min(groupIndex, groups.length - 1);
  const group = groups[groupIdx];
  // Kalibrierung robust über das type-Feld (Fallback: Name/erste Einheit).
  const isCalibration =
    planned && currentPlan
      ? isCalibrationSession(currentPlan.framework, planned)
      : /kalibr/i.test(activeWorkout.name);

  const roundsOf = (g: ExerciseGroup): number => Math.max(1, exViews[g.indices[0]].targetSets);
  const pairRestOf = (g: ExerciseGroup): number => exViews[g.indices[0]].restSeconds;

  // Aktueller Eingabewert eines Satzes (controlled): Draft oder abgeleitet.
  const valueOf = (ev: ExView, sn: number): SetInput => {
    const key = `${ev.index}:${sn}`;
    const draft = inputs[key];
    if (draft) return draft;
    const logged = ev.we.sets.find((s) => s.setNumber === sn);
    return {
      weight: logged
        ? String(logged.weightKg)
        : ev.suggestedLoadKg != null
          ? String(ev.suggestedLoadKg)
          : '',
      reps: logged ? String(logged.reps) : '',
      rpe: logged?.rpe ?? null,
    };
  };

  /** Schreibt einen Satz (Inputs + ggf. logSet). Gibt zurück, ob er JETZT fertig wurde. */
  const applySet = (ev: ExView, sn: number, patch: Partial<SetInput>): boolean => {
    const cur = valueOf(ev, sn);
    const next = { ...cur, ...patch };
    setInputs((prev) => ({ ...prev, [`${ev.index}:${sn}`]: next }));
    const becameComplete = !setComplete(cur) && setComplete(next);
    if (setComplete(next)) {
      const existing = ev.we.sets.find((s) => s.setNumber === sn);
      const wset: WorkoutSet = {
        id: existing?.id ?? uuidv4(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        workoutExerciseId: ev.we.id,
        setNumber: sn,
        reps: Number(next.reps),
        weightKg: next.weight.trim() === '' ? 0 : Number(next.weight),
        rpe: next.rpe ?? undefined,
        completed: true,
        isWarmup: false,
      };
      logSet(ev.index, wset);
    }
    return becameComplete;
  };

  // Klassischer Satz: nach Abschluss Pause-Timer (wie bisher).
  const onSingleSet = (ev: ExView, sn: number, patch: Partial<SetInput>) => {
    if (applySet(ev, sn, patch)) {
      setTimer({ secondsLeft: ev.restSeconds, key: `s:${ev.index}:${sn}`, advance: null });
    }
  };

  // Supersatz/Zirkel: nach Abschluss des aktiven Satzes (Runde = round) weiter.
  const onRoundSet = (ev: ExView, p: number, patch: Partial<SetInput>) => {
    if (!applySet(ev, round, patch)) return;
    const isLast = p === group.indices.length - 1;
    const rounds = roundsOf(group);
    const key = `${group.label}:${round}:${p}`;
    if (group.type === 'superset') {
      if (!isLast) setPos(p + 1); // A1 -> A2 ohne Pause
      else if (round < rounds) setTimer({ secondsLeft: pairRestOf(group), key, advance: 'round' });
      // sonst: Gruppe fertig (Nav-Button)
    } else {
      // circuit
      if (!isLast) setTimer({ secondsLeft: CIRCUIT_SWITCH_REST, key, advance: 'pos' });
      else if (round < rounds) setTimer({ secondsLeft: CIRCUIT_ROUND_REST, key, advance: 'round' });
    }
  };

  const skipTimer = () => {
    if (timer?.advance === 'pos') setPos((p) => p + 1);
    else if (timer?.advance === 'round') {
      setRound((r) => r + 1);
      setPos(0);
    }
    setTimer(null);
  };

  /** Ganze Gruppe fertig = alle Übungen über alle Runden komplett. */
  const groupComplete = (g: ExerciseGroup): boolean => {
    const rounds = roundsOf(g);
    return g.indices.every((idx) => {
      const ev = exViews[idx];
      for (let r = 1; r <= rounds; r++) if (!setComplete(valueOf(ev, r))) return false;
      return true;
    });
  };

  const resetGroupState = () => {
    setRound(1);
    setPos(0);
    setTimer(null);
  };
  const goPrev = () => {
    resetGroupState();
    setGroupIndex((g) => Math.max(0, g - 1));
  };
  const goNext = () => {
    resetGroupState();
    if (groupIdx < groups.length - 1) setGroupIndex(groupIdx + 1);
    else setPhase('summary');
  };

  const onAbort = () => {
    if (window.confirm('Workout abbrechen? Dein bisheriger Fortschritt wird als abgebrochen gespeichert.')) {
      abortWorkout();
    }
  };

  // Speichern -> Coach-Auswertung anfordern.
  const onSave = async () => {
    if (!currentPlan) {
      completeWorkout();
      return;
    }
    const snapshot: Workout = {
      ...activeWorkout,
      status: 'completed',
      completedAt: new Date().toISOString(),
    };
    setEvalError(null);
    setPhase('evaluating');
    try {
      const result = await evaluateWorkout(snapshot, currentPlan);
      setEvaluation(result);
      setPhase('evaluation');
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : 'Auswertung fehlgeschlagen.');
    }
  };

  const onAcknowledge = () => {
    if (evaluation) applyMarkers(convertCoachMarkers(evaluation.markers));
    completeWorkout();
  };

  // -------------------------------------------------------------------------
  // Coach wertet aus (Loading / Fehler)
  // -------------------------------------------------------------------------
  if (phase === 'evaluating') {
    return (
      <div className="ps-screen">
        <div className="ps-shell">
          {evalError ? (
            <>
              <div className="ps-plan-title">Auswertung fehlgeschlagen</div>
              <p className="ps-subtitle">Dein Workout ist erfasst — nur der Coach hat gepatzt.</p>
              <div className="ps-error-card">
                <div className="ps-error-title">Fehler</div>
                {evalError}
              </div>
              <div className="ps-actions">
                <button type="button" className="ps-btn ps-btn-primary" onClick={onSave}>
                  Nochmal versuchen
                </button>
                <button type="button" className="ps-btn ps-btn-ghost" onClick={completeWorkout}>
                  Ohne Auswertung speichern
                </button>
              </div>
            </>
          ) : (
            <div className="ps-center">
              <div className="ps-spinner" aria-hidden="true" />
              <div className="ps-loading-text">Coach wertet aus …</div>
              <p className="ps-loading-sub">
                Deine Sätze werden gegen den Plan geprüft. Das dauert ein paar Sekunden.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Auswertung
  // -------------------------------------------------------------------------
  if (phase === 'evaluation' && evaluation) {
    return (
      <div className="ps-screen">
        <div className="ps-shell">
          <div className="ps-progress-label">Auswertung · RPE {evaluation.overallRPE}/10</div>
          <p className="ps-coach-msg">{evaluation.coachMessage}</p>

          <div className="ps-evals">
            {evaluation.evaluation.map((item, i) => {
              const meta = VERDICT_META[item.verdict];
              const ev = exViews.find((e) => e.name === item.exerciseName);
              return (
                <div key={i} className="ps-eval-card">
                  <div className="ps-eval-head">
                    <span className="ps-eval-name">{item.exerciseName}</span>
                    <span className={`ps-pill ps-pill-${meta.tone}`}>{meta.label}</span>
                  </div>
                  {ev && <div className="ps-eval-sets">{formatSetsSummary(ev.we.sets)}</div>}
                  <div className="ps-eval-adjust">{adjustmentLine(item)}</div>
                  <p className="ps-eval-rationale">{item.rationale}</p>
                </div>
              );
            })}
          </div>

          <div className="ps-actions">
            <button type="button" className="ps-btn ps-btn-primary" onClick={onAcknowledge}>
              Verstanden
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Zusammenfassung
  // -------------------------------------------------------------------------
  if (phase === 'summary') {
    return (
      <div className="ps-screen">
        <div className="ps-shell">
          <div className="ps-topbar">
            <span className="ps-progress-label">Zusammenfassung</span>
            <button type="button" className="ps-abort" onClick={onAbort}>
              Abbrechen
            </button>
          </div>
          <div className="ps-plan-title">{activeWorkout.name}</div>
          <p className="ps-subtitle">Ist-Werte deiner Sätze. Prüfen und speichern.</p>

          <div className="ps-weeks">
            {exViews.map((ev) => {
              const sets = [...ev.we.sets].sort((a, b) => a.setNumber - b.setNumber);
              return (
                <div key={ev.we.id} className="ps-sum-ex">
                  <div className="ps-day-title">{ev.name}</div>
                  {sets.length === 0 ? (
                    <div className="ps-ex-cue">Keine Sätze erfasst.</div>
                  ) : (
                    <div className="ps-sum-sets">
                      {sets.map((s) => (
                        <div key={s.id} className="ps-sum-set">
                          <span>Satz {s.setNumber}</span>
                          <span className="ps-ex-spec">
                            {s.weightKg} kg × {s.reps}
                            {s.rpe != null ? ` @ RPE ${s.rpe}` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="ps-actions">
            <button type="button" className="ps-btn ps-btn-primary" onClick={onSave}>
              Workout speichern
            </button>
            <button type="button" className="ps-btn ps-btn-ghost" onClick={() => setPhase('train')}>
              Zurück zum Training
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Training (eine Gruppe im Fokus)
  // -------------------------------------------------------------------------
  const isLastGroup = groupIdx >= groups.length - 1;
  const canAdvance = groupComplete(group);
  const startMs = Date.parse(activeWorkout.startedAt ?? activeWorkout.date);
  const elapsedSeconds = Number.isNaN(startMs) ? 0 : Math.max(0, Math.floor((nowTs - startMs) / 1000));

  const rounds = roundsOf(group);
  let groupHead = '';
  if (group.type === 'superset') {
    groupHead = `Supersatz ${group.label}${rounds > 1 ? ` — Runde ${round} von ${rounds}` : ''}`;
  } else if (group.type === 'circuit') {
    groupHead = `Zirkel${rounds > 1 ? ` — Runde ${round} von ${rounds}` : ''} — Übung ${group.label}${pos + 1}`;
  }

  const renderRpe = (
    ev: ExView,
    sn: number,
    disabled: boolean,
    onPick: (rpe: number) => void,
  ) => {
    const v = valueOf(ev, sn);
    return (
      <div className="ps-rpe-wrap">
        <span className="ps-field-label">RPE</span>
        <div className="ps-rpe">
          {RPE_OPTIONS.map((r) => (
            <button
              key={r}
              type="button"
              className={`ps-rpe-btn${v.rpe === r ? ' is-active' : ''}`}
              disabled={disabled}
              onClick={() => onPick(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="ps-screen">
      <div className="ps-shell">
        <div className="ps-topbar">
          <span className="ps-progress-label">
            Abschnitt {groupIdx + 1} von {groups.length}
          </span>
          <button type="button" className="ps-abort" onClick={onAbort}>
            Abbrechen
          </button>
        </div>

        <div className="ps-wo-clock">
          <span className="ps-wo-session">{activeWorkout.name}</span>
          <span className="ps-wo-time" aria-label="Gesamtzeit">
            {formatClock(elapsedSeconds)}
          </span>
        </div>

        {isCalibration && (
          <div className="ps-hint">
            <span className="ps-pill ps-pill-yellow">Kalibrierung</span>
            <p>Gewicht steigern bis RPE 6–7. Dein Startgewicht finden.</p>
          </div>
        )}

        {group.type === 'single' ? (
          // -------- Klassischer Satz (unverändert) --------
          (() => {
            const ev = exViews[group.indices[0]];
            return (
              <>
                <ExerciseInfo name={ev.name} nameClass="ps-ex-focus-name" />
                <div className="ps-target">{targetText(ev)}</div>
                {ev.cue && <p className="ps-ex-cue ps-target-cue">{ev.cue}</p>}

                <div className="ps-sets">
                  {Array.from({ length: ev.targetSets }, (_, k) => {
                    const sn = k + 1;
                    const v = valueOf(ev, sn);
                    const done = setComplete(v);
                    return (
                      <div key={sn} className={`ps-set${done ? ' is-done' : ''}`}>
                        <div className="ps-set-head">
                          <span>Satz {sn}</span>
                          {done && <span className="ps-set-check">✓</span>}
                        </div>
                        <div className="ps-set-inputs">
                          <label className="ps-field">
                            <span className="ps-field-label">Gewicht (kg)</span>
                            <input
                              className="ps-input"
                              type="number"
                              inputMode="decimal"
                              value={v.weight}
                              onFocus={() => setTimer(null)}
                              onChange={(e) => onSingleSet(ev, sn, { weight: e.target.value })}
                            />
                          </label>
                          <label className="ps-field">
                            <span className="ps-field-label">Reps</span>
                            <input
                              className="ps-input"
                              type="number"
                              inputMode="numeric"
                              value={v.reps}
                              onFocus={() => setTimer(null)}
                              onChange={(e) => onSingleSet(ev, sn, { reps: e.target.value })}
                            />
                          </label>
                        </div>
                        {renderRpe(ev, sn, false, (r) => onSingleSet(ev, sn, { rpe: r }))}
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()
        ) : (
          // -------- Supersatz / Zirkel (rundenbasiert) --------
          <div className={`ps-group ps-group-${group.type}`}>
            <div className="ps-group-head">{groupHead}</div>
            {group.indices.map((idx, p) => {
              const gev = exViews[idx];
              const v = valueOf(gev, round);
              const done = setComplete(v);
              const isActive = p === pos && !done && !timer?.advance;
              const isWaiting = !isActive && !done;
              return (
                <div
                  key={gev.we.id}
                  className={`ps-group-ex${isActive ? ' is-active' : ''}${isWaiting ? ' is-waiting' : ''}${done ? ' is-done' : ''}`}
                >
                  <ExerciseInfo
                    name={gev.name}
                    nameClass="ps-group-ex-name"
                    badge={
                      <span className="ps-group-ex-badge">
                        {group.label}
                        {p + 1}
                      </span>
                    }
                    trailing={done ? <span className="ps-set-check">✓</span> : null}
                  />
                  <div className="ps-group-ex-target">{targetText(gev)}</div>
                  <div className="ps-set-inputs">
                    <label className="ps-field">
                      <span className="ps-field-label">Gewicht (kg)</span>
                      <input
                        className="ps-input"
                        type="number"
                        inputMode="decimal"
                        value={v.weight}
                        disabled={!isActive}
                        onChange={(e) => onRoundSet(gev, p, { weight: e.target.value })}
                      />
                    </label>
                    <label className="ps-field">
                      <span className="ps-field-label">Reps</span>
                      <input
                        className="ps-input"
                        type="number"
                        inputMode="numeric"
                        value={v.reps}
                        disabled={!isActive}
                        onChange={(e) => onRoundSet(gev, p, { reps: e.target.value })}
                      />
                    </label>
                  </div>
                  {renderRpe(gev, round, !isActive, (r) => onRoundSet(gev, p, { rpe: r }))}
                </div>
              );
            })}
          </div>
        )}

        {timer && (
          <div className={`ps-timer${timer.secondsLeft <= 0 ? ' is-done' : ''}`}>
            <span className="ps-timer-label">
              {timer.secondsLeft <= 0 && !timer.advance
                ? 'Pause vorbei'
                : timer.advance === 'pos'
                  ? 'Wechsel'
                  : 'Pause'}
            </span>
            <span className="ps-timer-num">{formatTime(timer.secondsLeft)}</span>
            <button
              type="button"
              className="ps-btn ps-btn-ghost ps-btn-quiet"
              onClick={skipTimer}
            >
              {timer.advance ? 'Weiter' : 'Überspringen'}
            </button>
          </div>
        )}

        <div className="ps-nav">
          {groupIdx > 0 && (
            <button type="button" className="ps-btn ps-btn-ghost" onClick={goPrev}>
              Zurück
            </button>
          )}
          <button
            type="button"
            className="ps-btn ps-btn-primary"
            disabled={!canAdvance}
            onClick={goNext}
          >
            {isLastGroup ? 'Workout abschließen' : 'Weiter'}
          </button>
        </div>
      </div>
    </div>
  );
}
