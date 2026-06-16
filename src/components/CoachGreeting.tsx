/**
 * CoachGreeting — kontextabhängige Coach-Nachricht oben auf dem Heute-Screen.
 *
 * UI-only (Regel 3): rendert nur den fertig berechneten Text (computeCoachGreeting
 * im greetingService) als dezente Chat-Bubble mit „Antworten"-Link. Kein Gate,
 * kein Formular — informativ, nicht aufdringlich.
 */

import '../screens/screens.css';

interface CoachGreetingProps {
  text: string;
  /** Öffnet den Coach-Tab mit dieser Nachricht als Kontext. */
  onReply: () => void;
}

export function CoachGreeting({ text, onReply }: CoachGreetingProps) {
  return (
    <div className="ps-coachgreet">
      <span className="ps-coachgreet-bar" aria-hidden="true" />
      <div className="ps-coachgreet-body">
        <p className="ps-coachgreet-text">{text}</p>
        <button type="button" className="ps-coachgreet-reply" onClick={onReply}>
          Antworten
        </button>
      </div>
    </div>
  );
}
