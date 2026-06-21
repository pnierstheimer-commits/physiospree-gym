/**
 * inputModeService — leitet den Eingabe-Modus einer Übung ab (Regel 3/4).
 *
 * Bestehende Pläne haben kein `inputMode`-Feld. Diese reine Logik erkennt den
 * Modus aus Name, Cue und (für Körpergewicht) dem Übungskatalog. Reihenfolge der
 * Erkennung: cardio -> time -> bodyweight_reps -> weight_reps (Default).
 *
 * Bewusst konservativ bei 'time': Tempo-Cues wie "2 s halten oben" (Wadenheben)
 * oder "ablassen (2–3 s)" (Bankdrücken) dürfen NICHT als Zeit-Übung gelten —
 * daher Erkennung über Übungsnamen (Plank etc.) bzw. zweistellige Sekundenwerte.
 */

import type { InputMode } from '../../shared/types';
import { findCatalogExercise } from '../../data/exerciseCatalog';

export const INPUT_MODES: InputMode[] = ['weight_reps', 'time', 'cardio', 'bodyweight_reps'];

/** Auswählbare Cardio-Geräte (Aufwärmen). */
export const CARDIO_MACHINES = [
  'Ergometer',
  'Laufband',
  'Crosstrainer',
  'Ruderergometer',
  'Stepper',
] as const;

// Cardio NUR über den ÜBUNGSNAMEN: ein explizit benanntes Cardio-Gerät oder der
// Aufwärm-Eintrag (Punkt 0, "Aufwärmen — …"). Bewusst NICHT über den Cue —
// Aufwärmsatz-Text im Cue ("Aufwärmsätze: 1×10 @ 50% …") darf Kraftübungen wie
// "Beinpresse (Maschine)" nicht fälschlich als Cardio markieren. "Maschine" ist
// kein Cardio-Stichwort -> Maschinen-Kraftübungen bleiben weight_reps.
const CARDIO_NAME_RE =
  /ergometer|laufband|crosstrainer|crosser|ruderergometer|rudergerät|stepper|fahrrad|aufwärm/i;
// Zeit: über den Namen (Plank etc.) oder zweistellige Sekundenangaben
// ("45 Sekunden", "30s") — einstellige Tempo-Cues ("2 s") matchen bewusst nicht.
const TIME_NAME_RE = /plank|planke|unterarmst(?:ü|u)tz|dead.?bug|\bhold\b|isometr/i;
const TIME_DUR_RE = /\b\d{2,}\s*(?:s\b|sek\b|sekunden\b)/i;
const BODYWEIGHT_RE = /körpergewicht|liegestütz|liege-stütz|push.?up/i;

function isInputMode(v: unknown): v is InputMode {
  return typeof v === 'string' && (INPUT_MODES as string[]).includes(v);
}

/** Ermittelt den Eingabe-Modus; explizites `inputMode` hat Vorrang. */
export function resolveInputMode(opts: {
  inputMode?: InputMode | null;
  name: string;
  cue?: string | null;
}): InputMode {
  if (isInputMode(opts.inputMode)) return opts.inputMode;
  // Cardio nur aus dem Namen (Gerät / Aufwärmen), nie aus dem Cue.
  if (CARDIO_NAME_RE.test(opts.name)) return 'cardio';
  const hay = `${opts.name} ${opts.cue ?? ''}`;
  if (TIME_NAME_RE.test(opts.name) || TIME_DUR_RE.test(hay)) return 'time';
  const cat = findCatalogExercise(opts.name);
  if ((cat && /körpergewicht/i.test(cat.equipment)) || BODYWEIGHT_RE.test(hay)) {
    return 'bodyweight_reps';
  }
  return 'weight_reps';
}

/** Zielzeit aus Cue/Name ("45 Sekunden", "30s") -> Sekunden, sonst null. */
export function parseTargetSeconds(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = /(\d{1,4})\s*(?:s\b|sek\b|sekunden\b)/i.exec(text);
  return m ? Number(m[1]) : null;
}
