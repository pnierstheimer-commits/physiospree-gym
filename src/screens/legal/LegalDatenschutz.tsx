/** LegalDatenschutz — statische Datenschutzerklärung (DSGVO). Platzhalter [..] = TODO. */

import '../screens.css';

export function LegalDatenschutz() {
  return (
    <div className="ps-prose">
      <h3>Verantwortlicher</h3>
      <p>
        Philipp Nierstheimer
        <br />
        Clauswitzstraße 1, 26125 Oldenburg
        <br />
        p.nierstheimer@gmx.de
        <br />
        0441 3844189
      </p>

      <h3>Wir verarbeiten folgende Daten</h3>

      <p>
        <strong>1. Kontodaten</strong> (E-Mail, Login-Zeitstempel)
        <br />
        Zweck: Authentifizierung · Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO
      </p>
      <p>
        <strong>2. Profildaten</strong> (Name, Alter, optionales Trainingsziel)
        <br />
        Zweck: Personalisierung · Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO
      </p>
      <p>
        <strong>3. Trainingsprofil</strong> (Ziel, Level, Equipment, Trainingstage)
        <br />
        Zweck: Planerstellung · Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO
      </p>
      <p>
        <strong>4. Gesundheitsnahe Daten</strong> (Schmerz, Schlaf, Energie,
        Muskelkater, Stimmung je 1–10, Krankheitsmeldungen im Coach-Chat)
        <br />
        Zweck: Coaching, Tagesform-Steuerung, Übertrainings-Erkennung
        <br />
        Rechtsgrundlage: Art. 6 Abs. 1 lit. b + Art. 9 Abs. 2 lit. a DSGVO
        (ausdrückliche Einwilligung)
      </p>
      <p>
        <strong>5. Trainingslogs und Coach-Chat-Verlauf</strong>
        <br />
        Zweck: Progression, Auswertung · Rechtsgrundlage: Art. 6 Abs. 1 lit. b
      </p>

      <h3>Auftragsverarbeiter</h3>
      <ul>
        <li>Supabase (Datenspeicherung, EU-Frankfurt)</li>
        <li>Anthropic/Claude API (KI-Verarbeitung, USA)</li>
        <li>Vercel (Hosting)</li>
        <li>Resend (E-Mail-Versand)</li>
      </ul>

      <h3>Deine Rechte</h3>
      <p>
        Auskunft (Art. 15), Löschung (Art. 17), Berichtigung (Art. 16),
        Datenübertragbarkeit (Art. 20) — alles im Profil-Screen.
        <br />
        Beschwerden: Landesbeauftragte für den Datenschutz Niedersachsen.
      </p>

      <p className="ps-prose-note">
        Die App verwendet keine Tracking-Cookies. Mindestalter: 15 Jahre.
      </p>
    </div>
  );
}
