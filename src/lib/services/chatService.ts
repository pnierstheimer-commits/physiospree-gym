/**
 * chatService — Coach-Chat-Anbindung (KI-Pfad, Regeln 3/4/8).
 *
 * Reine API-/Logikschicht (kein UI, kein React-State): ruft /api/claude-chat,
 * wandelt Endpoint-Marker in vollständige ParsedMarker und liefert
 * Klartext-Beschreibungen für die Confirm-Notiz. Die Persistenz/State-Mutation
 * (User-/Coach-Nachricht anhängen, Status setzen) liegt in state.tsx — analog
 * zu planService.generatePlan vs. state.requestPlan.
 */

import type {
  ChatMessage,
  ParsedMarker,
  ParsedMarkerKind,
  PlanFramework,
  PlanWeek,
  UserProfile,
  Workout,
} from '../../shared/types';

const CHAT_ENDPOINT = '/api/claude-chat';

export interface ChatRequestPayload {
  messages: ChatMessage[];
  currentPlan: PlanFramework;
  currentWeek: PlanWeek | null;
  recentWorkouts: Workout[];
  userProfile: UserProfile | null;
}

interface RawMarker {
  kind: string;
  rationale?: string;
  payload?: Record<string, unknown>;
  targetId?: string | null;
}

export interface ChatReply {
  content: string;
  proposedMarkers?: RawMarker[];
}

/**
 * Schickt den Chat-Kontext an die Coach-Route und liefert die Antwort. Wirft
 * bei jedem Fehler eine `Error` mit klarer Meldung — nie stummes Scheitern.
 */
export async function requestChatReply(payload: ChatRequestPayload): Promise<ChatReply> {
  let res: Response;
  try {
    res = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new Error(`Netzwerkfehler im Coach-Chat: ${(err as Error).message}`, { cause: err });
  }

  if (!res.ok) {
    let detail = '';
    try {
      const e = (await res.json()) as { message?: string; error?: string };
      detail = e?.message || e?.error || '';
    } catch {
      // Fehler-Body nicht parsebar — Status reicht.
    }
    throw new Error(`Coach-Chat fehlgeschlagen (${res.status})${detail ? ` — ${detail}` : ''}`);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error('Antwort des Coach-Chats ist kein gültiges JSON.');
  }

  if (typeof data !== 'object' || data === null || typeof (data as ChatReply).content !== 'string') {
    throw new Error('Antwort des Coach-Chats hat eine unerwartete Struktur.');
  }
  return data as ChatReply;
}

const MARKER_KINDS: ParsedMarkerKind[] = [
  'LOAD_ADJUSTMENT',
  'SESSION_ADJUSTMENT',
  'DELOAD',
  'EXERCISE_SWAP',
  'ILLNESS_RECOVERY',
  'VACATION_MODE',
  'PHASE_SHIFT',
  'EXERCISE_UPGRADE',
];

/**
 * Wandelt die Endpoint-Marker in vollständige ParsedMarker. `sourceActionId`
 * ist die ID der Coach-Nachricht (auditierbar). Unbekannte Kinds werden
 * verworfen.
 */
export function toParsedMarkers(raw: RawMarker[], sourceActionId: string): ParsedMarker[] {
  const out: ParsedMarker[] = [];
  for (const m of raw) {
    if (!m || typeof m.kind !== 'string' || !(MARKER_KINDS as string[]).includes(m.kind)) continue;
    out.push({
      kind: m.kind as ParsedMarkerKind,
      sourceActionId,
      rationale: typeof m.rationale === 'string' ? m.rationale : '',
      targetId: typeof m.targetId === 'string' ? m.targetId : null,
      payload: m.payload && typeof m.payload === 'object' ? m.payload : {},
    });
  }
  return out;
}

/** Menschlich lesbare Kurzbeschreibung (für die "Übernommen — …"-Notiz). */
export function describeMarker(m: ParsedMarker): string {
  const ex = typeof m.payload.exerciseName === 'string' ? m.payload.exerciseName : null;
  const delta = typeof m.payload.delta === 'number' ? m.payload.delta : null;
  switch (m.kind) {
    case 'LOAD_ADJUSTMENT':
      return ex && delta != null
        ? `Last ${delta > 0 ? '+' : ''}${String(delta).replace('.', ',')} kg bei ${ex}`
        : 'Last angepasst';
    case 'DELOAD':
      return 'Deload nächste Woche';
    case 'SESSION_ADJUSTMENT':
      return 'Einheit angepasst';
    case 'EXERCISE_SWAP':
      return ex ? `Übung getauscht: ${ex}` : 'Übung getauscht';
    case 'EXERCISE_UPGRADE':
      return ex ? `Übung hochgestuft: ${ex}` : 'Übung hochgestuft';
    case 'PHASE_SHIFT':
      return 'Blockphase verschoben';
    case 'ILLNESS_RECOVERY':
      return 'Wiedereinstieg nach Krankheit';
    case 'VACATION_MODE':
      return 'Pausen-/Urlaubsmodus';
    default:
      return m.kind;
  }
}
