/**
 * Sync localStorage <-> Supabase (Phase 4).
 *
 * Strategie (Regel 5): jede Entität trägt id (UUID) + updatedAt. Sync läuft
 * additiv und non-blocking (Regel 9). Merge = Last-Write-Wins über updated_at,
 * Workouts append-only (Union über id). Alle Writes über den anon-Client; RLS
 * (auth.uid() = user_id) erzwingt die Zuordnung serverseitig.
 *
 * Mapping: Top-Level-Spalten snake_case; verschachtelte Strukturen
 * (plan_weeks.sessions, coach_actions.payload) bleiben als JSONB camelCase.
 * Lokale-only Felder ohne Tabelle (markers, parsedMarkers, exercises) werden
 * nicht synchronisiert.
 */

import { getSupabase } from './supabaseClient';
import { SCHEMA_VERSION } from '../shared/constants';
import type {
  ChatMessage,
  CheckinData,
  CoachAction,
  ParsedMarker,
  PersistedState,
  PlanFramework,
  PlanResponse,
  PlannedSession,
  PlanWeek,
  UserProfile,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '../shared/types';

export interface SyncResult {
  ok: boolean;
  pushed: number;
  pulled: number;
  syncedAt: string;
  error?: string;
  /** Gemergter State (nur bei fullSync gesetzt). */
  state?: PersistedState;
}

// ---------------------------------------------------------------------------
// Lese-Helfer (DB-Row -> Wert)
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const numOpt = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
const bool = (v: unknown): boolean => v === true;
const isoOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);

// ---------------------------------------------------------------------------
// Mapper: Profile
// ---------------------------------------------------------------------------

function profileToRow(p: UserProfile, userId: string): Row {
  return {
    id: p.id,
    user_id: userId,
    display_name: p.displayName,
    sex: p.sex,
    age: p.age ?? 0,
    goal_why: p.goalWhy ?? null,
    disclaimer_accepted: p.disclaimerAccepted ?? false,
    birth_year: p.birthYear ?? null,
    height_cm: p.heightCm ?? null,
    bodyweight_kg: p.bodyweightKg ?? null,
    goal: p.goal,
    experience: p.experience,
    days_per_week: p.daysPerWeek,
    equipment: p.equipment,
    notes: p.notes ?? null,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    deleted_at: p.deletedAt ?? null,
  };
}

function rowToProfile(r: Row): UserProfile {
  return {
    id: str(r.id),
    updatedAt: str(r.updated_at),
    deletedAt: isoOrNull(r.deleted_at),
    userId: str(r.user_id),
    displayName: str(r.display_name),
    sex: r.sex as UserProfile['sex'],
    age: numOpt(r.age),
    goalWhy: typeof r.goal_why === 'string' ? r.goal_why : undefined,
    disclaimerAccepted: bool(r.disclaimer_accepted),
    birthYear: numOpt(r.birth_year),
    heightCm: numOpt(r.height_cm),
    bodyweightKg: numOpt(r.bodyweight_kg),
    goal: r.goal as UserProfile['goal'],
    experience: r.experience as UserProfile['experience'],
    daysPerWeek: num(r.days_per_week),
    equipment: r.equipment as UserProfile['equipment'],
    markers: [],
    notes: typeof r.notes === 'string' ? r.notes : undefined,
    createdAt: str(r.created_at),
  };
}

// ---------------------------------------------------------------------------
// Mapper: Framework + Weeks
// ---------------------------------------------------------------------------

function frameworkToRow(f: PlanFramework, userId: string): Row {
  return {
    id: f.id,
    user_id: userId,
    name: f.name,
    goal: f.goal,
    days_per_week: f.daysPerWeek,
    total_weeks: f.totalWeeks,
    cycle_length_weeks: f.cycleLengthWeeks,
    current_week_index: f.currentWeekIndex,
    generated_at: f.generatedAt,
    coach_version: f.coachVersion ?? null,
    status: f.status,
    updated_at: f.updatedAt,
    deleted_at: f.deletedAt ?? null,
  };
}

function weekToRow(w: PlanWeek, frameworkId: string, userId: string): Row {
  return {
    id: w.id,
    framework_id: frameworkId,
    user_id: userId,
    week_index: w.weekIndex,
    phase: w.phase,
    intensity_factor: w.intensityFactor,
    is_deload: w.isDeload,
    sessions: w.sessions,
    updated_at: w.updatedAt,
    deleted_at: w.deletedAt ?? null,
  };
}

function rowToWeek(r: Row): PlanWeek {
  return {
    id: str(r.id),
    updatedAt: str(r.updated_at),
    deletedAt: isoOrNull(r.deleted_at),
    frameworkId: str(r.framework_id),
    weekIndex: num(r.week_index),
    phase: r.phase as PlanWeek['phase'],
    intensityFactor: num(r.intensity_factor),
    isDeload: bool(r.is_deload),
    sessions: (Array.isArray(r.sessions) ? r.sessions : []) as PlannedSession[],
  };
}

function rowsToFrameworks(fwRows: Row[], weekRows: Row[]): PlanFramework[] {
  const weeksByFw = new Map<string, PlanWeek[]>();
  for (const wr of weekRows) {
    const w = rowToWeek(wr);
    const arr = weeksByFw.get(w.frameworkId) ?? [];
    arr.push(w);
    weeksByFw.set(w.frameworkId, arr);
  }
  return fwRows.map((r) => {
    const id = str(r.id);
    const weeks = (weeksByFw.get(id) ?? []).sort((a, b) => a.weekIndex - b.weekIndex);
    return {
      id,
      updatedAt: str(r.updated_at),
      deletedAt: isoOrNull(r.deleted_at),
      userId: str(r.user_id),
      name: str(r.name),
      goal: r.goal as PlanFramework['goal'],
      daysPerWeek: num(r.days_per_week),
      totalWeeks: num(r.total_weeks),
      cycleLengthWeeks: num(r.cycle_length_weeks),
      currentWeekIndex: num(r.current_week_index),
      weeks,
      generatedAt: str(r.generated_at),
      coachVersion: typeof r.coach_version === 'string' ? r.coach_version : undefined,
      status: r.status as PlanFramework['status'],
    };
  });
}

// ---------------------------------------------------------------------------
// Mapper: Workout + Exercises + Sets
// ---------------------------------------------------------------------------

function workoutToRow(w: Workout, userId: string): Row {
  return {
    id: w.id,
    user_id: userId,
    planned_session_id: w.plannedSessionId ?? null,
    date: w.date,
    name: w.name,
    status: w.status,
    started_at: w.startedAt ?? null,
    completed_at: w.completedAt ?? null,
    total_duration_minutes: w.totalDuration ?? null,
    notes: w.notes ?? null,
    updated_at: w.updatedAt,
    deleted_at: w.deletedAt ?? null,
  };
}

function exerciseToRow(e: WorkoutExercise, userId: string): Row {
  return {
    id: e.id,
    workout_id: e.workoutId,
    user_id: userId,
    exercise_id: e.exerciseId,
    order: e.order,
    notes: e.notes ?? null,
    updated_at: e.updatedAt,
    deleted_at: e.deletedAt ?? null,
  };
}

function setToRow(s: WorkoutSet, userId: string): Row {
  return {
    id: s.id,
    workout_exercise_id: s.workoutExerciseId,
    user_id: userId,
    set_number: s.setNumber,
    reps: s.reps,
    weight_kg: s.weightKg,
    rpe: s.rpe ?? null,
    rir: s.rir ?? null,
    completed: s.completed,
    is_warmup: s.isWarmup,
    updated_at: s.updatedAt,
    deleted_at: s.deletedAt ?? null,
  };
}

function rowToSet(r: Row): WorkoutSet {
  return {
    id: str(r.id),
    updatedAt: str(r.updated_at),
    deletedAt: isoOrNull(r.deleted_at),
    workoutExerciseId: str(r.workout_exercise_id),
    setNumber: num(r.set_number),
    reps: num(r.reps),
    weightKg: num(r.weight_kg),
    rpe: numOpt(r.rpe),
    rir: numOpt(r.rir),
    completed: bool(r.completed),
    isWarmup: bool(r.is_warmup),
  };
}

function rowsToWorkouts(woRows: Row[], exRows: Row[], setRows: Row[]): Workout[] {
  const setsByEx = new Map<string, WorkoutSet[]>();
  for (const sr of setRows) {
    const s = rowToSet(sr);
    const arr = setsByEx.get(s.workoutExerciseId) ?? [];
    arr.push(s);
    setsByEx.set(s.workoutExerciseId, arr);
  }
  const exByWorkout = new Map<string, WorkoutExercise[]>();
  for (const er of exRows) {
    const id = str(er.id);
    const ex: WorkoutExercise = {
      id,
      updatedAt: str(er.updated_at),
      deletedAt: isoOrNull(er.deleted_at),
      workoutId: str(er.workout_id),
      exerciseId: str(er.exercise_id),
      order: num(er.order),
      sets: (setsByEx.get(id) ?? []).sort((a, b) => a.setNumber - b.setNumber),
      notes: typeof er.notes === 'string' ? er.notes : undefined,
    };
    const arr = exByWorkout.get(ex.workoutId) ?? [];
    arr.push(ex);
    exByWorkout.set(ex.workoutId, arr);
  }
  return woRows.map((r) => {
    const id = str(r.id);
    return {
      id,
      updatedAt: str(r.updated_at),
      deletedAt: isoOrNull(r.deleted_at),
      userId: str(r.user_id),
      plannedSessionId: isoOrNull(r.planned_session_id),
      date: str(r.date),
      name: str(r.name),
      status: r.status as Workout['status'],
      startedAt: typeof r.started_at === 'string' ? r.started_at : undefined,
      completedAt: typeof r.completed_at === 'string' ? r.completed_at : undefined,
      totalDuration: numOpt(r.total_duration_minutes),
      exercises: (exByWorkout.get(id) ?? []).sort((a, b) => a.order - b.order),
      checkin: null,
      notes: typeof r.notes === 'string' ? r.notes : undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// Mapper: Checkin + CoachAction
// ---------------------------------------------------------------------------

function checkinToRow(c: CheckinData, userId: string): Row {
  return {
    id: c.id,
    user_id: userId,
    workout_id: c.workoutId ?? null,
    date: c.date,
    sleep_quality: c.sleepQuality,
    stress: c.stress,
    soreness: c.soreness,
    motivation: c.motivation,
    energy: c.energy,
    bodyweight_kg: c.bodyweightKg ?? null,
    notes: c.notes ?? null,
    updated_at: c.updatedAt,
    deleted_at: c.deletedAt ?? null,
  };
}

function rowToCheckin(r: Row): CheckinData {
  return {
    id: str(r.id),
    updatedAt: str(r.updated_at),
    deletedAt: isoOrNull(r.deleted_at),
    userId: str(r.user_id),
    workoutId: isoOrNull(r.workout_id),
    date: str(r.date),
    sleepQuality: num(r.sleep_quality),
    stress: num(r.stress),
    soreness: num(r.soreness),
    motivation: num(r.motivation),
    energy: num(r.energy),
    bodyweightKg: numOpt(r.bodyweight_kg),
    notes: typeof r.notes === 'string' ? r.notes : undefined,
  };
}

function actionToRow(a: CoachAction, userId: string): Row {
  return {
    id: a.id,
    user_id: userId,
    type: a.type,
    rationale: a.rationale,
    target_id: a.targetId ?? null,
    payload: a.payload ?? null,
    accepted: a.accepted ?? null,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
    deleted_at: a.deletedAt ?? null,
  };
}

function rowToAction(r: Row): CoachAction {
  return {
    id: str(r.id),
    updatedAt: str(r.updated_at),
    deletedAt: isoOrNull(r.deleted_at),
    userId: str(r.user_id),
    type: r.type as CoachAction['type'],
    rationale: str(r.rationale),
    targetId: isoOrNull(r.target_id),
    payload:
      typeof r.payload === 'object' && r.payload !== null
        ? (r.payload as Record<string, unknown>)
        : undefined,
    accepted: typeof r.accepted === 'boolean' ? r.accepted : null,
    createdAt: str(r.created_at),
  };
}

// ---------------------------------------------------------------------------
// Mapper: ChatMessage (Coach-Chat, append-only)
// ---------------------------------------------------------------------------

function chatToRow(c: ChatMessage, userId: string): Row {
  return {
    id: c.id,
    user_id: userId,
    role: c.role,
    content: c.content,
    proposed_markers: c.proposedMarkers ?? null,
    status: c.status ?? null,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

function rowToChat(r: Row): ChatMessage {
  const m: ChatMessage = {
    id: str(r.id),
    role: r.role === 'coach' ? 'coach' : 'user',
    content: str(r.content),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
  if (Array.isArray(r.proposed_markers)) m.proposedMarkers = r.proposed_markers as ParsedMarker[];
  if (typeof r.status === 'string') m.status = r.status as ChatMessage['status'];
  return m;
}

// ---------------------------------------------------------------------------
// Sammeln aus dem State
// ---------------------------------------------------------------------------

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const it of items) map.set(it.id, it);
  return [...map.values()];
}

function collectFrameworks(state: PersistedState): PlanFramework[] {
  const all = [...state.frameworks];
  if (state.currentPlan) all.push(state.currentPlan.framework);
  return dedupeById(all);
}

function collectActions(state: PersistedState): CoachAction[] {
  const all = [...state.coachActions];
  if (state.currentPlan) all.push(...state.currentPlan.actions);
  return dedupeById(all);
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

export async function pushChanges(userId: string, state: PersistedState): Promise<SyncResult> {
  const now = new Date().toISOString();
  const supabase = getSupabase();
  if (!supabase) return { ok: false, pushed: 0, pulled: 0, syncedAt: now, error: 'offline' };

  let pushed = 0;
  const fail = (error: string): SyncResult => ({ ok: false, pushed, pulled: 0, syncedAt: now, error });

  const upsert = async (table: string, rows: Row[], onConflict?: string): Promise<string | null> => {
    if (rows.length === 0) return null;
    const { error } = await supabase
      .from(table)
      .upsert(rows, onConflict ? { onConflict } : undefined);
    if (error) return `${table}: ${error.message}`;
    pushed += rows.length;
    return null;
  };

  if (state.profile) {
    const e = await upsert('gym_user_profiles', [profileToRow(state.profile, userId)], 'user_id');
    if (e) return fail(e);
  }

  const frameworks = collectFrameworks(state);
  let e = await upsert('gym_plan_frameworks', frameworks.map((f) => frameworkToRow(f, userId)));
  if (e) return fail(e);
  e = await upsert(
    'gym_plan_weeks',
    frameworks.flatMap((f) => f.weeks.map((w) => weekToRow(w, f.id, userId))),
  );
  if (e) return fail(e);

  e = await upsert('gym_workouts', state.workouts.map((w) => workoutToRow(w, userId)));
  if (e) return fail(e);
  e = await upsert(
    'gym_workout_exercises',
    state.workouts.flatMap((w) => w.exercises.map((ex) => exerciseToRow(ex, userId))),
  );
  if (e) return fail(e);
  e = await upsert(
    'gym_workout_sets',
    state.workouts.flatMap((w) => w.exercises.flatMap((ex) => ex.sets.map((s) => setToRow(s, userId)))),
  );
  if (e) return fail(e);

  e = await upsert('gym_checkins', state.checkins.map((c) => checkinToRow(c, userId)));
  if (e) return fail(e);

  e = await upsert('gym_coach_actions', collectActions(state).map((a) => actionToRow(a, userId)));
  if (e) return fail(e);

  e = await upsert('gym_chat_messages', state.chatMessages.map((c) => chatToRow(c, userId)));
  if (e) return fail(e);

  return { ok: true, pushed, pulled: 0, syncedAt: now };
}

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

function basePersisted(): PersistedState {
  return {
    schemaVersion: SCHEMA_VERSION,
    stateUpdatedAt: new Date().toISOString(),
    lastSyncedAt: null,
    profile: null,
    frameworks: [],
    workouts: [],
    checkins: [],
    markers: [],
    coachActions: [],
    exercises: [],
    currentPlan: null,
    parsedMarkers: [],
    chatMessages: [],
    activeTab: 'today',
  };
}

export async function pullChanges(userId: string): Promise<PersistedState> {
  const base = basePersisted();
  const supabase = getSupabase();
  if (!supabase) return base;

  const table = (name: string) => supabase.from(name).select('*').eq('user_id', userId);
  const [profiles, frameworks, weeks, workouts, exercises, sets, checkins, actions, chat] =
    await Promise.all([
      table('gym_user_profiles'),
      table('gym_plan_frameworks'),
      table('gym_plan_weeks'),
      table('gym_workouts'),
      table('gym_workout_exercises'),
      table('gym_workout_sets'),
      table('gym_checkins'),
      table('gym_coach_actions'),
      table('gym_chat_messages'),
    ]);

  const profileRow = (profiles.data as Row[] | null)?.[0];
  base.profile = profileRow ? rowToProfile(profileRow) : null;
  base.frameworks = rowsToFrameworks(
    (frameworks.data as Row[]) ?? [],
    (weeks.data as Row[]) ?? [],
  );
  base.workouts = rowsToWorkouts(
    (workouts.data as Row[]) ?? [],
    (exercises.data as Row[]) ?? [],
    (sets.data as Row[]) ?? [],
  );
  base.checkins = ((checkins.data as Row[]) ?? []).map(rowToCheckin);
  base.coachActions = ((actions.data as Row[]) ?? []).map(rowToAction);
  base.chatMessages = ((chat.data as Row[]) ?? []).map(rowToChat);

  // currentPlan = aktives Framework (Fallback: zuletzt aktualisiert) + dessen Actions.
  const active =
    base.frameworks.find((f) => f.status === 'active') ??
    [...base.frameworks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ??
    null;
  if (active) {
    base.currentPlan = {
      framework: active,
      actions: base.coachActions.filter((a) => a.targetId === active.id),
    };
  }

  return base;
}

// ---------------------------------------------------------------------------
// Merge (Last-Write-Wins über updatedAt; Workouts append-only Union)
// ---------------------------------------------------------------------------

function mergeById<T extends { id: string; updatedAt: string }>(local: T[], server: T[]): T[] {
  const map = new Map<string, T>();
  for (const r of [...server, ...local]) {
    const ex = map.get(r.id);
    if (!ex || r.updatedAt >= ex.updatedAt) map.set(r.id, r);
  }
  return [...map.values()];
}

function pickNewer<T extends { updatedAt: string }>(a: T | null, b: T | null): T | null {
  if (!a) return b;
  if (!b) return a;
  return a.updatedAt >= b.updatedAt ? a : b;
}

function mergePlan(local: PlanResponse | null, server: PlanResponse | null): PlanResponse | null {
  if (!local) return server;
  if (!server) return local;
  return local.framework.updatedAt >= server.framework.updatedAt ? local : server;
}

function mergeStates(local: PersistedState, server: PersistedState): PersistedState {
  const now = new Date().toISOString();
  return {
    ...local,
    profile: pickNewer(local.profile, server.profile),
    frameworks: mergeById(local.frameworks, server.frameworks),
    workouts: mergeById(local.workouts, server.workouts), // append-only Union
    checkins: mergeById(local.checkins, server.checkins),
    coachActions: mergeById(local.coachActions, server.coachActions),
    chatMessages: mergeById(local.chatMessages, server.chatMessages),
    currentPlan: mergePlan(local.currentPlan, server.currentPlan),
    // Lokale-only Felder (markers, parsedMarkers, exercises) bleiben aus local.
    schemaVersion: SCHEMA_VERSION,
    stateUpdatedAt: now,
    lastSyncedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Full Sync
// ---------------------------------------------------------------------------

export async function fullSync(userId: string, localState: PersistedState): Promise<SyncResult> {
  const now = new Date().toISOString();
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, pushed: 0, pulled: 0, syncedAt: now, error: 'offline', state: localState };
  }

  const pushRes = await pushChanges(userId, localState);
  if (!pushRes.ok) return { ...pushRes, state: localState };

  const server = await pullChanges(userId);
  const merged = mergeStates(localState, server);
  const pulled =
    server.frameworks.length +
    server.workouts.length +
    server.checkins.length +
    server.coachActions.length +
    (server.profile ? 1 : 0);

  return { ok: true, pushed: pushRes.pushed, pulled, syncedAt: now, state: merged };
}
