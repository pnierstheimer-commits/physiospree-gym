/**
 * WaitingScreen — während der Plan-Generierung (KI-Pfad, Regel 8).
 *
 * Erklärt, was passiert, statt nur einen leeren Spinner zu zeigen. Reine
 * CSS-Animation (keine Packages). Phasen-Texte wechseln alle 15 s, ein kleiner
 * Sekunden-Counter schätzt die Restzeit. Verschwindet automatisch, sobald der
 * Plan im State liegt (OnboardingScreen rendert dann den Plan).
 */

import { useEffect, useState } from 'react';
import './screens.css';

const PHASES = [
  'Trainingsziel wird ausgewertet …',
  'Übungen werden ausgewählt …',
  'Wochenstruktur wird aufgebaut …',
  'Progression wird berechnet …',
  'Fast fertig …',
];

/** Geschätzte Gesamtdauer für den Restzeit-Counter (s). */
const ETA_SECONDS = 60;

export function WaitingScreen() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const phase = PHASES[Math.min(PHASES.length - 1, Math.floor(elapsed / 15))];
  const remaining = Math.max(0, ETA_SECONDS - elapsed);

  return (
    <div className="ps-screen">
      <div className="ps-shell ps-wait">
        <div className="ps-brand ps-wait-brand">Physiospree</div>

        <div className="ps-wait-body">
          <div className="ps-wait-pulse" aria-hidden="true">
            <span />
            <span />
            <i />
          </div>

          <div className="ps-title ps-wait-title">Dein Plan wird erstellt.</div>
          <p className="ps-subtitle ps-wait-sub">
            Der Coach analysiert dein Profil und baut deinen persönlichen 8-Wochen-Plan.
            Das dauert etwa eine Minute.
          </p>

          <div className="ps-wait-phase" aria-live="polite">
            {phase}
          </div>
          {remaining > 0 && <div className="ps-wait-eta">Etwa noch {remaining} Sekunden</div>}
        </div>

        <div className="ps-wait-foot">
          Einmalig beim ersten Plan. Folge-Anpassungen sind schneller.
        </div>
      </div>
    </div>
  );
}
