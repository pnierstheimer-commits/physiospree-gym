/**
 * OnboardingScreen — 5-Schritte-Flow zur Profilerfassung.
 *
 * UI-only (Regel 3): sammelt Eingaben, baut am Ende ein UserProfile und stößt
 * `requestPlan` an. Die Plan-Generierung, Persistenz und Fehlerbehandlung
 * liegen im State/Service. Loading- und Error-Zustand werden hier nur
 * angezeigt (planLoading/planError aus dem State).
 */

import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useApp } from '../lib/state';
import type { Equipment, ExperienceLevel, Goal, UserProfile } from '../shared/types';
import './screens.css';

const TOTAL_STEPS = 5;

// --- Schritt 1: Ziel ---
const GOALS: { value: Goal; title: string; sub: string }[] = [
  { value: 'hypertrophy', title: 'Hypertrophie', sub: 'Muskelaufbau, Volumen im Fokus' },
  { value: 'strength', title: 'Maximalkraft', sub: 'Schwer, niedrige Wiederholungen' },
  { value: 'endurance', title: 'Kraftausdauer', sub: 'Hohe Wiederholungen, Dichte' },
];

// --- Schritt 2: Trainingsalter -> ExperienceLevel ---
const EXPERIENCE: { title: string; sub: string; value: ExperienceLevel }[] = [
  { title: 'Noch nie trainiert', sub: 'Einstieg', value: 'beginner' },
  { title: 'Unter 6 Monaten', sub: 'Anfänger', value: 'beginner' },
  { title: '6–24 Monate', sub: 'Fortgeschritten', value: 'intermediate' },
  { title: 'Über 2 Jahre', sub: 'Erfahren', value: 'advanced' },
];

// --- Schritt 3: Trainingstage ---
const DAYS: { value: number; title: string; sub: string }[] = [
  { value: 2, title: '2 Tage', sub: '2× Ganzkörper' },
  { value: 3, title: '3 Tage', sub: 'Ganzkörper oder OK/UK/GK' },
  { value: 4, title: '4 Tage', sub: '2× Ober-/Unterkörper' },
];

// --- Schritt 4: Trainingszeit ---
const MINUTES: { value: number; title: string; sub: string }[] = [
  { value: 45, title: '45 Minuten', sub: '5–6 Übungen' },
  { value: 60, title: '60 Minuten', sub: '6–7 Übungen' },
  { value: 75, title: '75+ Minuten', sub: '7–8 Übungen' },
];

// --- Schritt 5: Equipment ---
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

function LoadingView() {
  return (
    <div className="ps-screen">
      <div className="ps-shell">
        <div className="ps-center">
          <div className="ps-spinner" aria-hidden="true" />
          <div className="ps-loading-text">Dein Trainingsplan wird erstellt …</div>
          <p className="ps-loading-sub">
            Der Coach baut Zyklus, Split und die ersten zwei Wochen. Das dauert ein paar Sekunden.
          </p>
        </div>
      </div>
    </div>
  );
}

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

export function OnboardingScreen() {
  const { requestPlan, planLoading, planError, clearPlan } = useApp();

  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [experience, setExperience] = useState<ExperienceLevel | null>(null);
  // Eigener Index, weil zwei Trainingsalter-Optionen auf 'beginner' mappen.
  const [experienceIndex, setExperienceIndex] = useState<number | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [equip, setEquip] = useState<EquipAnswers>(EMPTY_EQUIP);
  const [submitted, setSubmitted] = useState<UserProfile | null>(null);

  // Loading/Error haben Vorrang vor dem Wizard.
  if (planLoading) return <LoadingView />;
  if (planError) {
    return (
      <ErrorView
        message={planError}
        onRetry={() => submitted && void requestPlan(submitted)}
        onEdit={clearPlan}
      />
    );
  }

  const goNext = () => setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const equipAllAnswered = EQUIP_QUESTIONS.every(({ key }) => equip[key] !== null);

  const finish = () => {
    if (goal == null || experience == null || days == null || minutes == null) return;
    const now = new Date().toISOString();
    const profile: UserProfile = {
      id: uuidv4(),
      updatedAt: now,
      userId: uuidv4(),
      displayName: '',
      sex: 'unspecified',
      goal,
      experience,
      daysPerWeek: days,
      equipment: deriveEquipment(equip),
      markers: [],
      notes: buildNotes(minutes, equip),
      createdAt: now,
    };
    setSubmitted(profile);
    void requestPlan(profile);
  };

  return (
    <div className="ps-screen">
      <div className="ps-shell">
        <div className="ps-head">
          {step > 1 && (
            <button type="button" className="ps-back" onClick={goBack} aria-label="Zurück">
              ‹
            </button>
          )}
          <div className="ps-progress">
            <div className="ps-progress-label">
              Schritt {step} von {TOTAL_STEPS}
            </div>
            <div className="ps-progress-track">
              <div
                className="ps-progress-fill"
                style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {step === 1 && (
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

        {step === 2 && (
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

        {step === 3 && (
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

        {step === 4 && (
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

        {step === 5 && (
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
