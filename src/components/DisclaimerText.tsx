/**
 * DisclaimerText — der Haftungs-/Gesundheitshinweis als reiner Textblock.
 *
 * Single Source für den Wortlaut: wird sowohl im DisclaimerGate (mit Checkbox,
 * vor der ersten Plan-Erstellung) als auch in der Legal-Seite „Trainingshinweis"
 * (ohne Checkbox) verwendet.
 */

import '../screens/screens.css';

export function DisclaimerText() {
  return (
    <div className="ps-prose">
      <p>
        Physiospree Gym ist ein digitaler Trainingsbegleiter für gesunde,
        beschwerdefreie Personen. Die App erstellt Trainingspläne auf Basis
        deiner Angaben — sie ersetzt keine medizinische, physiotherapeutische
        oder ärztliche Beratung und Betreuung.
      </p>
      <p>
        Trainiere nur, wenn du beschwerdefrei bist. Bei Schmerzen, akuten
        Beschwerden, Verletzungen oder Vorerkrankungen sprich vor
        Trainingsbeginn mit einem Arzt oder Physiotherapeuten.
      </p>
      <p>
        <strong>Du trainierst auf eigene Verantwortung.</strong>
      </p>
    </div>
  );
}
