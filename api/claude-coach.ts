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
  ExperienceLevel,
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

/**
 * 'stopped' = Übung abgebrochen/nicht gewertet (Schmerz, Stopp-Signal). Kein
 * normales Urteil, keine Lastwertung — dafür gibt es sonst keinen Zustand.
 */
type Verdict =
  | 'in_range'
  | 'above_range'
  | 'below_range'
  | 'rpe_low'
  | 'stagnation'
  | 'stopped';
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
  // --- Payload-Felder je Marker-Typ (§10). Werden unverändert durchgereicht,
  // damit z. B. EXERCISE_SWAP serverseitig nicht ins Leere läuft. ---
  /** EXERCISE_SWAP / EXERCISE_UPGRADE: Ersatz-/Zielübung. */
  newExerciseId?: string;
  newName?: string;
  newCue?: string;
  newLevel?: number;
  /** EXERCISE_SWAP: 'this_week' | 'permanent'. */
  scope?: string;
  /** SESSION_ADJUSTMENT: z. B. '-1_set_per_exercise'. */
  volumeChange?: string;
  sessionName?: string;
  /** DELOAD: Volumenanteil, z. B. 0.6. */
  volumeReduction?: number;
  /** ILLNESS_RECOVERY. */
  weeksOff?: number;
  returnLoad?: number;
  rampWeeks?: number;
  /** VACATION_MODE. */
  startDate?: string;
  endDate?: string;
  mode?: string;
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

const EXPERIENCE_LABEL: Record<ExperienceLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

/**
 * Wie viele frühere Einheiten je Übung der Coach braucht. Die "2 Einheiten in
 * Folge"-Regel vergleicht die aktuelle Einheit mit der vorherigen — zwei
 * Vorgänger geben genug Kontext (Streak + Stagnation), mehr ist Ballast.
 */
const HISTORY_SESSIONS_PER_EXERCISE = 2;

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
/**
 * Verbindliche Zusatzregeln für die Marker-Erzeugung und die Laststeuerung.
 * Schärft, was in SKILL §9/§10 sonst nur implizit steht — ohne die Fachregeln
 * selbst umzuschreiben.
 */
const COACH_RULES = `# Verbindliche Regeln für diese Auswertung

## Marker-Wahl (nicht verhandelbar)
- Lastanpassung einer Übung -> \`LOAD_ADJUSTMENT\` (exerciseName + delta).
- Tagesform/Readiness GELB (schlechter Schlaf, wenig Energie, Stress) ->
  \`SESSION_ADJUSTMENT\` mit volumeChange (z. B. "-1_set_per_exercise").
  NIEMALS die Last senken, nur weil die Tagesform gelb ist — Gelb reduziert
  VOLUMEN, nicht Gewicht. Eine Lastsenkung braucht einen eigenen Grund aus den
  Satzdaten (Reps unter Range bei Ziel-RPE).
- Schmerz, der den Bewegungsablauf verändert, oder Gerät besetzt ->
  \`EXERCISE_SWAP\`. Pflichtfelder: exerciseName (alt), newName (Ersatzübung aus
  derselben Familie) und newExerciseId. Ohne newName/newExerciseId ist der
  Marker wertlos — dann lieber gar keinen Marker setzen.
- Stabile Performance über mehrere Wochen / Übung dauerhaft zu leicht ->
  \`EXERCISE_UPGRADE\` mit exerciseName + newName (+ newExerciseId, newLevel).
- Krankheit -> \`ILLNESS_RECOVERY\`, Urlaub -> \`VACATION_MODE\`,
  Blockende/reaktive Entlastung -> \`DELOAD\`.

## Laststeuerung
- Maximal EINE Stufe pro Auswertung: ±2,5 kg. Niemals +5, +7,5 oder −5 in
  einem Schritt. Wenn die Last grob danebenliegt, korrigiere eine Stufe und
  sag an, dass in der nächsten Einheit nachjustiert wird.
- delta eines LOAD_ADJUSTMENT ist dieselbe eine Stufe (+2,5 / −2,5).

## Abbruch / Schmerz
- Wurde eine Übung wegen Schmerz oder einem anderen Stopp-Signal abgebrochen,
  ist das verdict \`stopped\` — NICHT in_range/below_range o. Ä.
- Bei \`stopped\`: adjustment IMMER "maintain", KEIN newLoad, KEINE Rep-/RPE-
  Wertung, KEIN LOAD_ADJUSTMENT. Die Übung wird nicht bewertet, nur versorgt
  (in der Regel \`EXERCISE_SWAP\`).

## Progression nur mit echter Historie
- "2 Einheiten in Folge" darfst du NUR behaupten, wenn die übergebene Historie
  das belegt. Ohne passende Vorgänger-Einheit: keine Progression, keine
  "zweite Woche in Folge"-Formulierung — dann ist die Einheit die Baseline.
- Erfinde niemals Vorgeschichte aus dem Einheits- oder Übungsnamen.

## RPE-Obergrenze (Level-/Phasen-Schutz)
- Das je Übung angegebene RPE-Ziel ist eine OBERGRENZE, kein Mindestwert.
  Rate NIEMALS, darüber hinauszugehen.
- Liegt das RPE-Ziel bei ≤ 7, ist das eine bewusste Beginner-/Technikphase:
  KEIN "geh ans Limit", KEIN "ans Versagen", KEIN "das war nur Aufwärmen".
  Richtig ist dann: Technik und saubere Reps loben, Last nur erhöhen, wenn die
  Reps über dem oberen Range-Ende liegen — und auch dann nur eine Stufe.`;

function buildSystemPrompt(segment: CoachSegment): string {
  const skill = loadPrompt('SKILL.md');
  const supervisor = extractSection(skill, '## Schritt 7');
  const evaluation = extractSection(skill, '## Schritt 9');
  // §10 = Marker-Vokabular inkl. Payloads (SESSION_ADJUSTMENT, EXERCISE_SWAP
  // mit newExerciseId, EXERCISE_UPGRADE, ILLNESS_RECOVERY, VACATION_MODE).
  const markerVocab = extractSection(skill, '## Schritt 10');
  const segmentEval = extractSection(loadPrompt(SEGMENT_REFERENCE[segment]), '## Auswertungslogik');

  return [
    'Du bist der Strength-Coach. Werte die abgeschlossene Trainingseinheit aus — ' +
      'im TRAIN-Sound, mit einer klaren Konsequenz pro Übung. Wende die folgenden ' +
      'Supervisor- und Auswertungsregeln strikt an.',
    supervisor,
    evaluation,
    markerVocab,
    `# Segmentspezifische Auswertung (${SEGMENT_LABEL[segment]})\n\n${segmentEval}`,
    COACH_RULES,
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
      "verdict": "in_range | above_range | below_range | rpe_low | stagnation | stopped",
      "currentLoad": 40,
      "adjustment": "maintain | increase | decrease",
      "newLoad": 42.5,
      "rationale": "40 kg x 15/15/14 bei RPE 9. Zweite Woche am oberen Ende. Nächste Woche: 42,5 kg."
    }
  ],
  "markers": [
    { "type": "LOAD_ADJUSTMENT", "exerciseName": "Brustpresse", "delta": 2.5, "reason": "2x in Folge alle Sätze >= oberes Range-Ende bei Ziel-RPE" },
    { "type": "SESSION_ADJUSTMENT", "volumeChange": "-1_set_per_exercise", "sessionName": "Push A", "reason": "Tagesform gelb — Volumen runter, Last bleibt" },
    { "type": "EXERCISE_SWAP", "exerciseName": "Bankdrücken", "newName": "Brustpresse (Maschine)", "newExerciseId": "brustpresse-maschine", "newCue": "Schulterblätter zusammen, kontrolliert drücken", "scope": "this_week", "reason": "Schulterschmerz 6/10 verändert den Bewegungsablauf" },
    { "type": "EXERCISE_UPGRADE", "exerciseName": "Beinpresse", "newName": "KH-Kniebeuge", "newExerciseId": "kh-kniebeuge", "newLevel": 2, "reason": "Stabile Performance, Übung dauerhaft zu leicht" },
    { "type": "DELOAD", "volumeReduction": 0.6, "reason": "RPE 2 Wochen konstant >= 9 ohne Progression" },
    { "type": "ILLNESS_RECOVERY", "weeksOff": 1, "returnLoad": 0.8, "rampWeeks": 2, "reason": "Krankheit gemeldet" },
    { "type": "VACATION_MODE", "startDate": "2026-07-01", "endDate": "2026-07-14", "mode": "pause", "reason": "Urlaub" }
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

/** Cue aus dem notes-Feld ("Name — cue"). */
function splitCue(notes: string | undefined): string {
  if (!notes) return '';
  const i = notes.indexOf(' — ');
  return i === -1 ? '' : notes.slice(i + 3);
}

type CoachInputMode = 'weight_reps' | 'time' | 'cardio' | 'bodyweight_reps';

/** Eingabe-Modus serverseitig ableiten (gespiegelt zu inputModeService). */
function resolveMode(pe: PlannedExercise | undefined, name: string, cue: string): CoachInputMode {
  const m = pe?.inputMode;
  if (m === 'weight_reps' || m === 'time' || m === 'cardio' || m === 'bodyweight_reps') return m;
  // Cardio NUR über den Namen (Gerät / Aufwärmen), nie über den Cue — sonst
  // markiert der Aufwärmsatz-Text im Cue ("Aufwärmsätze: …") Kraftübungen wie
  // "Beinpresse (Maschine)" fälschlich als Cardio (identisch zu inputModeService).
  if (/ergometer|laufband|crosstrainer|crosser|ruderergometer|rudergerät|stepper|fahrrad|aufwärm/i.test(name)) {
    return 'cardio';
  }
  const hay = `${name} ${cue}`;
  if (
    /plank|planke|unterarmst(?:ü|u)tz|dead.?bug|\bhold\b|isometr/i.test(name) ||
    /\b\d{2,}\s*(?:s\b|sek\b|sekunden\b)/i.test(hay)
  ) {
    return 'time';
  }
  if (/körpergewicht|liegestütz|push.?up/i.test(hay)) return 'bodyweight_reps';
  return 'weight_reps';
}

function formatReps(range: [number, number]): string {
  return range[0] === range[1] ? `${range[0]}` : `${range[0]}–${range[1]}`;
}

/** Kompakte Satzliste einer früheren Einheit: "40kg×12@9, 40kg×12@9". */
function formatHistorySets(we: WorkoutExercise): string {
  return [...we.sets]
    .sort((a, b) => a.setNumber - b.setNumber)
    .map((s) => {
      if (typeof s.cardioMinutes === 'number') return `${s.cardioMinutes}min`;
      if (typeof s.durationSeconds === 'number') return `${s.durationSeconds}s@${s.rpe ?? '-'}`;
      return `${s.weightKg ?? 0}kg×${s.reps ?? 0}@${s.rpe ?? '-'}`;
    })
    .join(', ');
}

/** Kurzes Datum "15.06." für die Historie. */
function shortDate(iso: string | undefined): string {
  const ms = Date.parse(iso ?? '');
  if (Number.isNaN(ms)) return '—';
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
}

/**
 * Frühere Einheiten DERSELBEN Übung (Match über den Namen, da exerciseId ein
 * Platzhalter ist), neueste zuerst, maximal HISTORY_SESSIONS_PER_EXERCISE.
 * Geskippte Übungen sind im Payload bereits entfernt und tauchen hier nicht
 * auf — eine übersprungene Einheit unterbricht die Kette also weder positiv
 * noch negativ.
 */
function historyForExercise(name: string, history: Workout[]): string[] {
  const rows: { date: string; sets: string }[] = [];
  const sorted = [...history].sort(
    (a, b) => Date.parse(b.date ?? '') - Date.parse(a.date ?? ''),
  );
  for (const wo of sorted) {
    for (const we of wo.exercises) {
      if (splitName(we.notes) !== name) continue;
      if (we.sets.length === 0) continue;
      rows.push({ date: shortDate(wo.date), sets: formatHistorySets(we) });
      break;
    }
    if (rows.length >= HISTORY_SESSIONS_PER_EXERCISE) break;
  }
  return rows.map((r) => `  ${r.date} ${r.sets}`);
}

function buildUserPrompt(
  workout: Workout,
  segment: CoachSegment,
  cycleLengthWeeks: number,
  weekIndex: number | null,
  isCalibration: boolean,
  plannedExercises: PlannedExercise[],
  history: Workout[],
  experience: ExperienceLevel | null,
): string {
  const lines: string[] = [];
  lines.push('AUSWERTUNG DER ABGESCHLOSSENEN EINHEIT');
  lines.push('');
  lines.push(
    `Segment: ${SEGMENT_LABEL[segment]} | Zykluslänge: ${cycleLengthWeeks} Wochen` +
      (weekIndex != null ? ` | Woche ${weekIndex + 1}` : ''),
  );
  lines.push(`Einheit: ${workout.name}${isCalibration ? ' (Kalibrierung)' : ''}`);

  // Level-Cap: primär aus dem echten experience-Feld, sonst aus dem plan-seitigen
  // targetRPE (das Level ist dort mitkodiert) als Fallback.
  const rpeTargets = plannedExercises
    .map((pe) => pe.targetRPE)
    .filter((r): r is number => typeof r === 'number' && r > 0);
  const maxRpe = rpeTargets.length > 0 ? Math.max(...rpeTargets) : null;

  if (experience) {
    lines.push(`Trainingserfahrung: ${EXPERIENCE_LABEL[experience]}`);
    if (experience === 'beginner') {
      lines.push(
        'LEVEL-CAP (Beginner, nicht verhandelbar): NIE RPE 10. In den ersten ' +
          'Wochen ist RPE 7 das Ziel — Technik vor Intensität. Rate NIEMALS zu ' +
          '"ans Limit", "ans Versagen" oder "da war mehr drin". Saubere Reps sind ' +
          'das Ergebnis, nicht ein Zwischenschritt.',
      );
    }
  }
  if (maxRpe != null) {
    lines.push(
      `RPE-OBERGRENZE dieser Einheit: ${maxRpe} (aus dem Plan). Das ist das Maximum, ` +
        'kein Mindestwert — rate NIE, darüber hinauszugehen.' +
        (maxRpe <= 7
          ? ' Achtung: RPE-Ziel ≤ 7 = bewusste Beginner-/Technikphase. KEIN "ans Limit", ' +
            'KEIN "ans Versagen", KEIN "das war nur Aufwärmen". Saubere Technik ist hier das Ziel.'
          : ''),
    );
  }
  lines.push('');
  lines.push('SATZ-DATEN');

  const MODE_LABEL: Record<CoachInputMode, string> = {
    weight_reps: 'Gewicht×Reps',
    time: 'Zeit (Sekunden)',
    cardio: 'Cardio (Minuten)',
    bodyweight_reps: 'Körpergewicht-Reps',
  };

  const exercises = [...workout.exercises].sort((a, b) => a.order - b.order);
  exercises.forEach((we: WorkoutExercise, i) => {
    const pe = plannedExercises[i];
    const name = splitName(we.notes);
    const mode = resolveMode(pe, name, splitCue(we.notes));
    const repRange = pe ? formatReps(pe.targetReps) : '—';
    const rpeTarget = pe ? `${pe.targetRPE}` : '—';
    lines.push('');
    if (mode === 'weight_reps' || mode === 'bodyweight_reps') {
      lines.push(`Übung: ${name} | Typ: ${MODE_LABEL[mode]} | Rep-Range: ${repRange} | RPE-Ziel: ${rpeTarget}`);
    } else {
      lines.push(`Übung: ${name} | Typ: ${MODE_LABEL[mode]}`);
    }
    const sets = [...we.sets].sort((a, b) => a.setNumber - b.setNumber);
    if (sets.length === 0) {
      lines.push('  (keine Sätze erfasst)');
    } else {
      for (const s of sets) {
        if (mode === 'cardio') {
          lines.push(
            `Satz ${s.setNumber}: ${s.cardioMinutes ?? 0} min${s.cardioMachine ? ` (${s.cardioMachine})` : ''}`,
          );
        } else if (mode === 'time') {
          lines.push(`Satz ${s.setNumber}: ${s.durationSeconds ?? 0}s gehalten | RPE ${s.rpe ?? '-'}`);
        } else if (mode === 'bodyweight_reps') {
          lines.push(
            `Satz ${s.setNumber}: Körpergewicht${s.weightKg ? ` +${s.weightKg} kg` : ''} × ${s.reps ?? 0} | RPE ${s.rpe ?? '-'}`,
          );
        } else {
          lines.push(`Satz ${s.setNumber}: ${s.weightKg ?? 0} kg × ${s.reps ?? 0} | RPE ${s.rpe ?? '-'}`);
        }
      }
    }
  });

  // --- Historie: Grundlage für "2 Einheiten in Folge". Ohne sie darf der Coach
  // keine Progressionsbehauptung aufstellen. ---
  lines.push('');
  lines.push('VORHERIGE EINHEITEN DERSELBEN ÜBUNGEN (neueste zuerst)');
  const historyBlocks: string[] = [];
  for (const we of exercises) {
    const name = splitName(we.notes);
    const rows = historyForExercise(name, history);
    if (rows.length > 0) historyBlocks.push(`${name}:`, ...rows);
  }
  if (historyBlocks.length === 0) {
    lines.push('  (keine früheren Einheiten dieser Übungen vorhanden)');
    lines.push(
      'KEINE HISTORIE: Du darfst KEINE Progression mit "2 Einheiten in Folge" o. Ä. ' +
        'begründen und NICHT behaupten, etwas sei "zweite Woche in Folge". Diese ' +
        'Einheit ist die Baseline — Last bleibt, Progression wird erst mit der ' +
        'nächsten vergleichbaren Einheit entschieden.',
    );
  } else {
    lines.push(...historyBlocks);
    lines.push(
      'Progression ausschließlich auf Basis dieser echten Historie bewerten. ' +
        'Eine Übung, die hier fehlt, hat keine verwertbare Vorgeschichte (z. B. ' +
        'übersprungen) — sie zählt weder als Fortschritt noch als Rückschritt; ' +
        'dann keine Progressionsbehauptung.',
    );
  }

  lines.push('');
  lines.push(
    'EINGABE-TYPEN: Übungen werden unterschiedlich geloggt — Gewicht×Reps, Zeit ' +
      '(Sekunden gehalten, z. B. Plank), Cardio (Minuten am Gerät, z. B. Aufwärmen) oder ' +
      'Körpergewicht-Reps. Zeit-Übungen über die gehaltene Dauer bewerten (ggf. Zeit ' +
      'steigern statt Last). Körpergewicht-Reps wie Reps werten, ohne Last-Logik. ' +
      'Cardio/Aufwärmen wird NICHT progrediert — nur als erledigt vermerken ' +
      '(adjustment "maintain", kein Marker, currentLoad 0).',
  );

  if (isCalibration) {
    lines.push('');
    lines.push(
      'KALIBRIERUNG: Diese Einheit legt die Startgewichte fest. Gib für JEDE Übung ' +
        'das ermittelte Arbeitsgewicht (die Last bei RPE 6–7, bei der die untere ' +
        'Rep-Range erreicht wurde) als `newLoad` (absolut, in kg) im evaluation-Eintrag ' +
        'an — nicht nur im Text. Setze pro Übung zusätzlich genau einen ' +
        '`LOAD_ADJUSTMENT`-Marker (exerciseName + reason), damit das Startgewicht in den ' +
        'Plan übernommen wird.',
    );
  }

  lines.push('');
  lines.push('AUSGABE');
  lines.push(
    'Antworte mit GENAU einem ```json-Block in exakt dieser Struktur (Feldnamen ' +
      'unverändert, keine weiteren Codeblöcke). `newLoad` nur wenn adjustment != ' +
      '"maintain". `overallRPE` IMMER als Zahl angeben — wenn keine Arbeitssätze ' +
      'geloggt wurden (z. B. Abbruch wegen Schmerz), gib 0 an.',
  );
  lines.push(
    'Der markers-Block unten ist ein TYP-KATALOG: Setze NUR die Marker, die hier ' +
      'wirklich anstehen (meist 0 oder 1), mit allen Pflichtfeldern des jeweiligen ' +
      'Typs. Steht nichts an: "markers": [].',
  );
  lines.push('```json');
  lines.push(OUTPUT_SCHEMA);
  lines.push('```');
  lines.push('Pro Übung genau ein evaluation-Eintrag. Konsequenz im rationale (TRAIN-Sound).');
  lines.push(
    'Lastanpassung: maximal EINE Stufe (±2,5 kg) pro Auswertung — in newLoad UND im ' +
      'LOAD_ADJUSTMENT-delta.',
  );

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
function asString(v: unknown, ctx: string): string {
  if (typeof v !== 'string') throw new CoachValidationError(`${ctx} muss ein String sein.`);
  return v;
}

const VERDICTS: Verdict[] = [
  'in_range',
  'above_range',
  'below_range',
  'rpe_low',
  'stagnation',
  'stopped',
];
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

/** Tolerant: Zahl bleibt Zahl, String ("8.5"/"8,5") wird geparst, sonst null. */
function coerceNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(',', '.').trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Optionaler String aus dem Marker-Payload. */
function strOpt(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/**
 * Durchschnitts-RPE der geloggten Arbeitssätze — Fallback, wenn das Modell
 * `overallRPE` nicht (oder nicht als Zahl) liefert. 0, wenn keine Sätze mit
 * RPE vorliegen (z. B. Abbruch wegen Schmerz) — dann ist 0 die ehrliche Angabe.
 */
function fallbackOverallRpe(workout: Workout): number {
  const rpes = workout.exercises
    .flatMap((ex) => ex.sets)
    .filter((s) => !s.isWarmup && typeof s.rpe === 'number')
    .map((s) => s.rpe as number);
  if (rpes.length === 0) return 0;
  return Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10;
}

function parseCoachEvaluation(raw: string, fallbackRpe: number): CoachEvaluation {
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
    // Tolerant statt harter Abbruch: bei Abbruch-/Schmerzfällen liefert das
    // Modell currentLoad/rationale gelegentlich nicht — kein Grund für 422.
    const item: CoachEvaluationItem = {
      exerciseName: asString(er.exerciseName, `evaluation[${i}].exerciseName`),
      verdict: verdict as Verdict,
      currentLoad: coerceNumber(er.currentLoad) ?? 0,
      adjustment: adjustment as Adjustment,
      rationale: typeof er.rationale === 'string' ? er.rationale : '',
    };
    const newLoad = coerceNumber(er.newLoad);
    if (newLoad !== null) item.newLoad = newLoad;
    return item;
  });

  const markers: CoachMarker[] = asArray(root.markers ?? [], 'markers').map((m, i) => {
    const mr = asRecord(m, `markers[${i}]`);
    const marker: CoachMarker = {
      type: asString(mr.type, `markers[${i}].type`),
      reason: typeof mr.reason === 'string' ? mr.reason : '',
    };
    if (typeof mr.exerciseName === 'string') marker.exerciseName = mr.exerciseName;
    const delta = coerceNumber(mr.delta);
    if (delta !== null) marker.delta = delta;
    // Typ-spezifische Payload-Felder (§10) unverändert durchreichen — sonst
    // läuft z. B. EXERCISE_SWAP ohne newName/newExerciseId ins Leere.
    marker.newExerciseId = strOpt(mr.newExerciseId);
    marker.newName = strOpt(mr.newName);
    marker.newCue = strOpt(mr.newCue);
    marker.scope = strOpt(mr.scope);
    marker.volumeChange = strOpt(mr.volumeChange);
    marker.sessionName = strOpt(mr.sessionName);
    marker.startDate = strOpt(mr.startDate);
    marker.endDate = strOpt(mr.endDate);
    marker.mode = strOpt(mr.mode);
    const newLevel = coerceNumber(mr.newLevel);
    if (newLevel !== null) marker.newLevel = newLevel;
    const volumeReduction = coerceNumber(mr.volumeReduction);
    if (volumeReduction !== null) marker.volumeReduction = volumeReduction;
    const weeksOff = coerceNumber(mr.weeksOff);
    if (weeksOff !== null) marker.weeksOff = weeksOff;
    const returnLoad = coerceNumber(mr.returnLoad);
    if (returnLoad !== null) marker.returnLoad = returnLoad;
    const rampWeeks = coerceNumber(mr.rampWeeks);
    if (rampWeeks !== null) marker.rampWeeks = rampWeeks;
    // undefined-Felder wieder entfernen, damit die Antwort schlank bleibt.
    for (const k of Object.keys(marker) as (keyof CoachMarker)[]) {
      if (marker[k] === undefined) delete marker[k];
    }
    return marker;
  });

  const coachMessage =
    typeof root.coachMessage === 'string' && root.coachMessage.trim()
      ? root.coachMessage.trim()
      : precedingText;

  // overallRPE tolerant: Zahl, Zahl-String, sonst Fallback aus den Satzdaten.
  // Kein harter Abbruch mehr — Schmerz-/Stoppfälle liefern sonst 422.
  const overallRPE = coerceNumber(root.overallRPE) ?? fallbackRpe;

  return {
    evaluation,
    markers,
    overallRPE,
    coachMessage,
  };
}

// ---------------------------------------------------------------------------
// Plan-Kontext
// ---------------------------------------------------------------------------

/** Eine Laststufe laut Skills. */
const LOAD_STEP_KG = 2.5;

/** Auf 2,5-kg-Raster runden (nie negativ). */
function round25(x: number): number {
  return Math.max(0, Math.round(x / LOAD_STEP_KG) * LOAD_STEP_KG);
}

/**
 * Hard-Clamp: maximal EINE Laststufe (±2,5 kg) pro Auswertung — in `newLoad`
 * und im zugehörigen LOAD_ADJUSTMENT-delta. Verhindert Sprünge wie +7,5/−5.
 *
 * Ausnahme Kalibrierung: dort ist `newLoad` das absolut ermittelte
 * Startgewicht und KEIN Schritt relativ zu currentLoad — nicht clampen.
 */
/**
 * 'stopped' (Abbruch/Schmerz) ist keine Wertung: adjustment hart auf
 * 'maintain', kein newLoad, und ein etwaiger LOAD_ADJUSTMENT für diese Übung
 * fliegt raus. Verhindert, dass ein Schmerzfall als Lastentscheidung durchgeht.
 */
function enforceStopped(ev: CoachEvaluation): void {
  const stopped = new Set<string>();
  for (const item of ev.evaluation) {
    if (item.verdict !== 'stopped') continue;
    stopped.add(item.exerciseName);
    item.adjustment = 'maintain';
    delete item.newLoad;
  }
  if (stopped.size === 0) return;
  ev.markers = ev.markers.filter(
    (m) => !(m.type === 'LOAD_ADJUSTMENT' && m.exerciseName && stopped.has(m.exerciseName)),
  );
}

function clampLoadSteps(ev: CoachEvaluation, isCalibration: boolean): void {
  if (isCalibration) return;

  const clampedByName = new Map<string, number>();
  for (const item of ev.evaluation) {
    if (item.adjustment === 'maintain' || item.newLoad == null) continue;
    const base = item.currentLoad;
    const raw = item.newLoad - base;
    if (raw === 0) continue;
    const dir = raw > 0 ? 1 : -1;
    const capped = round25(base + dir * LOAD_STEP_KG);
    if (capped !== item.newLoad) item.newLoad = capped;
    clampedByName.set(item.exerciseName, dir * LOAD_STEP_KG);
  }

  for (const m of ev.markers) {
    if (m.type !== 'LOAD_ADJUSTMENT' || typeof m.delta !== 'number' || m.delta === 0) continue;
    const fromItem = m.exerciseName ? clampedByName.get(m.exerciseName) : undefined;
    const dir = m.delta > 0 ? 1 : -1;
    m.delta = fromItem ?? dir * LOAD_STEP_KG;
  }
}

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
  let body: {
    workout?: Workout;
    plan?: PlanResponse;
    /** Frühere abgeschlossene Einheiten (für die "2 in Folge"-Regel). */
    history?: Workout[];
    /** Trainingserfahrung für den Level-Cap. */
    experience?: string;
  };
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {};
  } catch {
    sendJson(res, 400, { error: 'bad_request', message: 'Body ist kein gültiges JSON.' });
    return;
  }

  const workout = body.workout;
  const plan = body.plan;
  const history = Array.isArray(body.history)
    ? body.history.filter((w) => w && Array.isArray(w.exercises))
    : [];
  const experience: ExperienceLevel | null =
    body.experience === 'beginner' ||
    body.experience === 'intermediate' ||
    body.experience === 'advanced'
      ? body.experience
      : null;
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
      history,
      experience,
    );

    const client = new Anthropic();
    const message = await client.messages.create({
      model,
      max_tokens: 8000,
      thinking: { type: 'disabled' },
      // Prompt Caching (Kostenoptimierung): Der System-Prompt ist statisch
      // (SKILL + Segment-Auswertungslogik + sound + Zykluslänge) und über alle
      // Coach-Calls identisch -> als cache-baren Block markieren. Der
      // dynamische Teil (Workout-Logbuch/Kontext) steht im user-message NACH
      // dem Breakpoint und bleibt ungecacht (5min TTL, Eintrag je Segment).
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userPrompt }],
    });

    // Cache-Wirkung in den Vercel-Logs sichtbar machen.
    const usage = message.usage;
    console.log(
      `[claude-coach] cache_creation=${usage.cache_creation_input_tokens ?? 0} ` +
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

  // 4) Validieren + zurückgeben
  let evaluation: CoachEvaluation;
  try {
    evaluation = parseCoachEvaluation(raw, fallbackOverallRpe(workout));
  } catch (err) {
    if (err instanceof CoachValidationError) {
      sendJson(res, 422, { error: 'unprocessable_evaluation', message: err.message });
      return;
    }
    throw err;
  }

  // Abbruch/Schmerz entwerten, dann Hard-Clamp auf eine Laststufe
  // (Kalibrierung ausgenommen — dort ist newLoad das absolute Startgewicht).
  enforceStopped(evaluation);
  clampLoadSteps(evaluation, isCalibration);

  sendJson(res, 200, evaluation);
}
