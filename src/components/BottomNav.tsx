/**
 * BottomNav — feste Tab-Leiste am unteren Rand (Nav 1 minimal, Icons in Nav 2).
 */
import { useApp } from '../lib/state';
import type { AppTab } from '../shared/types';
import '../screens/screens.css';

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
          <span className="ps-navtab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
