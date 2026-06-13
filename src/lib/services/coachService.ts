/**
 * coachService — adaptive Trainingsentscheidungen (STUB, Phase 0).
 *
 * Das Herz der Coach-Logik (Regeln 3 & 4): Progression, Deload, Übertraining,
 * Wiedereinstieg und Tagesform-Status. Deterministische Regeln stammen aus
 * constants.ts (PROGRESSION, DELOAD, OVERTRAINING_THRESHOLDS, RECOVERY_RULES,
 * RETURN_PROTOCOL, STATUS_THRESHOLDS); die KI ergänzt nur (Regel 8).
 */

import type {
  CheckinData,
  CoachAction,
  Marker,
  PlannedExercise,
  Workout,
} from '../../shared/types';

/**
 * Berechnet den Readiness-Status (green/yellow/red) aus den letzten Check-ins.
 * TODO(Phase 1): Score gegen STATUS_THRESHOLDS auswerten.
 */
export function evaluateReadiness(
  _checkins: CheckinData[],
): 'green' | 'yellow' | 'red' {
  throw new Error('coachService.evaluateReadiness: not_implemented');
}

/**
 * Entscheidet auf Satz-Ebene (Regel 6), ob die Last einer Übung steigt,
 * gehalten oder reduziert wird.
 * TODO(Phase 1): PROGRESSION-Regeln über die letzten Workouts anwenden.
 */
export function decideProgression(
  _exercise: PlannedExercise,
  _history: Workout[],
): CoachAction {
  throw new Error('coachService.decideProgression: not_implemented');
}

/**
 * Prüft auf Übertraining anhand OVERTRAINING_THRESHOLDS.
 * TODO(Phase 1).
 */
export function detectOvertraining(_checkins: CheckinData[]): CoachAction | null {
  throw new Error('coachService.detectOvertraining: not_implemented');
}

/**
 * Erzeugt ein Wiedereinstiegs-Protokoll nach längerer Pause/Verletzung.
 * TODO(Phase 1): RETURN_PROTOCOL anwenden, aktive Marker berücksichtigen.
 */
export function buildReturnProtocol(
  _lastWorkout: Workout | null,
  _markers: Marker[],
): CoachAction {
  throw new Error('coachService.buildReturnProtocol: not_implemented');
}
