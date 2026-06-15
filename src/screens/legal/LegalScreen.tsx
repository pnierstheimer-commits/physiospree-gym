/**
 * LegalScreen — Wrapper für die vier statischen Rechtstexte. Eigener Vollbild-
 * Screen (über App.tsx, ohne BottomNav) mit Back-Button oben links.
 *
 * UI-only: rendert anhand `page` den passenden Textbaustein. `onBack` schließt
 * den Screen und kehrt zum Profil zurück.
 */

import '../screens.css';
import { LegalImpressum } from './LegalImpressum';
import { LegalDatenschutz } from './LegalDatenschutz';
import { LegalAGB } from './LegalAGB';
import { LegalDisclaimer } from './LegalDisclaimer';

export type LegalPage = 'impressum' | 'datenschutz' | 'agb' | 'disclaimer';

const TITLES: Record<LegalPage, string> = {
  impressum: 'Impressum',
  datenschutz: 'Datenschutz',
  agb: 'AGB',
  disclaimer: 'Trainingshinweis',
};

export function LegalScreen({ page, onBack }: { page: LegalPage; onBack: () => void }) {
  return (
    <div className="ps-screen">
      <div className="ps-shell">
        <div className="ps-head">
          <button type="button" className="ps-back" onClick={onBack} aria-label="Zurück">
            ‹
          </button>
          <span className="ps-legal-title">{TITLES[page]}</span>
        </div>

        {page === 'impressum' && <LegalImpressum />}
        {page === 'datenschutz' && <LegalDatenschutz />}
        {page === 'agb' && <LegalAGB />}
        {page === 'disclaimer' && <LegalDisclaimer />}
      </div>
    </div>
  );
}
