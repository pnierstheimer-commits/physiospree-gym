/**
 * scheduleService — Wochentags-Zuordnung der geplanten Sessions.
 *
 * Reine, deterministische Domänenlogik (Regel 3/4): die UI triggert nur,
 * entscheidet aber nicht. Verteilt fehlende `scheduledDay`-Felder anhand der
 * Single-Source-Konstante DEFAULT_TRAINING_DAYS und stellt die Helfer für die
 * manuelle Umplanung (Drag-and-Drop) bereit.
 *
 * Persistenz: `scheduledDay` lebt im `sessions`-JSONB von gym_plan_weeks und
 * wird vom bestehenden Sync ohne Schema-Migration mitgeführt.
 */

import { DEFAULT_TRAINING_DAYS, WEEKDAYS } from '../../shared/constants';
import type { PlanFramework, PlannedSession, PlanWeek, WeekDay } from '../../shared/types';

/** Standardtage für n Trainingstage; Fallback = die ersten n Wochentage. */
export function defaultDaysForCount(count: number): WeekDay[] {
  const preset = DEFAULT_TRAINING_DAYS[count];
  if (preset) return preset;
  const n = Math.max(1, Math.min(count || 1, WEEKDAYS.length));
  return WEEKDAYS.slice(0, n);
}

/**
 * Belegt fehlende `scheduledDay`-Felder einer Woche anhand der dayIndex-
 * Reihenfolge. Bereits gesetzte Tage bleiben unangetastet.
 */
export function assignDefaultDays(
  sessions: PlannedSession[],
  daysPerWeek: number,
): PlannedSession[] {
  const days = defaultDaysForCount(daysPerWeek || sessions.length);
  const ordered = [...sessions].sort((a, b) => a.dayIndex - b.dayIndex);
  const dayById = new Map<string, WeekDay>();
  ordered.forEach((s, i) => {
    dayById.set(s.id, days[i % days.length] ?? WEEKDAYS[i % WEEKDAYS.length]);
  });
  return sessions.map((s) => (s.scheduledDay ? s : { ...s, scheduledDay: dayById.get(s.id) }));
}

/** True, wenn mindestens eine Session noch keinen Wochentag hat. */
export function needsScheduling(framework: PlanFramework): boolean {
  return framework.weeks.some((w) => w.sessions.some((s) => !s.scheduledDay));
}

/**
 * Füllt fehlende `scheduledDay`-Felder über alle Wochen. Gibt das (ggf. neue)
 * Framework und ein `changed`-Flag zurück, damit der Aufrufer unnötige
 * State-/Sync-Writes vermeiden kann.
 */
export function ensureScheduledDays(framework: PlanFramework): {
  framework: PlanFramework;
  changed: boolean;
} {
  if (!needsScheduling(framework)) return { framework, changed: false };
  const weeks: PlanWeek[] = framework.weeks.map((w) =>
    w.sessions.every((s) => s.scheduledDay)
      ? w
      : { ...w, sessions: assignDefaultDays(w.sessions, framework.daysPerWeek) },
  );
  return { framework: { ...framework, weeks }, changed: true };
}
