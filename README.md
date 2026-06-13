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
