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
  groupExercises,
  parsePrefix,
  type ExerciseGroup,
} from '../lib/services/exerciseGroupService';
import { isCalibrationSession } from '../lib/services/planMeta';
import {
  CARDIO_MACHINES,
  parseTargetSeconds,
  resolveInputMode,
} from '../lib/services/inputModeService';
import { ExerciseInfo } from '../components/ExerciseInfo';
import type { InputMode, WorkoutExercise, WorkoutSet } from '../shared/types';
import './screens.css';

const RPE_OPTIONS = [3, 4, 5, 6, 7, 8, 9, 10];
/** Feste Zirkel-Pausen (Sekunden). */
const CIRCUIT_SWITCH_REST = 15;
const CIRCUIT_ROUND_REST = 60;
/** Pause zwischen den Sätzen in der Kalibrierung (Sekunden). */
const CALIBRATION_REST = 60;

interface SetInput {
  weight: string;
  reps: string;
  rpe: number | null;
  /** 'time': gehaltene Sekunden. */
  seconds: string;
  /** 'cardio': gewähltes Gerät. */
  machine: string;
  /** 'cardio': Minuten. */
  minutes: string;
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
  /** Eingabe-Modus (abgeleitet oder aus dem Plan). */
  mode: InputMode;
  /** Zielzeit in Sekunden ('time'-Modus, aus dem Cue), sonst null. */
  targetSeconds: number | null;
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

function setComplete(v: SetInput, mode: InputMode = 'weight_reps'): boolean {
  const pos = (s: string) => /^\d+$/.test(s.trim()) && Number(s) > 0;
  if (mode === 'time') return pos(v.seconds) && v.rpe != null;
  if (mode === 'cardio') return pos(v.minutes) && v.machine.trim() !== '';
  // weight_reps | bodyweight_reps: Reps + RPE (Gewicht optional)
  return pos(v.reps) && v.rpe != null;
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

/** Ist-Werte eines einzelnen Satzes je Modus (für Zusammenfassung/Journal). */
function formatSetValue(s: WorkoutSet, mode: InputMode): string {
  const rpe = s.rpe != null ? ` @ RPE ${s.rpe}` : '';
  if (mode === 'cardio') {
    return `${s.cardioMinutes ?? 0} min${s.cardioMachine ? ` · ${s.cardioMachine}` : ''}${rpe}`;
  }
  if (mode === 'time') return `${s.durationSeconds ?? 0}s gehalten${rpe}`;
  if (mode === 'bodyweight_reps') {
    return `× ${s.reps ?? 0}${s.weightKg ? ` +${s.weightKg} kg` : ''}${rpe}`;
  }
  return `${s.weightKg ?? 0} kg × ${s.reps ?? 0}${rpe}`;
}

/** Ziel-Zeile einer Übung je Modus. */
function targetText(ev: ExView): string {
  if (ev.mode === 'cardio') return `${ev.targetSets > 1 ? `${ev.targetSets} × ` : ''}Gerät + Minuten`;
  if (ev.mode === 'time') {
    const t = ev.targetSeconds != null ? `${ev.targetSeconds}s` : 'Zeit';
    return `${ev.targetSets} × ${t} halten · RPE ${ev.targetRPE}`;
  }
  const reps = ev.repMin === ev.repMax ? `${ev.repMin}` : `${ev.repMin}–${ev.repMax}`;
  if (!ev.repMin && !ev.repMax) return `${ev.targetSets} Sätze`;
  return (
    `${ev.targetSets} × ${reps}` +
    (ev.mode === 'weight_reps' && ev.suggestedLoadKg != null ? ` @ ${ev.suggestedLoadKg} kg` : '') +
    ` · RPE ${ev.targetRPE}`
  );
}

export function WorkoutScreen() {
  const { activeWorkout, currentPlan, logSet, completeWorkout, abortWorkout } = useApp();

  // Gruppen-basierte Navigation: groupIndex + (für Supersatz/Zirkel) round + pos.
  const [groupIndex, setGroupIndex] = useState(0);
  const [round, setRound] = useState(1);
  const [pos, setPos] = useState(0);
  const [phase, setPhase] = useState<'train' | 'summary'>('train');
  const [inputs, setInputs] = useState<Record<string, SetInput>>({});
  const [timer, setTimer] = useState<Timer | null>(null);
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
    const mode = resolveInputMode({ inputMode: pe?.inputMode, name, cue: split.cue });
    const targetSeconds =
      mode === 'time' ? parseTargetSeconds(`${split.cue ?? ''} ${name}`) : null;
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
      mode,
      targetSeconds,
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
      weight:
        logged?.weightKg != null
          ? String(logged.weightKg)
          : !logged && ev.mode === 'weight_reps' && ev.suggestedLoadKg != null
            ? String(ev.suggestedLoadKg)
            : '',
      reps: logged?.reps != null ? String(logged.reps) : '',
      rpe: logged?.rpe ?? null,
      seconds:
        logged?.durationSeconds != null
          ? String(logged.durationSeconds)
          : !logged && ev.targetSeconds != null
            ? String(ev.targetSeconds)
            : '',
      machine: logged?.cardioMachine ?? '',
      minutes: logged?.cardioMinutes != null ? String(logged.cardioMinutes) : '',
    };
  };

  /** Schreibt einen Satz (Inputs + ggf. logSet). Gibt zurück, ob er JETZT fertig wurde. */
  const applySet = (ev: ExView, sn: number, patch: Partial<SetInput>): boolean => {
    const cur = valueOf(ev, sn);
    const next = { ...cur, ...patch };
    setInputs((prev) => ({ ...prev, [`${ev.index}:${sn}`]: next }));
    const becameComplete = !setComplete(cur, ev.mode) && setComplete(next, ev.mode);
    if (setComplete(next, ev.mode)) {
      const existing = ev.we.sets.find((s) => s.setNumber === sn);
      const base = {
        id: existing?.id ?? uuidv4(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        workoutExerciseId: ev.we.id,
        setNumber: sn,
        completed: true,
      };
      let wset: WorkoutSet;
      if (ev.mode === 'time') {
        wset = { ...base, durationSeconds: Number(next.seconds), rpe: next.rpe ?? undefined, isWarmup: false };
      } else if (ev.mode === 'cardio') {
        // Cardio/Aufwärmen zählt nicht zum Arbeitsvolumen (isWarmup, keine Progression).
        wset = {
          ...base,
          cardioMachine: next.machine,
          cardioMinutes: Number(next.minutes),
          rpe: next.rpe ?? undefined,
          isWarmup: true,
        };
      } else {
        // weight_reps | bodyweight_reps — Gewicht optional (Zusatzgewicht bei bodyweight).
        wset = {
          ...base,
          reps: Number(next.reps),
          weightKg: next.weight.trim() === '' ? undefined : Number(next.weight),
          rpe: next.rpe ?? undefined,
          isWarmup: false,
        };
      }
      logSet(ev.index, wset);
    }
    return becameComplete;
  };

  // Klassischer Satz: nach Abschluss Pause-Timer — aber nur, wenn noch ein Satz
  // folgt (nach dem letzten Satz direkt zur nächsten Übung, kein Timer).
  // Kalibrierung: feste 60s Pause zwischen den Sätzen.
  const onSingleSet = (ev: ExView, sn: number, patch: Partial<SetInput>) => {
    if (applySet(ev, sn, patch) && sn < ev.targetSets) {
      const rest = isCalibration ? CALIBRATION_REST : ev.restSeconds;
      setTimer({ secondsLeft: rest, key: `s:${ev.index}:${sn}`, advance: null });
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
      for (let r = 1; r <= rounds; r++) if (!setComplete(valueOf(ev, r), ev.mode)) return false;
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

  // Speichern: Workout abschließen (markiert completed + schreibt
  // Kalibrierungslasten). Keine automatische Coach-Auswertung mehr — der Coach
  // ist optional über den Chat erreichbar. completeWorkout entfernt das aktive
  // Workout, App.tsx routet danach zurück zur Übersicht.
  const onSave = () => {
    completeWorkout();
  };

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
                          <span className="ps-ex-spec">{formatSetValue(s, ev.mode)}</span>
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

  // Eingabefelder eines klassischen Satzes je Modus (weight_reps/time/cardio/bodyweight).
  const renderSetBody = (ev: ExView, sn: number) => {
    const v = valueOf(ev, sn);
    if (ev.mode === 'cardio') {
      return (
        <>
          <div className="ps-machines">
            <span className="ps-field-label">Gerät</span>
            <div className="ps-machine-btns">
              {CARDIO_MACHINES.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`ps-machine-btn${v.machine === m ? ' is-active' : ''}`}
                  onClick={() => onSingleSet(ev, sn, { machine: m })}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <label className="ps-field">
            <span className="ps-field-label">Minuten</span>
            <input
              className="ps-input"
              type="number"
              inputMode="numeric"
              value={v.minutes}
              onFocus={() => setTimer(null)}
              onChange={(e) => onSingleSet(ev, sn, { minutes: e.target.value })}
            />
          </label>
          {renderRpe(ev, sn, false, (r) => onSingleSet(ev, sn, { rpe: r }))}
        </>
      );
    }
    if (ev.mode === 'time') {
      return (
        <>
          <label className="ps-field">
            <span className="ps-field-label">Sekunden gehalten</span>
            <input
              className="ps-input"
              type="number"
              inputMode="numeric"
              value={v.seconds}
              onFocus={() => setTimer(null)}
              onChange={(e) => onSingleSet(ev, sn, { seconds: e.target.value })}
            />
          </label>
          {renderRpe(ev, sn, false, (r) => onSingleSet(ev, sn, { rpe: r }))}
        </>
      );
    }
    // weight_reps | bodyweight_reps
    return (
      <>
        <div className="ps-set-inputs">
          {ev.mode === 'weight_reps' && (
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
          )}
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
          {ev.mode === 'bodyweight_reps' && (
            <label className="ps-field">
              <span className="ps-field-label">+kg (optional)</span>
              <input
                className="ps-input"
                type="number"
                inputMode="decimal"
                value={v.weight}
                onFocus={() => setTimer(null)}
                onChange={(e) => onSingleSet(ev, sn, { weight: e.target.value })}
              />
            </label>
          )}
        </div>
        {renderRpe(ev, sn, false, (r) => onSingleSet(ev, sn, { rpe: r }))}
      </>
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
          // -------- Klassischer Satz (mode-abhängige Eingabefelder) --------
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
                    const done = setComplete(v, ev.mode);
                    return (
                      <div key={sn} className={`ps-set${done ? ' is-done' : ''}`}>
                        <div className="ps-set-head">
                          <span>Satz {sn}</span>
                          {done && <span className="ps-set-check">✓</span>}
                        </div>
                        {renderSetBody(ev, sn)}
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
