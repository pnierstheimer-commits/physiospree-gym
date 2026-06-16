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

import type {
  BlockPhase,
  ParsedMarker,
  PlanFramework,
  PlannedSession,
  PlanWeek,
} from '../../shared/types';

// ---------------------------------------------------------------------------
// Kleine Helfer
// ---------------------------------------------------------------------------

const asStr = (v: unknown): string => (typeof v === 'string' ? v : '');
const asNum = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Übungsname aus notes ("Name — cue"). */
function exName(notes: string | undefined): string {
  if (!notes) return '';
  const i = notes.indexOf(' — ');
  return i === -1 ? notes : notes.slice(0, i);
}

/** Cue aus notes ("Name — cue") — leer, wenn keiner. */
function exCue(notes: string | undefined): string {
  if (!notes) return '';
  const i = notes.indexOf(' — ');
  return i === -1 ? '' : notes.slice(i + 3);
}

/** Block-/Phasen-Name (DE/EN/Key) -> BlockPhase. null wenn nicht auflösbar. */
function toPhase(v: unknown): BlockPhase | null {
  const s = asStr(v).toLowerCase();
  if (!s) return null;
  if (s.includes('akkumul') || s.includes('accumul')) return 'accumulation';
  if (s.includes('intensiv') || s.includes('intensif')) return 'intensification';
  if (s.includes('realis') || s.includes('peak')) return 'peak';
  if (s.includes('deload') || s.includes('entlad') || s.includes('entlast')) return 'deload';
  return null;
}

/** Volumen-Delta aus "+1_set_per_exercise" / "-1_set_per_exercise" o. ä. */
function parseVolumeDelta(v: unknown): number | null {
  const s = asStr(v).toLowerCase();
  const m = /([+-]?\d+)\s*_?\s*set/.exec(s);
  return m ? Number(m[1]) : null;
}

/** [min,max]-Rep-Range aus unbekanntem Payload-Wert. */
function asRepRange(v: unknown): [number, number] | null {
  if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number') {
    return [v[0], v[1]];
  }
  return null;
}

/** Rep-Range aus Array [min,max] ODER String "3-6"/"3–6". */
function parseRepRange(v: unknown): [number, number] | null {
  const arr = asRepRange(v);
  if (arr) return arr;
  const m = /(\d+)\s*[-–]\s*(\d+)/.exec(asStr(v));
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** notes-Feld aus Name + optionalem Cue ("Name — cue"). */
function buildNotes(name: string, cue: string): string {
  return cue ? `${name} — ${cue}` : name;
}

/** Auf 2,5-kg-Schritte runden (nie negativ). */
function round25(x: number): number {
  return Math.max(0, Math.round(x / 2.5) * 2.5);
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
  if (!name) return weeks;
  // newLoad (absolutes Zielgewicht) hat Vorrang vor delta (relativ).
  const newLoad =
    typeof marker.payload.newLoad === 'number' && Number.isFinite(marker.payload.newLoad)
      ? round25(marker.payload.newLoad)
      : null;
  const delta = asNum(marker.payload.delta, 0);
  if (newLoad === null && !delta) return weeks; // nichts anzuwenden

  return weeks.map((w) => ({
    ...w,
    sessions: w.sessions.map((s) => ({
      ...s,
      exercises: s.exercises.map((pe) => {
        if (exName(pe.notes) !== name) return pe;
        // Absolut setzen — greift auch auf null-Feldern (Kalibrierung).
        if (newLoad !== null) {
          return { ...pe, suggestedLoadKg: newLoad, updatedAt: now };
        }
        // Sonst relatives Delta, nur auf bestehender numerischer Last.
        return typeof pe.suggestedLoadKg === 'number'
          ? { ...pe, suggestedLoadKg: pe.suggestedLoadKg + delta, updatedAt: now }
          : pe;
      }),
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
// EXERCISE_SWAP — Übung ersetzen (Schmerz / Gerät besetzt)
// payload: { exerciseId?, exerciseName?, newExerciseId?, newName, newCue?,
//            newRepRange?, scope?, reason }
// scope: 'this_week' (nur aktuelle Woche, Default) | 'permanent' (ab jetzt)
// Last bleibt gleich — der Coach fordert im Chat zur Kalibrierung auf.
// ---------------------------------------------------------------------------

function exerciseSwap(
  weeks: PlanWeek[],
  framework: PlanFramework,
  marker: ParsedMarker,
  now: string,
): PlanWeek[] {
  const oldId = asStr(marker.payload.exerciseId);
  const oldName = asStr(marker.payload.exerciseName);
  const newName = asStr(marker.payload.newName);
  const newCue = asStr(marker.payload.newCue);
  const newExerciseId = asStr(marker.payload.newExerciseId);
  const newReps = asRepRange(marker.payload.newRepRange);
  if (!newName && !newExerciseId) return weeks; // nichts zu tauschen

  const permanent = asStr(marker.payload.scope) === 'permanent';
  const cur = framework.currentWeekIndex;
  const matches = (peId: string, notes: string | undefined): boolean =>
    (!!oldId && peId === oldId) || (!!oldName && exName(notes) === oldName);

  return mapWeeks(
    weeks,
    (w) => (permanent ? w.weekIndex >= cur : w.weekIndex === cur),
    (w) => ({
      ...w,
      sessions: w.sessions.map((s) => ({
        ...s,
        exercises: s.exercises.map((pe) => {
          if (!matches(pe.exerciseId, pe.notes)) return pe;
          return {
            ...pe,
            exerciseId: newExerciseId || pe.exerciseId,
            notes: newName ? buildNotes(newName, newCue) : pe.notes,
            targetReps: newReps ?? pe.targetReps,
            updatedAt: now,
          };
        }),
      })),
    }),
  );
}

// ---------------------------------------------------------------------------
// EXERCISE_UPGRADE — Übung auf eine schwerere Stufe hochstufen
// payload: { exerciseId?, exerciseName, newExerciseId?, newName?, newCue?,
//            newLevel?, reason }
// Match über den alten Übungsnamen (Platzhalter-IDs); neuer Name aus
// newName/newExerciseName oder newExerciseId (falls keine UUID). Neue Bewegung
// -> Last auf 80 % (2,5-kg-Raster), Reps/Sätze/RPE bleiben. Immer permanent
// (ab currentWeekIndex über alle verbleibenden Wochen).
// ---------------------------------------------------------------------------

function exerciseUpgrade(
  weeks: PlanWeek[],
  framework: PlanFramework,
  marker: ParsedMarker,
  now: string,
): PlanWeek[] {
  const oldId = asStr(marker.payload.exerciseId);
  const oldName = asStr(marker.payload.exerciseName) || asStr(marker.payload.oldName);
  const newId = asStr(marker.payload.newExerciseId);
  const newName =
    asStr(marker.payload.newName) ||
    asStr(marker.payload.newExerciseName) ||
    (newId && !UUID_RE.test(newId) ? newId : '');
  if (!newName) return weeks; // ohne neuen Namen nichts zu tun
  if (!oldName && !oldId) return weeks; // ohne Match-Kriterium nichts zu tun

  const newCue = asStr(marker.payload.newCue);
  const cur = framework.currentWeekIndex;
  const matches = (peId: string, notes: string | undefined): boolean =>
    (!!oldId && peId === oldId) || (!!oldName && exName(notes) === oldName);

  return mapWeeks(
    weeks,
    (w) => w.weekIndex >= cur, // immer permanent
    (w) => ({
      ...w,
      sessions: w.sessions.map((s) => ({
        ...s,
        exercises: s.exercises.map((pe) => {
          if (!matches(pe.exerciseId, pe.notes)) return pe;
          const cue = newCue || exCue(pe.notes);
          return {
            ...pe,
            // Nur eine echte UUID als neue exerciseId übernehmen, sonst behalten.
            exerciseId: UUID_RE.test(newId) ? newId : pe.exerciseId,
            notes: buildNotes(newName, cue),
            suggestedLoadKg:
              typeof pe.suggestedLoadKg === 'number'
                ? round25(pe.suggestedLoadKg * 0.8)
                : pe.suggestedLoadKg,
            // Rep-Range, Sätze, RPE-Ziel bleiben.
            updatedAt: now,
          };
        }),
      })),
    }),
  );
}

// ---------------------------------------------------------------------------
// PHASE_SHIFT — Blockphase verschieben (+ ggf. Parameter des neuen Blocks)
// payload: { fromBlock?, toBlock, changes?: { volumeChange?, rpeTarget?,
//            restSeconds?, repRange? } }
// Zielwochen: verbleibende Wochen (>= currentWeekIndex), die zum alten Block
// gehören (Fallback: alle verbleibenden, wenn fromBlock nicht auflösbar). Phase
// auf den neuen Block setzen; bei vorhandenen changes auch die Übungsparameter.
// Leere/unklare changes -> nur die Phase aktualisieren.
// ---------------------------------------------------------------------------

function phaseShift(
  weeks: PlanWeek[],
  framework: PlanFramework,
  marker: ParsedMarker,
  now: string,
): PlanWeek[] {
  const fromPhase = toPhase(marker.payload.fromBlock);
  const toP = toPhase(marker.payload.toBlock);
  const changes =
    typeof marker.payload.changes === 'object' && marker.payload.changes !== null
      ? (marker.payload.changes as Record<string, unknown>)
      : {};

  const cur = framework.currentWeekIndex;
  const volDelta = parseVolumeDelta(changes.volumeChange);
  const rpeTarget = typeof changes.rpeTarget === 'number' ? changes.rpeTarget : null;
  const restSeconds = typeof changes.restSeconds === 'number' ? changes.restSeconds : null;
  const repRange = parseRepRange(changes.repRange);
  const hasChanges = volDelta != null || rpeTarget != null || restSeconds != null || !!repRange;

  // Verbleibende Wochen des alten Blocks (oder alle verbleibenden als Fallback).
  const inTarget = (w: PlanWeek): boolean =>
    w.weekIndex >= cur && (fromPhase ? w.phase === fromPhase : true);

  if (!toP && !hasChanges) return weeks; // nichts auflösbar -> No-op (wird trotzdem protokolliert)

  return weeks.map((w) => {
    if (!inTarget(w)) return w;
    const base: PlanWeek = {
      ...w,
      phase: toP ?? w.phase,
      isDeload: toP ? toP === 'deload' : w.isDeload,
      updatedAt: now,
    };
    if (!hasChanges) return base; // nur Phase aktualisieren
    return {
      ...base,
      sessions: w.sessions.map((s) => ({
        ...s,
        updatedAt: now,
        exercises: s.exercises.map((pe) => ({
          ...pe,
          targetSets: volDelta != null ? Math.max(2, pe.targetSets + volDelta) : pe.targetSets,
          targetRPE: rpeTarget != null ? rpeTarget : pe.targetRPE,
          restSeconds: restSeconds != null ? restSeconds : pe.restSeconds,
          targetReps: repRange ?? pe.targetReps,
          updatedAt: now,
        })),
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// Last-Rampe (geteilt von ILLNESS_RECOVERY und VACATION_MODE)
// Senkt die Last ab `fromWeek` und steigt linear über `rampWeeks` Wochen
// zurück auf 100% (Wo0: returnLoad … Wo[rampWeeks]: 100%). 2,5-kg-Raster.
// rampWeeks <= 0 -> nur eine reduzierte Woche (returnLoad), keine Rampe.
// ---------------------------------------------------------------------------

function rampLoad(
  weeks: PlanWeek[],
  fromWeek: number,
  returnLoad: number,
  rampWeeks: number,
  now: string,
): PlanWeek[] {
  const steps = Math.max(0, Math.floor(rampWeeks));
  const lastOffset = steps <= 0 ? 0 : steps - 1; // Wochen unter 100%
  const factorFor = (offset: number): number =>
    steps <= 0 ? returnLoad : returnLoad + (1 - returnLoad) * (offset / steps);

  return weeks.map((w) => {
    const off = w.weekIndex - fromWeek;
    if (off < 0 || off > lastOffset) return w;
    const factor = factorFor(off);
    if (factor >= 1) return w;
    return {
      ...w,
      updatedAt: now,
      sessions: w.sessions.map((s) => ({
        ...s,
        exercises: s.exercises.map((pe) =>
          typeof pe.suggestedLoadKg === 'number'
            ? { ...pe, suggestedLoadKg: round25(pe.suggestedLoadKg * factor), updatedAt: now }
            : pe,
        ),
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// ILLNESS_RECOVERY — Last senken + Wiederaufbau-Rampe
// payload: { weeksOff, returnLoad (0.8 = -20%), rampWeeks (2) }
// ---------------------------------------------------------------------------

function illnessRecovery(
  weeks: PlanWeek[],
  framework: PlanFramework,
  marker: ParsedMarker,
  now: string,
): PlanWeek[] {
  const returnLoad = asNum(marker.payload.returnLoad, 0.8);
  const rampWeeks = asNum(marker.payload.rampWeeks, 2);
  if (returnLoad >= 1) return weeks; // keine Reduktion gewünscht
  return rampLoad(weeks, framework.currentWeekIndex, returnLoad, rampWeeks, now);
}

// ---------------------------------------------------------------------------
// VACATION_MODE — Urlaub: Sessions pausieren/minimieren + Auto-Rampback
// payload: { startDate, endDate, mode: 'pause' | 'minimal' }
// Ohne absolute Session-Daten wird die Urlaubsdauer aus start/endDate
// berechnet und als weeksSpan ab currentWeekIndex abgebildet.
//   pause:   Sessions im Zeitraum -> status 'skipped'
//   minimal: Sessions im Zeitraum -> 2 Übungen, Sätze halbiert
// Auto-Rampback nach dem Urlaub (Dauer): <7 Tage normal | 7–14 -10%/1 Wo |
//   >14 -20%/2 Wo (= ILLNESS_RECOVERY-Rampe).
// ---------------------------------------------------------------------------

/** 'minimal': auf die 2 ersten Übungen (nach order) kürzen, Sätze halbieren. */
function reduceMinimal(s: PlannedSession, now: string): PlannedSession {
  const ordered = [...s.exercises].sort((a, b) => a.order - b.order);
  const keep = new Set(ordered.slice(0, 2).map((e) => e.id));
  return {
    ...s,
    updatedAt: now,
    exercises: s.exercises
      .filter((pe) => keep.has(pe.id))
      .map((pe) => ({ ...pe, targetSets: Math.max(1, Math.round(pe.targetSets / 2)), updatedAt: now })),
  };
}

function vacationMode(
  weeks: PlanWeek[],
  framework: PlanFramework,
  marker: ParsedMarker,
  now: string,
): PlanWeek[] {
  const start = Date.parse(asStr(marker.payload.startDate));
  const end = Date.parse(asStr(marker.payload.endDate));
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return weeks; // ungültig

  const days = Math.round((end - start) / 86_400_000);
  const weeksSpan = Math.max(1, Math.ceil(days / 7));
  const minimal = asStr(marker.payload.mode) === 'minimal';
  const cur = framework.currentWeekIndex;
  const spanEnd = cur + weeksSpan - 1;

  // 1) Zeitraum pausieren bzw. minimieren.
  let next = mapWeeks(
    weeks,
    (w) => w.weekIndex >= cur && w.weekIndex <= spanEnd,
    (w) => ({
      ...w,
      updatedAt: now,
      sessions: w.sessions.map((s) =>
        minimal ? reduceMinimal(s, now) : { ...s, status: 'skipped' as const, updatedAt: now },
      ),
    }),
  );

  // 2) Auto-Rampback nach dem Urlaub, abhängig von der Pausenlänge.
  if (days >= 7) {
    const returnLoad = days > 14 ? 0.8 : 0.9;
    const rampWeeks = days > 14 ? 2 : 1;
    next = rampLoad(next, spanEnd + 1, returnLoad, rampWeeks, now);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Wendet EINEN Marker auf die Wochen an und gibt die (ggf. neuen) Wochen zurück.
 * Unbekannte Kinds sind No-ops — der Marker wird vom Aufrufer trotzdem
 * protokolliert.
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
    case 'EXERCISE_SWAP':
      return exerciseSwap(weeks, framework, marker, now);
    case 'EXERCISE_UPGRADE':
      return exerciseUpgrade(weeks, framework, marker, now);
    case 'PHASE_SHIFT':
      return phaseShift(weeks, framework, marker, now);
    case 'ILLNESS_RECOVERY':
      return illnessRecovery(weeks, framework, marker, now);
    case 'VACATION_MODE':
      return vacationMode(weeks, framework, marker, now);
    default:
      return weeks;
  }
}
