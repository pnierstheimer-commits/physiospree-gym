/**
 * PlanScreen — echte Plan-Anzeige.
 *
 * Zwei Ebenen: (A) Framework-Übersicht mit abgeleiteter Block-Liste,
 * (B) Detail-Wochen als Akkordeon (eine Woche offen). UI-only (Regel 3):
 * keine Trainingsentscheidungen, nur Darstellung der bereits geplanten Daten.
 *
 * Datenlage: `PlanFramework` persistiert keine Block-Metadaten (das Coach-JSON
 * `blocks` wird im Generator verworfen). Die Block-Übersicht wird daher aus den
 * Wochen-Phasen abgeleitet (`PlanWeek.phase`/`intensityFactor`/`isDeload`).
 * Der Übungsname steckt in `notes` ("Name — cue"), da `exerciseId` ein
 * Platzhalter ist. "Level" ist nirgends persistiert und wird weggelassen.
 */

import { useState } from 'react';
import { useApp } from '../lib/state';
import type {
  BlockPhase,
  CoachAction,
  Goal,
  PlannedExercise,
  PlanWeek,
} from '../shared/types';
import './screens.css';

const GOAL_LABEL: Record<Goal, string> = {
  strength: 'Maximalkraft',
  hypertrophy: 'Hypertrophie',
  endurance: 'Kraftausdauer',
  general_fitness: 'Allgemein',
  rehab: 'Reha',
};

const PHASE_LABEL: Record<BlockPhase, string> = {
  accumulation: 'Akkumulation',
  intensification: 'Intensivierung',
  peak: 'Realisierung',
  deload: 'Deload',
};

const PHASE_FOCUS: Record<BlockPhase, string> = {
  accumulation: 'Volumen aufbauen',
  intensification: 'Intensität steigern',
  peak: 'Leistung realisieren',
  deload: 'Erholung',
};

/** Volumen-Label, abgeleitet aus der (bereits vom Coach gesetzten) Phase. */
const PHASE_VOLUME: Record<BlockPhase, string> = {
  accumulation: 'hoch',
  intensification: 'mittel',
  peak: 'niedrig',
  deload: 'reduziert',
};

interface DerivedBlock {
  phase: BlockPhase;
  startWeek: number;
  endWeek: number;
  intensityFactor: number;
  isDeload: boolean;
  containsCurrent: boolean;
}

/** Gruppiert die Detail-Wochen zu Blöcken (gleiche Phase = ein Block). */
function deriveBlocks(weeks: PlanWeek[], currentWeekIndex: number): DerivedBlock[] {
  const sorted = [...weeks].sort((a, b) => a.weekIndex - b.weekIndex);
  const blocks: DerivedBlock[] = [];
  for (const w of sorted) {
    const last = blocks[blocks.length - 1];
    if (last && last.phase === w.phase && last.isDeload === w.isDeload) {
      last.endWeek = w.weekIndex;
    } else {
      blocks.push({
        phase: w.phase,
        startWeek: w.weekIndex,
        endWeek: w.weekIndex,
        intensityFactor: w.intensityFactor,
        isDeload: w.isDeload,
        containsCurrent: false,
      });
    }
  }
  for (const b of blocks) {
    b.containsCurrent = currentWeekIndex >= b.startWeek && currentWeekIndex <= b.endWeek;
  }
  return blocks;
}

function weekRange(b: DerivedBlock): string {
  const start = b.startWeek + 1;
  const end = b.endWeek + 1;
  return start === end ? `Woche ${start}` : `Woche ${start}–${end}`;
}

/** Split steckt in der plan_created-Action-Payload. */
function extractSplit(actions: CoachAction[]): string | null {
  for (const a of actions) {
    const s = a.payload?.split;
    if (typeof s === 'string' && s.trim()) return s.trim();
  }
  return null;
}

/** Trennt Übungsname und Cue aus dem notes-Feld ("Name — cue"). */
function splitExercise(notes: string | undefined): { name: string; cue: string | null } {
  if (!notes) return { name: 'Übung', cue: null };
  const sep = ' — ';
  const idx = notes.indexOf(sep);
  if (idx === -1) return { name: notes, cue: null };
  return { name: notes.slice(0, idx), cue: notes.slice(idx + sep.length) };
}

function formatSpec(ex: PlannedExercise): string {
  const [min, max] = ex.targetReps;
  const reps = min === max ? `${min}` : `${min}–${max}`;
  let head = `${ex.targetSets} × ${reps}`;
  if (typeof ex.suggestedLoadKg === 'number') head += ` @ ${ex.suggestedLoadKg} kg`;
  return [head, `Pause ${ex.restSeconds}s`, `RPE ${ex.targetRPE}`].join(' · ');
}

function isCalibration(name: string): boolean {
  return /kalibr/i.test(name);
}

export function PlanScreen() {
  const { currentPlan, clearPlan } = useApp();
  // Default: erste Woche offen; -1 = alle zu (Akkordeon).
  const [openWeek, setOpenWeek] = useState(0);

  if (!currentPlan) {
    return (
      <div className="ps-screen">
        <div className="ps-shell">
          <div className="ps-empty">Kein Plan geladen.</div>
        </div>
      </div>
    );
  }

  const fw = currentPlan.framework;
  const split = extractSplit(currentPlan.actions);
  const blocks = deriveBlocks(fw.weeks, fw.currentWeekIndex);
  const weeks = [...fw.weeks].sort((a, b) => a.weekIndex - b.weekIndex);

  const toggleWeek = (i: number) => setOpenWeek((prev) => (prev === i ? -1 : i));

  const onNewPlan = () => {
    if (window.confirm('Plan verwerfen? Dein aktueller Plan geht verloren.')) {
      clearPlan();
    }
  };

  return (
    <div className="ps-screen">
      <div className="ps-shell">
        {/* A) Framework-Übersicht */}
        <div className="ps-plan-title">{fw.name}</div>
        <div className="ps-pills">
          <span className="ps-pill">{GOAL_LABEL[fw.goal]}</span>
          {split && <span className="ps-pill">{split}</span>}
          <span className="ps-pill ps-pill-muted">{fw.cycleLengthWeeks} Wochen</span>
        </div>

        <div className="ps-section-label">Blöcke</div>
        <div className="ps-blocks">
          {blocks.map((b, i) => (
            <div
              key={i}
              className={
                'ps-block' +
                (b.containsCurrent ? ' is-current' : '') +
                (b.isDeload ? ' is-deload' : '')
              }
            >
              <div className="ps-block-head">
                <span className="ps-block-name">{PHASE_LABEL[b.phase]}</span>
                <span className="ps-block-range">{weekRange(b)}</span>
              </div>
              <div className="ps-block-focus">{PHASE_FOCUS[b.phase]}</div>
              <div className="ps-block-meta">
                <span className="ps-meta">
                  Volumen <strong>{b.isDeload ? 'reduziert' : PHASE_VOLUME[b.phase]}</strong>
                </span>
                <span className="ps-meta">
                  Intensität <strong>×{b.intensityFactor.toFixed(2)}</strong>
                </span>
                {b.isDeload && <span className="ps-pill ps-pill-yellow">Deload</span>}
                {b.containsCurrent && <span className="ps-pill ps-pill-muted">Aktuell</span>}
              </div>
            </div>
          ))}
        </div>

        {/* B) Detail-Wochen */}
        <div className="ps-section-label">Wochen im Detail</div>
        {weeks.length === 0 ? (
          <div className="ps-empty">Keine Detailwochen vorhanden.</div>
        ) : (
          <div className="ps-weeks">
            {weeks.map((week, i) => {
              const open = openWeek === i;
              const sessions = [...week.sessions].sort((a, b) => a.dayIndex - b.dayIndex);
              return (
                <div key={week.id} className={`ps-week${open ? ' is-open' : ''}`}>
                  <button
                    type="button"
                    className="ps-week-head"
                    onClick={() => toggleWeek(i)}
                    aria-expanded={open}
                  >
                    <span className="ps-week-title">Woche {week.weekIndex + 1}</span>
                    <span className="ps-week-meta">
                      {week.isDeload && <span className="ps-pill ps-pill-yellow">Deload</span>}
                      <span>{sessions.length} Einheiten</span>
                      <span className="ps-chevron">▾</span>
                    </span>
                  </button>
                  <div className="ps-week-body">
                    <div className="ps-week-inner">
                      {sessions.map((session) => {
                        const calib = isCalibration(session.name);
                        const exercises = [...session.exercises].sort((a, b) => a.order - b.order);
                        return (
                          <div
                            key={session.id}
                            className={`ps-day${calib ? ' is-calibration' : ''}`}
                          >
                            <div className="ps-day-head">
                              <span className="ps-day-title">
                                Tag {session.dayIndex + 1} — {session.name}
                              </span>
                              {calib && <span className="ps-pill ps-pill-yellow">Kalibrierung</span>}
                            </div>
                            <div className="ps-exlist">
                              {exercises.map((ex) => {
                                const { name, cue } = splitExercise(ex.notes);
                                return (
                                  <div key={ex.id} className="ps-ex">
                                    <span className="ps-ex-name">{name}</span>
                                    <span className="ps-ex-spec">{formatSpec(ex)}</span>
                                    {cue && <span className="ps-ex-cue">{cue}</span>}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Neuer Plan */}
        <div className="ps-actions">
          <button type="button" className="ps-btn ps-btn-ghost ps-btn-quiet" onClick={onNewPlan}>
            Neuen Plan erstellen
          </button>
        </div>
      </div>
    </div>
  );
}
