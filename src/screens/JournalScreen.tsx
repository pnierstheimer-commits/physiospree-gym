/**
 * JournalScreen — Tagebuch.
 *
 * Liste aller abgeschlossenen Workouts (neueste zuerst, aufklappbar) und eine
 * Kraftentwicklungs-Section. UI-only (Regel 3): reine Darstellung aus
 * `workoutHistory` (Satz-Daten, Regel 6). Höchstgewicht pro Einheit fett.
 */

import { useState } from 'react';
import { useApp } from '../lib/state';
import type { Workout, WorkoutExercise, WorkoutSet } from '../shared/types';
import './screens.css';

/** Übungsname aus notes ("Name — cue"). */
function splitName(notes: string | undefined): string {
  if (!notes) return 'Übung';
  const i = notes.indexOf(' — ');
  return i === -1 ? notes : notes.slice(0, i);
}

/** Deutsche kg-Schreibweise (42.5 -> "42,5"). */
function fmtKg(n: number): string {
  return String(n).replace('.', ',');
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' });
}

/** Höchstes Arbeitsgewicht einer geloggten Übung (ignoriert Zeit/Cardio/Aufwärmen). */
function topWeight(we: WorkoutExercise): number | null {
  const ws = we.sets
    .filter((s) => !s.isWarmup && typeof s.weightKg === 'number' && s.weightKg > 0)
    .map((s) => s.weightKg as number);
  return ws.length ? Math.max(...ws) : null;
}

/** Ist-Werte eines Satzes fürs Journal — zeigt das, was geloggt wurde. */
function fmtJournalSet(s: WorkoutSet): string {
  if (typeof s.cardioMinutes === 'number') {
    return `${s.cardioMinutes} min${s.cardioMachine ? ` · ${s.cardioMachine}` : ''}`;
  }
  if (typeof s.durationSeconds === 'number') return `${s.durationSeconds}s gehalten`;
  const w = typeof s.weightKg === 'number' && s.weightKg > 0 ? `${fmtKg(s.weightKg)} kg × ` : '';
  return `${w}${s.reps ?? 0}`;
}

interface Progression {
  name: string;
  weights: number[];
}

/** Pro Übung das Höchstgewicht je Einheit, chronologisch, letzte 8 (>= 3 Einheiten). */
function computeProgressions(completed: Workout[]): Progression[] {
  const chrono = [...completed].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const byName = new Map<string, number[]>();
  for (const w of chrono) {
    for (const we of w.exercises) {
      const top = topWeight(we);
      if (top == null) continue;
      const name = splitName(we.notes);
      const arr = byName.get(name) ?? [];
      arr.push(top);
      byName.set(name, arr);
    }
  }
  const out: Progression[] = [];
  for (const [name, all] of byName) {
    if (all.length >= 3) out.push({ name, weights: all.slice(-8) });
  }
  return out;
}

export function JournalScreen() {
  const { workoutHistory } = useApp();
  const [openId, setOpenId] = useState<string | null>(null);

  const completed = [...workoutHistory]
    .filter((w) => w.status === 'completed')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const progressions = computeProgressions(completed);

  return (
    <div className="ps-screen">
      <div className="ps-shell">
        <div className="ps-plan-title">Tagebuch</div>

        {completed.length === 0 ? (
          <div className="ps-empty">Noch keine Einheiten. Starte dein erstes Training.</div>
        ) : (
          <div className="ps-jr-list">
            {completed.map((w) => {
              const open = openId === w.id;
              const exercises = [...w.exercises].sort((a, b) => a.order - b.order);
              return (
                <div key={w.id} className={`ps-jr-card${open ? ' is-open' : ''}`}>
                  <button
                    type="button"
                    className="ps-jr-head"
                    onClick={() => setOpenId((id) => (id === w.id ? null : w.id))}
                    aria-expanded={open}
                  >
                    <div className="ps-jr-head-main">
                      <span className="ps-jr-date">{fmtDate(w.date)}</span>
                      <span className="ps-jr-name">{w.name}</span>
                    </div>
                    <div className="ps-jr-head-meta">
                      {typeof w.totalDuration === 'number' && <span>{w.totalDuration} min</span>}
                      <span>{exercises.length} Übungen</span>
                      <span className="ps-chevron">▾</span>
                    </div>
                  </button>

                  {open && (
                    <div className="ps-jr-body">
                      {exercises.map((we) => {
                        const top = topWeight(we);
                        const sets = [...we.sets].sort((a, b) => a.setNumber - b.setNumber);
                        return (
                          <div key={we.id} className="ps-jr-ex">
                            <div className="ps-jr-ex-head">
                              <span className="ps-jr-ex-name">{splitName(we.notes)}</span>
                              {top != null && <span className="ps-jr-ex-top">{fmtKg(top)} kg</span>}
                            </div>
                            {sets.length === 0 ? (
                              <div className="ps-jr-set">keine Sätze</div>
                            ) : (
                              sets.map((s) => (
                                <div key={s.id} className="ps-jr-set">
                                  Satz {s.setNumber}: {fmtJournalSet(s)}
                                  {s.rpe != null ? ` | RPE ${s.rpe}` : ''}
                                </div>
                              ))
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {progressions.length > 0 && (
          <>
            <div className="ps-jr-prog-title">Kraftentwicklung</div>
            <div className="ps-jr-prog-list">
              {progressions.map((p) => (
                <div key={p.name} className="ps-jr-prog">
                  <span className="ps-jr-prog-name">{p.name}</span>
                  <span className="ps-jr-prog-seq">{p.weights.map(fmtKg).join(' → ')} kg</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
