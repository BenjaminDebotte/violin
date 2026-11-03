/**
 * Where does this note go on the violin? A plain lookup, no auto-fingering.
 *
 * For each supported position, a note is `open string + offset semitones`. The offset
 * decides the finger and whether it is the low, normal or high version of it, so the key
 * signature never needs to be known. Positions: 1st and 3rd.
 *
 * Table (offsets above the open string; normal finger in bold in the docs):
 *   1st: 0 open | f1 2 (low 1) | f2 4 (low 3) | f3 5 (high 6) | f4 7 (extended 8)
 *   3rd:        | f1 5 (low 4) | f2 7 (low 6) | f3 9 (low 8)  | f4 10 (extended 11)
 */
export type PositionId = 1 | 3;
export type StringIndex = 0 | 1 | 2 | 3;
export type Finger = 0 | 1 | 2 | 3 | 4;
export type FingerVariant = 'normal' | 'low' | 'high' | 'extended';

export const POSITIONS: readonly PositionId[] = [1, 3];

/** Open strings G3, D4, A4, E5 (MIDI), index 0 = G. */
export const OPEN_STRING_MIDI: readonly [number, number, number, number] = [55, 62, 69, 76];
/** Letter labels, octave included, for formatting through the notation setting. */
export const OPEN_STRING_LABELS: readonly [string, string, string, string] = ['G3', 'D4', 'A4', 'E5'];

interface TableEntry {
  readonly finger: Finger;
  readonly variant: FingerVariant;
}

const FIRST_POSITION: Readonly<Record<number, TableEntry>> = {
  0: { finger: 0, variant: 'normal' },
  1: { finger: 1, variant: 'low' },
  2: { finger: 1, variant: 'normal' },
  3: { finger: 2, variant: 'low' },
  4: { finger: 2, variant: 'normal' },
  5: { finger: 3, variant: 'normal' },
  6: { finger: 3, variant: 'high' },
  7: { finger: 4, variant: 'normal' },
  8: { finger: 4, variant: 'extended' },
};

const THIRD_POSITION: Readonly<Record<number, TableEntry>> = {
  4: { finger: 1, variant: 'low' },
  5: { finger: 1, variant: 'normal' },
  6: { finger: 2, variant: 'low' },
  7: { finger: 2, variant: 'normal' },
  8: { finger: 3, variant: 'low' },
  9: { finger: 3, variant: 'normal' },
  10: { finger: 4, variant: 'normal' },
  11: { finger: 4, variant: 'extended' },
};

const TABLES: Readonly<Record<PositionId, Readonly<Record<number, TableEntry>>>> = {
  1: FIRST_POSITION,
  3: THIRD_POSITION,
};

export interface FingerPlacement {
  readonly position: PositionId;
  readonly string: StringIndex;
  readonly finger: Finger;
  readonly variant: FingerVariant;
  /** Semitones above the open string (0 = open). */
  readonly offset: number;
}

/** Lower is easier. Open beats a normal finger, a stretched finger beats nothing. */
function difficulty(p: FingerPlacement): number {
  if (p.finger === 0) return 0;
  if (p.variant === 'normal') return 1;
  if (p.variant === 'extended') return 3;
  return 2;
}

export interface PositionFingering {
  readonly position: PositionId;
  /** The suggested way to play the note in this position. */
  readonly primary: FingerPlacement;
  /** Other strings that give the same pitch in this position (e.g. 4th finger vs open string). */
  readonly alternates: readonly FingerPlacement[];
}

/**
 * Every way to play `midi` in the supported positions, easiest first within each position.
 * Returns an empty array for notes outside both positions or for fractional (quarter-tone)
 * pitches. Positions come back in ascending order, so index 0 is the lowest position.
 */
export function fingeringsFor(midi: number | null | undefined): PositionFingering[] {
  if (midi == null || !Number.isInteger(midi)) return [];
  const result: PositionFingering[] = [];
  for (const position of POSITIONS) {
    const table = TABLES[position];
    const options: FingerPlacement[] = [];
    for (let s = 0; s < OPEN_STRING_MIDI.length; s++) {
      const offset = midi - OPEN_STRING_MIDI[s];
      const entry = table[offset];
      if (entry) {
        options.push({ position, string: s as StringIndex, finger: entry.finger, variant: entry.variant, offset });
      }
    }
    if (options.length === 0) continue;
    // Stable sort: on a tie the lower string wins.
    options.sort((a, b) => difficulty(a) - difficulty(b));
    result.push({ position, primary: options[0], alternates: options.slice(1) });
  }
  return result;
}

export function positionLabel(position: PositionId): string {
  return position === 1 ? '1st' : '3rd';
}

/**
 * Where the hand's reference sits, as semitones above the open string: the nut for 1st
 * position, the first finger (a perfect fourth up: D on A, G on D, C on G, A on E) for 3rd.
 */
export const REFERENCE_OFFSET: Readonly<Record<PositionId, number>> = { 1: 0, 3: 5 };

/**
 * Every finger of every position on every string, in its normal place (open string
 * included for 1st position). Used to draw the whole hand faintly behind the target.
 * Ordered 3rd position first so that 1st-position marks draw on top where they coincide.
 */
export function referenceFingers(): FingerPlacement[] {
  const all: FingerPlacement[] = [];
  for (const position of [3, 1] as const) {
    for (let s = 0; s < OPEN_STRING_MIDI.length; s++) {
      for (const [offsetText, entry] of Object.entries(TABLES[position])) {
        if (entry.variant !== 'normal') continue;
        all.push({ position, string: s as StringIndex, finger: entry.finger, variant: 'normal', offset: Number(offsetText) });
      }
    }
  }
  return all;
}
