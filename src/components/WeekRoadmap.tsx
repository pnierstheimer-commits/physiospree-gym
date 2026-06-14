/**
 * WeekRoadmap — kompakte Gesamtübersicht aller Wochen des Zyklus.
 *
 * UI-only (Regel 3): rendert eine Zeile pro Woche (Nr · Phase · Fokus · Status)
 * und meldet Klicks über onSelectWeek zurück. Keine Trainingsentscheidungen —
 * Status und Fokus sind reine Ableitungen aus den bereits geplanten Wochendaten.
 */

import type { BlockPhase, PlanWeek } from '../shared/types';
import '../screens/screens.css';

const PHASE_LABEL: Record<BlockPhase, string> = {
  accumulation: 'Akkumulation',
  intensification: 'Intensivierung',
  peak: 'Realisierung',
  deload: 'Deload',
};

const PHASE_VOLUME: Record<BlockPhase, string> = {
  accumulation: 'hoch',
  intensification: 'mittel',
  peak: 'niedrig',
  deload: 'reduziert',
};

/** Durchschnittliches Ziel-RPE der Woche (für den Fokus-Kurztext). */
function avgTargetRpe(week: PlanWeek): number | null {
  const rpes = week.sessions
    .flatMap((s) => s.exercises.map((e) => e.targetRPE))
    .filter((r): r is number => typeof r === 'number' && r > 0);
  if (rpes.length === 0) return null;
  return Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10;
}

function focusText(week: PlanWeek): string {
  if (week.isDeload) return 'Erholung · Last reduziert';
  const vol = `Volumen ${PHASE_VOLUME[week.phase]}`;
  const rpe = avgTargetRpe(week);
  return rpe != null ? `${vol} · RPE ${rpe}` : vol;
}

type WeekStatus = 'done' | 'current' | 'future';
function statusOf(weekIndex: number, currentWeek: number): WeekStatus {
  if (weekIndex < currentWeek) return 'done';
  if (weekIndex === currentWeek) return 'current';
  return 'future';
}

interface WeekRoadmapProps {
  weeks: PlanWeek[];
  /** Aktuell laufende Woche (framework.currentWeekIndex) — steuert die Status-Dots. */
  currentWeek: number;
  /** Im Detail geöffnete Woche — wird in der Liste hervorgehoben. */
  selectedWeek: number;
  onSelectWeek: (weekIndex: number) => void;
}

export function WeekRoadmap({
  weeks,
  currentWeek,
  selectedWeek,
  onSelectWeek,
}: WeekRoadmapProps) {
  const sorted = [...weeks].sort((a, b) => a.weekIndex - b.weekIndex);
  return (
    <div className="ps-roadmap">
      {sorted.map((week) => {
        const status = statusOf(week.weekIndex, currentWeek);
        const selected = week.weekIndex === selectedWeek;
        return (
          <button
            type="button"
            key={week.id}
            className={`ps-rm-row is-${status}${selected ? ' is-selected' : ''}`}
            onClick={() => onSelectWeek(week.weekIndex)}
            aria-current={status === 'current' ? 'step' : undefined}
            aria-expanded={selected}
          >
            <span className={`ps-rm-dot is-${status}`} aria-hidden="true" />
            <span className="ps-rm-no">Wo {week.weekIndex + 1}</span>
            <span className="ps-rm-phase">{PHASE_LABEL[week.phase]}</span>
            <span className="ps-rm-focus">{focusText(week)}</span>
          </button>
        );
      })}
    </div>
  );
}
