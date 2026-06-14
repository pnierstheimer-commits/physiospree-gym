-- Physiospree Gym — Schema mit gym_-Prefix.
-- GETEILTE Supabase-Instanz mit der Running-App (physiospree-coach):
-- ein Account, zwei Apps. Alle Gym-Tabellen tragen das gym_-Prefix, um
-- Kollisionen mit den Running-Tabellen (workouts, user_profile, …) zu vermeiden.
-- Sync-ready: id (uuid) + updated_at (+ deleted_at Soft-Delete).
-- RLS aktiv: Nutzer sehen/ändern nur ihre eigenen Zeilen (auth.uid() = user_id).
-- FKs auf die gemeinsame auth.users.

create extension if not exists "pgcrypto";

-- --------------------------------------------------------------------------
-- Trigger-Funktion: updated_at automatisch pflegen (gym-spezifisch benannt,
-- um die Funktion der Running-App nicht zu überschreiben)
-- --------------------------------------------------------------------------
create or replace function public.gym_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- --------------------------------------------------------------------------
-- gym_user_profiles
-- --------------------------------------------------------------------------
create table if not exists public.gym_user_profiles (
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
-- gym_plan_frameworks  (inkl. cycle_length_weeks)
-- --------------------------------------------------------------------------
create table if not exists public.gym_plan_frameworks (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  name               text not null,
  goal               text not null,
  days_per_week      int  not null,
  total_weeks        int  not null,
  cycle_length_weeks int,
  current_week_index int  not null default 0,
  generated_at       timestamptz not null default now(),
  coach_version      text,
  status             text not null default 'active',
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);
create index if not exists idx_gym_plan_frameworks_user on public.gym_plan_frameworks (user_id);

-- --------------------------------------------------------------------------
-- gym_plan_weeks  (Sessions + geplante Übungen als JSONB)
-- --------------------------------------------------------------------------
create table if not exists public.gym_plan_weeks (
  id               uuid primary key default gen_random_uuid(),
  framework_id     uuid not null references public.gym_plan_frameworks (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  week_index       int  not null,
  phase            text not null,
  intensity_factor numeric not null default 1.0,
  is_deload        boolean not null default false,
  sessions         jsonb not null default '[]'::jsonb,
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index if not exists idx_gym_plan_weeks_framework on public.gym_plan_weeks (framework_id);

-- --------------------------------------------------------------------------
-- gym_workouts
-- --------------------------------------------------------------------------
create table if not exists public.gym_workouts (
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
create index if not exists idx_gym_workouts_user on public.gym_workouts (user_id, date);

-- --------------------------------------------------------------------------
-- gym_workout_exercises
-- --------------------------------------------------------------------------
create table if not exists public.gym_workout_exercises (
  id           uuid primary key default gen_random_uuid(),
  workout_id   uuid not null references public.gym_workouts (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  exercise_id  uuid not null,
  "order"      int  not null default 0,
  notes        text,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists idx_gym_workout_exercises_workout on public.gym_workout_exercises (workout_id);

-- --------------------------------------------------------------------------
-- gym_workout_sets  (Satz-Level-Datenmodell — kleinste Einheit)
-- --------------------------------------------------------------------------
create table if not exists public.gym_workout_sets (
  id                   uuid primary key default gen_random_uuid(),
  workout_exercise_id  uuid not null references public.gym_workout_exercises (id) on delete cascade,
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
create index if not exists idx_gym_workout_sets_exercise on public.gym_workout_sets (workout_exercise_id);

-- --------------------------------------------------------------------------
-- gym_checkins
-- --------------------------------------------------------------------------
create table if not exists public.gym_checkins (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  workout_id    uuid references public.gym_workouts (id) on delete set null,
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
create index if not exists idx_gym_checkins_user on public.gym_checkins (user_id, date);

-- --------------------------------------------------------------------------
-- gym_coach_actions
-- --------------------------------------------------------------------------
create table if not exists public.gym_coach_actions (
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
create index if not exists idx_gym_coach_actions_user on public.gym_coach_actions (user_id, created_at);

-- --------------------------------------------------------------------------
-- updated_at-Trigger + Row Level Security für alle gym_-Tabellen
-- --------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'gym_user_profiles', 'gym_plan_frameworks', 'gym_plan_weeks', 'gym_workouts',
    'gym_workout_exercises', 'gym_workout_sets', 'gym_checkins', 'gym_coach_actions'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists trg_set_updated_at on public.%I;', t);
    execute format(
      'create trigger trg_set_updated_at before update on public.%I
         for each row execute function public.gym_set_updated_at();', t);

    execute format('alter table public.%I enable row level security;', t);

    execute format('drop policy if exists owner_select on public.%I;', t);
    execute format('create policy owner_select on public.%I for select using (auth.uid() = user_id);', t);
    execute format('drop policy if exists owner_insert on public.%I;', t);
    execute format('create policy owner_insert on public.%I for insert with check (auth.uid() = user_id);', t);
    execute format('drop policy if exists owner_update on public.%I;', t);
    execute format('create policy owner_update on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id);', t);
    execute format('drop policy if exists owner_delete on public.%I;', t);
    execute format('create policy owner_delete on public.%I for delete using (auth.uid() = user_id);', t);
  end loop;
end;
$$;
