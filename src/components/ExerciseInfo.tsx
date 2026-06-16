/**
 * ExerciseInfo — tappbarer Übungsname mit ausklappbarem Info-Panel.
 *
 * UI-only (Regel 3): schlägt den Namen im Katalog nach (findCatalogExercise,
 * tolerant). Treffer -> der Name wird ein Button; Tap klappt Kurzbeschreibung,
 * Equipment, Cue und Stufe auf (CSS-Slide), nochmal Tap schließt. Kein Treffer
 * -> nur Text, nicht tappbar, kein Fehler.
 */

import { useState, type ReactNode } from 'react';
import { findCatalogExercise } from '../data/exerciseCatalog';
import '../screens/screens.css';

interface ExerciseInfoProps {
  name: string;
  /** Klasse für den Namens-Span (übernimmt die bestehende Typo je Kontext). */
  nameClass?: string;
  /** Optionales Element links vom Namen (z. B. A1/Z2-Badge). */
  badge?: ReactNode;
  /** Optionales Element rechts (z. B. ✓ bei erledigtem Satz). */
  trailing?: ReactNode;
}

export function ExerciseInfo({ name, nameClass, badge, trailing }: ExerciseInfoProps) {
  const entry = findCatalogExercise(name);
  const [open, setOpen] = useState(false);

  if (!entry) {
    // Nicht im Katalog -> nicht tappbar.
    return (
      <div className="ps-exname is-static">
        {badge}
        <span className={nameClass}>{name}</span>
        {trailing}
      </div>
    );
  }

  return (
    <div className="ps-exname-wrap">
      <button
        type="button"
        className="ps-exname"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {badge}
        <span className={nameClass}>{name}</span>
        <span className="ps-exname-info" aria-hidden="true">
          {open ? '×' : 'i'}
        </span>
        {trailing}
      </button>
      <div className={`ps-exinfo${open ? ' is-open' : ''}`}>
        <div className="ps-exinfo-inner">
          <p className="ps-exinfo-desc">{entry.shortDesc}</p>
          <div className="ps-exinfo-tags">
            <span className="ps-exinfo-tag">{entry.equipment}</span>
            <span className="ps-exinfo-tag">Stufe {entry.level}</span>
          </div>
          <p className="ps-exinfo-cue">{entry.cue}</p>
        </div>
      </div>
    </div>
  );
}
