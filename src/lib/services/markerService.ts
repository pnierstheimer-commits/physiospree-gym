/**
 * markerService — wendet bestätigte Coach-Marker real auf den Plan an.
 *
 * Reine, deterministische Plan-Transformationen (Regel 3/4): kein UI, kein
 * React-State. `state.applyMarkers` ruft `applyMarkerToWeeks` pro Marker und
 * faltet das Ergebnis. Marker werden nie automatisch angewendet — der Aufruf
 * passiert erst nach Nutzer-Bestätigung (Confirm-Pflicht).
 *
 * Datenmodell-Hinweis: Der Plan hat KEINE absoluten Session-Daten — Sessions
 * sind über weekIndex/dayIndex positioniert. Marker mit `date`-Payload werden
 * daher best-effort über sessionId/targetId/dayIndex/Name innerhalb der
 * aktuellen Woche bzw. über weekIndex-Offsets ab currentWeekIndex aufgelöst.
 * Feld-Mapping: Last = `suggestedLoadKg`, Sätze = `targetSets`, Rep-Range =
 * `targetReps`, Name/Cue = `notes` ("Name — cue").
 */

import type { ParsedMarker, PlanFramework, PlanWeek } from '../../shared/types';

// ---------------------------------------------------------------------------
// Kleine Helfer
// ---------------------------------------------------------------------------

const asStr = (v: unknown): string => (typeof v === 'string' ? v : '');
const asNum = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/** Übungsname aus notes ("Name — cue"). */
function exName(notes: string | undefined): string {
  if (!notes) return '';
  const i = notes.indexOf(' — ');
  return i === -1 ? notes : notes.slice(0, i);
}

function mapWeeks(
  weeks: PlanWeek[],
  pred: (w: PlanWeek) => boolean,
  fn: (w: PlanWeek) => PlanWeek,
): PlanWeek[] {
  return weeks.map((w) => (pred(w) ? fn(w) : w));
}

// ---------------------------------------------------------------------------
// LOAD_ADJUSTMENT — Last einer Übung (nach Name) anpassen
// ---------------------------------------------------------------------------

function loadAdjustment(weeks: PlanWeek[], marker: ParsedMarker, now: string): PlanWeek[] {
  const name = asStr(marker.payload.exerciseName);
  const delta = asNum(marker.payload.delta, 0);
  if (!name || !delta) return weeks;
  return weeks.map((w) => ({
    ...w,
    sessions: w.sessions.map((s) => ({
      ...s,
      exercises: s.exercises.map((pe) =>
        exName(pe.notes) === name && typeof pe.suggestedLoadKg === 'number'
          ? { ...pe, suggestedLoadKg: pe.suggestedLoadKg + delta, updatedAt: now }
          : pe,
      ),
    })),
  }));
}

// ---------------------------------------------------------------------------
// DELOAD — nächste Woche als Deload markieren + RPE senken
// ---------------------------------------------------------------------------

function deload(weeks: PlanWeek[], framework: PlanFramework, now: string): PlanWeek[] {
  const target = framework.currentWeekIndex + 1;
  return mapWeeks(
    weeks,
    (w) => w.weekIndex === target,
    (w) => ({
      ...w,
      isDeload: true,
      updatedAt: now,
      sessions: w.sessions.map((s) => ({
        ...s,
        exercises: s.exercises.map((pe) => ({ ...pe, targetRPE: 6, updatedAt: now })),
      })),
    }),
  );
}

// ---------------------------------------------------------------------------
// SESSION_ADJUSTMENT — Volumen einer einzelnen Einheit reduzieren
// payload: { date?, sessionId?, dayIndex?, sessionName?, volumeChange, setsDelta?, reason }
// volumeChange: '-1_set_per_exercise' | '-1_exercise' | 'custom'
// ---------------------------------------------------------------------------

/** Löst die Ziel-Session auf (ohne absolute Daten): targetId/sessionId, dann
 *  dayIndex/Name in der aktuellen Woche, sonst erste Session der aktuellen Woche. */
function resolveSession(
  weeks: PlanWeek[],
  framework: PlanFramework,
  marker: ParsedMarker,
): { weekIndex: number; sessionId: string } | null {
  const sid = asStr(marker.targetId) || asStr(marker.payload.sessionId);
  if (sid) {
    for (const w of weeks) {
      const s = w.sessions.find((ss) => ss.id === sid);
      if (s) return { weekIndex: w.weekIndex, sessionId: s.id };
    }
  }
  const cur = weeks.find((w) => w.weekIndex === framework.currentWeekIndex);
  if (!cur || cur.sessions.length === 0) return null;

  const di = marker.payload.dayIndex;
  if (typeof di === 'number') {
    const s = cur.sessions.find((ss) => ss.dayIndex === di);
    if (s) return { weekIndex: cur.weekIndex, sessionId: s.id };
  }
  const sname = asStr(marker.payload.sessionName);
  if (sname) {
    const s = cur.sessions.find((ss) => ss.name === sname);
    if (s) return { weekIndex: cur.weekIndex, sessionId: s.id };
  }
  return { weekIndex: cur.weekIndex, sessionId: cur.sessions[0].id };
}

function sessionAdjustment(
  weeks: PlanWeek[],
  framework: PlanFramework,
  marker: ParsedMarker,
  now: string,
): PlanWeek[] {
  const tgt = resolveSession(weeks, framework, marker);
  if (!tgt) return weeks;
  const change = asStr(marker.payload.volumeChange);

  return mapWeeks(
    weeks,
    (w) => w.weekIndex === tgt.weekIndex,
    (w) => ({
      ...w,
      sessions: w.sessions.map((s) => {
        if (s.id !== tgt.sessionId) return s;

        if (change === '-1_exercise') {
          // Letzte Übung (Isolation/Core liegt typ. am Ende der order) raus.
          if (s.exercises.length <= 1) return s;
          const ordered = [...s.exercises].sort((a, b) => a.order - b.order);
          const dropId = ordered[ordered.length - 1].id;
          return { ...s, updatedAt: now, exercises: s.exercises.filter((pe) => pe.id !== dropId) };
        }

        // '-1_set_per_exercise' (Default) oder 'custom' mit setsDelta.
        const setsDelta =
          change === 'custom' && typeof marker.payload.setsDelta === 'number'
            ? marker.payload.setsDelta
            : -1;
        return {
          ...s,
          updatedAt: now,
          exercises: s.exercises.map((pe) => ({
            ...pe,
            targetSets: Math.max(2, pe.targetSets + setsDelta),
            updatedAt: now,
          })),
        };
      }),
    }),
  );
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Wendet EINEN Marker auf die Wochen an und gibt die (ggf. neuen) Wochen zurück.
 * Unbekannte/nicht-transformierende Kinds (EXERCISE_UPGRADE, PHASE_SHIFT) sind
 * No-ops — der Marker wird vom Aufrufer trotzdem protokolliert.
 */
export function applyMarkerToWeeks(
  weeks: PlanWeek[],
  framework: PlanFramework,
  marker: ParsedMarker,
  now: string,
): PlanWeek[] {
  switch (marker.kind) {
    case 'LOAD_ADJUSTMENT':
      return loadAdjustment(weeks, marker, now);
    case 'DELOAD':
      return deload(weeks, framework, now);
    case 'SESSION_ADJUSTMENT':
      return sessionAdjustment(weeks, framework, marker, now);
    default:
      return weeks;
  }
}
