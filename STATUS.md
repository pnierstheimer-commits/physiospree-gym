# Projektstand — Physiospree Gym

Stand: 25. Oktober 2026 · Letzter Commit vor diesem Lauf: `dd0566c`

Kurzer Überblick, was steht und was offen ist. Fachliche Regeln stehen in
`CLAUDE.md`, die API-Dokumentation in `README.md`.

## Rechtstexte

Alle vier Rechtstexte sind vollständig ausformuliert und in der App erreichbar
(Profil → Rechtliches, `src/screens/legal/`):

- **AGB** — 14 Paragraphen, Stand 25. Oktober 2026.
- **Datenschutzerklärung** — 12 Abschnitte, Stand 25. Oktober 2026.
- **Impressum** — § 5 DDG, Berufsbezeichnung, Aufsichtsbehörde.
- **Trainingshinweis (Disclaimer)** — Pflicht-Gate vor der ersten
  Plan-Erstellung.

**Mindestalter 16** liegt als Single Source in `AGE_LIMITS` (`src/shared/
constants.ts`) und steuert die Onboarding-Validierung samt Hinweistext. AGB
§ 3 Abs. 3 und Datenschutz Abschnitt 9 nennen denselben Wert — die drei
Stellen sind deckungsgleich. Wer das Mindestalter ändert, muss beide
Rechtstexte mitziehen.

**Art-9-Einwilligung** im Onboarding (Slide „Gesundheitsdaten") deckt die
Drittlandübermittlung in die USA ab: Datenarten, Zweck, Empfänger
(Anthropic PBC, USA), fehlender gleichwertiger Rechtsschutz und
Widerrufsrecht. Damit trägt sie Art. 9 Abs. 2 lit. a **und** Art. 49 Abs. 1
lit. a DSGVO. Aus dem Text heraus ist die Datenschutzerklärung als Overlay
verlinkt, ohne den Wizard-State zu verlieren.

**Supabase-Region:** Das Projekt `xuyhkcivhipmaghxvtsj` läuft in `eu-west-3`
(Paris, Frankreich) — nicht Frankfurt. Datenschutz Abschnitt 7 ist darauf
korrigiert. Bei einem Regionswechsel muss die Angabe nachgezogen werden.

## Coach-Qualität

Welle 1, Welle 2 und der Nachzug sind live und verifiziert:

- Historien-Übergabe an den Coach (`coachService` → `history`), Grundlage der
  „2 Einheiten in Folge"-Regel.
- `experience`-Level als RPE-Cap.
- Verdict `stopped` für den Schmerz-/Abbruchpfad.
- Gelb-Ampel wirkt aufs Volumen.
- Begrüßung als offenes Angebot statt Tagesform-Abfrage; Begründungen
  satzgenau.

## Offen

- **Klick-Test Skip-Feature** — das Überspringen einzelner Übungen
  (`WorkoutExercise.skipped`, Commit `45a0959`) ist auf Code- und
  Infrastruktur-Ebene geprüft, aber der vollständige Round-Trip mit echtem
  Account im Browser steht noch aus: Workout starten, Übung überspringen,
  Rest loggen, beenden, Skip-Flag in Supabase und Auswertung kontrollieren.
- **Anwaltliche Gegenprüfung der Rechtstexte** — AGB, Datenschutzerklärung,
  Impressum und Disclaimer sind fachlich sorgfältig formuliert, aber nicht
  juristisch geprüft. Vor einem öffentlichen Start erforderlich.
