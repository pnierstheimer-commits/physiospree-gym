/**
 * Physiospree Gym — fachliche Konstanten (Single Source of Truth).
 *
 * Hier liegt die gesamte Trainings-/Coach-Domänenlogik in Datenform. UI und
 * Services lesen ausschließlich von hier — keine Magic Numbers verstreut im
 * Code (CLAUDE.md Regel 2). Die Coach-Logik (Regel 3) interpretiert diese
 * Werte, definiert sie aber nicht neu.
 *
 * GESCHÜTZTE DATEI — siehe CLAUDE.md, Regel 7.
 */

import type { BlockPhase, ExperienceLevel, Goal } from './types';

// ---------------------------------------------------------------------------
// Wiederholungsbereiche pro Trainingsziel
// ---------------------------------------------------------------------------

export const REP_RANGES: Record<Goal, { min: number; max: number }> = {
  strength: { min: 3, max: 6 },
  hypertrophy: { min: 8, max: 12 },
  endurance: { min: 15, max: 20 },
  general_fitness: { min: 8, max: 15 },
  rehab: { min: 12, max: 20 },
} as const;

// ---------------------------------------------------------------------------
// Ziel-RPE (Rate of Perceived Exertion, 1–10) pro Ziel
// ---------------------------------------------------------------------------

export const RPE_TARGETS: Record<Goal, number> = {
  strength: 8.5,
  hypertrophy: 8,
  endurance: 7,
  general_fitness: 7,
  rehab: 6,
} as const;

// ---------------------------------------------------------------------------
// Pausenzeiten in Sekunden pro Ziel
// ---------------------------------------------------------------------------

export const REST_TIMES: Record<Goal, number> = {
  strength: 180,
  hypertrophy: 90,
  endurance: 45,
  general_fitness: 75,
  rehab: 60,
} as const;

// ---------------------------------------------------------------------------
// Laststeigerung pro erfolgreicher Progression (in % des Arbeitsgewichts)
// ---------------------------------------------------------------------------

export const LOAD_INCREMENTS = {
  /** Untere/obere Körperhälfte unterscheiden sich im sinnvollen Sprung. */
  upperBodyPercent: 2.5,
  lowerBodyPercent: 5,
  /** Kleinste verfügbare Hantelscheibenstufe (kg) zum Runden. */
  minPlateStepKg: 1.25,
  /** Maximale Steigerung pro Woche (Deckel gegen Übersteuerung). */
  maxWeeklyPercent: 10,
} as const;

// ---------------------------------------------------------------------------
// Deload-Regeln
// ---------------------------------------------------------------------------

export const DELOAD = {
  /** Volumen wird auf diesen Anteil reduziert. */
  volumeMultiplier: 0.5,
  /** Intensität (Last) wird auf diesen Anteil reduziert. */
  intensityMultiplier: 0.85,
  /** Reguläre Deload alle N Wochen. */
  everyNWeeks: 4,
  /** Dauer eines Deloads in Wochen. */
  durationWeeks: 1,
} as const;

// ---------------------------------------------------------------------------
// Volumen-Vorgaben
// ---------------------------------------------------------------------------

export const SETS_PER_EXERCISE: Record<ExperienceLevel, { min: number; max: number }> = {
  beginner: { min: 2, max: 3 },
  intermediate: { min: 3, max: 4 },
  advanced: { min: 3, max: 5 },
} as const;

export const EXERCISES_PER_SESSION: Record<ExperienceLevel, { min: number; max: number }> = {
  beginner: { min: 4, max: 5 },
  intermediate: { min: 5, max: 7 },
  advanced: { min: 6, max: 8 },
} as const;

// ---------------------------------------------------------------------------
// Trainingssplit nach verfügbaren Tagen pro Woche
// ---------------------------------------------------------------------------

export const SPLIT_BY_DAYS: Record<number, string[]> = {
  1: ['Ganzkörper'],
  2: ['Ganzkörper A', 'Ganzkörper B'],
  3: ['Push', 'Pull', 'Legs'],
  4: ['Oberkörper', 'Unterkörper', 'Oberkörper', 'Unterkörper'],
  5: ['Push', 'Pull', 'Legs', 'Oberkörper', 'Unterkörper'],
  6: ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs'],
} as const;

// ---------------------------------------------------------------------------
// Schwellenwerte für den Tagesform-/Bereitschaftsstatus (Check-in)
// ---------------------------------------------------------------------------

/** Aggregierter Readiness-Score (0–100) → Statusampel. */
export const STATUS_THRESHOLDS = {
  green: 70, // >= 70: voll trainierbar
  yellow: 45, // 45–69: angepasstes Training
  red: 0, // < 45: Erholung/Deload empfohlen
} as const;

// ---------------------------------------------------------------------------
// Übertraining-Erkennung
// ---------------------------------------------------------------------------

export const OVERTRAINING_THRESHOLDS = {
  /** Anzahl aufeinanderfolgender Tage mit hohem Stress, bevor geflaggt wird. */
  consecutiveHighStressDays: 4,
  /** Schwelle für „hohen Stress“ auf 1–10 Skala. */
  highStressLevel: 7,
  /** Schwelle für anhaltend schlechten Schlaf (1–10, niedriger = schlechter). */
  lowSleepLevel: 4,
  /** Performance-Abfall (%) über mehrere Sessions, der ein Flag auslöst. */
  performanceDropPercent: 10,
  /** Anhaltende Muskelkater-Schwelle (1–10). */
  persistentSorenessLevel: 7,
} as const;

// ---------------------------------------------------------------------------
// Erholungsregeln
// ---------------------------------------------------------------------------

export const RECOVERY_RULES = {
  /** Mindestpause zwischen schweren Einheiten derselben Muskelgruppe (h). */
  minHoursBetweenSameMuscle: 48,
  /** Empfohlene Schlafdauer in Stunden. */
  recommendedSleepHours: 8,
  /** Bei rotem Status: Volumen auf diesen Anteil reduzieren. */
  redStatusVolumeMultiplier: 0.4,
  /** Bei gelbem Status: Volumen auf diesen Anteil reduzieren. */
  yellowStatusVolumeMultiplier: 0.7,
  /** Maximale Trainingstage in Folge ohne Ruhetag. */
  maxConsecutiveTrainingDays: 3,
} as const;

// ---------------------------------------------------------------------------
// Wiedereinstiegs-Protokoll (nach Pause/Verletzung)
// ---------------------------------------------------------------------------

export const RETURN_PROTOCOL = {
  /** Start-Last als Anteil des letzten bekannten Arbeitsgewichts. */
  startLoadPercent: 60,
  /** Wöchentliche Steigerung zurück zur Baseline (%). */
  weeklyRampPercent: 10,
  /** Wochen, über die der Wiedereinstieg gestreckt wird. */
  rampWeeks: 4,
  /** Bei wie vielen Tagen Pause das Protokoll greift. */
  triggersAfterDaysOff: 14,
  /** Start-Volumen als Anteil der regulären Vorgabe. */
  startVolumePercent: 50,
} as const;

// ---------------------------------------------------------------------------
// Progressionslogik
// ---------------------------------------------------------------------------

export const PROGRESSION = {
  /** Alle Zielwiederholungen erreicht → Last hochsetzen. */
  repsAchievedToProgress: true,
  /** Anzahl erfolgreicher Sessions vor Lasterhöhung. */
  successfulSessionsBeforeIncrease: 1,
  /** RPE unter diesem Wert → Progression möglich. */
  rpeCeilingForProgress: 8,
  /** Fehlversuche in Folge, bevor die Last reduziert wird. */
  failedSessionsBeforeDecrease: 2,
  /** Lastreduktion bei Stagnation (%). */
  deloadOnStallPercent: 10,
} as const;

// ---------------------------------------------------------------------------
// Blockstruktur (Mesozyklus-Aufbau)
// ---------------------------------------------------------------------------

export const BLOCK_STRUCTURE: {
  phases: { phase: BlockPhase; weeks: number; intensityFactor: number }[];
  defaultTotalWeeks: number;
} = {
  phases: [
    { phase: 'accumulation', weeks: 3, intensityFactor: 0.9 },
    { phase: 'intensification', weeks: 2, intensityFactor: 1.05 },
    { phase: 'peak', weeks: 1, intensityFactor: 1.1 },
    { phase: 'deload', weeks: 1, intensityFactor: DELOAD.intensityMultiplier },
  ],
  defaultTotalWeeks: 7,
} as const;

// ---------------------------------------------------------------------------
// Persistenz-Schemaversion (bei Breaking Changes erhöhen)
// ---------------------------------------------------------------------------

export const SCHEMA_VERSION = 1;

/** localStorage-Schlüssel für den persistierten App-State. */
export const STORAGE_KEY = 'physiospree.state.v1';
