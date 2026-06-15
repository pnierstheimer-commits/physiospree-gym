/**
 * ProfileScreen — Account, Trainings-Profil, Plan-Status, Danger Zone.
 *
 * UI-only (Regel 3): liest Profil/Plan aus dem State, E-Mail + Logout aus der
 * Auth-Session (über Props vom App-Root). Schlicht, Sektionen mit Trennstrich.
 */

import { useApp } from '../lib/state';
import type { Equipment, ExperienceLevel, Goal } from '../shared/types';
import './screens.css';

const GOAL_LABEL: Record<Goal, string> = {
  strength: 'Maximalkraft',
  hypertrophy: 'Hypertrophie',
  endurance: 'Kraftausdauer',
  general_fitness: 'Allgemein',
  rehab: 'Reha',
};
const LEVEL_LABEL: Record<ExperienceLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};
const EQUIP_LABEL: Record<Equipment, string> = {
  full_gym: 'Studio (voll ausgestattet)',
  home_basic: 'Home (Kurzhanteln)',
  bodyweight: 'Körpergewicht',
};
const PHASE_LABEL: Record<string, string> = {
  accumulation: 'Akkumulation',
  intensification: 'Intensivierung',
  peak: 'Realisierung',
  deload: 'Deload',
};

/** Trainingszeit aus dem Profil-Freitext ("… 60 min …"). */
function trainingMinutes(notes: string | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(/(\d+)\s*min/i);
  return m ? `${m[1]} min` : null;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="ps-prof-row">
      <span className="ps-prof-row-label">{label}</span>
      <span className="ps-prof-row-val">{value}</span>
    </div>
  );
}

export function ProfileScreen({
  email,
  onSignOut,
}: {
  email: string | null;
  onSignOut: () => void;
}) {
  const { state, currentPlan, clearPlan, setActiveTab } = useApp();
  const profile = state.profile;
  const fw = currentPlan?.framework ?? null;

  const segment: Goal | null = profile?.goal ?? fw?.goal ?? null;
  const days = profile?.daysPerWeek ?? fw?.daysPerWeek ?? null;
  const time = trainingMinutes(profile?.notes);
  const curWeek = fw ? (fw.weeks.find((w) => w.weekIndex === fw.currentWeekIndex) ?? null) : null;

  const onReset = () => {
    if (window.confirm('Plan wirklich löschen? Alle Trainingsdaten bleiben erhalten.')) {
      clearPlan();
      setActiveTab('plan');
    }
  };

  return (
    <div className="ps-screen">
      <div className="ps-shell">
        <div className="ps-plan-title">Profil</div>

        <section className="ps-prof-section">
          <div className="ps-prof-label">Account</div>
          <Row label="E-Mail" value={email ?? '—'} />
          <button
            type="button"
            className="ps-btn ps-btn-ghost ps-btn-quiet ps-prof-signout"
            onClick={onSignOut}
          >
            Abmelden
          </button>
        </section>

        <section className="ps-prof-section">
          <div className="ps-prof-label">Über dich</div>
          <Row label="Name" value={profile?.displayName?.trim() || '—'} />
          <Row
            label="Alter"
            value={
              typeof profile?.age === 'number' && profile.age > 0 ? `${profile.age} Jahre` : '—'
            }
          />
          {profile?.goalWhy?.trim() && <Row label="Warum" value={profile.goalWhy.trim()} />}
        </section>

        <section className="ps-prof-section">
          <div className="ps-prof-label">Trainings-Profil</div>
          <Row label="Segment" value={segment ? GOAL_LABEL[segment] : '—'} />
          <Row label="Level" value={profile ? LEVEL_LABEL[profile.experience] : '—'} />
          <Row label="Trainingstage" value={days != null ? `${days}× pro Woche` : '—'} />
          <Row label="Zeit / Einheit" value={time ?? '—'} />
          <Row label="Equipment" value={profile ? EQUIP_LABEL[profile.equipment] : '—'} />
        </section>

        {fw && (
          <section className="ps-prof-section">
            <div className="ps-prof-label">Plan-Status</div>
            <Row
              label="Fortschritt"
              value={`Woche ${fw.currentWeekIndex + 1} von ${fw.totalWeeks}${
                curWeek ? ` · ${PHASE_LABEL[curWeek.phase] ?? curWeek.phase}` : ''
              }`}
            />
            {fw.generatedAt && <Row label="Plan-Start" value={fmtDate(fw.generatedAt)} />}
          </section>
        )}

        <section className="ps-prof-section ps-prof-danger">
          <div className="ps-prof-label">Danger Zone</div>
          <button type="button" className="ps-prof-reset" onClick={onReset}>
            Plan zurücksetzen
          </button>
        </section>
      </div>
    </div>
  );
}
