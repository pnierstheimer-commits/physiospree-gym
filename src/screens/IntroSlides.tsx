/**
 * IntroSlides — 3 Onboarding-Folien vor dem Login (nur beim allerersten Start).
 *
 * Erscheint, wenn keine Session existiert UND localStorage "introSeen" !== "true".
 * "Überspringen" (Slide 1/2) und "Los geht's" (Slide 3) setzen beide das Flag
 * und rufen onDone() — danach routet App.tsx zum LoginScreen und die Slides
 * kommen nie wieder (bis localStorage gelöscht wird).
 *
 * Navigation: Swipe links/rechts ODER Tap auf rechte/linke Bildschirmhälfte.
 * UI-only (Regel 3): keine Daten, keine Logik außer dem lokalen Flag. Icons als
 * Inline-SVG (Tabler-Stil, currentColor) — kein Icon-Package im Projekt.
 */

import { useRef, useState, type ReactNode } from 'react';
import './screens.css';

const INTRO_FLAG = 'introSeen';

type IconName =
  | 'download'
  | 'user-check'
  | 'user'
  | 'clock'
  | 'barbell'
  | 'player-play';

/** Inline-SVG im Tabler-Stil (24er-Viewbox, outline, currentColor). */
function Icon({ name, size = 22, stroke = 1.5 }: { name: IconName; size?: number; stroke?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: stroke,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'download':
      return (
        <svg {...common}>
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
          <path d="M7 11l5 5l5 -5" />
          <path d="M12 4v12" />
        </svg>
      );
    case 'user-check':
      return (
        <svg {...common}>
          <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" />
          <path d="M6 21v-2a4 4 0 0 1 4 -4h3.5" />
          <path d="M15 19l2 2l4 -4" />
        </svg>
      );
    case 'user':
      return (
        <svg {...common}>
          <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" />
          <path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
        </svg>
      );
    case 'clock':
      return (
        <svg {...common}>
          <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
          <path d="M12 7v5l3 3" />
        </svg>
      );
    case 'barbell':
      return (
        <svg {...common}>
          <path d="M4 9v6M6.5 7v10M17.5 7v10M20 9v6" />
          <path d="M6.5 12h11" />
        </svg>
      );
    case 'player-play':
      return (
        <svg {...common}>
          <path d="M7 4v16l13 -8z" />
        </svg>
      );
  }
}

interface ListItem {
  icon: IconName;
  text: string;
}

interface Slide {
  num: string;
  icon: IconName;
  headline: string;
  body?: ReactNode;
  list?: ListItem[];
  hint: string;
}

const SLIDES: Slide[] = [
  {
    num: '01',
    icon: 'download',
    headline: 'App installieren',
    body: (
      <>
        Tippe auf <strong>Teilen</strong> (ᐃ) und dann auf <strong>Zum Home-Bildschirm</strong>.
      </>
    ),
    hint: 'Kein App Store nötig.',
  },
  {
    num: '02',
    icon: 'user-check',
    headline: 'Kurzes Setup',
    list: [
      { icon: 'user', text: 'Name, Alter, Trainingsziel' },
      { icon: 'clock', text: 'Tage und Zeit festlegen' },
      { icon: 'barbell', text: 'Verfügbares Equipment' },
    ],
    hint: 'Dauert 2 Minuten. Danach kommt dein Plan.',
  },
  {
    num: '03',
    icon: 'player-play',
    headline: 'Training starten',
    body: <>Dein Plan steht auf dem Startscreen. Sätze eintragen, der Coach passt an.</>,
    hint: 'Bei Fragen — schreib dem Coach.',
  },
];

interface IntroSlidesProps {
  onDone: () => void;
}

export function IntroSlides({ onDone }: IntroSlidesProps) {
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const suppressClick = useRef(false);

  const last = SLIDES.length - 1;
  const slide = SLIDES[index];

  const next = () => setIndex((i) => Math.min(i + 1, last));
  const prev = () => setIndex((i) => Math.max(i - 1, 0));

  const finish = () => {
    try {
      localStorage.setItem(INTRO_FLAG, 'true');
    } catch {
      /* Privatmodus o. Ä. — Navigation trotzdem erlauben. */
    }
    onDone();
  };

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    suppressClick.current = false;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX.current == null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    const dy = e.changedTouches[0].clientY - (startY.current ?? 0);
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      suppressClick.current = true; // den folgenden Klick auf die Tap-Zone schlucken
      if (dx < 0) next();
      else prev();
    }
    startX.current = null;
  };

  const onZoneClick = (dir: 'prev' | 'next') => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (dir === 'next') next();
    else prev();
  };

  return (
    <div className="ps-intro" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Tap-Zonen: links zurück, rechts weiter (liegen hinter dem Content). */}
      <button
        type="button"
        className="ps-intro-tap is-left"
        aria-label="Zurück"
        tabIndex={-1}
        onClick={() => onZoneClick('prev')}
      />
      <button
        type="button"
        className="ps-intro-tap is-right"
        aria-label="Weiter"
        tabIndex={-1}
        onClick={() => onZoneClick('next')}
      />

      <div className="ps-intro-inner">
        <div className="ps-intro-num">{slide.num}</div>

        <div className="ps-intro-center">
          <div className="ps-intro-icon">
            <Icon name={slide.icon} />
          </div>
          <h2 className="ps-intro-headline">{slide.headline}</h2>

          {slide.body && <p className="ps-intro-body">{slide.body}</p>}

          {slide.list && (
            <ul className="ps-intro-list">
              {slide.list.map((item) => (
                <li key={item.text}>
                  <span className="ps-intro-list-icon">
                    <Icon name={item.icon} size={15} stroke={1.6} />
                  </span>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="ps-intro-hint">{slide.hint}</p>
        </div>

        <div className="ps-intro-foot">
          <div className="ps-intro-dots" role="presentation">
            {SLIDES.map((s, i) => (
              <span key={s.num} className={`ps-intro-dot${i === index ? ' is-active' : ''}`} />
            ))}
          </div>
          {index === last ? (
            <button type="button" className="ps-intro-start" onClick={finish}>
              Los geht&apos;s
            </button>
          ) : (
            <button type="button" className="ps-intro-skip" onClick={finish}>
              Überspringen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
