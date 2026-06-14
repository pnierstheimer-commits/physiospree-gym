-- Physiospree Gym — Migration 002
-- PlanFramework: cycleLengthWeeks (Phase 1, Plan-Generator).
-- Single Source der Länge ist constants.ts (CYCLE_LENGTH_WEEKS); diese Spalte
-- spiegelt den Wert für Sync/Reporting. Deload ist immer die letzte Woche.
--
-- Hinweis: Seit dem gym_-Prefix-Schema (001) ist die Spalte bereits in
-- gym_plan_frameworks enthalten. Diese Migration bleibt idempotent als
-- historischer Marker.

alter table public.gym_plan_frameworks
  add column if not exists cycle_length_weeks int;

-- Bestandszeilen (falls vorhanden) auf total_weeks zurückführen.
update public.gym_plan_frameworks
   set cycle_length_weeks = total_weeks
 where cycle_length_weeks is null;
