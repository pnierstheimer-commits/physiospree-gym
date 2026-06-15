/**
 * DisclaimerGate — einmaliger Haftungs-/Gesundheitshinweis vor der ersten
 * Plan-Erstellung. Erscheint im Onboarding direkt vor dem WaitingScreen.
 *
 * UI-only (Regel 3): zeigt den Hinweis + Pflicht-Checkbox. Der Weiter-Button
 * ist deaktiviert, bis die Checkbox gesetzt ist; `onAccept` stößt dann die
 * Plan-Generierung an (und persistiert disclaimerAccepted im Profil).
 */

import { useState } from 'react';
import { DisclaimerText } from './DisclaimerText';
import '../screens/screens.css';

interface DisclaimerGateProps {
  onAccept: () => void;
  onBack: () => void;
}

export function DisclaimerGate({ onAccept, onBack }: DisclaimerGateProps) {
  const [checked, setChecked] = useState(false);

  return (
    <div className="ps-screen">
      <div className="ps-shell">
        <div className="ps-head">
          <button type="button" className="ps-back" onClick={onBack} aria-label="Zurück">
            ‹
          </button>
        </div>

        <div className="ps-title">Hinweis vor dem Start</div>
        <DisclaimerText />

        <label className="ps-disc-check">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span>Ich habe den Hinweis gelesen und verstanden.</span>
        </label>

        <div className="ps-actions">
          <button
            type="button"
            className="ps-btn ps-btn-primary"
            disabled={!checked}
            onClick={onAccept}
          >
            Weiter
          </button>
        </div>
      </div>
    </div>
  );
}
