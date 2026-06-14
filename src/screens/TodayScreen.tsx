/**
 * TodayScreen — Einstieg/Heute (Platzhalter in Nav 1, ausgebaut in Nav 3).
 */
import './screens.css';

export function TodayScreen({ onSignOut }: { onSignOut?: () => void } = {}) {
  return (
    <div className="ps-screen">
      <div className="ps-shell">
        {onSignOut && (
          <div className="ps-toprow">
            <button type="button" className="ps-link-quiet" onClick={onSignOut}>
              Abmelden
            </button>
          </div>
        )}
        <div className="ps-plan-title">Heute</div>
      </div>
    </div>
  );
}
