/**
 * planMeta — reine Helfer rund um Plan-Anzeige (Regel 3/4, kein API/DB):
 *  - absolute Kalenderdaten aus weekIndex + scheduledDay (Punkt 2)
 *  - Kalibrierungs-Erkennung über das type-Feld mit Fallback (Punkt 3)
 *
 * Datumsbasis = `framework.generatedAt` (Plan-Erstellung). Woche 0 = die
 * Kalenderwoche (Mo–So) der Erstellung; eine Session liegt auf
 * Montag(start) + weekIndex*7 + Wochentags-Offset. Ohne gültiges Startdatum
 * (alter Plan) liefern die Funktionen null -> die UI fällt aufs relative Format
 * zurück. Rein client-seitig, kein Crash.
 */

import type { PlanFramework, PlannedSession, WeekDay } from '../../shared/types';

const WD_OFFSET: Record<WeekDay, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

/** Montag der Kalenderwoche des Plan-Startdatums (lokal, 00:00). null = ungültig. */
function planStartMonday(framework: PlanFramework): Date | null {
  const ms = Date.parse(framework.generatedAt ?? '');
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // 0 = Mo … 6 = So
  d.setDate(d.getDate() - dow);
  return d;
}

/** Absolutes Datum einer Session (weekIndex + Wochentag) oder null. */
export function sessionDate(
  framework: PlanFramework,
  weekIndex: number,
  day: WeekDay | undefined,
): Date | null {
  const mon = planStartMonday(framework);
  if (!mon || !day) return null;
  const d = new Date(mon);
  d.setDate(d.getDate() + weekIndex * 7 + (WD_OFFSET[day] ?? 0));
  return d;
}

/** Mo–So-Spanne einer Woche oder null. */
export function weekDateRange(
  framework: PlanFramework,
  weekIndex: number,
): { start: Date; end: Date } | null {
  const mon = planStartMonday(framework);
  if (!mon) return null;
  const start = new Date(mon);
  start.setDate(start.getDate() + weekIndex * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start, end };
}

/** "Dienstag, 17. Juni". */
export function formatSessionDate(d: Date): string {
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Kurzformat "16.6." für die Tagesplanung. */
export function formatShortDate(d: Date): string {
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' }) + '';
}

/** "16.–22. Juni" (gleicher Monat) bzw. "28. Juni – 4. Juli" (über Monatsgrenze). */
export function formatWeekRange(r: { start: Date; end: Date }): string {
  const sameMonth =
    r.start.getMonth() === r.end.getMonth() && r.start.getFullYear() === r.end.getFullYear();
  const endStr = r.end.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
  if (sameMonth) return `${r.start.getDate()}.–${endStr}`;
  const startStr = r.start.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
  return `${startStr} – ${endStr}`;
}

/**
 * Kalibrierungs-Einheit? Robust über `type`; Fallback für alte Pläne ohne Feld:
 * Name enthält "Kalibrierung" ODER es ist die erste Einheit der ersten Woche.
 */
export function isCalibrationSession(framework: PlanFramework, session: PlannedSession): boolean {
  if (session.type === 'calibration') return true;
  if (session.type === 'regular') return false;
  if (/kalibr/i.test(session.name)) return true;

  const firstWeekIndex = Math.min(...framework.weeks.map((w) => w.weekIndex));
  const week0 = framework.weeks.find((w) => w.weekIndex === firstWeekIndex);
  if (!week0 || week0.sessions.length === 0) return false;
  const firstSession = [...week0.sessions].sort((a, b) => a.dayIndex - b.dayIndex)[0];
  return firstSession.id === session.id;
}
