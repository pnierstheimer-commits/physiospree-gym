/** LegalImpressum — statisches Impressum (§ 5 DDG). */

import '../screens.css';

export function LegalImpressum() {
  return (
    <div className="ps-prose">
      <h3>Angaben gemäß § 5 DDG</h3>
      <p>
        Philipp Nierstheimer
        <br />
        Clauswitzstraße 1
        <br />
        26125 Oldenburg
      </p>
      <p>
        E-Mail: p.nierstheimer@gmx.de
        <br />
        Telefon: 0441 3844189
      </p>

      <h3>Berufsbezeichnung</h3>
      <p>
        Berufsbezeichnung: Physiotherapeut
        <br />
        Verliehen in: Deutschland
      </p>
      <p>
        Zuständige Aufsichtsbehörde:
        <br />
        Gesundheitsamt Oldenburg
        <br />
        Industriestraße 1b
        <br />
        26121 Oldenburg
      </p>
      <p>
        Berufsrechtliche Regelungen: Masseur- und Physiotherapeutengesetz (MPhG)
      </p>

      <h3>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h3>
      <p>Philipp Nierstheimer, Clauswitzstraße 1, 26125 Oldenburg</p>

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
