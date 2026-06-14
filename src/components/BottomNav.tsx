/**
 * BottomNav — feste Tab-Leiste am unteren Rand (über allem, iOS-safe-area).
 *
 * UI-only: vier Tabs (Heute/Plan/Coach/Tagebuch) mit einfachen Inline-SVG-Icons
 * (kein Icon-Package). Aktiver Tab in Cream, inaktiv gedämpft. Klick ->
 * setActiveTab. Wird im WorkoutScreen + Login bewusst nicht gerendert.
 */

import { useApp } from '../lib/state';
import type { AppTab } from '../shared/types';
import '../screens/screens.css';

function Icon({ tab }: { tab: AppTab }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (tab) {
    case 'today': // Sonne
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
        </svg>
      );
    case 'plan': // Kalender
      return (
        <svg {...common}>
          <rect x="3" y="4.5" width="18" height="16" rx="2" />
          <path d="M3 9.5h18M8 3v3M16 3v3" />
        </svg>
      );
    case 'coach': // Sprechblase
      return (
        <svg {...common}>
          <path d="M21 11.5a8.5 8.5 0 0 1-12.2 7.7L3.5 21l1.8-5.3A8.5 8.5 0 1 1 21 11.5z" />
        </svg>
      );
    case 'journal': // Liste / Tagebuch
      return (
        <svg {...common}>
          <path d="M9 6h11M9 12h11M9 18h11" />
          <circle cx="4.5" cy="6" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="4.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="4.5" cy="18" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}

const TABS: { tab: AppTab; label: string }[] = [
  { tab: 'today', label: 'Heute' },
  { tab: 'plan', label: 'Plan' },
  { tab: 'coach', label: 'Coach' },
  { tab: 'journal', label: 'Tagebuch' },
];

export function BottomNav() {
  const { activeTab, setActiveTab } = useApp();
  return (
    <nav className="ps-bottomnav" aria-label="Hauptnavigation">
      {TABS.map((t) => (
        <button
          key={t.tab}
          type="button"
          className={`ps-navtab${activeTab === t.tab ? ' is-active' : ''}`}
          aria-current={activeTab === t.tab ? 'page' : undefined}
          onClick={() => setActiveTab(t.tab)}
        >
          <Icon tab={t.tab} />
          <span className="ps-navtab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
