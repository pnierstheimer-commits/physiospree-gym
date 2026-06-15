/** LegalImpressum — statisches Impressum (§ 5 DDG). Platzhalter [..] = TODO. */

import '../screens.css';

export function LegalImpressum() {
  return (
    <div className="ps-prose">
      <h3>Angaben gemäß § 5 DDG</h3>
      <p>
        Name: [Name]
        <br />
        Anschrift: [Adresse]
        <br />
        E-Mail: [E-Mail]
        <br />
        Telefon: [Telefon]
      </p>

      <h3>Berufsbezeichnung</h3>
      <p>
        Berufsbezeichnung: Physiotherapeut
        <br />
        Verliehen in: Deutschland
        <br />
        Zuständige Aufsichtsbehörde: [TODO]
        <br />
        Berufsrechtliche Regelungen: Masseur- und Physiotherapeutengesetz (MPhG)
      </p>

      <h3>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h3>
      <p>[Name], [Adresse]</p>

      <h3>Streitbeilegung</h3>
      <p>
        Die Europäische Kommission stellt eine Plattform zur
        Online-Streitbeilegung bereit:{' '}
        <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer">
          https://ec.europa.eu/consumers/odr
        </a>
      </p>
      <p>
        Wir sind nicht bereit oder verpflichtet, an einem
        Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
        teilzunehmen.
      </p>

      <p className="ps-prose-note">
        Hinweis: Physiospree Gym ist ein digitaler Trainingsbegleiter für
        gesunde Personen. Die App ersetzt keine medizinische oder
        physiotherapeutische Beratung.
      </p>
    </div>
  );
}
