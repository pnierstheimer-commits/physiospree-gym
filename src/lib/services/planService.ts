/**
 * planService — Erstellung & Verwaltung von Trainingsplänen (STUB, Phase 0).
 *
 * Coach-Logik gehört in den Service-Layer (Regeln 3 & 4), nicht in die UI.
 * "Zwei Geschwindigkeiten" (Regel 8): ein deterministisches lokales Gerüst aus
 * constants.ts (schnell, offline) und eine KI-Verfeinerung über /api/claude-plan
 * (langsam). Hier nur Signaturen.
 */

import type {
  PlanFramework,
  PlanRequest,
  PlanResponse,
  UserProfile,
} from '../../shared/types';

/**
 * Schnell & lokal: deterministisches Plangerüst aus BLOCK_STRUCTURE,
 * SPLIT_BY_DAYS, REP_RANGES etc. — ohne Netzwerk/KI.
 * TODO(Phase 1): Framework aus constants.ts + Profil bauen.
 */
export function buildLocalFramework(_profile: UserProfile): PlanFramework {
  throw new Error('planService.buildLocalFramework: not_implemented');
}

/**
 * Langsam & KI: ruft /api/claude-plan zur Verfeinerung/Generierung auf.
 * TODO(Phase 1): fetch POST, PlanResponse validieren.
 */
export async function requestAIPlan(_req: PlanRequest): Promise<PlanResponse> {
  throw new Error('planService.requestAIPlan: not_implemented');
}

/**
 * Markiert das aktuelle Framework als abgeschlossen/archiviert und rückt den
 * Wochenindex vor.
 * TODO(Phase 1).
 */
export function advanceWeek(_framework: PlanFramework): PlanFramework {
  throw new Error('planService.advanceWeek: not_implemented');
}
