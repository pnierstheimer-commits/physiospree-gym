/**
 * WeekRoadmap — Zyklus-Übersicht, nach Blöcken (Phasen) gruppiert.
 *
 * UI-only (Regel 3): gruppiert die Wochen in Blöcke (aufeinanderfolgende
 * gleiche Phase) und zeigt pro Block einen Header mit Kerninfo (was sich
 * ändert: Fokus/Volumen + RPE-Bereich), darunter die kompakten Wochen-Zeilen
 * (Nr + Status-Dot). Deload-Wochen sind eigens markiert. Klick auf eine Woche
 * meldet sie über onSelectWeek.
 */

import type { BlockPhase, PlanWeek } from '../shared/types';
import '../screens/screens.css';

const PHASE_LABEL: Record<BlockPhase, string> = {
  accumulation: 'Akkumulation',
  intensification: 'Intensivierung',
  peak: 'Realisierung',
  deload: 'Deload',
};

/** Kerninfo pro Phase (was sich im Block ändert). */
const PHASE_DESC: Record<BlockPhase, string> = {
  accumulation: 'Volumen hoch',
  intensification: 'Last rauf',
  peak: 'Maximaler Reiz',
  deload: 'Erholung · Last −40 %',
};

type WeekStatus = 'done' | 'current' | 'future';
function statusOf(weekIndex: number, currentWeek: number): WeekStatus {
  if (weekIndex < currentWeek) return 'done';
  if (weekIndex === currentWeek) return 'current';
  return 'future';
}

/** RPE-Bereich eines Blocks (min–max der Ziel-RPE über alle Wochen/Übungen). */
function blockRpe(weeks: PlanWeek[]): string {
  const rpes = weeks
    .flatMap((w) => w.sessions.flatMap((s) => s.exercises.map((e) => e.targetRPE)))
    .filter((r): r is number => typeof r === 'number' && r > 0);
  if (rpes.length === 0) return '';
  const min = Math.min(...rpes);
  const max = Math.max(...rpes);
  return min === max ? `${min}` : `${min}–${max}`;
}

interface BlockGroup {
  index: number;
  phase: BlockPhase;
  weeks: PlanWeek[];
}

/** Gruppiert Wochen in Blöcke (aufeinanderfolgende gleiche Phase + Deload-Flag). */
function groupBlocks(weeks: PlanWeek[]): BlockGroup[] {
  const sorted = [...weeks].sort((a, b) => a.weekIndex - b.weekIndex);
  const raw: { phase: BlockPhase; isDeload: boolean; weeks: PlanWeek[] }[] = [];
  for (const w of sorted) {
    const last = raw[raw.length - 1];
    if (last && last.phase === w.phase && last.isDeload === w.isDeload) {
      last.weeks.push(w);
    } else {
      raw.push({ phase: w.phase, isDeload: w.isDeload, weeks: [w] });
    }
  }
  return raw.map((b, i) => ({ index: i + 1, phase: b.phase, weeks: b.weeks }));
}

interface WeekRoadmapProps {
  weeks: PlanWeek[];
  /** Aktuell laufende Woche (framework.currentWeekIndex) — steuert die Status-Dots. */
  currentWeek: number;
  /** Im Detail geöffnete Woche — wird hervorgehoben. */
  selectedWeek: number;
  onSelectWeek: (weekIndex: number) => void;
}

export function WeekRoadmap({ weeks, currentWeek, selectedWeek, onSelectWeek }: WeekRoadmapProps) {
  const blocks = groupBlocks(weeks);

  return (
    <div className="ps-roadmap">
      {blocks.map((block) => {
        const rpe = blockRpe(block.weeks);
        const detail =
          block.phase === 'deload'
            ? PHASE_DESC.deload
            : `${PHASE_DESC[block.phase]}${rpe ? ` · RPE ${rpe}` : ''}`;
        return (
          <div key={block.index} className={`ps-rm-block${block.phase === 'deload' ? ' is-deload' : ''}`}>
            <div className="ps-rm-block-head">
              <span className="ps-rm-block-name">
                Block {block.index}: {PHASE_LABEL[block.phase]}
              </span>
              <span className="ps-rm-block-detail">{detail}</span>
            </div>

            <div className="ps-rm-weeks">
              {block.weeks.map((week) => {
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
                    <span
                      className={`ps-rm-dot is-${status}${week.isDeload ? ' is-deload' : ''}`}
                      aria-hidden="true"
                    />
                    <span className="ps-rm-no">Woche {week.weekIndex + 1}</span>
                    {status === 'current' && <span className="ps-rm-tag is-current">aktuell</span>}
                    {week.isDeload && <span className="ps-rm-tag is-deload">Deload</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
