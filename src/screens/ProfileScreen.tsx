/**
 * ProfileScreen — Account, Trainings-Profil, Plan-Status, Danger Zone.
 *
 * UI-only (Regel 3): liest Profil/Plan aus dem State, E-Mail + Logout aus der
 * Auth-Session (über Props vom App-Root). Schlicht, Sektionen mit Trennstrich.
 */

import { useState } from 'react';
import { useApp } from '../lib/state';
import { deleteAccount } from '../lib/services/accountService';
import type { Equipment, ExperienceLevel, Goal } from '../shared/types';
import type { LegalPage } from './legal/LegalScreen';
import './screens.css';

const LEGAL_LINKS: { page: LegalPage; label: string }[] = [
  { page: 'impressum', label: 'Impressum' },
  { page: 'datenschutz', label: 'Datenschutz' },
  { page: 'agb', label: 'AGB' },
  { page: 'disclaimer', label: 'Trainingshinweis' },
];

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
  onOpenLegal,
}: {
  email: string | null;
  onSignOut: () => void;
  onOpenLegal: (page: LegalPage) => void;
}) {
  const { state, currentPlan, resetPlan, setActiveTab } = useApp();
  const profile = state.profile;
  const fw = currentPlan?.framework ?? null;

  // Account-Löschung: Bestätigungsdialog + Loading-/Fehlerzustand.
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  const onConfirmDelete = async () => {
    setDeleting(true);
    setDeleteError(false);
    try {
      await deleteAccount();
      // Erfolg: lokalen State leeren + zur Login-Seite — onSignOut kapselt beides.
      onSignOut();
    } catch {
      setDeleteError(true);
      setDeleting(false);
    }
  };

  const closeDeleteDialog = () => {
    if (deleting) return;
    setShowDeleteConfirm(false);
    setDeleteError(false);
  };

  const segment: Goal | null = profile?.goal ?? fw?.goal ?? null;
  const days = profile?.daysPerWeek ?? fw?.daysPerWeek ?? null;
  const time = trainingMinutes(profile?.notes);
  const curWeek = fw ? (fw.weeks.find((w) => w.weekIndex === fw.currentWeekIndex) ?? null) : null;

  const onReset = () => {
    if (window.confirm('Plan wirklich löschen? Alle Trainingsdaten bleiben erhalten.')) {
      void resetPlan();
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

        <section className="ps-prof-section">
          <div className="ps-prof-label">Rechtliches</div>
          <div className="ps-legal-links">
            {LEGAL_LINKS.map((l) => (
              <button
                key={l.page}
                type="button"
                className="ps-legal-link"
                onClick={() => onOpenLegal(l.page)}
              >
                <span>{l.label}</span>
                <span className="ps-legal-link-chev" aria-hidden="true">
                  ›
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="ps-prof-section">
          <button
            type="button"
            className="ps-prof-delete"
            onClick={() => setShowDeleteConfirm(true)}
          >
            Account löschen
          </button>
        </section>
      </div>

      {showDeleteConfirm && (
        <div
          className="ps-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ps-del-title"
        >
          <div className="ps-modal">
            <div className="ps-modal-title" id="ps-del-title">
              Account wirklich löschen?
            </div>
            <p className="ps-modal-text">
              Alle deine Daten werden unwiderruflich gelöscht. Dieser Schritt kann nicht
              rückgängig gemacht werden.
            </p>
            {deleteError && (
              <p className="ps-modal-error">
                Löschen fehlgeschlagen. Bitte versuche es erneut oder kontaktiere uns.
              </p>
            )}
            <div className="ps-modal-actions">
              <button
                type="button"
                className="ps-btn ps-btn-ghost"
                onClick={closeDeleteDialog}
                disabled={deleting}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="ps-prof-delete"
                onClick={onConfirmDelete}
                disabled={deleting}
              >
                {deleting ? 'Löscht…' : 'Endgültig löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
