/**
 * Note-name notation systems.
 * - `letters`: Anglo-Saxon / German-style letters (C D E F G A B)
 * - `solfege`: European fixed-do syllables (Do Ré Mi Fa Sol La Si)
 *
 * Internal pitch labels are always letter-based (e.g. "C#4", "Bb3"); this module
 * only changes how they are displayed.
 */
export type NotationSystem = 'letters' | 'solfege';

export const DEFAULT_NOTATION: NotationSystem = 'letters';

export const NOTATION_STORAGE_KEY = 'violin-coach:notation';

export const SCORE_NOTE_NAMES_STORAGE_KEY = 'violin-coach:score-note-names';

const SOLFEGE_BY_STEP: Readonly<Record<string, string>> = {
  C: 'Do',
  D: 'Ré',
  E: 'Mi',
  F: 'Fa',
  G: 'Sol',
  A: 'La',
  B: 'Si',
};

const LABEL_RE = /^([A-Ga-g])(\+?[#b]{0,2}|[+-]\d+(?:\.\d+)?)(-?\d+)?$/;

export function isNotationSystem(value: unknown): value is NotationSystem {
  return value === 'letters' || value === 'solfege';
}

/**
 * Converts a letter-based pitch label ("C#4", "Bb", "F##5") to the chosen notation.
 * Unknown strings (e.g. "--", "Rest") are returned unchanged.
 */
export function formatNoteName(label: string, system: NotationSystem): string {
  if (system === 'letters') return label;
  const match = LABEL_RE.exec(label);
  if (!match) return label;
  const [, step, accidental, octave] = match;
  return `${SOLFEGE_BY_STEP[step.toUpperCase()]}${accidental}${octave ?? ''}`;
}

/**
 * Formats a letter-based pitch label ("C#4", "Bb3") for display under a score notehead,
 * dropping the octave number ("C#" / "Do#", "Bb" / "Sib").
 * Unknown strings (e.g. "--", "Rest") are returned unchanged.
 */
export function scoreNoteName(label: string, system: NotationSystem): string {
  const match = LABEL_RE.exec(label);
  if (!match) return label;
  const [, step, accidental] = match;
  const base = system === 'solfege' ? SOLFEGE_BY_STEP[step.toUpperCase()] : step.toUpperCase();
  return `${base}${accidental}`;
}

export function loadNotation(): NotationSystem {
  try {
    const stored = globalThis.localStorage?.getItem(NOTATION_STORAGE_KEY);
    return isNotationSystem(stored) ? stored : DEFAULT_NOTATION;
  } catch {
    return DEFAULT_NOTATION;
  }
}

export function saveNotation(system: NotationSystem): void {
  try {
    globalThis.localStorage?.setItem(NOTATION_STORAGE_KEY, system);
  } catch {
    /* storage unavailable (private mode): setting stays in memory only */
  }
}

export function loadScoreNoteNames(): boolean {
  try {
    const raw = globalThis.localStorage?.getItem(SCORE_NOTE_NAMES_STORAGE_KEY);
    return raw !== 'off' && raw !== 'false';
  } catch {
    return true;
  }
}

export function saveScoreNoteNames(enabled: boolean): void {
  try {
    globalThis.localStorage?.setItem(SCORE_NOTE_NAMES_STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    /* storage unavailable (private mode): setting stays in memory only */
  }
}
