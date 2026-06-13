/**
 * coachService — adaptive Trainingsentscheidungen (KI-Pfad, Regel 8).
 *
 * Kapselt die Post-Workout-Auswertung über /api/claude-coach und die
 * Konvertierung der Coach-Marker in das `ParsedMarker`-Format, das der State
 * anwendet. Kein UI-Code (Regel 3/4).
 */

import { v4 as uuidv4 } from 'uuid';
import type { ParsedMarker, ParsedMarkerKind, PlanResponse, Workout } from '../../shared/types';

const COACH_ENDPOINT = '/api/claude-coach';

// ---------------------------------------------------------------------------
// Antwort-Vertrag (gleiche Struktur wie api/claude-coach.ts)
// ---------------------------------------------------------------------------

export type Verdict = 'in_range' | 'above_range' | 'below_range' | 'rpe_low' | 'stagnation';
export type Adjustment = 'maintain' | 'increase' | 'decrease';

export interface CoachEvaluationItem {
  exerciseName: string;
  verdict: Verdict;
  currentLoad: number;
  adjustment: Adjustment;
  newLoad?: number;
  rationale: string;
}

export interface CoachMarker {
  type: string;
  exerciseName?: string;
  delta?: number;
  reason: string;
}

export interface CoachEvaluation {
  evaluation: CoachEvaluationItem[];
  markers: CoachMarker[];
  overallRPE: number;
  coachMessage: string;
}

// ---------------------------------------------------------------------------
// Auswertung anfordern
// ---------------------------------------------------------------------------

function evalErrorMessage(status: number, detail: string): string {
  const suffix = detail ? ` — ${detail}` : '';
  switch (status) {
    case 400:
      return `Ungültige Auswertungsanfrage (400): Workout/Plan unvollständig oder nicht abgeschlossen${suffix}`;
    case 405:
      return `Methode nicht erlaubt (405): Die Coach-Route akzeptiert nur POST${suffix}`;
    case 422:
      return `Auswertung nicht verwertbar (422): Antwort des Coaches war nicht lesbar${suffix}`;
    case 500:
      return `Serverfehler bei der Auswertung (500)${suffix}`;
    case 502:
      return `KI-Dienst nicht erreichbar (502): Claude API lieferte keine Auswertung${suffix}`;
    default:
      return `Auswertung fehlgeschlagen (${status})${suffix}`;
  }
}

function isCoachEvaluation(value: unknown): value is CoachEvaluation {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.evaluation) &&
    Array.isArray(v.markers) &&
    typeof v.overallRPE === 'number' &&
    typeof v.coachMessage === 'string'
  );
}

/**
 * Wertet ein abgeschlossenes Workout über die serverseitige Coach-Route aus.
 * Wirft bei jedem Fehler eine klare `Error` — scheitert nie stumm.
 */
export async function evaluateWorkout(
  workout: Workout,
  plan: PlanResponse,
): Promise<CoachEvaluation> {
  let res: Response;
  try {
    res = await fetch(COACH_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workout, plan }),
    });
  } catch (err) {
    throw new Error(`Netzwerkfehler bei der Auswertung: ${(err as Error).message}`, { cause: err });
  }

  if (!res.ok) {
    let detail = '';
    try {
      const errBody = (await res.json()) as { message?: string; error?: string };
      detail = errBody?.message || errBody?.error || '';
    } catch {
      // Statuscode genügt für die Meldung.
    }
    throw new Error(evalErrorMessage(res.status, detail));
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error('Antwort der Auswertung ist kein gültiges JSON.');
  }

  if (!isCoachEvaluation(data)) {
    throw new Error('Antwort der Auswertung hat eine unerwartete Struktur.');
  }

  return data;
}

// ---------------------------------------------------------------------------
// Marker-Konvertierung: CoachMarker -> ParsedMarker
// ---------------------------------------------------------------------------

const MARKER_KINDS: ParsedMarkerKind[] = [
  'LOAD_ADJUSTMENT',
  'DELOAD',
  'PHASE_SHIFT',
  'EXERCISE_SWAP',
  'EXERCISE_UPGRADE',
  'SESSION_ADJUSTMENT',
  'ILLNESS_RECOVERY',
  'VACATION_MODE',
];

/**
 * Wandelt die Coach-Marker (type/exerciseName/delta/reason) in typisierte
 * `ParsedMarker` um, die der State anwenden kann. Unbekannte Marker-Typen
 * werden verworfen. Die Roh-Felder (exerciseName, delta) bleiben in `payload`
 * erhalten, damit `applyMarkers` sie auswerten kann.
 */
export function convertCoachMarkers(coachMarkers: CoachMarker[]): ParsedMarker[] {
  const out: ParsedMarker[] = [];
  for (const m of coachMarkers) {
    if (!(MARKER_KINDS as string[]).includes(m.type)) continue;
    out.push({
      kind: m.type as ParsedMarkerKind,
      sourceActionId: uuidv4(),
      rationale: m.reason,
      targetId: null,
      payload: {
        exerciseName: m.exerciseName,
        delta: m.delta,
      },
    });
  }
  return out;
}
