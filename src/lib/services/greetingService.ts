/**
 * greetingService — bestimmt die kontextabhängige Coach-Begrüßung für den
 * Heute-Screen. Reine Funktion, kein API-Call (Regel 4/8: schnell & lokal).
 * Coach-Logik gehört in den Service-Layer, nicht in die UI (Regel 3).
 *
 * Priorität (erste zutreffende Regel gewinnt): A Pause > B harte Woche >
 * C Meilenstein > D regelmäßige Nachfrage > E heutige Einheit (Standard).
 */

import type { CoachAction, PlannedSession, Workout } from '../../shared/types';

export type CoachGreetingKind = 'pause' | 'hard_week' | 'milestone' | 'checkin' | 'today';

export interface CoachGreeting {
  kind: CoachGreetingKind;
  text: string;
}

export interface GreetingInput {
  displayName?: string;
  /** Alle Workouts (die Funktion filtert selbst auf 'completed'). */
  workouts: Workout[];
  /** Heutige geplante Einheit oder null (Ruhetag). */
  todaySession: PlannedSession | null;
  /** Coach-Actions (Plan + Auswertungen) für die Meilenstein-Erkennung. */
  coachActions: CoachAction[];
  /** Aktuelle Zeit in ms (Date.now() aus der UI — testbar/deterministisch). */
  nowMs: number;
}

const DAY_MS = 86_400_000;

function firstName(displayName?: string): string {
  const n = (displayName ?? '').trim();
  return n ? n.split(/\s+/)[0] : '';
}

/** Übungsname aus PlannedExercise.notes ("Name — Cue"). */
function exerciseName(notes?: string): string {
  if (!notes) return 'Übung';
  const i = notes.indexOf(' — ');
  return i === -1 ? notes : notes.slice(0, i);
}

function fmtKg(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(1).replace('.', ',');
}

export function computeCoachGreeting(input: GreetingInput): CoachGreeting {
  const { displayName, workouts, todaySession, coachActions, nowMs } = input;
  const name = firstName(displayName);
  const hi = name ? `${name}, ` : '';

  const completed = workouts
    .filter((w) => w.status === 'completed')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // A) Pause: >= 4 Tage seit dem letzten Training.
  if (completed.length > 0) {
    const days = Math.floor((nowMs - new Date(completed[0].date).getTime()) / DAY_MS);
    if (days >= 4) {
      return { kind: 'pause', text: `${hi}${days} Tage seit dem letzten Training. Alles klar bei dir?` };
    }
  }

  // B) Harte Woche: Ø-RPE der letzten 3 Workouts >= 9 (nur Arbeitssätze mit RPE).
  if (completed.length >= 3) {
    const rpes = completed
      .slice(0, 3)
      .flatMap((w) =>
        w.exercises.flatMap((ex) =>
          ex.sets.filter((s) => !s.isWarmup && typeof s.rpe === 'number').map((s) => s.rpe as number),
        ),
      );
    if (rpes.length > 0) {
      const avg = rpes.reduce((a, b) => a + b, 0) / rpes.length;
      if (avg >= 9) return { kind: 'hard_week', text: 'Intensive Woche hinter dir. Wie fühlst du dich?' };
    }
  }

  // C) Meilenstein: jüngste Hochstufung (progress_load) und frisch (<= 4 Tage).
  const upgrade = coachActions
    .filter((a) => a.type === 'progress_load')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  if (upgrade && nowMs - new Date(upgrade.createdAt).getTime() <= 4 * DAY_MS) {
    const exn = typeof upgrade.payload?.exerciseName === 'string' ? (upgrade.payload.exerciseName as string) : null;
    return {
      kind: 'milestone',
      text: exn
        ? `${exn} hochgestuft. Gewicht geht rauf — läuft bei dir.`
        : 'Gewicht hochgestuft — läuft bei dir.',
    };
  }

  // D) Regelmäßige Nachfrage: alle 5 abgeschlossenen Einheiten.
  if (completed.length > 0 && completed.length % 5 === 0) {
    return { kind: 'checkin', text: 'Alles fit? Schlaf, Energie, irgendwo Zwicken?' };
  }

  // E) Standard: heutige Einheit (Split + erste Übung + Gewicht).
  if (todaySession && todaySession.exercises.length > 0) {
    const first = [...todaySession.exercises].sort((a, b) => a.order - b.order)[0];
    const exn = exerciseName(first.notes);
    const weight =
      typeof first.suggestedLoadKg === 'number' ? ` mit ${fmtKg(first.suggestedLoadKg)} kg` : '';
    return { kind: 'today', text: `${todaySession.name}. ${exn}${weight}. Los.` };
  }

  // Ruhetag / keine Einheit heute.
  return { kind: 'today', text: name ? `Heute frei, ${name}. Erholung ist Teil des Plans.` : 'Heute frei. Erholung ist Teil des Plans.' };
}
