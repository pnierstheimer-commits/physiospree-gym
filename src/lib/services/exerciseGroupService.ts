/**
 * exerciseGroupService — erkennt Satzformate (klassisch / Supersatz / Zirkel)
 * anhand des Prefix im Übungsnamen und gruppiert aufeinanderfolgende Übungen.
 *
 * Reine Funktionen, kein State, kein API (Regel 3/4: Logik im Service, nicht
 * in der UI). Die Gruppierung ist NUR für Anzeige + Flow; die gespeicherten
 * Satz-Daten bleiben pro Übung (Regel 6).
 *
 * Prefix-Konvention im notes-Feld:
 *   "Bankdrücken — Cue"      -> klassisch (kein Prefix)
 *   "A1: Brustpresse — Cue"  -> Supersatz-Paar A   (A/B/C…, je 2)
 *   "Z1: Beinpresse — Cue"   -> Zirkel-Gruppe Z     (Z, 3–4)
 */

export type GroupType = 'single' | 'superset' | 'circuit';

export interface ExerciseGroup {
  type: GroupType;
  /** Buchstaben-Label ('A','B','Z') oder null bei klassisch/Einzel. */
  label: string | null;
  /** Indizes in die ursprüngliche Übungsliste (1 single, 2 superset, 3–4 circuit). */
  indices: number[];
}

const PREFIX_RE = /^\s*([A-Za-z])\s*(\d+)\s*:\s*(.*)$/;

/**
 * Zerlegt einen Übungsnamen in Prefix (Buchstabe + Zahl) und reinen Namen.
 * Ohne gültigen Prefix: letter/num null, name unverändert (getrimmt).
 */
export function parsePrefix(name: string): { letter: string | null; num: number | null; name: string } {
  const m = PREFIX_RE.exec(name);
  if (!m) return { letter: null, num: null, name: name.trim() };
  return { letter: m[1].toUpperCase(), num: Number(m[2]), name: m[3].trim() };
}

/**
 * Gruppiert aufeinanderfolgende Übungen mit gleichem Buchstaben-Prefix.
 * `labels[i]` = der geparste Prefix-Buchstabe der Übung i (oder null).
 * Einzelne Übungen (kein Prefix oder Gruppe der Größe 1) werden 'single'.
 * 'Z' -> Zirkel, jeder andere Buchstabe -> Supersatz. Fallback (alles null):
 * lauter klassische Einzelübungen.
 */
export function groupExercises(labels: (string | null)[]): ExerciseGroup[] {
  const groups: ExerciseGroup[] = [];
  let i = 0;
  while (i < labels.length) {
    const letter = labels[i];
    if (letter == null) {
      groups.push({ type: 'single', label: null, indices: [i] });
      i += 1;
      continue;
    }
    const indices = [i];
    let j = i + 1;
    while (j < labels.length && labels[j] === letter) {
      indices.push(j);
      j += 1;
    }
    if (indices.length < 2) {
      groups.push({ type: 'single', label: null, indices });
    } else {
      groups.push({ type: letter === 'Z' ? 'circuit' : 'superset', label: letter, indices });
    }
    i = j;
  }
  return groups;
}
