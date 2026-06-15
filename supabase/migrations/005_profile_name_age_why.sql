-- ---------------------------------------------------------------------------
-- 005: Onboarding "Kurz zu dir" — Alter + Warum
-- Name nutzt die bestehende Spalte `display_name` (= Vorname). Neu: `age`
-- (15–99 wird in der App erzwungen, analog zum bestehenden Validierungs-Pattern;
-- DEFAULT 0 statt DB-CHECK, damit Bestandszeilen nicht brechen) und das
-- optionale `goal_why`. Idempotent.
-- ---------------------------------------------------------------------------

alter table public.gym_user_profiles
  add column if not exists age      integer not null default 0,
  add column if not exists goal_why text;
