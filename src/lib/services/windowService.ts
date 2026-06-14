/**
 * windowService — Rolling-2-Wochen-Fenster (Regel 8, KI-Pfad).
 *
 * Prüft, ob die nächsten 2 Detail-Wochen generiert werden sollen, und fordert
 * sie über /api/claude-plan an (Window-Update statt Neustart). Kein UI-Code.
 */

import { v4 as uuidv4 } from 'uuid';
import type { PlanResponse, UserProfile, Workout } from '../../shared/types';

const PLAN_ENDPOINT = '/api/claude-plan';

/**
 * Soll das nächste Fenster generiert werden?
 * Bedingung: Die erste Detail-Woche ist abgeschlossen (Anzahl abgeschlossener
 * Workouts für Woche 0 >= Anzahl Sessions in Woche 0) UND das nächste Fenster
 * existiert noch nicht (verhindert Endlos-Triggern).
 */
export function shouldGenerateNextWindow(plan: PlanResponse, workoutHistory: Workout[]): boolean {
  const weeks = [...plan.framework.weeks].sort((a, b) => a.weekIndex - b.weekIndex);
  if (weeks.length === 0) return false;

  const firstWeek = weeks[0];
  const sessionIds = new Set(firstWeek.sessions.map((s) => s.id));
  const completedForWeek0 = workoutHistory.filter(
    (w) =>
      w.status === 'completed' &&
      typeof w.plannedSessionId === 'string' &&
      sessionIds.has(w.plannedSessionId),
  ).length;

  // Nächstes Fenster bereits vorhanden? (weekIndex jenseits der ersten 2 Wochen)
  const hasNextWindow = weeks.some((w) => w.weekIndex >= 2);

  return !hasNextWindow && completedForWeek0 >= firstWeek.sessions.length;
}

/** Minimalprofil aus dem Framework (im Window-Modus nur Kontext, nicht für die Länge). */
function reconstructProfile(plan: PlanResponse): UserProfile {
  const fw = plan.framework;
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    updatedAt: now,
    deletedAt: null,
    userId: fw.userId,
    displayName: '',
    sex: 'unspecified',
    goal: fw.goal,
    experience: 'intermediate',
    daysPerWeek: fw.daysPerWeek,
    equipment: 'full_gym',
    markers: [],
    createdAt: now,
  };
}

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
 * Fordert die nächsten 2 Detail-Wochen an. Sendet `existingPlan` +
 * `completedWorkouts`, woran der Endpoint ein Window-Update erkennt (nicht
 * Neustart). Liefert die aktualisierte PlanResponse (Framework gleich,
 * detailWeeks erweitert). Wirft bei jedem Fehler eine klare Error.
 */
export async function requestNextWindow(
  plan: PlanResponse,
  workoutHistory: Workout[],
): Promise<PlanResponse> {
  const body = {
    profile: reconstructProfile(plan),
    existingPlan: plan,
    completedWorkouts: workoutHistory.filter((w) => w.status === 'completed'),
  };

  let res: Response;
  try {
    res = await fetch(PLAN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Netzwerkfehler beim Fenster-Update: ${(err as Error).message}`, { cause: err });
  }

  if (!res.ok) {
    let detail = '';
    try {
      const errBody = (await res.json()) as { message?: string; error?: string };
      detail = errBody?.message || errBody?.error || '';
    } catch {
      // Statuscode genügt.
    }
    throw new Error(
      `Nächste Wochen konnten nicht geladen werden (${res.status})${detail ? ` — ${detail}` : ''}`,
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error('Antwort des Fenster-Updates ist kein gültiges JSON.');
  }

  if (!isPlanResponse(data)) {
    throw new Error('Antwort des Fenster-Updates hat eine unerwartete Struktur.');
  }

  return data;
}
