/**
 * planService — Erstellung & Verwaltung von Trainingsplänen.
 *
 * Coach-Logik gehört in den Service-Layer (Regeln 3 & 4), nicht in die UI.
 * "Zwei Geschwindigkeiten" (Regel 8): ein deterministisches lokales Gerüst aus
 * constants.ts (schnell, offline) und die KI-Verfeinerung über /api/claude-plan
 * (langsam). Dieser Service kapselt den KI-Aufruf, das Marker-Parsing und einen
 * Console-Integrationstest. Kein UI-Code.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  CoachAction,
  ParsedMarker,
  ParsedMarkerKind,
  PlanRequest,
  PlanResponse,
  UserProfile,
} from '../../shared/types';

const PLAN_ENDPOINT = '/api/claude-plan';

// ---------------------------------------------------------------------------
// KI-Pfad: Plan über /api/claude-plan generieren
// ---------------------------------------------------------------------------

/** Übersetzt einen HTTP-Status der Plan-Route in eine klare Fehlermeldung. */
function planErrorMessage(status: number, detail: string): string {
  const suffix = detail ? ` — ${detail}` : '';
  switch (status) {
    case 400:
      return `Ungültige Plananfrage (400): Profil unvollständig oder Body fehlerhaft${suffix}`;
    case 405:
      return `Methode nicht erlaubt (405): Die Plan-Route akzeptiert nur POST${suffix}`;
    case 422:
      return `Plan konnte nicht erzeugt werden (422): Antwort des Coaches war nicht verwertbar${suffix}`;
    case 500:
      return `Serverfehler bei der Planerstellung (500)${suffix}`;
    case 502:
      return `KI-Dienst nicht erreichbar (502): Claude API lieferte keinen Plan${suffix}`;
    default:
      return `Planerstellung fehlgeschlagen (${status})${suffix}`;
  }
}

/** Minimale Strukturprüfung der Antwort gegen den PlanResponse-Vertrag. */
function isPlanResponse(value: unknown): value is PlanResponse {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const fw = v.framework as Record<string, unknown> | undefined;
  return (
    typeof fw === 'object' &&
    fw !== null &&
    typeof fw.id === 'string' &&
    Array.isArray(fw.weeks) &&
    Array.isArray(v.actions)
  );
}

/**
 * Generiert einen Plan über die serverseitige Claude-Route. Wirft bei jedem
 * Fehler (Netzwerk, 4xx/5xx, kaputte Antwort) eine `Error` mit klarer Meldung —
 * scheitert nie stumm, damit der State `planError` sauber setzen kann.
 */
export async function generatePlan(profile: UserProfile): Promise<PlanResponse> {
  const body: PlanRequest = { profile };

  let res: Response;
  try {
    res = await fetch(PLAN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Netzwerkfehler bei der Planerstellung: ${(err as Error).message}`, {
      cause: err,
    });
  }

  if (!res.ok) {
    let detail = '';
    try {
      const errBody = (await res.json()) as { message?: string; error?: string };
      detail = errBody?.message || errBody?.error || '';
    } catch {
      // Fehler-Body nicht parsebar — Statuscode reicht für die Meldung.
    }
    throw new Error(planErrorMessage(res.status, detail));
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error('Antwort der Planerstellung ist kein gültiges JSON.');
  }

  if (!isPlanResponse(data)) {
    throw new Error('Antwort der Planerstellung hat eine unerwartete Struktur.');
  }

  return data;
}

// ---------------------------------------------------------------------------
// Marker-Parsing (Coach-Skill §10) — nur extrahieren, nicht anwenden
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
 * Fallback-Mapping vom CoachActionType (types.ts) auf das Marker-Vokabular,
 * falls die Action keinen expliziten Marker-Tag in der Payload trägt.
 * Actions ohne sinnvolle Entsprechung (z. B. 'maintain') liefern null.
 */
const ACTION_TYPE_TO_MARKER: Partial<Record<CoachAction['type'], ParsedMarkerKind>> = {
  progress_load: 'LOAD_ADJUSTMENT',
  reduce_load: 'LOAD_ADJUSTMENT',
  deload: 'DELOAD',
  flag_overtraining: 'DELOAD',
  swap_exercise: 'EXERCISE_SWAP',
  add_recovery: 'SESSION_ADJUSTMENT',
  return_protocol: 'ILLNESS_RECOVERY',
};

/** Liest einen expliziten Marker-Tag aus der Action-Payload (vorrangig). */
function markerKindFromPayload(payload: Record<string, unknown> | undefined): ParsedMarkerKind | null {
  if (!payload) return null;
  for (const key of ['marker', 'markerType', 'kind', 'type'] as const) {
    const raw = payload[key];
    if (typeof raw === 'string' && (MARKER_KINDS as string[]).includes(raw)) {
      return raw as ParsedMarkerKind;
    }
  }
  return null;
}

/**
 * Extrahiert die relevanten Coach-Marker aus den Actions einer PlanResponse.
 * Erkennung zuerst über einen expliziten Marker-Tag in der Payload, sonst über
 * das Mapping aus dem CoachActionType. Reine Plan-Notizen (z. B. plan_created,
 * goal_redirect) liefern keinen Marker.
 *
 * Wichtig: Hier wird NUR geparst und gespeichert — keine State-Mutation. Die
 * Anwendung der Marker folgt im Feedback-Loop (Phase 3).
 */
export function parseMarkers(actions: CoachAction[]): ParsedMarker[] {
  const out: ParsedMarker[] = [];
  for (const action of actions) {
    const kind = markerKindFromPayload(action.payload) ?? ACTION_TYPE_TO_MARKER[action.type] ?? null;
    if (!kind) continue;
    out.push({
      kind,
      sourceActionId: action.id,
      rationale: action.rationale,
      targetId: action.targetId ?? null,
      payload: action.payload ?? {},
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Integrationstest (Browser-Console)
// ---------------------------------------------------------------------------

/** Vollständiges Test-Profil: Hypertrophie / Beginner / 3 Tage. */
function makeTestProfile(): UserProfile {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    updatedAt: now,
    userId: uuidv4(),
    displayName: 'Console-Test',
    sex: 'male',
    goal: 'hypertrophy',
    experience: 'beginner',
    daysPerWeek: 3,
    equipment: 'full_gym',
    markers: [],
    createdAt: now,
  };
}

/**
 * Schnelltest der ganzen Kette aus der Browser-Console:
 *   import('/src/lib/services/planService.ts').then(m => m.testPlanGeneration())
 * Loggt Zykluslänge, Anzahl Detail-Wochen und den Namen der ersten Session.
 */
export async function testPlanGeneration(): Promise<PlanResponse> {
  const profile = makeTestProfile();
  console.info('[planService] Test-Plananfrage (Hypertrophie/Beginner/3 Tage) …');

  const plan = await generatePlan(profile);
  const fw = plan.framework;
  const firstSession = fw.weeks[0]?.sessions[0]?.name ?? '—';

  console.info('[planService] OK', {
    name: fw.name,
    cycleLengthWeeks: fw.cycleLengthWeeks,
    detailWeeks: fw.weeks.length,
    firstSession,
    markers: parseMarkers(plan.actions).map((m) => m.kind),
  });

  return plan;
}
