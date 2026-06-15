-- ---------------------------------------------------------------------------
-- 006: Haftungs-/Gesundheitshinweis (DisclaimerGate)
-- Einmalige Bestätigung vor der ersten Plan-Erstellung. DEFAULT FALSE, damit
-- Bestandszeilen nicht brechen. Idempotent.
-- ---------------------------------------------------------------------------

alter table public.gym_user_profiles
  add column if not exists disclaimer_accepted boolean not null default false;
