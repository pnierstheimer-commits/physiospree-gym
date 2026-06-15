/**
 * OnboardingScreen — 6-Schritte-Flow zur Profilerfassung.
 *
 * Schritt 1 ist "Kurz zu dir" (Name, Alter, optionales Warum) — ein Formular
 * mit Weiter-Button; die übrigen Slides sind Auswahl-Karten (auto-advance).
 * UI-only (Regel 3): sammelt Eingaben, baut am Ende ein UserProfile und stößt
 * `requestPlan` an. Loading läuft als Vollbild-WaitingScreen über App.tsx.
 */

import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useApp } from '../lib/state';
import type { Equipment, ExperienceLevel, Goal, UserProfile } from '../shared/types';
import { DisclaimerGate } from '../components/DisclaimerGate';
import './screens.css';

const TOTAL_STEPS = 6;

// --- Schritt 2: Ziel ---
const GOALS: { value: Goal; title: string; sub: string }[] = [
  { value: 'hypertrophy', title: 'Hypertrophie', sub: 'Muskelaufbau, Volumen im Fokus' },
  { value: 'strength', title: 'Maximalkraft', sub: 'Schwer, niedrige Wiederholungen' },
  { value: 'endurance', title: 'Kraftausdauer', sub: 'Hohe Wiederholungen, Dichte' },
];

// --- Schritt 3: Trainingsalter -> ExperienceLevel ---
const EXPERIENCE: { title: string; sub: string; value: ExperienceLevel }[] = [
  { title: 'Noch nie trainiert', sub: 'Einstieg', value: 'beginner' },
  { title: 'Unter 6 Monaten', sub: 'Anfänger', value: 'beginner' },
  { title: '6–24 Monate', sub: 'Fortgeschritten', value: 'intermediate' },
  { title: 'Über 2 Jahre', sub: 'Erfahren', value: 'advanced' },
];

// --- Schritt 4: Trainingstage ---
const DAYS: { value: number; title: string; sub: string }[] = [
  { value: 2, title: '2 Tage', sub: '2× Ganzkörper' },
  { value: 3, title: '3 Tage', sub: 'Ganzkörper oder OK/UK/GK' },
  { value: 4, title: '4 Tage', sub: '2× Ober-/Unterkörper' },
];

// --- Schritt 5: Trainingszeit ---
const MINUTES: { value: number; title: string; sub: string }[] = [
  { value: 45, title: '45 Minuten', sub: '5–6 Übungen' },
  { value: 60, title: '60 Minuten', sub: '6–7 Übungen' },
  { value: 75, title: '75+ Minuten', sub: '7–8 Übungen' },
];

// --- Schritt 6: Equipment ---
type EquipKey = 'barbellRack' | 'dumbbells' | 'cable' | 'machinesOnly';
type EquipAnswers = Record<EquipKey, boolean | null>;

const EQUIP_QUESTIONS: { key: EquipKey; q: string }[] = [
  { key: 'barbellRack', q: 'Langhantel + Rack verfügbar?' },
  { key: 'dumbbells', q: 'Kurzhanteln verfügbar?' },
  { key: 'cable', q: 'Kabelzug verfügbar?' },
  { key: 'machinesOnly', q: 'Nur Maschinen?' },
];

const EMPTY_EQUIP: EquipAnswers = {
  barbellRack: null,
  dumbbells: null,
  cable: null,
  machinesOnly: null,
};

/** Leitet aus den 4 Ja/Nein-Antworten das grobe Equipment-Enum ab. */
function deriveEquipment(a: EquipAnswers): Equipment {
  if (a.barbellRack || a.cable || a.machinesOnly) return 'full_gym';
  if (a.dumbbells) return 'home_basic';
  return 'bodyweight';
}

/** Hält Trainingszeit + Equipment-Detail als Freitext fest (geht an den Coach). */
function buildNotes(minutes: number, a: EquipAnswers): string {
  const yn = (v: boolean | null) => (v ? 'ja' : 'nein');
  return (
    `Trainingszeit/Einheit: ${minutes} min. ` +
    `Equipment — Langhantel+Rack: ${yn(a.barbellRack)}, Kurzhanteln: ${yn(a.dumbbells)}, ` +
    `Kabelzug: ${yn(a.cable)}, Nur Maschinen: ${yn(a.machinesOnly)}.`
  );
}

// ---------------------------------------------------------------------------

function ErrorView({
  message,
  onRetry,
  onEdit,
}: {
  message: string;
  onRetry: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="ps-screen">
      <div className="ps-shell">
        <div className="ps-title">Plan konnte nicht erstellt werden</div>
        <p className="ps-subtitle">Kein Netz, oder der Coach hat gepatzt. Probier es nochmal.</p>
        <div className="ps-error-card">
          <div className="ps-error-title">Fehler</div>
          {message}
        </div>
        <div className="ps-actions">
          <button className="ps-btn ps-btn-primary" onClick={onRetry}>
            Nochmal versuchen
          </button>
          <button className="ps-btn ps-btn-ghost" onClick={onEdit}>
            Eingaben ändern
          </button>
        </div>
      </div>
    </div>
  );
}

interface OptionCardProps {
  title: string;
  sub: string;
  selected: boolean;
  onClick: () => void;
}
function OptionCard({ title, sub, selected, onClick }: OptionCardProps) {
  return (
    <button
      type="button"
      className={`ps-card${selected ? ' is-selected' : ''}`}
      onClick={onClick}
    >
      <span className="ps-card-title">{title}</span>
      <span className="ps-card-sub">{sub}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------

export function OnboardingScreen({ onSignOut }: { onSignOut?: () => void } = {}) {
  const { state, requestPlan, planError, clearPlan } = useApp();

  const [step, setStep] = useState(1);
  // Schritt 1: Kurz zu dir
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [why, setWhy] = useState('');
  // weitere Schritte
  const [goal, setGoal] = useState<Goal | null>(null);
  const [experience, setExperience] = useState<ExperienceLevel | null>(null);
  // Eigener Index, weil zwei Trainingsalter-Optionen auf 'beginner' mappen.
  const [experienceIndex, setExperienceIndex] = useState<number | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [equip, setEquip] = useState<EquipAnswers>(EMPTY_EQUIP);
  const [submitted, setSubmitted] = useState<UserProfile | null>(null);
  // Profil, das auf die Disclaimer-Bestätigung wartet (Gate vor WaitingScreen).
  const [pendingProfile, setPendingProfile] = useState<UserProfile | null>(null);

  // Plan-Generierung läuft als Vollbild-WaitingScreen über App.tsx (planLoading).
  // Hier nur noch der Fehlerfall, der Disclaimer-Gate + der Wizard.
  if (planError) {
    return (
      <ErrorView
        message={planError}
        onRetry={() => submitted && void requestPlan(submitted)}
        onEdit={clearPlan}
      />
    );
  }

  // Einmaliger Haftungs-/Gesundheitshinweis: erscheint nach „Plan erstellen",
  // direkt vor dem WaitingScreen. Erst nach Bestätigung läuft requestPlan.
  if (pendingProfile) {
    return (
      <DisclaimerGate
        onBack={() => setPendingProfile(null)}
        onAccept={() => {
          const profile: UserProfile = { ...pendingProfile, disclaimerAccepted: true };
          setSubmitted(profile);
          setPendingProfile(null);
          void requestPlan(profile);
        }}
      />
    );
  }

  const goNext = () => setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const ageNum = age.trim() === '' ? null : Number(age);
  const ageTooYoung = ageNum != null && ageNum < 15;
  const step1Valid =
    name.trim().length >= 2 && ageNum != null && ageNum >= 15 && ageNum <= 99;

  const equipAllAnswered = EQUIP_QUESTIONS.every(({ key }) => equip[key] !== null);

  const finish = () => {
    if (goal == null || experience == null || days == null || minutes == null || ageNum == null) return;
    const now = new Date().toISOString();
    const profile: UserProfile = {
      id: uuidv4(),
      updatedAt: now,
      userId: uuidv4(),
      displayName: name.trim(),
      age: ageNum,
      goalWhy: why.trim() ? why.trim() : undefined,
      sex: 'unspecified',
      goal,
      experience,
      daysPerWeek: days,
      equipment: deriveEquipment(equip),
      markers: [],
      notes: buildNotes(minutes, equip),
      createdAt: now,
    };
    // Disclaimer bereits früher bestätigt? Dann direkt zum Plan. Sonst Gate.
    if (state.profile?.disclaimerAccepted) {
      const accepted: UserProfile = { ...profile, disclaimerAccepted: true };
      setSubmitted(accepted);
      void requestPlan(accepted);
    } else {
      setPendingProfile(profile);
    }
  };

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
        <div className="ps-head">
          {step > 1 && (
            <button type="button" className="ps-back" onClick={goBack} aria-label="Zurück">
              ‹
            </button>
          )}
          <div className="ps-progress">
            <div className="ps-progress-label">
              Schritt {step} / {TOTAL_STEPS}
            </div>
            <div className="ps-progress-steps">
              {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                <span
                  key={i}
                  className={`ps-progress-step${i < step ? ' is-active' : ''}`}
                />
              ))}
            </div>
          </div>
        </div>

        {step === 1 && (
          <>
            <div className="ps-title">Kurz zu dir</div>
            <p className="ps-subtitle">Damit dein Coach dich kennt.</p>
            <div className="ps-onb-form">
              <label className="ps-onb-field">
                <span className="ps-onb-label">Wie heißt du?</span>
                <input
                  className="ps-onb-input"
                  type="text"
                  autoFocus
                  autoComplete="given-name"
                  maxLength={30}
                  placeholder="Dein Vorname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>

              <label className="ps-onb-field">
                <span className="ps-onb-label">Wie alt bist du?</span>
                <input
                  className="ps-onb-input"
                  type="number"
                  inputMode="numeric"
                  min={15}
                  max={99}
                  placeholder="z. B. 28"
                  value={age}
                  onChange={(e) => setAge(e.target.value.replace(/\D/g, '').slice(0, 3))}
                />
                {ageTooYoung && (
                  <span className="ps-onb-error">
                    Physiospree Gym ist ab 15 Jahren verfügbar.
                  </span>
                )}
              </label>

              <label className="ps-onb-field">
                <span className="ps-onb-label">Warum trainierst du?</span>
                <textarea
                  className="ps-onb-textarea"
                  rows={3}
                  maxLength={200}
                  placeholder="z. B. Kraft aufbauen, nach Verletzung zurück, besser aussehen…"
                  value={why}
                  onChange={(e) => setWhy(e.target.value)}
                />
                <span className="ps-onb-hint">
                  Optional — aber hilft dem Coach, dich zu verstehen
                </span>
              </label>
            </div>
            <div className="ps-actions">
              <button
                type="button"
                className="ps-btn ps-btn-primary"
                disabled={!step1Valid}
                onClick={goNext}
              >
                Weiter
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="ps-title">Dein Trainingsziel</div>
            <p className="ps-subtitle">Worauf zielt dieser Zyklus?</p>
            <div className="ps-cards">
              {GOALS.map((o) => (
                <OptionCard
                  key={o.value}
                  title={o.title}
                  sub={o.sub}
                  selected={goal === o.value}
                  onClick={() => {
                    setGoal(o.value);
                    goNext();
                  }}
                />
              ))}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="ps-title">Wie lange trainierst du schon?</div>
            <p className="ps-subtitle">Bestimmt dein Progressionsmodell.</p>
            <div className="ps-cards">
              {EXPERIENCE.map((o, i) => (
                <OptionCard
                  key={i}
                  title={o.title}
                  sub={o.sub}
                  selected={experienceIndex === i}
                  onClick={() => {
                    setExperience(o.value);
                    setExperienceIndex(i);
                    goNext();
                  }}
                />
              ))}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div className="ps-title">Trainingstage pro Woche</div>
            <p className="ps-subtitle">Steuert den Split.</p>
            <div className="ps-cards">
              {DAYS.map((o) => (
                <OptionCard
                  key={o.value}
                  title={o.title}
                  sub={o.sub}
                  selected={days === o.value}
                  onClick={() => {
                    setDays(o.value);
                    goNext();
                  }}
                />
              ))}
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <div className="ps-title">Zeit pro Einheit</div>
            <p className="ps-subtitle">Bestimmt die Übungsanzahl.</p>
            <div className="ps-cards">
              {MINUTES.map((o) => (
                <OptionCard
                  key={o.value}
                  title={o.title}
                  sub={o.sub}
                  selected={minutes === o.value}
                  onClick={() => {
                    setMinutes(o.value);
                    goNext();
                  }}
                />
              ))}
            </div>
          </>
        )}

        {step === 6 && (
          <>
            <div className="ps-title">Equipment</div>
            <p className="ps-subtitle">Vier kurze Fragen zu deinem Studio.</p>
            <div className="ps-toggles">
              {EQUIP_QUESTIONS.map(({ key, q }) => (
                <div className="ps-toggle" key={key}>
                  <div className="ps-toggle-q">{q}</div>
                  <div className="ps-toggle-opts">
                    <button
                      type="button"
                      className={`ps-toggle-btn${equip[key] === true ? ' is-selected' : ''}`}
                      onClick={() => setEquip((prev) => ({ ...prev, [key]: true }))}
                    >
                      Ja
                    </button>
                    <button
                      type="button"
                      className={`ps-toggle-btn${equip[key] === false ? ' is-selected' : ''}`}
                      onClick={() => setEquip((prev) => ({ ...prev, [key]: false }))}
                    >
                      Nein
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="ps-actions">
              <button
                type="button"
                className="ps-btn ps-btn-primary"
                disabled={!equipAllAnswered}
                onClick={finish}
              >
                Plan erstellen
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
