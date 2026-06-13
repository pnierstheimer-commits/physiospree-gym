# Physiospree Gym

**KI-Kraftcoach fürs Fitnessstudio.** Eine PWA, die individuelle Trainingspläne
erstellt, Workouts auf Satz-Ebene protokolliert und per Claude-API als adaptiver
Coach Progression, Deload und Erholung steuert.

## Stack

- **Frontend:** Vite + React + TypeScript
- **Hosting/Serverless:** Vercel (`/api`-Functions)
- **Datenbank/Auth:** Supabase (Postgres + RLS)
- **KI-Coach:** Claude API (Anthropic) über serverseitige Routes
- **Offline:** localStorage-Persistenz, später Sync nach Supabase

## Architektur-Überblick

```
src/
  shared/      types.ts (Datenmodell), constants.ts (Fachlogik) — Single Source
  lib/
    state.tsx           AppProvider + useApp, localStorage-Persistenz
    supabaseClient.ts   Supabase-Client
    sync.ts             Sync localStorage <-> Supabase (Stub)
    services/           planService, coachService, workoutService (Coach-Logik)
api/                    claude-plan.ts, claude-coach.ts (Vercel Functions)
supabase/migrations/    SQL-Schema
public/manifest.json    PWA-Manifest
```

## Die 10 Projektregeln

1. **Funktionale State-Updates.** State nur über funktionale Updater ändern:
   `setState(prev => ...)`. Niemals den aktuellen State direkt referenzieren —
   das vermeidet Races und veraltete Closures.

2. **Single Source für Konstanten.** Alle fachlichen Zahlen/Bereiche leben in
   `src/shared/constants.ts`. Keine Magic Numbers in UI oder Services. Typen
   leben in `src/shared/types.ts`.

3. **Coach-Logik nie in der UI.** Komponenten rendern und lösen Aktionen aus,
   treffen aber keine Trainingsentscheidungen. Progression, Deload, Übertraining
   etc. gehören in `src/lib/services/`.

4. **Service-Layer.** Jeder fachliche Vorgang läuft über einen Service
   (`planService`, `coachService`, `workoutService`). Komponenten rufen Services,
   Services kapseln Logik und API-/DB-Zugriffe.

5. **Sync-ready mit UUID + updatedAt.** Jede persistierte Entität trägt eine
   `id` (UUID v4) und `updatedAt` (ISO). Löschen ist Soft-Delete (`deletedAt`).
   Das ermöglicht konfliktarmen Sync (Last-Write-Wins / Merge).

6. **Satz-Level-Datenmodell.** Kleinste Einheit ist der einzelne Satz
   (`WorkoutSet`: reps, weightKg, rpe/rir). Auswertung und Progression bauen auf
   Satzdaten auf — niemals aggregierte Werte als Quelle speichern.

7. **Geschützte Dateien.** `src/shared/types.ts` und `src/shared/constants.ts`
   sind das Fundament. Änderungen nur bewusst, mit Anpassung abhängiger Schemata
   (SQL-Migrationen, Services) und Schemaversion-Bump bei Breaking Changes.

8. **Zwei Geschwindigkeiten.** (a) *Schnell/lokal*: optimistische UI direkt aus
   dem lokalen State und deterministischen Konstanten — kein Warten auf die KI.
   (b) *Langsam/KI*: Claude-API für Planerstellung und adaptive Empfehlungen,
   asynchron im Hintergrund. Die App ist ohne KI-Antwort voll bedienbar.

9. **Offline-First.** localStorage ist die primäre Quelle zur Laufzeit. Alle
   Kernfunktionen (Workout loggen, Plan ansehen) funktionieren offline; Supabase-
   Sync ist additiv und darf nie blockieren.

10. **PWA.** Installierbar, mit Manifest und (später) Service Worker. Mobile-
    first, da die App im Studio am Handy genutzt wird.

## Konventionen

- TypeScript strict; keine `any` ohne Begründung.
- IDs via `uuid` (`v4`), Zeitstempel als ISO-String (`new Date().toISOString()`).
- Serverseitige Secrets (`ANTHROPIC_API_KEY`, Supabase Service Role) nur in
  `/api`-Functions, nie im Client-Bundle. Siehe `.env.example`.
