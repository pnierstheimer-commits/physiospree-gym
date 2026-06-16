-- ---------------------------------------------------------------------------
-- 008: Tombstones für Plan-Reset (Cross-Device-Delete-Propagation)
-- deleted_at als Soft-Delete-Marker auf den beiden Plan-Tabellen. "Plan
-- zurücksetzen" setzt deleted_at statt hart zu löschen, damit andere Geräte
-- den Tombstone sehen und ihre lokale Kopie verwerfen (statt den Plan wieder
-- hochzuschieben). Idempotent — die Spalten existieren bereits (Sync-ready
-- Schema), dieser Eintrag dokumentiert/garantiert sie nur. NUR Gym-Tabellen.
-- ---------------------------------------------------------------------------

alter table public.gym_plan_frameworks add column if not exists deleted_at timestamptz;
alter table public.gym_plan_weeks      add column if not exists deleted_at timestamptz;
