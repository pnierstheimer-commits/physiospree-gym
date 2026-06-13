/**
 * WorkoutScreen — Workout-Player.
 *
 * Eine Übung im Fokus: Sätze eintragen (Gewicht/Reps/RPE), automatischer
 * Pause-Timer, Übungswechsel, Zusammenfassung und Speichern. UI-only (Regel 3):
 * keine Trainingsentscheidungen, nur Erfassung der Satz-Daten (Regel 6).
 *
 * Daten: `activeWorkout` (state) hält die geloggten Sätze, die geplante
 * Einheit (Ziele) wird über `plannedSessionId` aus `currentPlan` aufgelöst.
 * Übungsname steckt in `notes` ("Name — cue").
 */

import { useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useApp } from '../lib/state';
import type { WorkoutExercise, WorkoutSet } from '../shared/types';
import './screens.css';

const RPE_OPTIONS = [6, 7, 8, 9, 10];

interface SetInput {
  weight: string;
  reps: string;
  rpe: number | null;
}

interface ExView {
  index: number;
  name: string;
  cue: string | null;
  we: WorkoutExercise;
  targetSets: number;
  repMin: number;
  repMax: number;
  targetRPE: number;
  restSeconds: number;
  suggestedLoadKg: number | null;
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

export function WorkoutScreen() {
  const { activeWorkout, currentPlan, logSet, completeWorkout, abortWorkout } = useApp();

  const [exIndex, setExIndex] = useState(0);
  const [phase, setPhase] = useState<'train' | 'summary'>('train');
  const [inputs, setInputs] = useState<Record<string, SetInput>>({});
  const [timer, setTimer] = useState<{ secondsLeft: number; key: string } | null>(null);

  // Warnung bei Reload/Schließen während eines aktiven Workouts.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Pause-Timer-Countdown.
  useEffect(() => {
    if (!timer || timer.secondsLeft <= 0) return;
    const id = setTimeout(
      () => setTimer((t) => (t ? { ...t, secondsLeft: t.secondsLeft - 1 } : t)),
      1000,
    );
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
    const { name, cue } = splitExercise(we.notes);
    return {
      index: i,
      name,
      cue,
      we,
      targetSets: pe?.targetSets ?? Math.max(we.sets.length, 1),
      repMin: pe ? pe.targetReps[0] : 0,
      repMax: pe ? pe.targetReps[1] : 0,
      targetRPE: pe?.targetRPE ?? 0,
      restSeconds: pe?.restSeconds ?? 90,
      suggestedLoadKg: pe?.suggestedLoadKg ?? null,
    };
  });

  const total = exViews.length;
  const isCalibration = /kalibr/i.test(activeWorkout.name);

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

  const updateSet = (ev: ExView, sn: number, patch: Partial<SetInput>) => {
    const key = `${ev.index}:${sn}`;
    const cur = valueOf(ev, sn);
    const next = { ...cur, ...patch };
    setInputs((prev) => ({ ...prev, [key]: next }));

    const wasComplete = setComplete(cur);
    const nowComplete = setComplete(next);
    if (nowComplete) {
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
      if (!wasComplete) setTimer({ secondsLeft: ev.restSeconds, key });
    }
  };

  const exerciseComplete = (ev: ExView): boolean => {
    for (let sn = 1; sn <= ev.targetSets; sn++) {
      if (!setComplete(valueOf(ev, sn))) return false;
    }
    return true;
  };

  const goPrev = () => {
    setTimer(null);
    setExIndex((i) => Math.max(0, i - 1));
  };
  const goNext = () => {
    setTimer(null);
    if (exIndex < total - 1) setExIndex((i) => i + 1);
    else setPhase('summary');
  };

  const onAbort = () => {
    if (window.confirm('Workout abbrechen? Dein bisheriger Fortschritt wird als abgebrochen gespeichert.')) {
      abortWorkout();
    }
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
            <button type="button" className="ps-btn ps-btn-primary" onClick={completeWorkout}>
              Workout speichern
            </button>
            <button
              type="button"
              className="ps-btn ps-btn-ghost"
              onClick={() => setPhase('train')}
            >
              Zurück zum Training
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Training (eine Übung im Fokus)
  // -------------------------------------------------------------------------
  const ev = exViews[Math.min(exIndex, total - 1)];
  const reps = ev.repMin === ev.repMax ? `${ev.repMin}` : `${ev.repMin}–${ev.repMax}`;
  const target =
    ev.repMin || ev.repMax
      ? `${ev.targetSets} × ${reps}` +
        (ev.suggestedLoadKg != null ? ` @ ${ev.suggestedLoadKg} kg` : '') +
        ` · RPE ${ev.targetRPE}`
      : `${ev.targetSets} Sätze`;
  const canAdvance = exerciseComplete(ev);

  return (
    <div className="ps-screen">
      <div className="ps-shell">
        <div className="ps-topbar">
          <span className="ps-progress-label">
            Übung {exIndex + 1} von {total}
          </span>
          <button type="button" className="ps-abort" onClick={onAbort}>
            Abbrechen
          </button>
        </div>

        {isCalibration && (
          <div className="ps-hint">
            <span className="ps-pill ps-pill-yellow">Kalibrierung</span>
            <p>Gewicht steigern bis RPE 6–7. Dein Startgewicht finden.</p>
          </div>
        )}

        <div className="ps-ex-focus-name">{ev.name}</div>
        <div className="ps-target">{target}</div>
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
                      onChange={(e) => updateSet(ev, sn, { weight: e.target.value })}
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
                      onChange={(e) => updateSet(ev, sn, { reps: e.target.value })}
                    />
                  </label>
                </div>
                <div className="ps-rpe-wrap">
                  <span className="ps-field-label">RPE</span>
                  <div className="ps-rpe">
                    {RPE_OPTIONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        className={`ps-rpe-btn${v.rpe === r ? ' is-active' : ''}`}
                        onClick={() => updateSet(ev, sn, { rpe: r })}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {timer && (
          <div className={`ps-timer${timer.secondsLeft <= 0 ? ' is-done' : ''}`}>
            <span className="ps-timer-label">
              {timer.secondsLeft <= 0 ? 'Pause vorbei' : 'Pause'}
            </span>
            <span className="ps-timer-num">{formatTime(timer.secondsLeft)}</span>
            <button type="button" className="ps-btn ps-btn-ghost ps-btn-quiet" onClick={() => setTimer(null)}>
              Überspringen
            </button>
          </div>
        )}

        <div className="ps-nav">
          {exIndex > 0 && (
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
            {exIndex < total - 1 ? 'Nächste Übung' : 'Workout abschließen'}
          </button>
        </div>
      </div>
    </div>
  );
}
