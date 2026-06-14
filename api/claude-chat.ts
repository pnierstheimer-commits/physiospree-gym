/**
 * Vercel Serverless Function: POST /api/claude-chat  (Block 3)
 *
 * Persistenter Coach-Dialog. Nimmt die letzten Chat-Nachrichten + aktuellen
 * Plan (Framework + aktuelle Woche) + letzte Workouts + Profil und liefert eine
 * Coach-Antwort als Freitext, optional mit Plan-Marker-Vorschlägen.
 *
 * Architektur (CLAUDE.md):
 * - Regel 8: Secrets serverseitig; KI-Pfad. Prompt Caching auf statischem Block.
 * - Marker werden NIE automatisch angewendet — der Endpoint liefert nur
 *   Vorschläge; die Bestätigung passiert clientseitig (Confirm-Pflicht).
 *
 * Gleiches Muster wie claude-coach.ts. Nur Typ-Importe aus src (werden
 * wegkompiliert) — kein Wert-Import, damit die Lambda nicht aus src/ auflösen
 * muss (vgl. ERR_MODULE_NOT_FOUND-Fix in claude-plan).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type {
  ChatMessage,
  Goal,
  ParsedMarkerKind,
  PlanFramework,
  PlanWeek,
  UserProfile,
  Workout,
} from '../src/shared/types';

export const config = { runtime: 'nodejs', maxDuration: 60 };

// ---------------------------------------------------------------------------
// Antwort-Vertrag (inline, da types.ts geschützt)
// ---------------------------------------------------------------------------

interface ProposedMarker {
  kind: ParsedMarkerKind;
  rationale: string;
  payload: Record<string, unknown>;
  targetId?: string | null;
}

interface ChatResponse {
  content: string;
  proposedMarkers?: ProposedMarker[];
}

/** Im Chat erlaubte Marker-Typen (siehe Block-3-Vorgabe). */
const CHAT_MARKER_KINDS: ParsedMarkerKind[] = [
  'LOAD_ADJUSTMENT',
  'SESSION_ADJUSTMENT',
  'DELOAD',
  'EXERCISE_SWAP',
  'ILLNESS_RECOVERY',
  'VACATION_MODE',
];

// ---------------------------------------------------------------------------
// Segment-Ableitung (aus dem Plan-Ziel, wie claude-coach)
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

const PHASE_LABEL: Record<string, string> = {
  accumulation: 'Akkumulation',
  intensification: 'Intensivierung',
  peak: 'Realisierung',
  deload: 'Deload',
};

function goalToSegment(goal: Goal): CoachSegment {
  switch (goal) {
    case 'strength':
      return 'strength';
    case 'endurance':
      return 'endurance';
    default:
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

/** Zusatz-Block speziell für den Chat (TRAIN/READ + Marker-Regeln + Format). */
const CHAT_ADDENDUM = `# Chat-Modus

Du chattest direkt mit dem Trainierenden. Nutze den TRAIN-Sound für
Trainingsfragen (Progression, Übungen, Technik) und den READ-Sound für
Tagesform, Schmerz, Schlaf, Stress und Lebenskontext. Halte dich strikt an die
Sound-Vorgaben aus sound.md. Antworte kurz und konkret — kein Roman.

Wenn eine Plan-Anpassung sinnvoll ist: schlage sie KONKRET vor und hänge am
Ende GENAU EINEN \`\`\`json-Block mit Marker(n) an. Keine Plan-Änderung ohne
Marker. Die Marker werden erst vom Nutzer bestätigt — formuliere also einen
Vorschlag, keine Tatsache ("Ich würde …", nicht "Ich habe …").

Bei Schmerz > 4/10 oder Beschwerden, die länger als 5 Tage bestehen: READ-Sound,
keine Belastungssteigerung, verweise auf Arzt/Physio (siehe Skill).

Erlaubte Marker-Typen: LOAD_ADJUSTMENT, SESSION_ADJUSTMENT, DELOAD,
EXERCISE_SWAP, ILLNESS_RECOVERY, VACATION_MODE.

AUSGABEFORMAT
Antworte zuerst mit deinem Freitext (die Coach-Antwort im passenden Sound). NUR
wenn du eine Plan-Anpassung vorschlägst, hänge danach genau einen JSON-Block an:
\`\`\`json
{ "proposedMarkers": [
  { "kind": "LOAD_ADJUSTMENT", "rationale": "Kurzbegründung", "payload": { "exerciseName": "Brustpresse", "delta": 2.5 } }
] }
\`\`\`
Ohne Anpassungsvorschlag: KEIN JSON-Block, nur Freitext.`;

/**
 * Statischer System-Prompt (cache-bar): voller Skill + Segment-Referenz +
 * exercises + sound + Zykluslänge + Chat-Zusatz. Über alle Chat-Calls eines
 * Segments identisch.
 */
function buildSystemPrompt(segment: CoachSegment): string {
  return [
    'Du bist der Physiospree Strength-Coach im persistenten Chat mit dem ' +
      'Trainierenden. Wende die folgenden Supervisor-, Auswertungs- und ' +
      'Sound-Regeln strikt an.',
    loadPrompt('SKILL.md'),
    `# Segmentspezifische Referenz (${SEGMENT_LABEL[segment]})\n\n${loadPrompt(
      SEGMENT_REFERENCE[segment],
    )}`,
    loadPrompt('exercises.md'),
    loadPrompt('sound.md'),
    loadPrompt('prompt-modul-zykluslaenge.md'),
    CHAT_ADDENDUM,
  ]
    .filter(Boolean)
    .join('\n\n---\n\n');
}

// ---------------------------------------------------------------------------
// User-Message (dynamisch, nicht gecacht)
// ---------------------------------------------------------------------------

function avgRpe(w: Workout): number | null {
  const rpes = w.exercises.flatMap((e) =>
    e.sets.filter((s) => !s.isWarmup && typeof s.rpe === 'number').map((s) => s.rpe as number),
  );
  if (rpes.length === 0) return null;
  return Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  } catch {
    return iso.slice(0, 10);
  }
}

function buildUserPrompt(
  messages: ChatMessage[],
  framework: PlanFramework,
  currentWeek: PlanWeek | null,
  recentWorkouts: Workout[],
  profile: UserProfile | null,
): string {
  const segment = goalToSegment(framework.goal);
  const lines: string[] = [];

  lines.push('KONTEXT');
  const weekBits: string[] = [`Segment: ${SEGMENT_LABEL[segment]}`, `Plan: ${framework.name}`];
  if (currentWeek) {
    weekBits.push(
      `Woche ${currentWeek.weekIndex + 1}/${framework.totalWeeks} ` +
        `(${PHASE_LABEL[currentWeek.phase] ?? currentWeek.phase}${currentWeek.isDeload ? ', Deload' : ''})`,
    );
  }
  if (profile?.notes) weekBits.push(`Profil-Notiz: ${profile.notes}`);
  lines.push(weekBits.join(' | '));

  lines.push('');
  lines.push('LETZTE WORKOUTS (neueste zuerst)');
  if (recentWorkouts.length === 0) {
    lines.push('- (noch keine abgeschlossenen Workouts)');
  } else {
    for (const w of recentWorkouts.slice(0, 5)) {
      const rpe = avgRpe(w);
      const sets = w.exercises.reduce((n, e) => n + e.sets.filter((s) => !s.isWarmup).length, 0);
      lines.push(
        `- ${fmtDate(w.date)} ${w.name}: ${sets} Arbeitssätze${rpe != null ? `, Ø RPE ${rpe}` : ''}`,
      );
    }
  }

  lines.push('');
  lines.push('GESPRÄCHSVERLAUF (älteste zuerst, letzte Zeile = aktuelle Nachricht)');
  const recent = messages.slice(-10);
  for (const m of recent) {
    const who = m.role === 'coach' ? 'Coach' : 'Nutzer';
    lines.push(`[${who}]: ${m.content}`);
  }

  lines.push('');
  lines.push('AUFGABE');
  lines.push(
    'Antworte als Coach auf die letzte Nutzer-Nachricht. Halte den passenden ' +
      'Sound (TRAIN/READ). Wenn — und nur wenn — eine Plan-Anpassung sinnvoll ist, ' +
      'hänge am Ende genau einen ```json-Block mit proposedMarkers an (siehe ' +
      'Ausgabeformat). Sonst nur Freitext.',
  );

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Antwort-Parsing (Marker-Block optional, am Ende)
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validateMarker(v: unknown): ProposedMarker | null {
  if (!isRecord(v)) return null;
  const kind = v.kind;
  if (typeof kind !== 'string' || !(CHAT_MARKER_KINDS as string[]).includes(kind)) return null;
  const rationale = typeof v.rationale === 'string' ? v.rationale : '';
  const payload = isRecord(v.payload) ? v.payload : {};
  const marker: ProposedMarker = { kind: kind as ParsedMarkerKind, rationale, payload };
  if (typeof v.targetId === 'string') marker.targetId = v.targetId;
  return marker;
}

/**
 * Trennt Freitext und optionalen Marker-JSON-Block. Resilient: schlägt das
 * Parsen des Blocks fehl, bleibt der Freitext erhalten (Chat darf nie leer
 * antworten).
 */
function parseChatResponse(raw: string): ChatResponse {
  const text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```\s*$/i);
  if (!fence) return { content: text };

  const blockStart = text.lastIndexOf(fence[0]);
  const content = text.slice(0, blockStart).trim();

  let markers: ProposedMarker[] = [];
  try {
    const parsed: unknown = JSON.parse(fence[1].trim());
    const arr = isRecord(parsed) && Array.isArray(parsed.proposedMarkers) ? parsed.proposedMarkers : [];
    markers = arr.map(validateMarker).filter((m): m is ProposedMarker => m !== null);
  } catch {
    // Block unparsebar -> als reinen Text behandeln (gesamten Output behalten).
    return { content: text };
  }

  const finalContent = content || text;
  return markers.length > 0 ? { content: finalContent, proposedMarkers: markers } : { content: finalContent };
}

// ---------------------------------------------------------------------------
// HTTP-Helfer + Handler
// ---------------------------------------------------------------------------

function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.status(status).json(body);
}

interface ChatRequestBody {
  messages?: ChatMessage[];
  currentPlan?: PlanFramework;
  currentWeek?: PlanWeek | null;
  recentWorkouts?: Workout[];
  userProfile?: UserProfile | null;
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

  let body: ChatRequestBody;
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {};
  } catch {
    sendJson(res, 400, { error: 'bad_request', message: 'Body ist kein gültiges JSON.' });
    return;
  }

  const messages = body.messages;
  const framework = body.currentPlan;
  if (!Array.isArray(messages) || messages.length === 0 || !framework?.goal) {
    sendJson(res, 400, {
      error: 'bad_request',
      message: 'messages (nicht leer) und currentPlan (mit goal) sind erforderlich.',
    });
    return;
  }

  const segment = goalToSegment(framework.goal);
  const recentWorkouts = Array.isArray(body.recentWorkouts) ? body.recentWorkouts : [];
  const currentWeek = body.currentWeek ?? null;
  const profile = body.userProfile ?? null;

  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  let raw: string;
  try {
    const systemPrompt = buildSystemPrompt(segment);
    const userPrompt = buildUserPrompt(messages, framework, currentWeek, recentWorkouts, profile);

    const client = new Anthropic();
    const message = await client.messages.create({
      model,
      max_tokens: 2000,
      thinking: { type: 'disabled' },
      // Prompt Caching: statischer System-Prompt (SKILL + Segment + exercises +
      // sound + Zykluslänge + Chat-Zusatz) -> ephemerer Cache-Block. Der
      // dynamische Teil (Verlauf/Kontext) steht im user-message nach dem
      // Breakpoint. Eintrag je Segment, 5min TTL.
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userPrompt }],
    });

    const usage = message.usage;
    console.log(
      `[claude-chat] cache_creation=${usage.cache_creation_input_tokens ?? 0} ` +
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

  const response = parseChatResponse(raw);
  sendJson(res, 200, response satisfies ChatResponse);
}
