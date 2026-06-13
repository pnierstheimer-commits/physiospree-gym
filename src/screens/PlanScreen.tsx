/**
 * PlanScreen — Platzhalter (Phase 2 Schritt 2 baut das aus).
 *
 * Zeigt nur, dass ein Plan geladen ist. UI-only.
 */

import { useApp } from '../lib/state';
import './screens.css';

export function PlanScreen() {
  const { currentPlan, clearPlan } = useApp();
  const fw = currentPlan?.framework;

  return (
    <div className="ps-screen">
      <div className="ps-shell">
        <div className="ps-center">
          <span className="ps-badge">Plan aktiv</span>
          <div className="ps-plan-name">Plan geladen: {fw?.name ?? '—'}</div>
          {fw && (
            <p className="ps-loading-sub">
              {fw.cycleLengthWeeks} Wochen · {fw.daysPerWeek}× pro Woche · {fw.weeks.length} Wochen
              im Detail
            </p>
          )}
        </div>
        <div className="ps-actions">
          <button type="button" className="ps-btn ps-btn-ghost" onClick={clearPlan}>
            Neuen Plan erstellen
          </button>
        </div>
      </div>
    </div>
  );
}
