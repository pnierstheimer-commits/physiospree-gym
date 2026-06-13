-- Physiospree Gym — Initiales Schema
-- Sync-ready: jede Tabelle hat id (uuid) + updated_at (+ deleted_at Soft-Delete).
-- RLS aktiv: Nutzer sehen/ändern nur ihre eigenen Zeilen.

-- --------------------------------------------------------------------------
-- Erweiterungen
-- --------------------------------------------------------------------------
create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- --------------------------------------------------------------------------
-- Trigger-Funktion: updated_at automatisch pflegen
-- --------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- --------------------------------------------------------------------------
-- user_profiles
-- --------------------------------------------------------------------------
create table if not exists public.user_profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  display_name  text not null default '',
  sex           text not null default 'unspecified',
  birth_year    int,
  height_cm     numeric,
  bodyweight_kg numeric,
  goal          text not null default 'general_fitness',
  experience    text not null default 'beginner',
  days_per_week int  not null default 3,
  equipment     text not null default 'full_gym',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (user_id)
);

-- --------------------------------------------------------------------------
-- plan_frameworks
-- --------------------------------------------------------------------------
create table if not exists public.plan_frameworks (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  name               text not null,
  goal               text not null,
  days_per_week      int  not null,
  total_weeks        int  not null,
  current_week_index int  not null default 0,
  generated_at       timestamptz not null default now(),
  coach_version      text,
  status             text not null default 'active',
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);
create index if not exists idx_plan_frameworks_user on public.plan_frameworks (user_id);

-- --------------------------------------------------------------------------
-- plan_weeks  (enthält Sessions + geplante Übungen als JSONB, da rein vom Coach erzeugt)
-- --------------------------------------------------------------------------
create table if not exists public.plan_weeks (
  id               uuid primary key default gen_random_uuid(),
  framework_id     uuid not null references public.plan_frameworks (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  week_index       int  not null,
  phase            text not null,
  intensity_factor numeric not null default 1.0,
  is_deload        boolean not null default false,
  sessions         jsonb not null default '[]'::jsonb,
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index if not exists idx_plan_weeks_framework on public.plan_weeks (framework_id);

-- --------------------------------------------------------------------------
-- workouts
-- --------------------------------------------------------------------------
create table if not exists public.workouts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  planned_session_id  uuid,
  date                timestamptz not null default now(),
  name                text not null,
  status              text not null default 'planned',
  started_at          timestamptz,
  completed_at        timestamptz,
  notes               text,
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index if not exists idx_workouts_user on public.workouts (user_id);
create index if not exists idx_workouts_date on public.workouts (user_id, date);

-- --------------------------------------------------------------------------
-- workout_exercises
-- --------------------------------------------------------------------------
create table if not exists public.workout_exercises (
  id           uuid primary key default gen_random_uuid(),
  workout_id   uuid not null references public.workouts (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  exercise_id  uuid not null,
  "order"      int  not null default 0,
  notes        text,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists idx_workout_exercises_workout on public.workout_exercises (workout_id);

-- --------------------------------------------------------------------------
-- workout_sets  (Satz-Level-Datenmodell — kleinste Einheit)
-- --------------------------------------------------------------------------
create table if not exists public.workout_sets (
  id                   uuid primary key default gen_random_uuid(),
  workout_exercise_id  uuid not null references public.workout_exercises (id) on delete cascade,
  user_id              uuid not null references auth.users (id) on delete cascade,
  set_number           int  not null,
  reps                 int  not null default 0,
  weight_kg            numeric not null default 0,
  rpe                  numeric,
  rir                  numeric,
  completed            boolean not null default false,
  is_warmup            boolean not null default false,
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);
create index if not exists idx_workout_sets_exercise on public.workout_sets (workout_exercise_id);

-- --------------------------------------------------------------------------
-- checkins
-- --------------------------------------------------------------------------
create table if not exists public.checkins (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  workout_id    uuid references public.workouts (id) on delete set null,
  date          timestamptz not null default now(),
  sleep_quality int not null default 5,
  stress        int not null default 5,
  soreness      int not null default 5,
  motivation    int not null default 5,
  energy        int not null default 5,
  bodyweight_kg numeric,
  notes         text,
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists idx_checkins_user on public.checkins (user_id, date);

-- --------------------------------------------------------------------------
-- coach_actions
-- --------------------------------------------------------------------------
create table if not exists public.coach_actions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  type       text not null,
  rationale  text not null,
  target_id  uuid,
  payload    jsonb,
  accepted   boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_coach_actions_user on public.coach_actions (user_id, created_at);

-- --------------------------------------------------------------------------
-- updated_at-Trigger für alle Tabellen
-- --------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'user_profiles', 'plan_frameworks', 'plan_weeks', 'workouts',
    'workout_exercises', 'workout_sets', 'checkins', 'coach_actions'
  ];
begin
  foreach t in array tables loop
    execute format(
      'drop trigger if exists trg_set_updated_at on public.%I;', t
    );
    execute format(
      'create trigger trg_set_updated_at before update on public.%I
         for each row execute function public.set_updated_at();', t
    );
  end loop;
end;
$$;

-- --------------------------------------------------------------------------
-- Row Level Security: nur Eigentümer (auth.uid() = user_id)
-- --------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'user_profiles', 'plan_frameworks', 'plan_weeks', 'workouts',
    'workout_exercises', 'workout_sets', 'checkins', 'coach_actions'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security;', t);

    execute format('drop policy if exists owner_select on public.%I;', t);
    execute format(
      'create policy owner_select on public.%I
         for select using (auth.uid() = user_id);', t);

    execute format('drop policy if exists owner_insert on public.%I;', t);
    execute format(
      'create policy owner_insert on public.%I
         for insert with check (auth.uid() = user_id);', t);

    execute format('drop policy if exists owner_update on public.%I;', t);
    execute format(
      'create policy owner_update on public.%I
         for update using (auth.uid() = user_id) with check (auth.uid() = user_id);', t);

    execute format('drop policy if exists owner_delete on public.%I;', t);
    execute format(
      'create policy owner_delete on public.%I
         for delete using (auth.uid() = user_id);', t);
  end loop;
end;
$$;
