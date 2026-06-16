/**
 * Vercel Serverless Function: POST /api/claude-plan  (Phase 1)
 *
 * Plan-Generator. Nimmt einen PlanRequest, baut den System-Prompt aus den
 * Coach-Bausteinen in `api/prompt/`, ruft die Claude API (Modell
 * claude-sonnet-4-6) und liefert eine vollständige, gegen `types.ts`
 * validierte PlanResponse.
 *
 * Architektur (CLAUDE.md):
 * - Regel 2: Die Zykluslänge kommt aus `CYCLE_LENGTH_WEEKS` (constants.ts),
 *   nie frei aus der KI.
 * - Regel 5: Jede erzeugte Entität trägt id (UUID v4) + updatedAt (ISO).
 * - Regel 8: Secrets (ANTHROPIC_API_KEY) bleiben serverseitig.
 *
 * Bekannte Grenze (v1): Im Request liegt kein Übungskatalog, daher bekommt
 * jede geplante Übung eine Platzhalter-`exerciseId` (UUID) und der Übungsname
 * landet in `notes`. Sobald der Katalog im Request mitkommt, hier auf echte
 * ExerciseDefinition-IDs auflösen.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type {
  BlockPhase,
  CoachAction,
  Goal,
  MuscleGroup,
  PlanFramework,
  PlanRequest,
  PlanResponse,
  PlanWeek,
  PlannedExercise,
  PlannedSession,
  UserProfile,
  Workout,
} from '../src/shared/types';

export const config = { runtime: 'nodejs', maxDuration: 300 };

// Lokale Spiegelung von CYCLE_LENGTH_WEEKS aus src/shared/constants.ts (Single
// Source, Regel 2). Die Vercel-Lambda kann zur Laufzeit nicht aus src/ auflösen
// (ESM ERR_MODULE_NOT_FOUND), deshalb hier gespiegelt. WICHTIG: Bei Änderung in
// constants.ts diese Tabelle mitziehen.
const CYCLE_LENGTH_WEEKS: Record<
  'strength' | 'hypertrophy' | 'endurance',
  Record<'beginner' | 'intermediate' | 'advanced', number | null>
> = {
  hypertrophy: { beginner: 8, intermediate: 8, advanced: 12 },
  strength: { beginner: null, intermediate: 12, advanced: 12 },
  endurance: { beginner: 6, intermediate: 8, advanced: 8 },
};

// ---------------------------------------------------------------------------
// Segment-Ableitung (Trainingsziel -> Coach-Segment)
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

/** general_fitness/rehab werden volumengetrieben als Hypertrophie behandelt. */
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
// Prompt-Bausteine laden
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

/** §4 des Zykluslängen-Moduls: feste Reihenfolge der Bausteine. */
function buildSystemPrompt(segment: CoachSegment): string {
  return [
    loadPrompt('SKILL.md'),
    loadPrompt(SEGMENT_REFERENCE[segment]),
    loadPrompt('exercises.md'),
    loadPrompt('sound.md'),
    loadPrompt('prompt-modul-zykluslaenge.md'),
  ].join('\n\n---\n\n');
}

// ---------------------------------------------------------------------------
// Validierung / Normalisierung der Modellantwort
// ---------------------------------------------------------------------------

/** Strukturfehler in der Modellantwort -> HTTP 422. */
class PlanValidationError extends Error {}

interface NormExercise {
  name: string;
  sets: number;
  repRange: [number, number];
  targetRPE: number;
  restSeconds: number;
  suggestedLoadKg?: number;
  cue?: string;
}
interface NormSession {
  dayIndex: number;
  name: string;
  isCalibration: boolean;
  focus: string[];
  exercises: NormExercise[];
}
interface NormWeek {
  weekIndex: number;
  phase: BlockPhase;
  intensityFactor: number;
  isDeload: boolean;
  sessions: NormSession[];
}
interface NormPlan {
  split: string;
  detailWeeks: NormWeek[];
  coachMessage: string;
}

const BLOCK_PHASES: BlockPhase[] = ['accumulation', 'intensification', 'peak', 'deload'];

function asRecord(v: unknown, ctx: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new PlanValidationError(`${ctx} muss ein Objekt sein.`);
  }
  return v as Record<string, unknown>;
}
function asArray(v: unknown, ctx: string): unknown[] {
  if (!Array.isArray(v)) throw new PlanValidationError(`${ctx} muss ein Array sein.`);
  return v;
}
function asNumber(v: unknown, ctx: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new PlanValidationError(`${ctx} muss eine Zahl sein.`);
  }
  return v;
}
function asString(v: unknown, ctx: string): string {
  if (typeof v !== 'string') throw new PlanValidationError(`${ctx} muss ein String sein.`);
  return v;
}

function toRepRange(v: unknown, ctx: string): [number, number] {
  const arr = asArray(v, ctx);
  if (arr.length !== 2) throw new PlanValidationError(`${ctx} muss [min, max] sein.`);
  return [asNumber(arr[0], `${ctx}[0]`), asNumber(arr[1], `${ctx}[1]`)];
}

/**
 * Extrahiert den JSON-Block aus der Modellantwort. Bevorzugt einen
 * ```json-Fence, fällt sonst auf das erste {...} zurück. Liefert zusätzlich
 * den Freitext davor (Fallback-coachMessage).
 */
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
  throw new PlanValidationError('Keine JSON-Struktur in der Modellantwort gefunden.');
}

function parseCoachPlan(raw: string): NormPlan {
  const { json, precedingText } = extractJson(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new PlanValidationError(
      `JSON-Block ist nicht parsebar: ${(err as Error).message}`,
    );
  }

  const root = asRecord(parsed, 'Antwort');
  const framework = asRecord(root.framework, 'framework');
  const split = typeof framework.split === 'string' ? framework.split : '';

  const detailRaw = asArray(root.detailWeeks, 'detailWeeks');
  if (detailRaw.length < 1) {
    throw new PlanValidationError('detailWeeks ist leer — mindestens Woche 1 muss ausdetailliert sein.');
  }

  const detailWeeks: NormWeek[] = detailRaw.map((wRaw, wi) => {
    const w = asRecord(wRaw, `detailWeeks[${wi}]`);
    const sessionsRaw = asArray(w.sessions, `detailWeeks[${wi}].sessions`);
    if (sessionsRaw.length < 1) {
      throw new PlanValidationError(`detailWeeks[${wi}].sessions ist leer.`);
    }

    const sessions: NormSession[] = sessionsRaw.map((sRaw, si) => {
      const s = asRecord(sRaw, `detailWeeks[${wi}].sessions[${si}]`);
      const exRaw = asArray(s.exercises, `detailWeeks[${wi}].sessions[${si}].exercises`);
      if (exRaw.length < 1) {
        throw new PlanValidationError(`detailWeeks[${wi}].sessions[${si}].exercises ist leer.`);
      }

      const exercises: NormExercise[] = exRaw.map((eRaw, ei) => {
        const ctx = `detailWeeks[${wi}].sessions[${si}].exercises[${ei}]`;
        const e = asRecord(eRaw, ctx);
        const ex: NormExercise = {
          name: asString(e.name, `${ctx}.name`),
          sets: asNumber(e.sets, `${ctx}.sets`),
          repRange: toRepRange(e.repRange, `${ctx}.repRange`),
          targetRPE: asNumber(e.targetRPE, `${ctx}.targetRPE`),
          restSeconds: asNumber(e.restSeconds, `${ctx}.restSeconds`),
        };
        if (typeof e.suggestedLoadKg === 'number' && Number.isFinite(e.suggestedLoadKg)) {
          ex.suggestedLoadKg = e.suggestedLoadKg;
        }
        if (typeof e.cue === 'string' && e.cue.trim()) ex.cue = e.cue.trim();
        return ex;
      });

      return {
        dayIndex: typeof s.dayIndex === 'number' ? s.dayIndex : si,
        name: typeof s.name === 'string' && s.name.trim() ? s.name.trim() : `Einheit ${si + 1}`,
        isCalibration: s.type === 'calibration',
        focus: Array.isArray(s.focus) ? s.focus.filter((f): f is string => typeof f === 'string') : [],
        exercises,
      };
    });

    return {
      weekIndex: typeof w.weekIndex === 'number' ? w.weekIndex : wi,
      phase: BLOCK_PHASES.includes(w.phase as BlockPhase) ? (w.phase as BlockPhase) : 'accumulation',
      intensityFactor:
        typeof w.intensityFactor === 'number' && Number.isFinite(w.intensityFactor)
          ? w.intensityFactor
          : 1,
      isDeload: w.isDeload === true,
      sessions,
    };
  });

  // Pflicht: Woche 1, Einheit 1 ist die Kalibrierung.
  detailWeeks[0].sessions[0].isCalibration = true;

  const coachMessage =
    typeof root.coachMessage === 'string' && root.coachMessage.trim()
      ? root.coachMessage.trim()
      : precedingText;

  return { split, detailWeeks, coachMessage };
}

// ---------------------------------------------------------------------------
// Mapping NormPlan -> typisierte PlanResponse (types.ts)
// ---------------------------------------------------------------------------

const MUSCLE_GROUPS: MuscleGroup[] = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads',
  'hamstrings', 'glutes', 'calves', 'core', 'full_body',
];

/** Best-effort: Übersetzt deutsche Fokus-Begriffe in MuscleGroup-Enums. */
const FOCUS_ALIASES: Record<string, MuscleGroup> = {
  brust: 'chest',
  rücken: 'back', ruecken: 'back',
  schulter: 'shoulders', schultern: 'shoulders',
  bizeps: 'biceps',
  trizeps: 'triceps',
  quadrizeps: 'quads', beine: 'quads', oberschenkel: 'quads',
  beinbeuger: 'hamstrings',
  gesäß: 'glutes', gesaess: 'glutes', po: 'glutes',
  waden: 'calves',
  rumpf: 'core', bauch: 'core',
  ganzkörper: 'full_body', ganzkoerper: 'full_body',
};

function toFocus(values: string[]): MuscleGroup[] {
  const out: MuscleGroup[] = [];
  for (const v of values) {
    const key = v.toLowerCase().trim();
    if (MUSCLE_GROUPS.includes(key as MuscleGroup)) {
      out.push(key as MuscleGroup);
    } else if (FOCUS_ALIASES[key]) {
      out.push(FOCUS_ALIASES[key]);
    }
  }
  return out;
}

/**
 * Mappt NormWeek[] -> PlanWeek[]. `weekIndexFor` bestimmt den Wochenindex
 * (Neustart: aus der Norm-Woche; Window: fortlaufend ans bestehende Framework).
 */
function mapDetailWeeks(
  detailWeeks: NormWeek[],
  frameworkId: string,
  now: string,
  weekIndexFor: (w: NormWeek, i: number) => number,
): PlanWeek[] {
  return detailWeeks.map((w, wi) => {
    const weekId = uuidv4();
    const sessions: PlannedSession[] = w.sessions.map((s) => {
      const sessionId = uuidv4();
      const exercises: PlannedExercise[] = s.exercises.map((ex, order) => ({
        id: uuidv4(),
        updatedAt: now,
        deletedAt: null,
        sessionId,
        // v1: kein Katalog im Request -> Platzhalter-Referenz, Name in notes.
        exerciseId: uuidv4(),
        order,
        targetSets: ex.sets,
        targetReps: ex.repRange,
        targetRPE: ex.targetRPE,
        restSeconds: ex.restSeconds,
        suggestedLoadKg: ex.suggestedLoadKg,
        notes: ex.cue ? `${ex.name} — ${ex.cue}` : ex.name,
      }));

      // Kalibrierung im Namen sichtbar machen (types.ts kennt kein type-Feld).
      const name =
        s.isCalibration && !/kalibr/i.test(s.name) ? `Kalibrierung — ${s.name}` : s.name;

      return {
        id: sessionId,
        updatedAt: now,
        deletedAt: null,
        weekId,
        dayIndex: s.dayIndex,
        name,
        // Robustes Typ-Feld (statt nur Name-String). Name behält den
        // "Kalibrierung — "-Prefix für Abwärtskompatibilität der Coach-Auswertung.
        type: s.isCalibration ? ('calibration' as const) : ('regular' as const),
        focus: toFocus(s.focus),
        exercises,
        workoutId: null,
        status: 'planned',
      };
    });

    return {
      id: weekId,
      updatedAt: now,
      deletedAt: null,
      frameworkId,
      weekIndex: weekIndexFor(w, wi),
      phase: w.phase,
      intensityFactor: w.intensityFactor,
      isDeload: w.isDeload,
      sessions,
    };
  });
}

function buildFramework(
  plan: NormPlan,
  profile: UserProfile,
  effectiveGoal: Goal,
  segment: CoachSegment,
  cycleLengthWeeks: number,
  coachVersion: string,
  now: string,
): PlanFramework {
  const frameworkId = uuidv4();
  const weeks = mapDetailWeeks(plan.detailWeeks, frameworkId, now, (w) => w.weekIndex);

  return {
    id: frameworkId,
    updatedAt: now,
    deletedAt: null,
    userId: profile.userId,
    name: `${SEGMENT_LABEL[segment]}-Zyklus (${cycleLengthWeeks} Wochen)`,
    goal: effectiveGoal,
    daysPerWeek: profile.daysPerWeek,
    totalWeeks: cycleLengthWeeks,
    cycleLengthWeeks,
    currentWeekIndex: 0,
    weeks,
    generatedAt: now,
    coachVersion,
    status: 'active',
  };
}

// ---------------------------------------------------------------------------
// User-Prompt
// ---------------------------------------------------------------------------

const OUTPUT_SCHEMA = `{
  "coachMessage": "1–3 Sätze im TRAIN-Sound: was der Plan ist, was zuerst zählt.",
  "framework": {
    "segment": "hypertrophie | maximalkraft | kraftausdauer",
    "level": "beginner | intermediate | advanced",
    "split": "z.B. GK/GK/GK oder OK/UK",
    "cycleLengthWeeks": <ZAHL — exakt der vorgegebene Wert>,
    "blocks": [
      { "name": "Akkumulation", "weeks": "1-4", "focus": "...", "volume": "hoch",
        "intensity": "moderat", "repRange": "10-15", "rpe": "9", "isDeload": false }
    ]
  },
  "detailWeeks": [
    {
      "weekIndex": 0, "phase": "accumulation", "intensityFactor": 0.9, "isDeload": false,
      "sessions": [
        {
          "dayIndex": 0, "name": "Kalibrierung — Ganzkörper", "type": "calibration",
          "focus": ["Brust", "Rücken", "Beine"],
          "exercises": [
            { "name": "Beinpresse", "sets": 3, "repRange": [8, 15], "targetRPE": 7,
              "restSeconds": 90, "suggestedLoadKg": null, "cue": "Voller ROM, Knie nicht nach innen" }
          ]
        }
      ]
    }
  ],
  "markers": []
}`;

function buildUserPrompt(
  profile: UserProfile,
  request: PlanRequest,
  segment: CoachSegment,
  cycleLengthWeeks: number,
  redirected: boolean,
): string {
  const lines: string[] = [];
  lines.push('Erstelle einen neuen Trainingsplan für diesen Klienten.');
  lines.push('');
  lines.push('NUTZERPROFIL');
  lines.push(`- Segment: ${SEGMENT_LABEL[segment]}`);
  lines.push(`- Level: ${profile.experience}`);
  lines.push(`- Trainingstage/Woche: ${profile.daysPerWeek}`);
  lines.push(`- Equipment: ${profile.equipment}`);
  lines.push(`- Geschlecht: ${profile.sex}`);
  if (profile.birthYear) lines.push(`- Jahrgang: ${profile.birthYear}`);
  if (profile.bodyweightKg) lines.push(`- Körpergewicht: ${profile.bodyweightKg} kg`);
  if (profile.notes?.trim()) lines.push(`- Notizen: ${profile.notes.trim()}`);
  lines.push('');

  const markers = request.markers ?? profile.markers ?? [];
  lines.push(`AKTIVE MARKER: ${markers.length ? JSON.stringify(markers) : 'keine'}`);
  const checkins = request.recentCheckins ?? [];
  lines.push(`LETZTE CHECK-INS: ${checkins.length ? JSON.stringify(checkins) : 'keine'}`);
  const workouts = request.recentWorkouts ?? [];
  lines.push(`LETZTE WORKOUTS: ${workouts.length ? `${workouts.length} vorhanden` : 'keine (Erstplan)'}`);
  lines.push('');

  lines.push('VERBINDLICHE VORGABEN (nicht ändern)');
  lines.push(
    `- cycleLengthWeeks = ${cycleLengthWeeks} (Single Source aus constants.ts). ` +
      'Deload ist die letzte Woche. Blockstruktur an diese Länge anpassen.',
  );
  lines.push('- Übungsauswahl, Reihenfolge und Stufen strikt nach exercises.md.');
  if (redirected) {
    lines.push(
      '- HINWEIS: Maximalkraft ist für Beginner nicht zulässig. Der Plan wird ' +
        'als Hypertrophie erstellt (Technik + Muskelbasis zuerst). Erkläre das ' +
        'in der coachMessage knapp im TRAIN-Sound.',
    );
  }
  lines.push('');

  lines.push('AUSGABE');
  lines.push(
    'Antworte mit GENAU einem ```json-Block in exakt dieser Struktur (Feldnamen ' +
      'unverändert, keine weiteren Codeblöcke):',
  );
  lines.push('```json');
  lines.push(OUTPUT_SCHEMA);
  lines.push('```');
  lines.push('');
  lines.push('Pflichten:');
  lines.push('- detailWeeks: die ersten 2 Wochen vollständig (Tage → Übungen → Sätze).');
  lines.push('- Woche 1, erste Einheit: "type": "calibration".');
  lines.push('- Jede Übung: repRange [min,max], targetRPE, restSeconds, cue; suggestedLoadKg nur wenn sinnvoll, sonst null.');
  lines.push('- letzter Block: "isDeload": true.');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Window-Update: User-Prompt für die nächsten 2 Wochen
// ---------------------------------------------------------------------------

/** Übungsname aus dem notes-Feld ("Name — cue"). */
function summarizeName(notes: string | undefined): string {
  if (!notes) return 'Übung';
  const i = notes.indexOf(' — ');
  return i === -1 ? notes : notes.slice(0, i);
}

function buildWindowUserPrompt(
  existingPlan: PlanResponse,
  completedWorkouts: Workout[],
  segment: CoachSegment,
  cycleLengthWeeks: number,
): string {
  const fw = existingPlan.framework;
  const existingWeeks = [...fw.weeks].sort((a, b) => a.weekIndex - b.weekIndex);
  const lastIndex = existingWeeks.length
    ? Math.max(...existingWeeks.map((w) => w.weekIndex))
    : -1;
  const nextA = lastIndex + 2; // 1-basiert für die Anzeige
  const nextB = lastIndex + 3;

  const lines: string[] = [];
  lines.push('ROLLING-WINDOW-UPDATE: Generiere die nächsten 2 Detail-Wochen — KEINEN neuen Plan.');
  lines.push('');
  lines.push(
    `Segment: ${SEGMENT_LABEL[segment]} | Zykluslänge: ${cycleLengthWeeks} Wochen | Plan: ${fw.name}`,
  );
  lines.push(
    `Bereits ausdetailliert: Woche 1–${lastIndex + 1}. Jetzt gefragt: Woche ${nextA} und ${nextB}.`,
  );
  lines.push('');
  lines.push('BISHERIGES FRAMEWORK (Wochen, Phasen, Übungen mit Zielen):');
  for (const w of existingWeeks) {
    lines.push(`Woche ${w.weekIndex + 1} | Phase ${w.phase}${w.isDeload ? ' (Deload)' : ''}`);
    for (const s of [...w.sessions].sort((a, b) => a.dayIndex - b.dayIndex)) {
      lines.push(`  Tag ${s.dayIndex + 1} — ${s.name}`);
      for (const pe of [...s.exercises].sort((a, b) => a.order - b.order)) {
        const reps =
          pe.targetReps[0] === pe.targetReps[1]
            ? `${pe.targetReps[0]}`
            : `${pe.targetReps[0]}–${pe.targetReps[1]}`;
        lines.push(
          `    ${summarizeName(pe.notes)}: ${pe.targetSets}×${reps} @ ${pe.suggestedLoadKg ?? '—'} kg, RPE ${pe.targetRPE}`,
        );
      }
    }
  }
  lines.push('');
  lines.push('WORKOUT-ERGEBNISSE (geloggte Sätze):');
  if (completedWorkouts.length === 0) {
    lines.push('  (keine abgeschlossenen Workouts übergeben)');
  } else {
    for (const wo of completedWorkouts) {
      lines.push(`Einheit: ${wo.name}`);
      for (const we of [...wo.exercises].sort((a, b) => a.order - b.order)) {
        const sets = [...we.sets].sort((a, b) => a.setNumber - b.setNumber);
        const txt = sets.map((s) => `${s.weightKg}kg×${s.reps}@${s.rpe ?? '-'}`).join(', ');
        lines.push(`  ${summarizeName(we.notes)}: ${txt || 'keine Sätze'}`);
      }
    }
  }
  lines.push('');
  lines.push('AUFGABE');
  lines.push(
    `Wende die Progressionsregeln (2-für-2 bzw. segmentspezifisch) auf die Ergebnisse an und ` +
      `generiere Woche ${nextA} und ${nextB} im Detail. Block-Phase passend zur Position im ` +
      `${cycleLengthWeeks}-Wochen-Zyklus (Deload nur als letzte Woche). Keine Kalibrierung mehr.`,
  );
  lines.push('');
  lines.push('AUSGABE');
  lines.push(
    'Antworte mit GENAU einem ```json-Block in dieser Struktur (framework wiederholen, ' +
      `detailWeeks = die 2 NEUEN Wochen mit weekIndex ${lastIndex + 1} und ${lastIndex + 2}):`,
  );
  lines.push('```json');
  lines.push(OUTPUT_SCHEMA);
  lines.push('```');
  lines.push(
    'Pflichten: detailWeeks = genau die 2 neuen Wochen; je Übung repRange/targetRPE/restSeconds/cue; ' +
      'suggestedLoadKg gesetzt (Progression eingerechnet); keine "calibration".',
  );

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// HTTP-Helfer
// ---------------------------------------------------------------------------

function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.status(status).json(body);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

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

  // 1) Request lesen. existingPlan/completedWorkouts sind Window-Extras (nicht
  // in PlanRequest, da types.ts geschützt) -> per Cast lesen.
  let reqBody: PlanRequest & { existingPlan?: PlanResponse; completedWorkouts?: Workout[] };
  try {
    reqBody = ((typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {}) as typeof reqBody;
  } catch {
    sendJson(res, 400, { error: 'bad_request', message: 'Body ist kein gültiges JSON.' });
    return;
  }

  const profile = reqBody.profile;
  if (!profile?.userId || !profile.goal || !profile.experience || !profile.daysPerWeek) {
    sendJson(res, 400, {
      error: 'bad_request',
      message: 'profile mit userId, goal, experience und daysPerWeek ist erforderlich.',
    });
    return;
  }

  const existingPlan = reqBody.existingPlan;
  const isWindow = !!(
    existingPlan?.framework &&
    Array.isArray(existingPlan.framework.weeks) &&
    existingPlan.framework.weeks.length > 0
  );

  // 2) Segment / Zykluslänge / User-Prompt — je nach Modus.
  let segment: CoachSegment;
  let effectiveGoal: Goal;
  let cycleLengthWeeks: number;
  let redirected = false;
  let userPrompt: string;

  if (isWindow && existingPlan) {
    // Window-Update: alles aus dem bestehenden Framework, kein Guard/Redirect.
    segment = goalToSegment(existingPlan.framework.goal);
    effectiveGoal = existingPlan.framework.goal;
    cycleLengthWeeks = existingPlan.framework.cycleLengthWeeks;
    userPrompt = buildWindowUserPrompt(
      existingPlan,
      reqBody.completedWorkouts ?? [],
      segment,
      cycleLengthWeeks,
    );
  } else {
    // Neustart: Guard (Maximalkraft+Beginner) + Zykluslänge aus constants.ts.
    segment = goalToSegment(profile.goal);
    effectiveGoal = profile.goal;
    if (segment === 'strength' && profile.experience === 'beginner') {
      redirected = true;
      segment = 'hypertrophy';
      effectiveGoal = 'hypertrophy';
    }
    const len = CYCLE_LENGTH_WEEKS[segment][profile.experience];
    if (len == null) {
      redirected = true;
      segment = 'hypertrophy';
      effectiveGoal = 'hypertrophy';
      cycleLengthWeeks = CYCLE_LENGTH_WEEKS.hypertrophy[profile.experience] ?? 8;
    } else {
      cycleLengthWeeks = len;
    }
    userPrompt = buildUserPrompt(profile, reqBody, segment, cycleLengthWeeks, redirected);
  }

  // 3) Claude rufen
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  let raw: string;
  try {
    const systemPrompt = buildSystemPrompt(segment);

    const client = new Anthropic();
    const message = await client.messages.create({
      model,
      max_tokens: 8000,
      // Thinking aus: Die Periodisierungslogik steckt bereits prägnant in den
      // Referenzdateien (SKILL/Segment/exercises). Ohne Thinking bleibt die
      // synchrone Antwortzeit deutlich unter dem Function-Timeout; das ist für
      // den "langsamen KI-Pfad" (Regel 8) hier der pragmatische Trade-off.
      thinking: { type: 'disabled' },
      // Prompt Caching (Kostenoptimierung): Der System-Prompt ist statisch
      // (SKILL + Segment-Referenz + exercises + sound + Zykluslänge) und über
      // alle Plan-Calls identisch -> als cache-baren Block markieren. Der
      // dynamische Teil (Profil/Logbuch/Anfrage) steht im user-message NACH
      // dem Breakpoint und bleibt ungecacht. Min. cache-barer Prefix bei
      // claude-sonnet-4-6 = 2048 Tokens; der System-Prompt liegt deutlich
      // darüber. Pro Segment entsteht ein eigener Cache-Eintrag (5min TTL).
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userPrompt }],
    });

    // Cache-Wirkung in den Vercel-Logs sichtbar machen.
    const usage = message.usage;
    console.log(
      `[claude-plan] cache_creation=${usage.cache_creation_input_tokens ?? 0} ` +
        `cache_read=${usage.cache_read_input_tokens ?? 0} ` +
        `input=${usage.input_tokens} output=${usage.output_tokens}`,
    );

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

  // 4) Antwort trennen + validieren
  let plan: NormPlan;
  try {
    plan = parseCoachPlan(raw);
  } catch (err) {
    if (err instanceof PlanValidationError) {
      sendJson(res, 422, { error: 'unprocessable_plan', message: err.message });
      return;
    }
    throw err;
  }

  // 5) PlanResponse bauen
  const now = new Date().toISOString();
  const coachVersion = `${model}/plan-v1`;

  // 5a) Window-Update: neue Wochen ans bestehende Framework anhängen.
  if (isWindow && existingPlan) {
    const fw = existingPlan.framework;
    const existingMax = Math.max(...fw.weeks.map((w) => w.weekIndex));
    const newWeeks = mapDetailWeeks(plan.detailWeeks, fw.id, now, (_w, i) => existingMax + 1 + i);
    const framework: PlanFramework = {
      ...fw,
      weeks: [...fw.weeks, ...newWeeks],
      updatedAt: now,
    };
    const windowAction: CoachAction = {
      id: uuidv4(),
      updatedAt: now,
      deletedAt: null,
      userId: fw.userId,
      type: 'maintain',
      rationale:
        plan.coachMessage ||
        `Nächste 2 Wochen generiert (Woche ${existingMax + 2}–${existingMax + 3}).`,
      targetId: fw.id,
      payload: {
        kind: 'window_generated',
        fromWeek: existingMax + 2,
        toWeek: existingMax + 3,
        coachVersion,
      },
      accepted: null,
      createdAt: now,
    };
    sendJson(res, 200, {
      framework,
      actions: [...existingPlan.actions, windowAction],
    } satisfies PlanResponse);
    return;
  }

  // 5b) Neustart: vollständiges Framework.
  const framework = buildFramework(
    plan,
    profile,
    effectiveGoal,
    segment,
    cycleLengthWeeks,
    coachVersion,
    now,
  );

  // CoachActions: Plan-Erstellung dokumentieren (Regel 5, auditierbar).
  // Hinweis: CoachActionType kennt kein 'create'/'redirect' — 'maintain'
  // ("Kurs halten") ist die neutrale, passendste Kategorie für einen frischen Plan.
  const actions: CoachAction[] = [];
  if (redirected) {
    actions.push({
      id: uuidv4(),
      updatedAt: now,
      deletedAt: null,
      userId: profile.userId,
      type: 'maintain',
      rationale:
        'Maximalkraft für Beginner nicht zulässig (≥6 Monate Basis nötig). ' +
        'Auf Hypertrophie umgeleitet — Technik und Muskelbasis zuerst.',
      targetId: framework.id,
      payload: { kind: 'goal_redirect', from: 'strength', to: 'hypertrophy' },
      accepted: null,
      createdAt: now,
    });
  }
  actions.push({
    id: uuidv4(),
    updatedAt: now,
    deletedAt: null,
    userId: profile.userId,
    type: 'maintain',
    rationale:
      plan.coachMessage ||
      `Plan erstellt: ${SEGMENT_LABEL[segment]}, ${cycleLengthWeeks} Wochen.`,
    targetId: framework.id,
    payload: {
      kind: 'plan_created',
      segment,
      cycleLengthWeeks,
      split: plan.split,
      coachVersion,
    },
    accepted: null,
    createdAt: now,
  });

  const response: PlanResponse = { framework, actions };
  sendJson(res, 200, response);
}
