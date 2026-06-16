/**
 * exerciseCatalog — statische Übungsbibliothek (client-seitig, kein API/DB).
 *
 * Quelle: api/prompt/exercises.md (Familien + Stufen + Cues). Jede Übung hat
 * eine stabile id, Anzeigename, Familie, Stufe (1–3), Equipment, Cue
 * (Technik-Hinweis) und eine alltagstaugliche Kurzbeschreibung (shortDesc).
 *
 * Matching (findCatalogExercise) ist tolerant: case-insensitive, diakritik-
 * unabhängig, contains in beide Richtungen — der Coach verwendet leicht
 * abweichende Namen. Kein Treffer -> null (UI macht den Namen dann nicht tappbar).
 */

export type ExerciseLevel = 1 | 2 | 3;

export interface CatalogExercise {
  id: string;
  name: string;
  family: string;
  level: ExerciseLevel;
  equipment: string;
  cue: string;
  shortDesc: string;
}

export const EXERCISE_CATALOG: CatalogExercise[] = [
  // --- Horizontales Drücken (Brust) ---
  { id: 'brustpresse-maschine', name: 'Brustpresse (Maschine)', family: 'Horizontales Drücken', level: 1, equipment: 'Maschine', cue: 'Schulterblätter zusammen, Griffe auf Brusthöhe, kontrolliert drücken', shortDesc: 'Geführte Druckbewegung für die Brust. Idealer Einstieg, weil die Maschine die Bahn vorgibt.' },
  { id: 'kabel-flys', name: 'Kabelzug-Flys (stehend)', family: 'Horizontales Drücken', level: 1, equipment: 'Kabelzug', cue: 'Leicht vorgebeugt, Arme in weitem Bogen zusammenführen, Brust anspannen', shortDesc: 'Isolierte Brustübung am Kabel mit konstanter Spannung über den ganzen Weg.' },
  { id: 'kh-bankdruecken-flach', name: 'KH-Bankdrücken (flach)', family: 'Horizontales Drücken', level: 2, equipment: 'Kurzhanteln + Flachbank', cue: 'Hanteln über der Brust, Ellbogen 45°, kontrolliert ablassen (2–3 s)', shortDesc: 'Freies Bankdrücken mit Kurzhanteln — mehr Bewegungsfreiheit und Stabiarbeit als an der Maschine.' },
  { id: 'kh-schraegbankdruecken', name: 'KH-Schrägbankdrücken', family: 'Horizontales Drücken', level: 2, equipment: 'Kurzhanteln + Schrägbank', cue: 'Bank 30–45°, Ellbogen leicht unter Schulterniveau, kontrolliert ablassen', shortDesc: 'Schrägbank betont die obere Brust; Kurzhanteln geben vollen Bewegungsradius.' },
  { id: 'lh-bankdruecken', name: 'LH-Bankdrücken', family: 'Horizontales Drücken', level: 3, equipment: 'Langhantel + Rack', cue: 'Schulterblätter fest, Bogen in der BWS, Stange zur unteren Brust', shortDesc: 'Die klassische Grundübung für maximale Brust- und Druckkraft.' },
  { id: 'lh-schraegbankdruecken', name: 'LH-Schrägbankdrücken', family: 'Horizontales Drücken', level: 3, equipment: 'Langhantel + Schrägbank', cue: 'Bank 30–45°, Stange zur oberen Brust, kontrolliert', shortDesc: 'Langhantel-Schrägbank für schwere, gezielte Arbeit an der oberen Brust.' },

  // --- Vertikales Drücken (Schulter) ---
  { id: 'schulterpresse-maschine', name: 'Schulterpress-Maschine', family: 'Vertikales Drücken', level: 1, equipment: 'Maschine', cue: 'Rücken an Polster, Griffe auf Schulterhöhe, senkrecht drücken', shortDesc: 'Geführtes Überkopfdrücken für die Schultern — sicher und einfach zu lernen.' },
  { id: 'kh-schulterdruecken-sitzend', name: 'KH-Schulterdrücken (sitzend)', family: 'Vertikales Drücken', level: 2, equipment: 'Kurzhanteln + Bank 90°', cue: 'Hanteln auf Schulterhöhe, senkrecht drücken, nicht ins Hohlkreuz', shortDesc: 'Schulterdrücken mit Kurzhanteln im Sitzen — stabiler Rücken, voller Radius.' },
  { id: 'kh-schulterdruecken-stehend', name: 'KH-Schulterdrücken (stehend)', family: 'Vertikales Drücken', level: 2, equipment: 'Kurzhanteln', cue: 'Hanteln auf Schulterhöhe, Rumpf stabil, senkrecht drücken', shortDesc: 'Stehendes Schulterdrücken, das zusätzlich den Rumpf fordert.' },
  { id: 'lh-ueberkopfdruecken', name: 'LH-Überkopfdrücken (stehend)', family: 'Vertikales Drücken', level: 3, equipment: 'Langhantel', cue: 'Stange auf Schlüsselbein, Körper gerade, Kopf am Ende zwischen den Armen', shortDesc: 'Schweres Überkopfdrücken mit der Langhantel für Ganzkörper-Druckkraft.' },
  { id: 'lh-push-press', name: 'LH-Push Press', family: 'Vertikales Drücken', level: 3, equipment: 'Langhantel', cue: 'Kurzer Beinimpuls, dann senkrecht drücken. Nur Advanced.', shortDesc: 'Überkopfdrücken mit Beinimpuls für mehr Last — nur für Fortgeschrittene.' },

  // --- Schulter-Isolation (Seitheben) ---
  { id: 'seitheben-kh-leicht', name: 'Seitheben (KH, leicht)', family: 'Schulter-Isolation', level: 1, equipment: 'Kurzhanteln (leicht)', cue: 'Daumen leicht nach unten, bis Schulterniveau heben, kontrolliert ablassen (2 s)', shortDesc: 'Isolation für die seitliche Schulter — leichtes Gewicht, saubere Form.' },
  { id: 'seitheben-kabel', name: 'Seitheben am Kabelzug (einarmig)', family: 'Schulter-Isolation', level: 1, equipment: 'Kabelzug', cue: 'Kabel von unten, seitlich heben bis Schulterniveau, langsam zurück', shortDesc: 'Konstante Spannung am Kabel für runde, breite Schultern.' },
  { id: 'seitheben-kh-schwer', name: 'Seitheben (KH, schwerer)', family: 'Schulter-Isolation', level: 2, equipment: 'Kurzhanteln', cue: 'Kein Schwingen, kontrolliert heben, Ellbogen leicht gebeugt', shortDesc: 'Seitheben mit mehr Gewicht und striktem Tempo für Fortgeschrittene.' },
  { id: 'frontheben-kh', name: 'Frontheben (KH)', family: 'Schulter-Isolation', level: 2, equipment: 'Kurzhanteln', cue: 'Arme gestreckt, bis Schulterhöhe, kontrolliert. Nicht über Schulterhöhe.', shortDesc: 'Hebt die vordere Schulter gezielt; kontrolliert bis Schulterhöhe.' },

  // --- Trizeps-Isolation ---
  { id: 'trizeps-kabel-seil', name: 'Trizepsdrücken am Kabelzug (Seil)', family: 'Trizeps-Isolation', level: 1, equipment: 'Kabelzug', cue: 'Oberarme fixiert am Körper, nur Unterarme strecken, am Ende Seilenden auseinanderziehen', shortDesc: 'Isolierter Trizeps am Kabel; das Seil erlaubt am Ende eine starke Kontraktion.' },
  { id: 'trizeps-kabel-stange', name: 'Trizepsdrücken am Kabelzug (Stange)', family: 'Trizeps-Isolation', level: 1, equipment: 'Kabelzug', cue: 'Obergriff, Oberarme fixiert, volle Streckung, kontrolliert zurück', shortDesc: 'Trizeps-Pushdown mit Stange — einfach und gelenkschonend.' },
  { id: 'kh-trizeps-ueberkopf', name: 'KH-Trizepsdrücken über Kopf (beidarmig)', family: 'Trizeps-Isolation', level: 2, equipment: 'Kurzhantel', cue: 'Eine Hantel mit beiden Händen, Ellbogen zeigen nach vorne, voller ROM', shortDesc: 'Überkopf-Variante dehnt den Trizeps stärker für mehr Reiz.' },
  { id: 'kh-french-press', name: 'KH-French Press (liegend)', family: 'Trizeps-Isolation', level: 2, equipment: 'Kurzhanteln + Bank', cue: 'Hanteln über den Kopf ablassen, Ellbogen zeigen zur Decke, kontrolliert strecken', shortDesc: 'Liegendes Trizepsstrecken mit Kurzhanteln, gezielt und kontrolliert.' },
  { id: 'dips', name: 'Dips (Körpergewicht/gewichtet)', family: 'Trizeps-Isolation', level: 3, equipment: 'Dip-Barren', cue: 'Leicht vorbeugen, kontrolliert ablassen bis 90° Ellbogen, volle Streckung oben', shortDesc: 'Schwere Eigengewichtsübung für Trizeps und untere Brust.' },
  { id: 'lh-french-press', name: 'LH-French Press (SZ-Stange)', family: 'Trizeps-Isolation', level: 3, equipment: 'SZ-Stange + Bank', cue: 'Stange zur Stirn ablassen, Ellbogen stabil, kontrolliert strecken', shortDesc: 'SZ-Stangen-French-Press für schweren Trizepsreiz.' },

  // --- Horizontales Ziehen (Rudern) ---
  { id: 'rudermaschine', name: 'Rudermaschine (sitzend)', family: 'Horizontales Ziehen', level: 1, equipment: 'Maschine', cue: 'Brust ans Polster, Schulterblätter am Ende zusammenziehen', shortDesc: 'Geführtes Rudern für den oberen Rücken — leicht zu treffen.' },
  { id: 'kabelrudern-eng', name: 'Kabelrudern (sitzend, enger Griff)', family: 'Horizontales Ziehen', level: 1, equipment: 'Kabelzug + Sitzbank', cue: 'Brust raus, Griff zum Bauchnabel ziehen, Schulterblätter zusammen', shortDesc: 'Enges Kabelrudern für die Rückenmitte mit konstanter Spannung.' },
  { id: 'kabelrudern-breit', name: 'Kabelrudern (sitzend, breiter Griff)', family: 'Horizontales Ziehen', level: 1, equipment: 'Kabelzug + Sitzbank', cue: 'Breiter Griff, Ellbogen nach außen, zur oberen Brust ziehen', shortDesc: 'Breites Kabelrudern, das oberen Rücken und hintere Schulter betont.' },
  { id: 'kh-rudern-einarmig', name: 'KH-Rudern (einarmig)', family: 'Horizontales Ziehen', level: 2, equipment: 'Kurzhantel + Bank', cue: 'Hand und Knie auf Bank, Hantel zum Hüftknochen ziehen, Rücken gerade', shortDesc: 'Einarmiges Rudern mit großem Bewegungsradius je Seite.' },
  { id: 'kh-rudern-beidarmig', name: 'KH-Rudern (beidarmig, vorgebeugt)', family: 'Horizontales Ziehen', level: 2, equipment: 'Kurzhanteln', cue: '45° Neigung, Hanteln zum Bauchnabel, Schulterblätter zusammen', shortDesc: 'Vorgebeugtes Rudern mit beiden Kurzhanteln für den ganzen Rücken.' },
  { id: 'lh-rudern', name: 'LH-Rudern (vorgebeugt)', family: 'Horizontales Ziehen', level: 3, equipment: 'Langhantel', cue: '45° Oberkörperneigung, Stange zum Bauchnabel, Rücken gerade', shortDesc: 'Schweres Langhantelrudern für Rückendicke und Zugkraft.' },
  { id: 't-bar-rudern', name: 'T-Bar Rudern', family: 'Horizontales Ziehen', level: 3, equipment: 'T-Bar / Landmine', cue: 'Enger Griff, Brust an Polster oder freistehend, zum Bauch ziehen', shortDesc: 'Dicht am Körper geführtes Rudern für schwere Last und Rückenmasse.' },

  // --- Vertikales Ziehen (Latzug/Klimmzug) ---
  { id: 'latzug-breit', name: 'Latzug (breit, Obergriff)', family: 'Vertikales Ziehen', level: 1, equipment: 'Kabelzug', cue: 'Brust raus, Stange zur oberen Brust ziehen, Ellbogen nach unten', shortDesc: 'Latzug für einen breiten Rücken — der Einstieg in die Klimmzug-Bewegung.' },
  { id: 'latzug-eng', name: 'Latzug (eng, Untergriff)', family: 'Vertikales Ziehen', level: 1, equipment: 'Kabelzug', cue: 'Untergriff schulterbreit, Ellbogen eng am Körper, zur Brust ziehen', shortDesc: 'Enger Untergriff-Latzug, der Lat und Bizeps stärker einbindet.' },
  { id: 'latzug-vgriff', name: 'Latzug (neutral, V-Griff)', family: 'Vertikales Ziehen', level: 2, equipment: 'Kabelzug', cue: 'Neutraler Griff, Ellbogen eng, zur Brust', shortDesc: 'Neutraler Griff-Latzug, schulterschonend und kräftig im unteren Lat.' },
  { id: 'klimmzug-assistiert', name: 'Klimmzug (assistiert/Band)', family: 'Vertikales Ziehen', level: 2, equipment: 'Klimmzugstange + Band', cue: 'Voller Hang, Band unterstützt, Kinn über Stange', shortDesc: 'Klimmzug mit Bandunterstützung — die Brücke zum freien Klimmzug.' },
  { id: 'klimmzug', name: 'Klimmzug (Körpergewicht)', family: 'Vertikales Ziehen', level: 3, equipment: 'Klimmzugstange', cue: 'Voller Hang, Kinn über Stange, kontrolliert ablassen (2–3 s)', shortDesc: 'Die klassische Zugübung für Rücken und Griffkraft.' },
  { id: 'klimmzug-gewichtet', name: 'Klimmzug (gewichtet)', family: 'Vertikales Ziehen', level: 3, equipment: 'Klimmzugstange + Gewichtsgurt', cue: 'Wie Klimmzug, zusätzliches Gewicht am Gurt', shortDesc: 'Klimmzug mit Zusatzgewicht für fortgeschrittene Zugkraft.' },

  // --- Rear Delt ---
  { id: 'reverse-flys-maschine', name: 'Reverse Flys (Maschine)', family: 'Rear Delt', level: 1, equipment: 'Maschine', cue: 'Brust an Polster, Arme in weitem Bogen nach hinten, Schulterblätter zusammen', shortDesc: 'Geführte Isolation für die hintere Schulter und gute Haltung.' },
  { id: 'face-pulls', name: 'Face Pulls (Kabelzug, Seil)', family: 'Rear Delt', level: 1, equipment: 'Kabelzug', cue: 'Kabel auf Gesichtshöhe, zum Gesicht ziehen, Ellbogen hoch, Schulterblätter zusammen', shortDesc: 'Zug aufs Gesicht für die hintere Schulter und gesunde Schultergelenke.' },
  { id: 'kh-reverse-flys', name: 'KH-Reverse Flys (vorgebeugt)', family: 'Rear Delt', level: 2, equipment: 'Kurzhanteln', cue: '45° Neigung, Arme seitlich heben, kontrolliert, leichtes Gewicht', shortDesc: 'Vorgebeugte Reverse Flys mit Kurzhanteln für die hintere Schulter.' },

  // --- Bizeps-Isolation ---
  { id: 'bizeps-kabel-stange', name: 'Bizeps-Curl (Kabelzug, Stange)', family: 'Bizeps-Isolation', level: 1, equipment: 'Kabelzug', cue: 'Oberarme am Körper, kontrolliert beugen, volle Streckung unten', shortDesc: 'Bizeps am Kabel mit konstanter Spannung über den ganzen Weg.' },
  { id: 'bizeps-kabel-seil', name: 'Bizeps-Curl (Kabelzug, Seil)', family: 'Bizeps-Isolation', level: 1, equipment: 'Kabelzug', cue: 'Seilgriff, Oberarme fixiert, am Ende supinieren (Hände drehen)', shortDesc: 'Seil-Curl mit Drehung am Ende für die Spitzenkontraktion.' },
  { id: 'kh-bizeps-curl', name: 'KH-Bizeps-Curl (stehend)', family: 'Bizeps-Isolation', level: 1, equipment: 'Kurzhanteln', cue: 'Ellbogen fixiert, kein Schwung, volle Streckung unten, kontrolliert (2 s)', shortDesc: 'Der Standard-Bizeps-Curl mit Kurzhanteln, strikt ausgeführt.' },
  { id: 'bizeps-maschine', name: 'Bizeps-Curl Maschine', family: 'Bizeps-Isolation', level: 1, equipment: 'Maschine', cue: 'Oberarme auf Polster, kontrolliert beugen und strecken', shortDesc: 'Geführter Bizeps-Curl, ideal zum sauberen Ausreizen.' },
  { id: 'kh-hammercurl', name: 'KH-Hammercurl (stehend)', family: 'Bizeps-Isolation', level: 2, equipment: 'Kurzhanteln', cue: 'Neutraler Griff (Daumen oben), Ellbogen fixiert, kein Schwung', shortDesc: 'Neutraler Griff trifft Bizeps und Unterarm zugleich.' },
  { id: 'kh-schraegbank-curl', name: 'KH-Schrägbank-Curl (sitzend)', family: 'Bizeps-Isolation', level: 2, equipment: 'Kurzhanteln + Schrägbank', cue: 'Arme hängen seitlich, volle Dehnung, kontrolliert beugen', shortDesc: 'Die Schrägbank dehnt den Bizeps stark für mehr Reiz.' },
  { id: 'lh-bizeps-sz', name: 'LH-Bizeps-Curl (SZ-Stange)', family: 'Bizeps-Isolation', level: 3, equipment: 'SZ-Stange', cue: 'Schulterbreiter Griff, Oberarme am Körper, kein Rückschwung', shortDesc: 'SZ-Curl für schweren Bizepsreiz, handgelenkschonend.' },
  { id: 'lh-bizeps-gerade', name: 'LH-Bizeps-Curl (gerade Stange)', family: 'Bizeps-Isolation', level: 3, equipment: 'Langhantel', cue: 'Schulterbreit, Oberarme fixiert, voller ROM', shortDesc: 'Langhantel-Curl für maximale Bizeps-Last.' },

  // --- Kniebeuge (bilateral) ---
  { id: 'beinpresse', name: 'Beinpresse (Maschine)', family: 'Kniebeuge', level: 1, equipment: 'Maschine', cue: 'Füße schulterbreit, Knie nicht nach innen, voller ROM, nicht am Ende durchdrücken', shortDesc: 'Geführte Beinübung für viel Last bei geringem Technikrisiko.' },
  { id: 'hack-squat', name: 'Hack-Squat (Maschine)', family: 'Kniebeuge', level: 1, equipment: 'Maschine', cue: 'Rücken an Polster, Füße schulterbreit, tief gehen, kontrolliert drücken', shortDesc: 'Maschinen-Kniebeuge mit fester Bahn, betont die Oberschenkel-Vorderseite.' },
  { id: 'goblet-squat', name: 'Goblet Squat', family: 'Kniebeuge', level: 2, equipment: 'Kurzhantel', cue: 'Hantel vor der Brust, Ellbogen zwischen die Knie, aufrechter Oberkörper', shortDesc: 'Kniebeuge mit einer Hantel vor der Brust — lehrt aufrechte Technik.' },
  { id: 'kh-kniebeuge', name: 'KH-Kniebeuge (Hanteln seitlich)', family: 'Kniebeuge', level: 2, equipment: 'Kurzhanteln', cue: 'Hanteln seitlich halten, Brust raus, parallel oder tiefer', shortDesc: 'Freie Kniebeuge mit Kurzhanteln seitlich — einfacher Einstieg ins freie Beugen.' },
  { id: 'lh-kniebeuge', name: 'LH-Kniebeuge (Back Squat)', family: 'Kniebeuge', level: 3, equipment: 'Langhantel + Rack', cue: 'Stange auf hinterem Trapez, Brust raus, Knie in Zehenrichtung, parallel oder tiefer', shortDesc: 'Die Königsübung für Bein- und Ganzkörperkraft.' },
  { id: 'lh-frontkniebeuge', name: 'LH-Frontkniebeuge', family: 'Kniebeuge', level: 3, equipment: 'Langhantel + Rack', cue: 'Stange auf vorderem Delt/Schlüsselbein, Ellbogen hoch, aufrechter Oberkörper', shortDesc: 'Frontkniebeuge betont Quadrizeps und aufrechte Haltung.' },

  // --- Einbeinig/Split ---
  { id: 'beinstrecker', name: 'Beinstrecker (Maschine)', family: 'Einbeinig/Split', level: 1, equipment: 'Maschine', cue: 'Rücken an Polster, kontrolliert strecken, nicht am Ende rucken', shortDesc: 'Isolation für die vordere Oberschenkelmuskulatur.' },
  { id: 'ausfallschritte-kg', name: 'Ausfallschritte (Körpergewicht)', family: 'Einbeinig/Split', level: 1, equipment: 'Körpergewicht', cue: 'Großer Schritt, hinteres Knie Richtung Boden, Oberkörper aufrecht', shortDesc: 'Einbeinige Grundübung für Beine und Balance, ganz ohne Geräte.' },
  { id: 'ausfallschritte-kh', name: 'Ausfallschritte (KH)', family: 'Einbeinig/Split', level: 2, equipment: 'Kurzhanteln', cue: 'Hanteln seitlich, großer Schritt, hinteres Knie Richtung Boden', shortDesc: 'Ausfallschritte mit Zusatzgewicht für mehr Bein-Reiz.' },
  { id: 'step-ups', name: 'Step-Ups (KH)', family: 'Einbeinig/Split', level: 2, equipment: 'Kurzhanteln + Box/Bank', cue: 'Fuß komplett auf Box, aus dem Vorderbein drücken, nicht abstoßen', shortDesc: 'Aufsteigen auf eine Box — einbeinige Kraft und Stabilität.' },
  { id: 'bulgarian-kh', name: 'Bulgarische Kniebeuge (KH)', family: 'Einbeinig/Split', level: 3, equipment: 'Kurzhanteln + Bank', cue: 'Hinterer Fuß auf Bank, tiefe Position, Knie stabil', shortDesc: 'Anspruchsvolle einbeinige Kniebeuge mit großem Reiz pro Bein.' },
  { id: 'bulgarian-lh', name: 'Bulgarische Kniebeuge (LH)', family: 'Einbeinig/Split', level: 3, equipment: 'Langhantel + Bank', cue: 'Stange auf Trapez, hinterer Fuß auf Bank, tiefe Position', shortDesc: 'Bulgarian Split Squat mit Langhantel für schwere einbeinige Last.' },

  // --- Hüftstreckung/Kreuzheben ---
  { id: 'beinbeuger-liegend', name: 'Beinbeuger (Maschine, liegend)', family: 'Hüftstreckung', level: 1, equipment: 'Maschine', cue: 'Hüfte auf Polster, kontrolliert beugen, nicht rucken', shortDesc: 'Isolation für die hintere Oberschenkelmuskulatur im Liegen.' },
  { id: 'beinbeuger-sitzend', name: 'Beinbeuger (Maschine, sitzend)', family: 'Hüftstreckung', level: 1, equipment: 'Maschine', cue: 'Rücken an Polster, kontrolliert beugen, voller ROM', shortDesc: 'Sitzender Beinbeuger mit vollem Bewegungsradius für die Hamstrings.' },
  { id: 'pull-through', name: 'Kabelzug-Pull-Through', family: 'Hüftstreckung', level: 1, equipment: 'Kabelzug', cue: 'Kabel von unten, durch die Beine greifen, Hüfte nach vorne drücken, Rücken gerade', shortDesc: 'Hüftdominante Übung am Kabel — lehrt das Hüftstrecken sicher.' },
  { id: 'kh-rdl', name: 'Rumänisches Kreuzheben (KH)', family: 'Hüftstreckung', level: 2, equipment: 'Kurzhanteln', cue: 'Leicht gebeugte Knie, Hanteln an den Schienbeinen entlang, Rücken gerade', shortDesc: 'Hüftbeuge mit Kurzhanteln für Hamstrings und Gesäß.' },
  { id: 'hip-thrust', name: 'Hip Thrust (KH oder LH)', family: 'Hüftstreckung', level: 2, equipment: 'Kurzhantel/Langhantel + Bank', cue: 'Schulterblätter auf Bank, Hüfte heben bis Oberkörper waagerecht, oben anspannen', shortDesc: 'Gezielte Gesäßübung mit starker Endkontraktion.' },
  { id: 'kb-swing', name: 'Kettlebell Swing', family: 'Hüftstreckung', level: 2, equipment: 'Kettlebell', cue: 'Hüftdominant, Kraft aus der Hüfte, Arme nur führen, Rücken gerade', shortDesc: 'Explosive Hüftstreckung mit der Kettlebell für Power und Kondition.' },
  { id: 'kreuzheben-konv', name: 'Kreuzheben (LH, konventionell)', family: 'Hüftstreckung', level: 3, equipment: 'Langhantel', cue: 'Hüftbreiter Stand, Stange an den Schienbeinen, Rücken neutral, Hüfte nach vorne', shortDesc: 'Die schwere Ganzkörper-Zugübung für hintere Kette und Griffkraft.' },
  { id: 'kreuzheben-sumo', name: 'Kreuzheben (LH, Sumo)', family: 'Hüftstreckung', level: 3, equipment: 'Langhantel', cue: 'Breiter Stand, Zehen außen, Griff schulterbreit, Hüfte nach vorne', shortDesc: 'Breitbeiniges Kreuzheben, das mehr Bein und Gesäß einbindet.' },
  { id: 'lh-rdl', name: 'Rumänisches Kreuzheben (LH)', family: 'Hüftstreckung', level: 3, equipment: 'Langhantel', cue: 'Stange nah am Körper, leicht gebeugte Knie, Hüfte zurück, Rücken neutral', shortDesc: 'Langhantel-RDL für schweren Hamstring- und Gesäßreiz.' },

  // --- Waden ---
  { id: 'wadenheben-sitzend', name: 'Wadenheben (Maschine, sitzend)', family: 'Waden', level: 1, equipment: 'Maschine', cue: 'Voller ROM: ganz runter, ganz hoch, 2 s halten oben', shortDesc: 'Sitzendes Wadenheben für den unteren Wadenmuskel.' },
  { id: 'wadenheben-stehend', name: 'Wadenheben (Maschine, stehend)', family: 'Waden', level: 1, equipment: 'Maschine', cue: 'Schulterpolster, voller ROM, kontrolliert', shortDesc: 'Stehendes Wadenheben mit vollem Bewegungsradius.' },
  { id: 'wadenheben-kh-einbeinig', name: 'Wadenheben (stehend, KH, einbeinig)', family: 'Waden', level: 2, equipment: 'Kurzhantel + Stufe', cue: 'Eine Hantel, einbeinig auf Stufe, volle Dehnung unten', shortDesc: 'Einbeiniges Wadenheben mit Kurzhantel für mehr Dehnung.' },
  { id: 'wadenheben-lh', name: 'Wadenheben (LH, stehend)', family: 'Waden', level: 3, equipment: 'Langhantel + Rack', cue: 'Stange auf Nacken, beidbeinig auf Platte, voller ROM', shortDesc: 'Schweres Wadenheben mit der Langhantel.' },

  // --- Rumpf (Anti-Extension) ---
  { id: 'plank', name: 'Plank (Unterarmstütz)', family: 'Rumpf (Anti-Extension)', level: 1, equipment: 'Körpergewicht', cue: 'Gerade Linie von Kopf bis Fuß, Bauch aktiv, nicht durchhängen', shortDesc: 'Statische Rumpfübung für Stabilität, ohne Geräte.' },
  { id: 'dead-bug', name: 'Dead Bug', family: 'Rumpf (Anti-Extension)', level: 1, equipment: 'Körpergewicht', cue: 'Rücken am Boden, gegenüberliegende Arm/Bein strecken, Rücken bleibt flach', shortDesc: 'Sanfte Rumpfübung für Bauch und Koordination, schont den Rücken.' },
  { id: 'plank-gewicht', name: 'Plank mit Gewicht', family: 'Rumpf (Anti-Extension)', level: 2, equipment: 'Gewichtsscheibe', cue: 'Wie Plank, zusätzliches Gewicht, Hüfte stabil', shortDesc: 'Plank mit Zusatzgewicht für mehr Rumpfspannung.' },
  { id: 'ab-wheel', name: 'Ab-Wheel Rollout', family: 'Rumpf (Anti-Extension)', level: 3, equipment: 'Ab-Wheel', cue: 'Aus den Knien, langsam rollen, Rücken nicht durchhängen', shortDesc: 'Anspruchsvolle Übung mit dem Rollrad für starke Bauchspannung.' },

  // --- Rumpf (Anti-Rotation) ---
  { id: 'pallof-press', name: 'Pallof Press (Kabelzug)', family: 'Rumpf (Anti-Rotation)', level: 1, equipment: 'Kabelzug', cue: 'Seitlicher Zug, Arme strecken und halten, Hüfte stabil', shortDesc: 'Rumpfübung gegen Rotation für einen stabilen Mittelteil.' },
  { id: 'pallof-press-rotation', name: 'Pallof Press mit Rotation', family: 'Rumpf (Anti-Rotation)', level: 2, equipment: 'Kabelzug', cue: 'Arme strecken, dann kontrolliert zur Seite drehen, Hüfte bleibt stabil', shortDesc: 'Pallof Press mit kontrollierter Drehung für mehr Rumpfkontrolle.' },

  // --- Rumpfbeugung ---
  { id: 'crunch-maschine', name: 'Crunch (Maschine)', family: 'Rumpfbeugung', level: 1, equipment: 'Maschine', cue: 'Kontrolliert, kein Schwung, Spannung im Bauch halten', shortDesc: 'Geführte Bauchübung mit einstellbarem Widerstand.' },
  { id: 'kabel-crunch', name: 'Kabelzug-Crunch (kniend)', family: 'Rumpfbeugung', level: 1, equipment: 'Kabelzug', cue: 'Seil hinter dem Kopf, Oberkörper einrollen, Hüfte bleibt stabil', shortDesc: 'Kniender Crunch am Kabel für progressiven Bauchreiz.' },
  { id: 'hanging-knee-raise', name: 'Hanging Knee Raise', family: 'Rumpfbeugung', level: 2, equipment: 'Klimmzugstange', cue: 'Im Hang, Knie zur Brust, kontrolliert ablassen, kein Schwingen', shortDesc: 'Hängendes Knieheben für den unteren Bauch.' },
  { id: 'hanging-leg-raise', name: 'Hanging Leg Raise', family: 'Rumpfbeugung', level: 3, equipment: 'Klimmzugstange', cue: 'Im Hang, gestreckte Beine heben, kontrolliert, kein Schwung', shortDesc: 'Hängendes Beinheben mit gestreckten Beinen für starke Bauchkraft.' },
];

/** Diakritik-/Satzzeichen-frei, lowercase, einfache Wortgrenzen. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Findet die Katalog-Übung zum (Coach-)Namen — tolerant, case-/diakritik-
 * unabhängig, contains in beide Richtungen. Bester Treffer per einfacher
 * Score-Heuristik; null wenn nichts passt.
 */
export function findCatalogExercise(rawName: string): CatalogExercise | null {
  const q = normalize(rawName);
  if (!q) return null;
  let best: CatalogExercise | null = null;
  let bestScore = 0;
  for (const e of EXERCISE_CATALOG) {
    const n = normalize(e.name);
    let score = 0;
    if (n === q) score = 100;
    else if (n.startsWith(q) || q.startsWith(n)) score = 80;
    else if (n.includes(q)) score = 60;
    else if (q.includes(n)) score = 50;
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return bestScore >= 50 ? best : null;
}
