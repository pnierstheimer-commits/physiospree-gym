-- 009: Übung während des Trainings überspringen.
-- Exercise-Level-Skip-Flag auf gym_workout_exercises. Eine geskippte Übung ist
-- eindeutig von "erledigt" (hat Sätze) UND "offen" (keine Sätze, skipped=false)
-- unterscheidbar. Geskippte Übungen fließen NICHT als Leistungsdaten in die
-- Coach-Auswertung/Progression ein (Filterung client-seitig vor dem Payload).
-- Idempotent; nur die app-eigene gym_-Tabelle betroffen.

alter table public.gym_workout_exercises
  add column if not exists skipped boolean not null default false;
