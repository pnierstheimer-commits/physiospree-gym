# Prompt-Modul: Zykluslänge + komprimierte Blöcke + Output-Vertrag

> Phase 1, Schritt 1 — Delta zum Coach-Skill V1.
> Die 6 Skill-Dateien bleiben unverändert. Dieses Modul wird als zusätzlicher
> Abschnitt in den System-Prompt von `api/claude-plan.ts` eingehängt (siehe §4).

---

## 1. Zykluslänge (Segment × Level)

Die Zykluslänge ist **kein fester String "12"**, sondern eine aus Segment und Level
abgeleitete Variable. Der Deload ist immer die letzte Woche, egal welche Länge.

| Segment | Beginner | Intermediate | Advanced |
|---|---|---|---|
| Hypertrophie | **8** | **8** | **12** |
| Maximalkraft | → Hypertrophie | **12** | **12** |
| Kraftausdauer | **6** | **8** | **8** |

**Begründung (eine Zeile pro Segment):**
- **Maximalkraft = 12, nicht kürzer.** Anpassung ist neuronal; der Kraftgewinn drückt sich erst in der Realisierungsphase (Wo 9–11) aus. Kürzen kappt den Peak. Beginner haben hier keinen Eintrag — werden auf Hypertrophie umgeleitet (≥6 Monate Basis nötig).
- **Hypertrophie = 8 Default, 12 für Advanced.** Volumengetrieben und verzeihend. 8 Wochen holen den Großteil des Reizes; den letzten Peak-Prozent über 12 brauchen nur Fortgeschrittene.
- **Kraftausdauer = 6 (Beginner) / 8 (Int+Adv).** Progressionshebel ist Dichte (Pausen verkürzen), greift schnell. 6 Wochen sind ein vollständiger Zyklus.

**Produktkonsequenz:** Die Entscheidung "Wechsel nur nach 12-Wochen-Zyklus" wird zu
**"Wechsel nur nach Zyklusende, Länge segment-/level-abhängig (6/8/12)"**. Das Rolling-
2-Wochen-Fenster versteckt die Gesamtlänge ohnehin — die UX ändert sich nicht.

---

## 2. Komprimierte Blockstrukturen

Die Block-Logik (Akkumulation → Intensivierung → Realisierung, Davidson-Regel:
Volumen/Intensität invers, eine Priorität pro Block) bleibt. Bei 6/8 Wochen werden
Intensivierung und Realisierung in einen Block gezogen. Deload immer letzte Woche.

Detail-Generierung (erste 2 Wochen voll, Kalibrierung = Wo 1/Einheit 1, Rolling-Fenster)
ist **identisch** für alle Längen — nur das Framework wird kürzer.

### Hypertrophie — 8 Wochen, Beginner (linear)
- Wo 1–3: Technik + Gewöhnung (RPE **8**, RIR 2, Rep-Range 8–15, Bewegung lernen)
- Wo 4–7: Aufbau + Belastung (Wo 4–5 RPE **9**, Wo 6–7 RPE **9–10**, Progression startet)
- Wo 8: Deload (RPE 6–7, Volumen −40 %, Gewichte beibehalten)
- → danach Neu-Kalibrierung (früher Re-Assessment-Punkt = Feature, kein Kompromiss)

### Hypertrophie — 8 Wochen, Intermediate (Block)
- Block 1 — Akkumulation (Wo 1–4): Vol HOCH (12→16 Sätze), RPE 9, Rep 10–15, Pause 60–90 s
- Block 2 — Intensivierung/Realisierung (Wo 5–7): Vol MITTEL (12 Sätze), RPE 9–10, Rep 8–12, Pause 90–120 s; echtes Versagen ab Wo 7
- Wo 8: Deload (Vol −40 %, RPE 6–7, Gewichte halten)

### Hypertrophie — 12 Wochen, Advanced
→ unverändert. Blockstruktur aus `references/hypertrophy.md` (Wo 1–4 / 5–8 / 9–11 + Deload 12).

### Maximalkraft — 12 Wochen (Intermediate + Advanced)
→ unverändert. Blockstruktur aus `references/maxstrength.md` (Vol-Akku 1–4 / Intens 5–8 / Real 9–11 + Deload 12). Keine 6/8-Variante — 12 ist die Untergrenze.

### Kraftausdauer — 6 Wochen, Beginner
- Wo 1–2: Gewöhnung + Technik (2×15, Pause 60 s, RPE 6–7, klassische Sätze)
- Wo 3–5: Dichte (Wo 3: 3×18 / Wo 4–5: 3×20, Pause 50 s→45 s, RPE 7–8)
- Wo 6: Deload (2×15, Pause 60 s, RPE 5–6)

### Kraftausdauer — 8 Wochen, Intermediate + Advanced
- Block 1 — Gewöhnung + Kapazität (Wo 1–3): 2–3×15, Pause 60 s, RPE 6–7, klassische Sätze
- Block 2 — Dichte (Wo 4–7): 3–4×20, Pause 45 s, RPE 7–8, Supersätze ab Wo 5
- Wo 8: Deload (2×15, Pause 60 s, RPE ≤6)

---

## 3. Output-Vertrag (PlanRequest → PlanResponse)

Der Generator antwortet mit **`coachMessage` (Freitext im TRAIN-Sound) PLUS einem
JSON-Block in genau dieser Struktur**. Ohne feste Struktur wird das Parsing Raterei.

```jsonc
{
  "framework": {
    "segment": "hypertrophie | maximalkraft | kraftausdauer",
    "level": "beginner | intermediate | advanced",
    "split": "GK/GK/GK | OK/UK/GK | 2xOK/2xUK | 2xGK",
    "cycleLengthWeeks": 8,            // NEU — abgeleitet aus Segment × Level (§1)
    "blocks": [
      {
        "name": "Akkumulation",
        "weeks": "1-4",
        "focus": "Volumen aufbauen",
        "volume": "hoch",
        "intensity": "moderat",
        "repRange": "10-15",
        "rpe": "9",
        "isDeload": false
      }
      // ... weitere Blöcke; letzter Block immer isDeload: true
    ]
  },
  "detailWeeks": [
    // die ersten 2 Wochen voll ausdetailliert:
    // Woche -> Tage -> Übungen -> Sätze (Range, Last, Pause, RPE-Ziel, Cue)
    // Woche 1 / Einheit 1 = type: "calibration"
  ],
  "markers": [],                      // beim ersten Plan i.d.R. leer
  "coachMessage": "Freitext, TRAIN-Sound: was der Plan ist, was als Erstes zählt."
}
```

**OFFEN — in Schritt 2 (Claude Code) gegen `types.ts` abgleichen:**
Die Feldnamen oben sind ein Vorschlag. `types.ts` liegt im Code-Repo (nicht in diesem
Projekt) und ist die verbindliche Quelle. Vor dem Generator-Bau abgleichen.

**Zwei Code-seitige Folge-Todos durch die Zykluslängen-Entscheidung:**
1. `cycleLengthWeeks` zu `PlanFramework` in `types.ts` hinzufügen *(geschützte Datei — bewusst ändern)*.
2. Segment×Level→Länge-Mapping in `shared/constants.ts` als Single Source ablegen
   (Architektur-Regel 2). Der Prompt liest die Länge nicht "frei", sie kommt aus der Konstante.

---

## 4. So wird der System-Prompt zusammengesetzt

Pro Anfrage (Segment ist bekannt) wird der System-Prompt aus diesen Bausteinen gebaut:

```
[ SKILL.md ]                      # Rolle, Ablauf, Supervisor-Regeln
+ [ aktive Segment-Referenz ]     # nur die zum Segment passende:
                                  #   hypertrophy.md | maxstrength.md | strength-endurance.md
+ [ exercises.md ]                # Übungsauswahl + verbindliche Reihenfolge
+ [ sound.md ]                    # TRAIN/READ-Sound
+ [ DIESES MODUL §1–§3 ]          # Zykluslänge, komprimierte Blöcke, Output-Vertrag
```

Empfehlung (offener Punkt aus Schritt 2): Prompt-Bausteine als **eigene Datei** in `api/`,
nicht im Code duplizieren — eine Quelle, leichter zu pflegen.
