-- ---------------------------------------------------------------------------
-- 007: Art.-9-Einwilligung (Gesundheitsdaten)
-- Ausdrückliche Einwilligung in die Verarbeitung gesundheitsbezogener Daten
-- (Art. 9 Abs. 2 lit. a DSGVO) — Pflicht-Step im Onboarding. DEFAULT FALSE,
-- damit Bestandszeilen nicht brechen. Idempotent.
-- ---------------------------------------------------------------------------

alter table public.gym_user_profiles
  add column if not exists art9_consent    boolean not null default false,
  add column if not exists art9_consent_at timestamptz;
