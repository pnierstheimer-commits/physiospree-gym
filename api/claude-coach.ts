/**
 * Vercel Serverless Function: POST /api/claude-coach  (Phase 1)
 *
 * Post-Workout-Coach. Nimmt ein abgeschlossenes Workout + den aktuellen Plan,
 * baut einen fokussierten System-Prompt (Supervisor-Regeln + Auswertungslogik)
 * aus `api/prompt/` und liefert eine validierte CoachEvaluation.
 *
 * Architektur (CLAUDE.md):
 * - Regel 6: Auswertung baut auf Satz-Daten auf.
 * - Regel 8: Secrets (ANTHROPIC_API_KEY) bleiben serverseitig; KI-Pfad.
 *
 * CoachEvaluation ist hier inline definiert, da types.ts geschützt ist
 * (kein Persistenz-Typ — reine API-Antwort).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type {
  Goal,
  PlannedExercise,
  PlannedSession,
  PlanResponse,
  Workout,
  WorkoutExercise,
} from '../src/shared/types';

export const config = { runtime: 'nodejs', maxDuration: 60 };

// ---------------------------------------------------------------------------
// Antwort-Vertrag (inline, da types.ts geschützt)
// ---------------------------------------------------------------------------

type Verdict = 'in_range' | 'above_range' | 'below_range' | 'rpe_low' | 'stagnation';
type Adjustment = 'maintain' | 'increase' | 'decrease';

interface CoachEvaluationItem {
  exerciseName: string;
  verdict: Verdict;
  currentLoad: number;
  adjustment: Adjustment;
  /** Nur gesetzt, wenn adjustment != 'maintain'. */
  newLoad?: number;
  rationale: string;
}

interface CoachMarker {
  /** Marker-Vokabular aus Coach-Skill §10 (z. B. LOAD_ADJUSTMENT, DELOAD). */
  type: string;
  exerciseName?: string;
  delta?: number;
  reason: string;
}

interface CoachEvaluation {
  evaluation: CoachEvaluationItem[];
  markers: CoachMarker[];
  overallRPE: number;
  coachMessage: string;
}

// ---------------------------------------------------------------------------
// Segment-Ableitung
// ---------------------------------------------------------------------------

type CoachSegment = 'hypertrophy' | 'strength' | 'endurance';

const SEGMENT_REFERENCE: Record<CoachSegment, string> = {
  hypertrophy: 'hypertrophy.md',
  strength: 'maxstrength.md',
  endurance: 'strength-endurance.md',
};

const SEGMENT_LABEL: Record<CoachSegment, string> = {
  hypertrophy: 'Hypertrophie',
  strength: 'Maximalkraft',
  endurance: 'Kraftausdauer',
};

function goalToSegment(goal: Goal): CoachSegment {
  switch (goal) {
    case 'strength':
      return 'strength';
    case 'endurance':
      return 'endurance';
    case 'hypertrophy':
    case 'general_fitness':
    case 'rehab':
      return 'hypertrophy';
  }
}

// ---------------------------------------------------------------------------
// Prompt-Bausteine laden + Abschnitt-Extraktion
// ---------------------------------------------------------------------------

const PROMPT_DIRS = [
  join(dirname(fileURLToPath(import.meta.url)), 'prompt'),
  join(process.cwd(), 'api', 'prompt'),
];

function loadPrompt(name: string): string {
  for (const dir of PROMPT_DIRS) {
    try {
      return readFileSync(join(dir, name), 'utf8');
    } catch {
      // nächsten Kandidaten versuchen
    }
  }
  throw new Error(`Prompt-Baustein nicht gefunden: ${name}`);
}

/**
 * Schneidet einen Markdown-Abschnitt ab `headerPrefix` (z. B. "## Schritt 9")
 * bis zur nächsten Überschrift auf Ebene 1–2 aus. Unterüberschriften (###)
 * bleiben Teil des Abschnitts.
 */
function extractSection(md: string, headerPrefix: string): string {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.startsWith(headerPrefix));
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,2} /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n').trim();
}

/**
 * Fokussierter Coach-Prompt für die Auswertung: nur Supervisor-Regeln (§7) und
 * Workout-Auswertung (§9) aus SKILL.md, der segmentspezifische
 * Auswertungsabschnitt, der Sprachleitfaden (TRAIN) und das Zykluslängen-Modul.
 */
function buildSystemPrompt(segment: CoachSegment): string {
  const skill = loadPrompt('SKILL.md');
  const supervisor = extractSection(skill, '## Schritt 7');
  const evaluation = extractSection(skill, '## Schritt 9');
  const segmentEval = extractSection(loadPrompt(SEGMENT_REFERENCE[segment]), '## Auswertungslogik');

  return [
    'Du bist der Strength-Coach. Werte die abgeschlossene Trainingseinheit aus — ' +
      'im TRAIN-Sound, mit einer klaren Konsequenz pro Übung. Wende die folgenden ' +
      'Supervisor- und Auswertungsregeln strikt an.',
    supervisor,
    evaluation,
    `# Segmentspezifische Auswertung (${SEGMENT_LABEL[segment]})\n\n${segmentEval}`,
    loadPrompt('sound.md'),
    loadPrompt('prompt-modul-zykluslaenge.md'),
  ]
    .filter(Boolean)
    .join('\n\n---\n\n');
}

// ---------------------------------------------------------------------------
// User-Message: Satz-Daten im Format aus SKILL.md Schritt 9
// ---------------------------------------------------------------------------

const OUTPUT_SCHEMA = `{
  "evaluation": [
    {
      "exerciseName": "Brustpresse",
      "verdict": "in_range | above_range | below_range | rpe_low | stagnation",
      "currentLoad": 40,
      "adjustment": "maintain | increase | decrease",
      "newLoad": 42.5,
      "rationale": "40 kg x 15/15/14 bei RPE 9. Zweite Woche am oberen Ende. Nächste Woche: 42,5 kg."
    }
  ],
  "markers": [
    { "type": "LOAD_ADJUSTMENT", "exerciseName": "Brustpresse", "delta": 2.5, "reason": "2x in Folge alle Sätze >= 15 bei RPE 9" }
  ],
  "overallRPE": 8.5,
  "coachMessage": "Freitext im TRAIN-Sound: Gesamtbewertung der Einheit."
}`;

/** Übungsname steckt im notes-Feld ("Name — cue"). */
function splitName(notes: string | undefined): string {
  if (!notes) return 'Übung';
  const i = notes.indexOf(' — ');
  return i === -1 ? notes : notes.slice(0, i);
}

function formatReps(range: [number, number]): string {
  return range[0] === range[1] ? `${range[0]}` : `${range[0]}–${range[1]}`;
}

function buildUserPrompt(
  workout: Workout,
  segment: CoachSegment,
  cycleLengthWeeks: number,
  weekIndex: number | null,
  isCalibration: boolean,
  plannedExercises: PlannedExercise[],
): string {
  const lines: string[] = [];
  lines.push('AUSWERTUNG DER ABGESCHLOSSENEN EINHEIT');
  lines.push('');
  lines.push(
    `Segment: ${SEGMENT_LABEL[segment]} | Zykluslänge: ${cycleLengthWeeks} Wochen` +
      (weekIndex != null ? ` | Woche ${weekIndex + 1}` : ''),
  );
  lines.push(`Einheit: ${workout.name}${isCalibration ? ' (Kalibrierung)' : ''}`);
  lines.push('');
  lines.push('SATZ-DATEN');

  const exercises = [...workout.exercises].sort((a, b) => a.order - b.order);
  exercises.forEach((we: WorkoutExercise, i) => {
    const pe = plannedExercises[i];
    const name = splitName(we.notes);
    const repRange = pe ? formatReps(pe.targetReps) : '—';
    const rpeTarget = pe ? `${pe.targetRPE}` : '—';
    lines.push('');
    lines.push(`Übung: ${name} | Rep-Range: ${repRange} | RPE-Ziel: ${rpeTarget}`);
    const sets = [...we.sets].sort((a, b) => a.setNumber - b.setNumber);
    if (sets.length === 0) {
      lines.push('  (keine Sätze erfasst)');
    } else {
      for (const s of sets) {
        lines.push(`Satz ${s.setNumber}: ${s.weightKg} kg × ${s.reps} | RPE ${s.rpe ?? '-'}`);
      }
    }
  });

  lines.push('');
  lines.push('AUSGABE');
  lines.push(
    'Antworte mit GENAU einem ```json-Block in exakt dieser Struktur (Feldnamen ' +
      'unverändert, keine weiteren Codeblöcke). `newLoad` nur wenn adjustment != ' +
      '"maintain". markers nur, wenn eine konkrete Anpassung ansteht (sonst []).',
  );
  lines.push('```json');
  lines.push(OUTPUT_SCHEMA);
  lines.push('```');
  lines.push('Pro Übung genau ein evaluation-Eintrag. Konsequenz im rationale (TRAIN-Sound).');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Validierung der Modellantwort
// ---------------------------------------------------------------------------

class CoachValidationError extends Error {}

function asRecord(v: unknown, ctx: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new CoachValidationError(`${ctx} muss ein Objekt sein.`);
  }
  return v as Record<string, unknown>;
}
function asArray(v: unknown, ctx: string): unknown[] {
  if (!Array.isArray(v)) throw new CoachValidationError(`${ctx} muss ein Array sein.`);
  return v;
}
function asNumber(v: unknown, ctx: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new CoachValidationError(`${ctx} muss eine Zahl sein.`);
  }
  return v;
}
function asString(v: unknown, ctx: string): string {
  if (typeof v !== 'string') throw new CoachValidationError(`${ctx} muss ein String sein.`);
  return v;
}

const VERDICTS: Verdict[] = ['in_range', 'above_range', 'below_range', 'rpe_low', 'stagnation'];
const ADJUSTMENTS: Adjustment[] = ['maintain', 'increase', 'decrease'];

function extractJson(raw: string): { json: string; precedingText: string } {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    const idx = raw.indexOf(fence[0]);
    return { json: fence[1].trim(), precedingText: raw.slice(0, idx).trim() };
  }
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first !== -1 && last > first) {
    return { json: raw.slice(first, last + 1), precedingText: raw.slice(0, first).trim() };
  }
  throw new CoachValidationError('Keine JSON-Struktur in der Modellantwort gefunden.');
}

function parseCoachEvaluation(raw: string): CoachEvaluation {
  const { json, precedingText } = extractJson(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new CoachValidationError(`JSON-Block ist nicht parsebar: ${(err as Error).message}`);
  }

  const root = asRecord(parsed, 'Antwort');

  const evaluation: CoachEvaluationItem[] = asArray(root.evaluation, 'evaluation').map((e, i) => {
    const er = asRecord(e, `evaluation[${i}]`);
    const verdict = er.verdict;
    if (typeof verdict !== 'string' || !VERDICTS.includes(verdict as Verdict)) {
      throw new CoachValidationError(`evaluation[${i}].verdict ist ungültig.`);
    }
    const adjustment = er.adjustment;
    if (typeof adjustment !== 'string' || !ADJUSTMENTS.includes(adjustment as Adjustment)) {
      throw new CoachValidationError(`evaluation[${i}].adjustment ist ungültig.`);
    }
    const item: CoachEvaluationItem = {
      exerciseName: asString(er.exerciseName, `evaluation[${i}].exerciseName`),
      verdict: verdict as Verdict,
      currentLoad: asNumber(er.currentLoad, `evaluation[${i}].currentLoad`),
      adjustment: adjustment as Adjustment,
      rationale: asString(er.rationale, `evaluation[${i}].rationale`),
    };
    if (typeof er.newLoad === 'number' && Number.isFinite(er.newLoad)) {
      item.newLoad = er.newLoad;
    }
    return item;
  });

  const markers: CoachMarker[] = asArray(root.markers ?? [], 'markers').map((m, i) => {
    const mr = asRecord(m, `markers[${i}]`);
    const marker: CoachMarker = {
      type: asString(mr.type, `markers[${i}].type`),
      reason: asString(mr.reason, `markers[${i}].reason`),
    };
    if (typeof mr.exerciseName === 'string') marker.exerciseName = mr.exerciseName;
    if (typeof mr.delta === 'number' && Number.isFinite(mr.delta)) marker.delta = mr.delta;
    return marker;
  });

  const coachMessage =
    typeof root.coachMessage === 'string' && root.coachMessage.trim()
      ? root.coachMessage.trim()
      : precedingText;

  return {
    evaluation,
    markers,
    overallRPE: asNumber(root.overallRPE, 'overallRPE'),
    coachMessage,
  };
}

// ---------------------------------------------------------------------------
// Plan-Kontext
// ---------------------------------------------------------------------------

function findPlannedSession(
  plan: PlanResponse,
  plannedSessionId: string | null | undefined,
): { session: PlannedSession; weekIndex: number } | null {
  if (!plannedSessionId) return null;
  for (const week of plan.framework.weeks) {
    const session = week.sessions.find((s) => s.id === plannedSessionId);
    if (session) return { session, weekIndex: week.weekIndex };
  }
  return null;
}

// ---------------------------------------------------------------------------
// HTTP-Helfer + Handler
// ---------------------------------------------------------------------------

function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.status(status).json(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    sendJson(res, 500, {
      error: 'config_error',
      message: 'ANTHROPIC_API_KEY ist serverseitig nicht gesetzt.',
    });
    return;
  }

  // 1) Body lesen
  let body: { workout?: Workout; plan?: PlanResponse };
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {};
  } catch {
    sendJson(res, 400, { error: 'bad_request', message: 'Body ist kein gültiges JSON.' });
    return;
  }

  const workout = body.workout;
  const plan = body.plan;
  if (!workout || !Array.isArray(workout.exercises) || !plan?.framework?.weeks) {
    sendJson(res, 400, {
      error: 'bad_request',
      message: 'workout (mit exercises) und plan (mit framework.weeks) sind erforderlich.',
    });
    return;
  }

  // 2) Guard: nur abgeschlossene Workouts auswerten
  if (workout.status !== 'completed') {
    sendJson(res, 400, {
      error: 'bad_request',
      message: `Nur abgeschlossene Workouts können ausgewertet werden (status='${workout.status}').`,
    });
    return;
  }

  // 3) Kontext + Prompt
  const segment = goalToSegment(plan.framework.goal);
  const cycleLengthWeeks = plan.framework.cycleLengthWeeks;
  const ctx = findPlannedSession(plan, workout.plannedSessionId);
  const plannedExercises = ctx
    ? [...ctx.session.exercises].sort((a, b) => a.order - b.order)
    : [];
  const isCalibration = /kalibr/i.test(workout.name) || /kalibr/i.test(ctx?.session.name ?? '');

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  let raw: string;
  try {
    const systemPrompt = buildSystemPrompt(segment);
    const userPrompt = buildUserPrompt(
      workout,
      segment,
      cycleLengthWeeks,
      ctx?.weekIndex ?? null,
      isCalibration,
      plannedExercises,
    );

    const client = new Anthropic();
    const message = await client.messages.create({
      model,
      max_tokens: 8000,
      thinking: { type: 'disabled' },
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    raw = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    if (!raw) {
      sendJson(res, 502, { error: 'upstream_error', message: 'Modell lieferte keinen Text zurück.' });
      return;
    }
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      sendJson(res, 502, { error: 'upstream_error', message: `Claude API: ${err.message}` });
      return;
    }
    sendJson(res, 500, { error: 'internal_error', message: (err as Error).message });
    return;
  }

  // 4) Validieren + zurückgeben
  let evaluation: CoachEvaluation;
  try {
    evaluation = parseCoachEvaluation(raw);
  } catch (err) {
    if (err instanceof CoachValidationError) {
      sendJson(res, 422, { error: 'unprocessable_evaluation', message: err.message });
      return;
    }
    throw err;
  }

  sendJson(res, 200, evaluation);
}
