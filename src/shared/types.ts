/**
 * Physiospree Gym — zentrale Typdefinitionen.
 *
 * Single Source of Truth für das gesamte Datenmodell. Jede persistierte
 * Entität trägt `id` (UUID) und `updatedAt` (ISO-String), damit Sync
 * konfliktfrei über Last-Write-Wins / Merge funktioniert (Sync-ready).
 *
 * GESCHÜTZTE DATEI — siehe CLAUDE.md, Regel 7. Änderungen nur bewusst und
 * mit Migration der abhängigen Schemata (constants.ts, SQL-Migrationen).
 */

// ---------------------------------------------------------------------------
// Basistypen
// ---------------------------------------------------------------------------

/** Eindeutige Kennung (UUID v4). */
export type UUID = string;

/** ISO-8601 Zeitstempel, z. B. "2026-06-13T10:00:00.000Z". */
export type ISODateString = string;

/** Felder, die jede synchronisierbare Entität besitzen muss. */
export interface Syncable {
  id: UUID;
  updatedAt: ISODateString;
  /** Soft-Delete-Marker für Sync (statt hartem Löschen). */
  deletedAt?: ISODateString | null;
}

export type Goal = 'strength' | 'hypertrophy' | 'endurance' | 'general_fitness' | 'rehab';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type Sex = 'male' | 'female' | 'other' | 'unspecified';
export type Equipment = 'full_gym' | 'home_basic' | 'bodyweight';
export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'
  | 'full_body';

/** Trainingsphase eines Mesozyklus. */
export type BlockPhase = 'accumulation' | 'intensification' | 'peak' | 'deload';

/** Verlauf/Status einer Trainingseinheit oder eines Workouts. */
export type SessionStatus = 'planned' | 'in_progress' | 'completed' | 'skipped';

// ---------------------------------------------------------------------------
// Nutzerprofil
// ---------------------------------------------------------------------------

export interface UserProfile extends Syncable {
  userId: UUID;
  displayName: string;
  sex: Sex;
  birthYear?: number;
  heightCm?: number;
  bodyweightKg?: number;
  goal: Goal;
  experience: ExperienceLevel;
  /** Verfügbare Trainingstage pro Woche (steuert das Split, siehe SPLIT_BY_DAYS). */
  daysPerWeek: number;
  equipment: Equipment;
  /** Aktive Marker (Verletzungen, Einschränkungen) — beeinflussen Coach-Logik. */
  markers: Marker[];
  /** Freitext-Notizen des Nutzers an den Coach. */
  notes?: string;
  createdAt: ISODateString;
}

// ---------------------------------------------------------------------------
// Plan: Framework → Woche → Session → Übung
// ---------------------------------------------------------------------------

/** Übergeordnetes Trainingsgerüst (Mesozyklus / Trainingsblock). */
export interface PlanFramework extends Syncable {
  userId: UUID;
  name: string;
  goal: Goal;
  daysPerWeek: number;
  /** Gesamtdauer in Wochen (inkl. Deload). */
  totalWeeks: number;
  /** Index der aktuell laufenden Woche (0-basiert). */
  currentWeekIndex: number;
  weeks: PlanWeek[];
  /** Zeitpunkt der Erstellung durch den Coach. */
  generatedAt: ISODateString;
  /** Modell-/Prompt-Version, mit der das Framework erzeugt wurde. */
  coachVersion?: string;
  status: 'active' | 'archived';
}

export interface PlanWeek extends Syncable {
  frameworkId: UUID;
  /** 0-basierter Wochenindex innerhalb des Frameworks. */
  weekIndex: number;
  phase: BlockPhase;
  /** Globaler Volumen-/Intensitätsmultiplikator dieser Woche (1.0 = Basis). */
  intensityFactor: number;
  isDeload: boolean;
  sessions: PlannedSession[];
}

export interface PlannedSession extends Syncable {
  weekId: UUID;
  /** 0-basierter Tag innerhalb der Woche. */
  dayIndex: number;
  name: string;
  /** Fokus-Muskelgruppen dieser Einheit (z. B. Push/Pull/Legs). */
  focus: MuscleGroup[];
  exercises: PlannedExercise[];
  /** Verknüpftes tatsächlich geloggtes Workout (falls absolviert). */
  workoutId?: UUID | null;
  status: SessionStatus;
}

export interface PlannedExercise extends Syncable {
  sessionId: UUID;
  exerciseId: UUID;
  /** Reihenfolge innerhalb der Session. */
  order: number;
  targetSets: number;
  /** Zielwiederholungen (Bereich), z. B. [8, 12]. */
  targetReps: [number, number];
  /** Ziel-RPE (Rate of Perceived Exertion, 1–10). */
  targetRPE: number;
  /** Pausenzeit in Sekunden. */
  restSeconds: number;
  /** Optionaler Lastvorschlag des Coaches in kg. */
  suggestedLoadKg?: number;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Workout-Logging (Satz-Level-Datenmodell, siehe CLAUDE.md Regel 6)
// ---------------------------------------------------------------------------

export interface Workout extends Syncable {
  userId: UUID;
  /** Verknüpfte geplante Session (falls aus Plan absolviert). */
  plannedSessionId?: UUID | null;
  date: ISODateString;
  name: string;
  status: SessionStatus;
  startedAt?: ISODateString;
  completedAt?: ISODateString;
  exercises: WorkoutExercise[];
  /** Check-in vor/nach dem Training. */
  checkin?: CheckinData | null;
  notes?: string;
}

export interface WorkoutExercise extends Syncable {
  workoutId: UUID;
  exerciseId: UUID;
  order: number;
  sets: WorkoutSet[];
  notes?: string;
}

/** Ein einzelner geloggter Satz — kleinste Einheit des Datenmodells. */
export interface WorkoutSet extends Syncable {
  workoutExerciseId: UUID;
  /** Satznummer innerhalb der Übung (1-basiert). */
  setNumber: number;
  reps: number;
  weightKg: number;
  /** Tatsächliches RPE des Satzes. */
  rpe?: number;
  /** Wiederholungen in Reserve (Reps in Reserve). */
  rir?: number;
  completed: boolean;
  /** Warm-up-Satz zählt nicht zum Arbeitsvolumen. */
  isWarmup: boolean;
}

// ---------------------------------------------------------------------------
// Check-in & Marker
// ---------------------------------------------------------------------------

/** Subjektive Tagesform — speist die Coach-/Recovery-Logik. */
export interface CheckinData extends Syncable {
  userId: UUID;
  workoutId?: UUID | null;
  date: ISODateString;
  /** Skalen jeweils 1–10. */
  sleepQuality: number;
  stress: number;
  soreness: number;
  motivation: number;
  energy: number;
  bodyweightKg?: number;
  notes?: string;
}

export type MarkerType = 'injury' | 'pain' | 'limitation' | 'fatigue' | 'overtraining' | 'illness';
export type MarkerSeverity = 'low' | 'moderate' | 'high';

/** Flag, das die Coach-Logik einschränkt oder anpasst (z. B. Verletzung). */
export interface Marker extends Syncable {
  userId: UUID;
  type: MarkerType;
  severity: MarkerSeverity;
  /** Betroffene Region/Muskelgruppe. */
  area?: MuscleGroup | string;
  description: string;
  /** Aktiv, solange nicht aufgelöst. */
  active: boolean;
  resolvedAt?: ISODateString | null;
}

// ---------------------------------------------------------------------------
// Coach-Aktionen
// ---------------------------------------------------------------------------

export type CoachActionType =
  | 'progress_load'
  | 'reduce_load'
  | 'deload'
  | 'swap_exercise'
  | 'add_recovery'
  | 'return_protocol'
  | 'maintain'
  | 'flag_overtraining';

/** Eine vom Coach getroffene/empfohlene Entscheidung — auditierbar. */
export interface CoachAction extends Syncable {
  userId: UUID;
  type: CoachActionType;
  /** Menschlich lesbare Begründung. */
  rationale: string;
  /** Betroffene Entität (Workout, Übung, Framework …). */
  targetId?: UUID | null;
  /** Strukturierte Payload der Empfehlung (z. B. neues Gewicht). */
  payload?: Record<string, unknown>;
  /** Wurde die Empfehlung vom Nutzer angenommen? */
  accepted?: boolean | null;
  createdAt: ISODateString;
}

// ---------------------------------------------------------------------------
// Übungskatalog
// ---------------------------------------------------------------------------

export interface ExerciseDefinition extends Syncable {
  name: string;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  equipment: Equipment;
  /** Grundübung (compound) vs. Isolationsübung. */
  isCompound: boolean;
  /** Übungen, die bei aktivem Marker als Ersatz dienen können. */
  alternativesFor?: UUID[];
  instructions?: string;
  videoUrl?: string;
}

// ---------------------------------------------------------------------------
// API-Verträge (Claude API über /api Routes)
// ---------------------------------------------------------------------------

/** Anfrage an die Plan-Generierung (api/claude-plan). */
export interface PlanRequest {
  profile: UserProfile;
  /** Bisherige Workouts als Kontext (optional, für Re-Planung). */
  recentWorkouts?: Workout[];
  /** Aktive Marker, die berücksichtigt werden müssen. */
  markers?: Marker[];
  /** Letzte Check-ins zur Tagesform. */
  recentCheckins?: CheckinData[];
}

export interface PlanResponse {
  framework: PlanFramework;
  /** Begleitende Coach-Aktionen/Hinweise zur Planerstellung. */
  actions: CoachAction[];
}

// ---------------------------------------------------------------------------
// Persistenz (localStorage / Sync-Snapshot)
// ---------------------------------------------------------------------------

/** Vollständiger App-State, wie er persistiert und synchronisiert wird. */
export interface PersistedState {
  /** Schemaversion für Migrationen. */
  schemaVersion: number;
  /** Zeitpunkt der letzten State-Änderung (treibt Sync). */
  stateUpdatedAt: ISODateString;
  /** Zeitpunkt des letzten erfolgreichen Syncs mit dem Backend. */
  lastSyncedAt?: ISODateString | null;
  profile: UserProfile | null;
  frameworks: PlanFramework[];
  workouts: Workout[];
  checkins: CheckinData[];
  markers: Marker[];
  coachActions: CoachAction[];
  /** Übungskatalog (lokal gecacht). */
  exercises: ExerciseDefinition[];
}
