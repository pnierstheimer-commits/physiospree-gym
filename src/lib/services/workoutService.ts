/**
 * workoutService — Anlegen & Protokollieren von Workouts (STUB, Phase 0).
 *
 * Satz-Level-Datenmodell (Regel 6): Workouts werden Satz für Satz geloggt.
 * Jede erzeugte Entität erhält UUID + updatedAt (Regel 5). Services kapseln
 * die Logik; Komponenten rufen nur diese Funktionen (Regel 4).
 */

import type {
  PlannedSession,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '../../shared/types';

/**
 * Erzeugt ein neues Workout aus einer geplanten Session (oder leer).
 * TODO(Phase 1): UUIDs vergeben, geplante Übungen übernehmen.
 */
export function createWorkout(
  _userId: string,
  _session?: PlannedSession | null,
): Workout {
  throw new Error('workoutService.createWorkout: not_implemented');
}

/**
 * Fügt einen Satz zu einer Workout-Übung hinzu.
 * TODO(Phase 1): WorkoutSet mit UUID + setNumber anlegen.
 */
export function logSet(
  _exercise: WorkoutExercise,
  _set: Omit<WorkoutSet, 'id' | 'updatedAt' | 'workoutExerciseId' | 'setNumber'>,
): WorkoutSet {
  throw new Error('workoutService.logSet: not_implemented');
}

/**
 * Schließt ein Workout ab (Status + completedAt setzen).
 * TODO(Phase 1).
 */
export function completeWorkout(_workout: Workout): Workout {
  throw new Error('workoutService.completeWorkout: not_implemented');
}

/**
 * Berechnet das Arbeitsvolumen (Summe reps*weight ohne Warm-ups) eines Workouts.
 * TODO(Phase 1): über alle WorkoutSets aggregieren.
 */
export function computeVolume(_workout: Workout): number {
  throw new Error('workoutService.computeVolume: not_implemented');
}
