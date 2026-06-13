# physiospree-gym
KI-Kraftcoach fürs Fitnessstudio

## API: Plan-Generator (`POST /api/claude-plan`)

Erzeugt aus einem `PlanRequest` einen vollständigen, gegen `src/shared/types.ts`
validierten `PlanResponse`. Die Zykluslänge kommt deterministisch aus
`CYCLE_LENGTH_WEEKS` (`src/shared/constants.ts`), der System-Prompt aus den
Bausteinen in `api/prompt/`. Modell: `claude-sonnet-4-6` (per `ANTHROPIC_MODEL`
override­bar).

### Lokal testen

```bash
# 1. Secrets setzen (siehe .env.example)
cp .env.example .env.local
# .env.local: ANTHROPIC_API_KEY=sk-ant-... eintragen

# 2. Vercel-Dev-Server starten (stellt /api-Functions bereit, Port 3000)
npx vercel dev
```

### Beispiel-Aufruf

```bash
curl -sS -X POST http://localhost:3000/api/claude-plan \
  -H 'content-type: application/json' \
  -d '{
    "profile": {
      "id": "11111111-1111-4111-8111-111111111111",
      "updatedAt": "2026-06-13T10:00:00.000Z",
      "userId": "22222222-2222-4222-8222-222222222222",
      "displayName": "Test-Klient",
      "sex": "male",
      "goal": "hypertrophy",
      "experience": "beginner",
      "daysPerWeek": 3,
      "equipment": "full_gym",
      "markers": [],
      "createdAt": "2026-06-13T10:00:00.000Z"
    }
  }' | jq '.framework.name, .framework.cycleLengthWeeks, (.framework.weeks | length), .actions[].rationale'
```

Erwartet: `cycleLengthWeeks = 8` (Hypertrophie/Beginner), die ersten 2 Wochen
ausdetailliert, Woche 1 / Einheit 1 mit „Kalibrierung" im Namen.

### Guard prüfen (Maximalkraft + Beginner → Hypertrophie)

`goal: "strength"` + `experience: "beginner"` wird automatisch auf Hypertrophie
umgeleitet; die `actions` enthalten dann ein `goal_redirect`:

```bash
curl -sS -X POST http://localhost:3000/api/claude-plan \
  -H 'content-type: application/json' \
  -d '{ "profile": { "id":"1...","updatedAt":"2026-06-13T10:00:00.000Z",
        "userId":"2...","displayName":"X","sex":"male","goal":"strength",
        "experience":"beginner","daysPerWeek":3,"equipment":"full_gym",
        "markers":[],"createdAt":"2026-06-13T10:00:00.000Z" } }' \
  | jq '.framework.goal, [.actions[].payload.kind]'
```

### Statuscodes

| Code | Bedeutung |
|------|-----------|
| 200  | `PlanResponse` (framework + actions) |
| 400  | Body kein JSON / `profile` unvollständig |
| 405  | falsche Methode (nur POST) |
| 422  | Modellantwort nicht parse-/validierbar (`unprocessable_plan`) |
| 500  | `ANTHROPIC_API_KEY` fehlt o. interner Fehler |
| 502  | Fehler der Claude API / leere Antwort |

## API: Post-Workout-Coach (`POST /api/claude-coach`)

Wertet ein **abgeschlossenes** Workout aus. Input: `{ workout: Workout, plan:
PlanResponse }`. Der System-Prompt wird fokussiert aus `api/prompt/` gebaut
(SKILL §7 Supervisor + §9 Auswertung, segmentspezifische Auswertungslogik,
`sound.md`, Zykluslängen-Modul). Modell: `claude-sonnet-4-6`, ohne Thinking.

### Beispiel-Aufruf

Body als Datei (`coach.json`) — abgeschlossenes Workout + Plan-Kontext. Minimal:

```jsonc
{
  "workout": {
    "id": "w1", "userId": "u1", "plannedSessionId": "s1", "name": "Ganzkörper A",
    "status": "completed", "date": "2026-06-13T12:00:00.000Z",
    "updatedAt": "2026-06-13T12:00:00.000Z", "deletedAt": null, "checkin": null,
    "exercises": [
      { "id": "we1", "workoutId": "w1", "exerciseId": "c1", "order": 0,
        "updatedAt": "x", "deletedAt": null, "notes": "Brustpresse — Cue",
        "sets": [
          { "id": "st1", "workoutExerciseId": "we1", "setNumber": 1, "reps": 15,
            "weightKg": 40, "rpe": 9, "completed": true, "isWarmup": false,
            "updatedAt": "x", "deletedAt": null }
        ] }
    ]
  },
  "plan": {
    "framework": {
      "id": "fw1", "userId": "u1", "name": "Hypertrophie-Zyklus (8 Wochen)",
      "goal": "hypertrophy", "daysPerWeek": 3, "totalWeeks": 8, "cycleLengthWeeks": 8,
      "currentWeekIndex": 0, "status": "active", "generatedAt": "x",
      "updatedAt": "x", "deletedAt": null,
      "weeks": [ { "id": "wk1", "frameworkId": "fw1", "weekIndex": 0,
        "phase": "accumulation", "intensityFactor": 0.9, "isDeload": false,
        "updatedAt": "x", "deletedAt": null, "sessions": [
          { "id": "s1", "weekId": "wk1", "dayIndex": 0, "name": "Ganzkörper A",
            "focus": [], "status": "planned", "workoutId": null,
            "updatedAt": "x", "deletedAt": null, "exercises": [
              { "id": "pe1", "sessionId": "s1", "exerciseId": "c1", "order": 0,
                "targetSets": 3, "targetReps": [8,15], "targetRPE": 9,
                "restSeconds": 90, "suggestedLoadKg": 40,
                "notes": "Brustpresse — Cue", "updatedAt": "x", "deletedAt": null }
            ] } ] } ]
    },
    "actions": []
  }
}
```

```bash
curl -sS -X POST http://localhost:3000/api/claude-coach \
  -H 'content-type: application/json' --data @coach.json \
  | jq '{overallRPE, evaluation: [.evaluation[] | {exerciseName, verdict, adjustment, newLoad}], markers: [.markers[].type]}'
```

Antwort (`CoachEvaluation`): `evaluation[]` (verdict/adjustment/newLoad/rationale
pro Übung), `markers[]` (§10-Vokabular), `overallRPE`, `coachMessage` (TRAIN-Sound).

### Statuscodes

| Code | Bedeutung |
|------|-----------|
| 200  | `CoachEvaluation` |
| 400  | Body kein JSON / `workout`+`plan` unvollständig / `status` ≠ `completed` |
| 405  | falsche Methode (nur POST) |
| 422  | Modellantwort nicht parse-/validierbar (`unprocessable_evaluation`) |
| 500  | `ANTHROPIC_API_KEY` fehlt o. interner Fehler |
| 502  | Fehler der Claude API / leere Antwort |
