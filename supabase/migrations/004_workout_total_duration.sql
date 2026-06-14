-- ---------------------------------------------------------------------------
-- 004: Gesamtdauer einer Trainingseinheit (Nav 5)
-- Minuten, beim Workout-Abschluss gesetzt. Idempotent.
-- ---------------------------------------------------------------------------

alter table public.gym_workouts
  add column if not exists total_duration_minutes integer;
