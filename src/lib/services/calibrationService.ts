/**
 * calibrationService — schreibt die in der Kalibrierung ermittelten
 * Arbeitsgewichte als absolute Startgewichte in alle Folgeeinheiten.
 *
 * Reine, deterministische Plan-Transformation (Regel 3/4): kein UI, kein
 * React-State. Wird nach Abschluss einer Kalibrierungseinheit aufgerufen
 * (state.completeWorkout). Bewusst client-seitig direkt — nicht über den
 * Coach-Marker-Weg — damit es zuverlässig greift, auch wenn die KI-Auswertung
 * scheitert.
 *
 * Match der Übungen per Name (exerciseId ist Platzhalter). Die Last wird ABSOLUT
 * gesetzt, auch auf zuvor null-Feldern (genau der Kalibrierungsfall), über alle
 * vorhandenen Wochen. Nur tatsächlich geänderte Übungen/Sessions/Wochen werden
 * neu erzeugt + `updatedAt` gebumpt (sync-schonend, Regel 5).
 */

import type {
  PlanFramework,
  PlannedSession,
  PlanWeek,
  Workout,
  WorkoutSet,
} from '../../shared/types';
import { isCalibrationSession } from './planMeta';

/** Übungsname aus notes ("Name — cue"). */
function exName(notes: string | undefined): string {
  if (!notes) return '';
  const i = notes.indexOf(' — ');
  return i === -1 ? notes : notes.slice(0, i);
}

/** Auf 2,5-kg-Schritte runden (nie negativ). */
function round25(x: number): number {
  return Math.max(0, Math.round(x / 2.5) * 2.5);
}

/**
 * Arbeitsgewicht aus den Kalibrierungssätzen einer Übung.
 * Logik: Sätze im RPE-Zielbereich 6–7, die mindestens die untere Rep-Range
 * erreichen; davon der Satz am nächsten an RPE 7 (Tie -> höhere Last).
 * Warm-up-Sätze zählen nicht. null, wenn kein verwertbarer Satz vorliegt.
 */
export function workingWeightFromSets(sets: WorkoutSet[], repMin: number): number | null {
  const candidates = sets.filter(
    (s) =>
      !s.isWarmup &&
      typeof s.weightKg === 'number' &&
      Number.isFinite(s.weightKg) &&
      typeof s.rpe === 'number' &&
      s.rpe >= 6 &&
      s.rpe <= 7 &&
      (s.reps ?? 0) >= repMin,
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const da = Math.abs((a.rpe as number) - 7);
    const db = Math.abs((b.rpe as number) - 7);
    if (da !== db) return da - db; // näher an RPE 7 zuerst
    return (b.weightKg as number) - (a.weightKg as number); // Tie: höhere Last
  });
  return candidates[0].weightKg as number;
}

/**
 * Liefert die abgeschlossene Session als Kalibrierung, falls das Workout zu
 * einer Kalibrierungseinheit gehört — sonst null. Erkennung robust über
 * `isCalibrationSession` (type-Feld mit Name-/Erste-Einheit-Fallback).
 */
export function findCalibrationSession(
  framework: PlanFramework,
  workout: Workout,
): PlannedSession | null {
  const pid = workout.plannedSessionId;
  if (!pid) return null;
  for (const w of framework.weeks) {
    const s = w.sessions.find((ss) => ss.id === pid);
    if (s) return isCalibrationSession(framework, s) ? s : null;
  }
  return null;
}

export interface CalibrationApplication {
  weeks: PlanWeek[];
  /** Pro Übung das gesetzte Startgewicht (für Logging/Tests). */
  applied: { name: string; load: number }[];
}

/**
 * Schreibt die ermittelten Arbeitsgewichte als absolute `suggestedLoadKg` in
 * alle Sessions aller Wochen, in denen die Übung per Name matcht. Gibt die
 * (ggf. neuen) Wochen + die angewendeten Werte zurück. Ändert nichts, wenn kein
 * Arbeitsgewicht ermittelbar ist.
 */
export function applyCalibrationLoads(
  weeks: PlanWeek[],
  calibrationSession: PlannedSession,
  workout: Workout,
  now: string,
): CalibrationApplication {
  // 1) Pro Kalibrierungs-Übung das Arbeitsgewicht bestimmen (Match per Name).
  const loads = new Map<string, number>();
  for (const we of workout.exercises) {
    const name = exName(we.notes);
    if (!name) continue;
    const planned = calibrationSession.exercises.find((pe) => exName(pe.notes) === name);
    const repMin = planned ? planned.targetReps[0] : 1;
    const w = workingWeightFromSets(we.sets, repMin);
    if (w !== null) loads.set(name, round25(w));
  }
  if (loads.size === 0) return { weeks, applied: [] };

  const applied: { name: string; load: number }[] = [];
  loads.forEach((load, name) => applied.push({ name, load }));

  // 2) In alle Wochen/Sessions schreiben — nur Geändertes neu erzeugen.
  const nextWeeks = weeks.map((week) => {
    let weekChanged = false;
    const sessions = week.sessions.map((s) => {
      let sessionChanged = false;
      const exercises = s.exercises.map((pe) => {
        const load = loads.get(exName(pe.notes));
        if (load === undefined || pe.suggestedLoadKg === load) return pe;
        sessionChanged = true;
        return { ...pe, suggestedLoadKg: load, updatedAt: now };
      });
      if (!sessionChanged) return s;
      weekChanged = true;
      return { ...s, exercises, updatedAt: now };
    });
    if (!weekChanged) return week;
    return { ...week, sessions, updatedAt: now };
  });

  return { weeks: nextWeeks, applied };
}
