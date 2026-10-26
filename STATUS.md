# Projektstand — Physiospree Gym

Stand: 26. Oktober 2026 · Letzter Commit: `514919e`

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

## PWA

Installierbar und offline startfähig (Regel 10, und Regel 9 jetzt auch für den
Kaltstart — die Laufzeitdaten lagen ohnehin im localStorage).

**Service Worker** (`public/sw.js`, handgeschrieben, keine Dependency):
Navigationen network-first mit Fallback auf die gecachte Shell, same-origin
GET-Assets stale-while-revalidate. Nie abgefangen werden non-GET, cross-origin
(Google Fonts, Supabase) und `/api/`. `skipWaiting` + `clients.claim`, und bei
`activate` fliegen alle Caches außer `CACHE_VERSION` raus.

Zwei Punkte, die beim Anfassen zu beachten sind:

- **`CACHE_VERSION` hochzählen**, sobald sich der SW oder eine von ihm
  gecachte statische Datei ändert (aktuell `psg-v2`). Sonst bekommen Clients
  mit altem Cache die neue Datei erst beim übernächsten Start.
- **Die Response im SWR-Zweig sofort klonen**, nicht erst in der
  `caches.open`-Fortsetzung — bis die läuft, hat der Client den Body gelesen
  und `clone()` wirft. Der Fehler schlägt still fehl: es landet dann nur die
  Shell im Cache, kein einziges Asset.

Registriert wird nur im Production-Build (`import.meta.env.PROD` in
`src/main.tsx`); im Vite-Dev-Server würde das Asset-Caching gerade bearbeitete
Module ausliefern. Verifikation läuft deshalb über `npm run preview`, nicht
über den Dev-Server.

**Plattformerkennung** (`src/lib/pwa.ts`): `isStandalone()` über
`display-mode: standalone` plus `navigator.standalone` für iOS-Safari,
`detectPlatform()` mit dem iPadOS-Fall (meldet sich als „MacIntel", wird über
`maxTouchPoints` als iOS erkannt). Die IntroSlides zeigen damit je nach Gerät
den Teilen-Weg, das Browser-Menü oder die Adressleiste — und lassen die
Installations-Folie in der bereits installierten App ganz weg.

**Manifest und Icons:** `standalone`, Icons 192 und 512 als `any`, das 512er
zusätzlich als `maskable` (ausgemessen: Inhalt 163 px vom Zentrum gegen 205 px
Safe-Zone-Radius). `theme_color`, `background_color` und der `theme-color`-
Metatag sind alle `#110F0D` — das ist `--background` im Dark-Theme, und
`html.dark` steht fest im Markup. Wer das Theme ändert, muss alle drei
nachziehen.

**iOS** wertet weder Manifest noch `beforeinstallprompt` aus; Vollbild,
Statusleiste und Home-Bildschirm-Name kommen allein aus den
`apple-mobile-web-app-*`-Metatags in `index.html`. `status-bar-style` steht
bewusst auf `black`, nicht `black-translucent`: nur ein einziger Screen wertet
`safe-area-inset-top` aus.

Einen `beforeinstallprompt`-Handler gibt es bewusst nicht — die App erklärt den
manuellen Weg, statt den nativen Prompt zu kapern.

## Offen

- **Gerätetest PWA auf Android und iOS** — am Schreibtisch nicht prüfbar und
  deshalb offen: ob das maskable Icon im Android-Launcher sauber aussieht, ob
  Chrome den Install-Prompt anbietet (der Menüeintrag „App installieren" muss
  sofort da sein, der automatische Prompt kann ein, zwei Besuche brauchen) und
  ob die App auf dem iPhone wirklich im Vollbild startet statt im
  Safari-Chrome.
- **Klick-Test Skip-Feature** — das Überspringen einzelner Übungen
  (`WorkoutExercise.skipped`, Commit `45a0959`) ist auf Code- und
  Infrastruktur-Ebene geprüft, aber der vollständige Round-Trip mit echtem
  Account im Browser steht noch aus: Workout starten, Übung überspringen,
  Rest loggen, beenden, Skip-Flag in Supabase und Auswertung kontrollieren.
- **Anwaltliche Gegenprüfung der Rechtstexte** — AGB, Datenschutzerklärung,
  Impressum und Disclaimer sind fachlich sorgfältig formuliert, aber nicht
  juristisch geprüft. Vor einem öffentlichen Start erforderlich.
