/**
 * PlanScreen — Plan-Anzeige mit Roadmap + Wochentags-Planung.
 *
 * Aufbau (von oben nach unten): Framework-Header (Ziel/Split/Woche X von Y) →
 * 12-Wochen-Roadmap → Tagesplanung der ausgewählten Woche (Drag-and-Drop Mo–So)
 * → Detail der angetippten Einheit. Nur eine Woche ist „offen" (selectedWeek).
 *
 * Coach-Chat lebt jetzt im CoachScreen, Historie/Progression im JournalScreen
 * (Nav-Umbau) — dieser Screen zeigt nur noch Plan + Tagesplanung.
 *
 * UI-only (Regel 3): keine Trainingsentscheidungen. Übungsname steckt in
 * `notes` ("Name — cue"), da `exerciseId` Platzhalter ist.
 */

import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../lib/state';
import { requestNextWindow, shouldGenerateNextWindow } from '../lib/services/windowService';
import { needsScheduling } from '../lib/services/scheduleService';
import { WeekRoadmap } from '../components/WeekRoadmap';
import { WeekDayPlanner } from '../components/WeekDayPlanner';
import { ExerciseInfo } from '../components/ExerciseInfo';
import {
  formatSessionDate,
  formatShortDate,
  formatWeekRange,
  isCalibrationSession,
  sessionDate,
  weekDateRange,
} from '../lib/services/planMeta';
import type { BlockPhase, CoachAction, Goal, PlannedExercise, PlannedSession } from '../shared/types';
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

/** Detailansicht einer angetippten Einheit (Übungen + Training starten). */
function SessionDetail({
  session,
  calib,
  date,
  onStart,
}: {
  session: PlannedSession;
  calib: boolean;
  date: string | null;
  onStart: (s: PlannedSession) => void;
}) {
  const exercises = [...session.exercises].sort((a, b) => a.order - b.order);
  return (
    <div className={`ps-day ps-day-detail${calib ? ' is-calibration' : ''}`}>
      <div className="ps-day-head">
        <span className="ps-day-title">{session.name}</span>
        {calib && <span className="ps-pill ps-pill-yellow">Kalibrierung</span>}
      </div>
      {date && <div className="ps-day-date">{date}</div>}
      <div className="ps-exlist">
        {exercises.map((ex) => {
          const { name, cue } = splitExercise(ex.notes);
          return (
            <div key={ex.id} className="ps-ex">
              <ExerciseInfo name={name} nameClass="ps-ex-name" />
              <span className="ps-ex-spec">{formatSpec(ex)}</span>
              {cue && <span className="ps-ex-cue">{cue}</span>}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="ps-btn ps-btn-primary ps-start-btn"
        onClick={() => onStart(session)}
      >
        Training starten
      </button>
    </div>
  );
}

export function PlanScreen() {
  const { currentPlan, clearPlan, startWorkout, setPlan, workoutHistory, updateWeekSessions, ensureSchedule } =
    useApp();

  const initialWeek = currentPlan?.framework.currentWeekIndex ?? 0;
  const [selectedWeek, setSelectedWeek] = useState(initialWeek);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [windowState, setWindowState] = useState<'idle' | 'generating' | 'error'>('idle');
  const [windowError, setWindowError] = useState<string | null>(null);

  // Auto-Verteilung fehlender Wochentage beim Laden (einmalig, deferred).
  useEffect(() => {
    if (currentPlan && needsScheduling(currentPlan.framework)) {
      const id = setTimeout(ensureSchedule, 0);
      return () => clearTimeout(id);
    }
  }, [currentPlan, ensureSchedule]);

  const runWindow = useCallback(() => {
    if (!currentPlan) return;
    setWindowState('generating');
    setWindowError(null);
    requestNextWindow(currentPlan, workoutHistory)
      .then((updated) => {
        setPlan(updated);
        setWindowState('idle');
      })
      .catch((err) => {
        setWindowError(err instanceof Error ? err.message : 'Unbekannter Fehler.');
        setWindowState('error');
      });
  }, [currentPlan, workoutHistory, setPlan]);

  // Nach dem Laden prüfen, ob das nächste Fenster fällig ist.
  useEffect(() => {
    if (!currentPlan || windowState !== 'idle') return;
    if (!shouldGenerateNextWindow(currentPlan, workoutHistory)) return;
    const id = setTimeout(runWindow, 0);
    return () => clearTimeout(id);
  }, [currentPlan, workoutHistory, windowState, runWindow]);

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
  const weeks = [...fw.weeks].sort((a, b) => a.weekIndex - b.weekIndex);
  const currentWeekObj = weeks.find((w) => w.weekIndex === fw.currentWeekIndex);
  const selectedWeekObj =
    weeks.find((w) => w.weekIndex === selectedWeek) ?? currentWeekObj ?? weeks[0] ?? null;
  const selectedSession = selectedWeekObj?.sessions.find((s) => s.id === selectedSessionId) ?? null;
  const firstWeekNo = (weeks[0]?.weekIndex ?? 0) + 1;

  const onSelectWeek = (weekIndex: number) => {
    setSelectedWeek(weekIndex);
    setSelectedSessionId(null);
  };
  const onSelectSession = (s: PlannedSession) =>
    setSelectedSessionId((prev) => (prev === s.id ? null : s.id));

  const onNewPlan = () => {
    if (window.confirm('Plan verwerfen? Dein aktueller Plan geht verloren.')) {
      clearPlan();
    }
  };

  return (
    <div className="ps-screen">
      <div className="ps-shell">
        {/* A) Framework-Header */}
        <div className="ps-plan-title">{fw.name}</div>
        <div className="ps-pills">
          <span className="ps-pill">{GOAL_LABEL[fw.goal]}</span>
          {split && <span className="ps-pill">{split}</span>}
          <span className="ps-pill ps-pill-muted">{fw.cycleLengthWeeks} Wochen</span>
        </div>
        <div className="ps-plan-sub">
          Woche {fw.currentWeekIndex + 1} von {fw.totalWeeks}
          {currentWeekObj && ` · ${PHASE_LABEL[currentWeekObj.phase]}`}
        </div>

        {windowState === 'generating' && (
          <div className="ps-window-banner">
            <div className="ps-spinner ps-spinner-sm" aria-hidden="true" />
            <span>Woche {firstWeekNo} abgeschlossen. Nächste 2 Wochen werden generiert …</span>
          </div>
        )}
        {windowState === 'error' && (
          <div className="ps-window-banner is-error">
            <div>
              <div>Konnte nächste Wochen nicht laden.</div>
              {windowError && <small className="ps-window-detail">{windowError}</small>}
            </div>
            <button type="button" className="ps-window-retry" onClick={runWindow}>
              Nochmal versuchen
            </button>
          </div>
        )}

        {/* B) Zyklus-Roadmap */}
        <div className="ps-section-label">Zyklus-Übersicht</div>
        <WeekRoadmap
          weeks={weeks}
          currentWeek={fw.currentWeekIndex}
          selectedWeek={selectedWeek}
          onSelectWeek={onSelectWeek}
        />

        {/* C) Tagesplanung der ausgewählten Woche */}
        {selectedWeekObj ? (
          <>
            <div className="ps-section-label">
              {(() => {
                const range = weekDateRange(fw, selectedWeekObj.weekIndex);
                return `Woche ${selectedWeekObj.weekIndex + 1}${
                  range ? ` — ${formatWeekRange(range)}` : ' — Tagesplanung'
                }`;
              })()}
              {selectedWeekObj.isDeload && (
                <span className="ps-pill ps-pill-yellow ps-section-pill">Deload</span>
              )}
            </div>
            {selectedWeekObj.sessions.length === 0 ? (
              <div className="ps-shell-week">
                <div className="ps-shell-week-phase">{PHASE_LABEL[selectedWeekObj.phase]}</div>
                {selectedWeekObj.focus && (
                  <div className="ps-shell-week-focus">{selectedWeekObj.focus}</div>
                )}
                <div className="ps-shell-week-hint">
                  Wird nach Woche 2 anhand deines Feedbacks generiert.
                </div>
              </div>
            ) : (
              <>
                <WeekDayPlanner
                  week={selectedWeekObj}
                  onReorder={(sessions) => updateWeekSessions(selectedWeekObj.id, sessions)}
                  selectedSessionId={selectedSessionId}
                  onSelectSession={onSelectSession}
                  dateForDay={(day) => {
                    const d = sessionDate(fw, selectedWeekObj.weekIndex, day);
                    return d ? formatShortDate(d) : null;
                  }}
                />
                {selectedSession ? (
                  <SessionDetail
                    session={selectedSession}
                    calib={isCalibrationSession(fw, selectedSession)}
                    date={(() => {
                      const d = sessionDate(fw, selectedWeekObj.weekIndex, selectedSession.scheduledDay);
                      return d ? formatSessionDate(d) : null;
                    })()}
                    onStart={startWorkout}
                  />
                ) : (
                  <div className="ps-day-hint">Tippe eine Einheit für Details &amp; Start.</div>
                )}
              </>
            )}
          </>
        ) : (
          <div className="ps-empty">Keine Detailwochen vorhanden.</div>
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
