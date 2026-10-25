/** LegalDatenschutz — statische Datenschutzerklärung (DSGVO). */

import '../screens.css';

export function LegalDatenschutz() {
  return (
    <div className="ps-prose">
      <p>
        Datenschutzerklärung
        <br />
        Physiospree Gym
        <br />
        Stand: 25. Oktober 2026
      </p>

      <h3>1. Verantwortlicher</h3>
      <p>
        Verantwortlicher für die Verarbeitung personenbezogener Daten im Sinne
        der Datenschutz-Grundverordnung (DSGVO) ist:
      </p>
      <p>
        Philipp Nierstheimer, Clauswitzstraße 1, 26125 Oldenburg, Deutschland.
        <br />
        E-Mail: p.nierstheimer@gmx.de, Telefon: 0441 3844189.
      </p>
      <p>
        Ein Datenschutzbeauftragter ist nicht bestellt, da die gesetzlichen
        Voraussetzungen hierfür nicht vorliegen.
      </p>

      <h3>2. Überblick: Worum es bei dieser App besonders geht</h3>
      <p>
        Physiospree Gym verarbeitet Gesundheitsdaten. Dazu zählen Angaben zu
        deinem Trainingszustand, zu Beschwerden und Schmerzen sowie deine
        Trainingsprotokolle. Gesundheitsdaten sind nach Art. 9 DSGVO besonders
        geschützt.
      </p>
      <p>
        Zur Erstellung und Fortschreibung deines Trainingsplans werden diese
        Daten an einen KI-Dienstleister in den USA übermittelt. Beides geschieht
        ausschließlich auf Grundlage deiner ausdrücklichen Einwilligung, die du
        im Onboarding erteilst und jederzeit widerrufen kannst.
      </p>
      <p>Die Einzelheiten dazu stehen in Abschnitt 5 und 6.</p>

      <h3>3. Welche Daten verarbeitet werden</h3>
      <p>
        <strong>Zugangsdaten</strong>
        <br />
        E-Mail-Adresse, Zeitpunkt der Anmeldung, Einmalcodes zur Anmeldung.
      </p>
      <p>
        <strong>Profilangaben</strong>
        <br />
        Name oder Anzeigename, Alter, Trainingsziel, Beweggrund für das Training
        (&bdquo;Warum&ldquo;), Trainingserfahrung, Anzahl der Trainingstage pro
        Woche, verfügbare Zeit pro Einheit, vorhandenes Equipment.
      </p>
      <p>
        <strong>Gesundheitsbezogene Daten (Art. 9 DSGVO)</strong>
        <br />
        Angaben zu deinem Trainingszustand und deiner Belastbarkeit, Angaben zu
        Schmerzen oder Beschwerden, die du im Chat oder beim Training mitteilst,
        sowie dein subjektives Anstrengungsempfinden (RPE).
      </p>
      <p>
        <strong>Trainingsdaten</strong>
        <br />
        Deine Trainingsprotokolle auf Satzebene — Übung, Wiederholungen,
        Gewicht, RPE, übersprungene Übungen, Datum und Zeitpunkt der Einheit.
      </p>
      <p>
        <strong>Chat-Inhalte</strong>
        <br />
        Deine Nachrichten an den Coach und dessen Antworten.
      </p>
      <p>
        <strong>Einwilligungen</strong>
        <br />
        Dass und wann du der Verarbeitung von Gesundheitsdaten zugestimmt und
        den Trainingshinweis bestätigt hast.
      </p>
      <p>
        <strong>Technische Daten</strong>
        <br />
        Beim Aufruf der App fallen beim Hosting-Dienstleister technische
        Verbindungsdaten an, insbesondere IP-Adresse, Zeitpunkt des Zugriffs,
        abgerufene Ressource, übertragene Datenmenge sowie Angaben zu Browser
        und Betriebssystem.
      </p>
      <p>
        Die App verwendet keine Tracking-Cookies, keine Analyse-Werkzeuge und
        keine Werbenetzwerke. Für den Betrieb notwendige Daten werden zusätzlich
        lokal im Speicher deines Geräts abgelegt, damit die App auch ohne
        Verbindung nutzbar ist.
      </p>

      <h3>4. Zwecke und Rechtsgrundlagen</h3>
      <p>
        <strong>Bereitstellung des Nutzerkontos und Anmeldung</strong> (Zugangsdaten)
        <br />
        Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).
      </p>
      <p>
        <strong>Erstellung und Fortschreibung des Trainingsplans</strong>{' '}
        (Profilangaben, Trainingsdaten)
        <br />
        Art. 6 Abs. 1 lit. b DSGVO.
      </p>
      <p>
        <strong>Verarbeitung gesundheitsbezogener Angaben</strong>{' '}
        (Gesundheitsdaten nach Abschnitt 3)
        <br />
        Art. 9 Abs. 2 lit. a DSGVO (ausdrückliche Einwilligung), zusätzlich
        Art. 6 Abs. 1 lit. a DSGVO.
      </p>
      <p>
        <strong>Übermittlung an den KI-Dienstleister zur Planerstellung</strong>{' '}
        (Profilangaben, Trainingsdaten, Gesundheitsdaten, Chat-Inhalte)
        <br />
        Art. 9 Abs. 2 lit. a in Verbindung mit Art. 49 Abs. 1 lit. a DSGVO
        (ausdrückliche Einwilligung, auch für die Übermittlung in ein
        Drittland).
      </p>
      <p>
        <strong>Synchronisierung zwischen mehreren Geräten</strong> (Profil-,
        Trainings- und Chat-Daten)
        <br />
        Art. 6 Abs. 1 lit. b DSGVO.
      </p>
      <p>
        <strong>Nachweis erteilter Einwilligungen</strong> (Einwilligungsdaten)
        <br />
        Art. 6 Abs. 1 lit. c DSGVO (rechtliche Verpflichtung, Art. 7 Abs. 1
        DSGVO).
      </p>
      <p>
        <strong>Betrieb, Sicherheit und Fehleranalyse</strong> (technische Daten)
        <br />
        Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse am sicheren und
        störungsfreien Betrieb).
      </p>

      <h3>5. Verarbeitung durch Künstliche Intelligenz</h3>
      <p>
        (1) Dein Trainingsplan wird nicht von einem Menschen erstellt, sondern
        automatisiert durch ein KI-Sprachmodell erzeugt. Dasselbe gilt für die
        Antworten im Coach-Chat und für die Auswertung deiner
        Trainingseinheiten.
      </p>
      <p>
        (2) Hierzu werden deine Profilangaben, deine Trainingsprotokolle, deine
        gesundheitsbezogenen Angaben und deine Chat-Nachrichten an Anthropic
        PBC, 548 Market St, PMB 90375, San Francisco, CA 94104, USA übermittelt
        und dort verarbeitet.
      </p>
      <p>(3) Zu dieser Verarbeitung gilt nach den Angaben des Anbieters:</p>
      <ul>
        <li>
          Inhalte, die über die Programmierschnittstelle (API) übermittelt
          werden, werden nicht zum Training der KI-Modelle verwendet.
        </li>
        <li>
          Ein- und Ausgaben werden beim Anbieter innerhalb von 30 Tagen
          gelöscht, soweit nicht gesetzliche Pflichten oder die Durchsetzung von
          Nutzungsbedingungen eine längere Speicherung erfordern.
        </li>
        <li>
          Mit dem Anbieter besteht ein Vertrag zur Auftragsverarbeitung nach
          Art. 28 DSGVO.
        </li>
      </ul>
      <p>
        (4) <strong>Datenübermittlung in die USA.</strong> Die USA sind ein
        Drittland ohne Angemessenheitsbeschluss im Sinne des Art. 45 DSGVO für
        diesen Verarbeitungsvorgang. Die Übermittlung erfolgt auf Grundlage der
        Standardvertragsklauseln der Europäischen Kommission (Art. 46 Abs. 2
        lit. c DSGVO) sowie zusätzlich auf Grundlage deiner ausdrücklichen
        Einwilligung nach Art. 49 Abs. 1 lit. a DSGVO.
      </p>
      <p>
        (5) <strong>Risikohinweis.</strong> Trotz dieser Schutzmaßnahmen kann
        nicht vollständig ausgeschlossen werden, dass US-Behörden auf Grundlage
        dortiger Gesetze Zugriff auf übermittelte Daten verlangen und dass dir
        dagegen kein mit dem europäischen Recht vergleichbarer Rechtsschutz zur
        Verfügung steht. Über dieses Risiko wirst du vor Erteilung deiner
        Einwilligung informiert.
      </p>
      <p>
        (6) <strong>Keine automatisierte Entscheidung mit Rechtswirkung.</strong>{' '}
        Die KI erstellt Trainingsvorschläge. Es findet keine automatisierte
        Entscheidung im Sinne des Art. 22 DSGVO statt, die dir gegenüber
        rechtliche Wirkung entfaltet oder dich in ähnlicher Weise erheblich
        beeinträchtigt. Ob du einem Vorschlag folgst, entscheidest allein du.
      </p>
      <p>
        (7) <strong>Hinweis zur Qualität.</strong> KI-generierte Inhalte können
        unzutreffend oder für deine Situation ungeeignet sein. Die
        Trainingsvorschläge ersetzen keine ärztliche oder physiotherapeutische
        Beratung.
      </p>

      <h3>6. Einwilligung und Widerruf</h3>
      <p>
        (1) Die Verarbeitung deiner Gesundheitsdaten und deren Übermittlung an
        den KI-Dienstleister erfolgen ausschließlich auf Grundlage deiner
        ausdrücklichen Einwilligung. Ohne diese Einwilligung kann die App ihre
        zentrale Funktion nicht erbringen.
      </p>
      <p>
        (2) Du kannst deine Einwilligung jederzeit mit Wirkung für die Zukunft
        widerrufen. Die Rechtmäßigkeit der bis zum Widerruf erfolgten
        Verarbeitung bleibt unberührt.
      </p>
      <p>
        (3) Den Widerruf kannst du erklären, indem du dein Nutzerkonto in der
        App löschst oder eine formlose Mitteilung an p.nierstheimer@gmx.de
        sendest.
      </p>
      <p>
        (4) Nach einem Widerruf ist eine weitere Nutzung der
        Trainingsplanfunktion nicht mehr möglich.
      </p>

      <h3>7. Empfänger und Auftragsverarbeiter</h3>
      <p>
        Deine Daten werden ausschließlich an folgende Dienstleister
        weitergegeben, die für uns als Auftragsverarbeiter nach Art. 28 DSGVO
        tätig sind:
      </p>
      <p>
        <strong>Hosting und Bereitstellung der App</strong>
        <br />
        Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA. Betrieb
        der Web-Anwendung und der serverseitigen Funktionen, Verarbeitung
        technischer Verbindungsdaten. Übermittlung in die USA auf Grundlage der
        Standardvertragsklauseln.
      </p>
      <p>
        <strong>Datenbank und Anmeldung</strong>
        <br />
        Supabase Inc., 970 Toa Payoh North, Singapur 318992. Speicherung deiner
        Konto-, Profil-, Trainings- und Chat-Daten sowie Versand der
        Anmeldecodes. Die Datenbank wird in einem Rechenzentrum innerhalb der
        Europäischen Union betrieben (Paris, Frankreich).
      </p>
      <p>
        <strong>KI-Verarbeitung</strong>
        <br />
        Anthropic PBC, San Francisco, USA. Einzelheiten siehe Abschnitt 5.
      </p>
      <p>
        Eine Weitergabe deiner Daten zu Werbezwecken oder ein Verkauf deiner
        Daten findet nicht statt.
      </p>

      <h3>8. Speicherdauer</h3>
      <p>
        (1) Deine Konto-, Profil-, Trainings- und Chat-Daten werden gespeichert,
        solange dein Nutzerkonto besteht.
      </p>
      <p>
        (2) Bei Löschung des Nutzerkontos werden die zugehörigen Daten aus allen
        Datenbanktabellen entfernt. Die Löschung umfasst Profil, Trainingspläne,
        Trainingsprotokolle, Chat-Verläufe und Einwilligungsnachweise.
      </p>
      <p>
        (3) Lokal auf deinem Gerät gespeicherte Daten kannst du zusätzlich über
        die Einstellungen deines Browsers entfernen.
      </p>
      <p>
        (4) Beim KI-Dienstleister werden übermittelte Inhalte nach dessen
        Angaben innerhalb von 30 Tagen gelöscht (siehe Abschnitt 5 Abs. 3).
      </p>
      <p>
        (5) Technische Verbindungsdaten beim Hosting-Dienstleister werden nach
        kurzer Zeit automatisch gelöscht oder anonymisiert.
      </p>
      <p>
        (6) Soweit gesetzliche Aufbewahrungspflichten bestehen, werden die
        betroffenen Daten bis zum Ablauf der jeweiligen Frist eingeschränkt
        verarbeitet und anschließend gelöscht.
      </p>

      <h3>9. Mindestalter</h3>
      <p>
        Die Nutzung der App setzt ein Mindestalter von 16 Jahren voraus. Für
        Minderjährige ist zusätzlich die Einwilligung der sorgeberechtigten
        Personen erforderlich.
      </p>

      <h3>10. Deine Rechte</h3>
      <p>Du hast das Recht:</p>
      <ul>
        <li>
          auf Auskunft über die zu deiner Person verarbeiteten Daten
          (Art. 15 DSGVO);
        </li>
        <li>auf Berichtigung unrichtiger Daten (Art. 16 DSGVO);</li>
        <li>auf Löschung (Art. 17 DSGVO);</li>
        <li>auf Einschränkung der Verarbeitung (Art. 18 DSGVO);</li>
        <li>auf Datenübertragbarkeit (Art. 20 DSGVO);</li>
        <li>
          auf Widerspruch gegen Verarbeitungen, die auf einem berechtigten
          Interesse beruhen (Art. 21 DSGVO);
        </li>
        <li>
          auf Widerruf erteilter Einwilligungen mit Wirkung für die Zukunft
          (Art. 7 Abs. 3 DSGVO).
        </li>
      </ul>
      <p>
        Zur Ausübung genügt eine formlose Mitteilung an p.nierstheimer@gmx.de.
      </p>
      <p>
        <strong>Beschwerderecht.</strong> Du hast das Recht, dich bei einer
        Datenschutz-Aufsichtsbehörde zu beschweren. Zuständig ist:
        <br />
        Die Landesbeauftragte für den Datenschutz Niedersachsen,
        <br />
        Prinzenstraße 5, 30159 Hannover, poststelle@lfd.niedersachsen.de
      </p>

      <h3>11. Datensicherheit</h3>
      <p>
        Die Übertragung erfolgt verschlüsselt über HTTPS. Der Zugriff auf
        gespeicherte Daten ist durch Zugriffsregeln auf Datenbankebene auf das
        jeweils eigene Nutzerkonto beschränkt. Die Anmeldung erfolgt über
        Einmalcodes; Passwörter werden nicht gespeichert.
      </p>

      <h3>12. Änderung dieser Datenschutzerklärung</h3>
      <p>
        Diese Datenschutzerklärung wird angepasst, wenn sich die Verarbeitung
        oder die rechtlichen Rahmenbedingungen ändern. Die jeweils aktuelle
        Fassung ist in der App abrufbar. Wesentliche Änderungen, die eine neue
        Einwilligung erfordern, werden dir gesondert mitgeteilt.
      </p>
    </div>
  );
}
