/**
 * TodayScreen — der Einstieg.
 *
 * Datum + adaptive Begrüßung, die Einheit des Tages (oder Ruhetag/CTA) und das
 * letzte Workout. UI-only (Regel 3): liest aus dem State und löst Aktionen aus
 * (startWorkout, Tab-Wechsel). Der adaptive Satz nutzt das vorhandene Signal
 * (Trainingstag? Deload?) — Check-in/Coach-Hinweis kommen später.
 */

import { useApp } from '../lib/state';
import type { PlannedSession } from '../shared/types';
import './screens.css';

const WD_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type WD = (typeof WD_ORDER)[number];
const WD_FULL: Record<WD, string> = {
  mon: 'Montag',
  tue: 'Dienstag',
  wed: 'Mittwoch',
  thu: 'Donnerstag',
  fri: 'Freitag',
  sat: 'Samstag',
  sun: 'Sonntag',
};
const todayWD = (d: Date): WD => (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as WD[])[d.getDay()];
const schedOf = (s: PlannedSession): WD | null => (s.scheduledDay as WD | undefined) ?? null;

function firstName(displayName: string | undefined): string | null {
  const n = (displayName ?? '').trim();
  return n ? n.split(/\s+/)[0] : null;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

export function TodayScreen({ onSignOut }: { onSignOut?: () => void } = {}) {
  const { state, currentPlan, workoutHistory, startWorkout, setActiveTab } = useApp();

  const today = new Date();
  const dateStr = today.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const name = firstName(state.profile?.displayName);
  const greeting = name ? `Moin ${name}.` : 'Moin.';

  const fw = currentPlan?.framework ?? null;
  const curWeek = fw ? (fw.weeks.find((w) => w.weekIndex === fw.currentWeekIndex) ?? null) : null;
  const wd = todayWD(today);
  const todaySession = curWeek?.sessions.find((s) => schedOf(s) === wd) ?? null;
  const isDeload = curWeek?.isDeload ?? false;

  let sub: string;
  if (!fw) sub = 'Dein Plan wartet.';
  else if (!todaySession) sub = 'Heute Ruhetag.';
  else if (isDeload) sub = 'Heute lieber einen Gang zurück.';
  else sub = 'Du kannst heute gut trainieren.';

  // Nächstes Training (für die Ruhetag-Karte).
  const nextSession = (() => {
    if (!curWeek) return null;
    const ti = WD_ORDER.indexOf(wd);
    const sorted = curWeek.sessions
      .filter((s) => schedOf(s) !== null)
      .sort((a, b) => WD_ORDER.indexOf(schedOf(a)!) - WD_ORDER.indexOf(schedOf(b)!));
    return sorted.find((s) => WD_ORDER.indexOf(schedOf(s)!) > ti) ?? sorted[0] ?? null;
  })();

  const lastWorkout =
    [...workoutHistory]
      .filter((w) => w.status === 'completed')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] ?? null;

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

        <div className="ps-today-date">{dateStr}</div>
        <div className="ps-today-greet">{greeting}</div>
        <p className="ps-today-sub">{sub}</p>

        {/* Einheit des Tages */}
        {!fw ? (
          <div className="ps-today-card ps-today-cta">
            <div className="ps-today-card-name">Noch kein Plan</div>
            <p className="ps-today-card-meta">Lass dir vom Coach einen Zyklus bauen.</p>
            <button
              type="button"
              className="ps-btn ps-btn-primary ps-today-start"
              onClick={() => setActiveTab('plan')}
            >
              Plan erstellen
            </button>
          </div>
        ) : todaySession ? (
          <div className="ps-today-card">
            <div className="ps-today-card-label">Einheit des Tages</div>
            <div className="ps-today-card-name">{todaySession.name}</div>
            <p className="ps-today-card-meta">{todaySession.exercises.length} Übungen</p>
            <button
              type="button"
              className="ps-btn ps-btn-primary ps-today-start"
              onClick={() => startWorkout(todaySession)}
            >
              Training starten
            </button>
          </div>
        ) : (
          <div className="ps-today-rest">
            {nextSession && schedOf(nextSession)
              ? `Nächstes Training: ${WD_FULL[schedOf(nextSession)!]}`
              : 'Diese Woche kein Training geplant.'}
          </div>
        )}

        {/* Letztes Workout */}
        {lastWorkout && (
          <button type="button" className="ps-today-last" onClick={() => setActiveTab('journal')}>
            <div className="ps-today-last-top">
              <span className="ps-today-last-name">{lastWorkout.name}</span>
              <span className="ps-today-last-date">{fmtDate(lastWorkout.date)}</span>
            </div>
            <div className="ps-today-last-meta">
              {typeof lastWorkout.totalDuration === 'number' ? `${lastWorkout.totalDuration} min · ` : ''}
              Details im Tagebuch →
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
