import { describe, it, expect } from 'vitest';
import { fingeringsFor, OPEN_STRING_MIDI, positionLabel, placementsForNotes, REFERENCE_OFFSET } from '../../src/modules/fingerboard/fingering';

const G = 0, D = 1, A = 2, E = 3;

describe('fingeringsFor', () => {
  it('covers every note from G3 to C6 in 1st position', () => {
    for (let midi = 55; midi <= 84; midi++) {
      const first = fingeringsFor(midi).find((f) => f.position === 1);
      expect(first, `midi ${midi}`).toBeDefined();
    }
  });

  it('plays an open string as primary and offers the 4th finger below as an alternate', () => {
    const [first] = fingeringsFor(62); // D4
    expect(first.position).toBe(1);
    expect(first.primary).toMatchObject({ string: D, finger: 0, offset: 0 });
    expect(first.alternates).toHaveLength(1);
    expect(first.alternates[0]).toMatchObject({ string: G, finger: 4, offset: 7 });
  });

  it('knows A4: open A in 1st, 2nd finger on the D string in 3rd', () => {
    const [first, third] = fingeringsFor(69);
    expect(first.primary).toMatchObject({ string: A, finger: 0 });
    expect(third.position).toBe(3);
    expect(third.primary).toMatchObject({ string: D, finger: 2, variant: 'normal' });
  });

  it('maps Do (C4) to the 3rd finger on G in 1st and the 1st finger on G in 3rd', () => {
    const [first, third] = fingeringsFor(60);
    expect(first.primary).toMatchObject({ string: G, finger: 3, offset: 5 });
    expect(third.primary).toMatchObject({ string: G, finger: 1, offset: 5 });
  });

  it('finds the 3rd-position first finger a perfect fourth above each open string', () => {
    for (const s of [G, D, A, E]) {
      const third = fingeringsFor(OPEN_STRING_MIDI[s] + 5).find((f) => f.position === 3);
      expect(third?.primary).toMatchObject({ string: s, finger: 1, variant: 'normal' });
    }
  });

  it('distinguishes the low and high versions of a finger by pitch alone', () => {
    // On the D string: F (offset 3) is low 2, F# (offset 4) is the normal 2.
    expect(fingeringsFor(65)[0].primary).toMatchObject({ string: D, finger: 2, variant: 'low' });
    expect(fingeringsFor(66)[0].primary).toMatchObject({ string: D, finger: 2, variant: 'normal' });
    // High 3rd finger on the A string (offset 6).
    expect(fingeringsFor(75)[0].primary).toMatchObject({ string: A, finger: 3, variant: 'high' });
  });

  it('prefers a low 1st finger on the next string to a stretched 4th finger', () => {
    const [first] = fingeringsFor(63); // Eb4: G string offset 8 (stretched) vs D string offset 1 (low 1)
    expect(first.primary).toMatchObject({ string: D, finger: 1, variant: 'low' });
    expect(first.alternates[0]).toMatchObject({ string: G, finger: 4, variant: 'extended' });
  });

  it('reaches the top of the 3rd position, and nothing beyond', () => {
    expect(fingeringsFor(86)[0]).toMatchObject({ position: 3, primary: { string: E, finger: 4, offset: 10 } });
    expect(fingeringsFor(87)[0].primary).toMatchObject({ string: E, finger: 4, variant: 'extended' });
    expect(fingeringsFor(88)).toEqual([]);
  });

  it('returns nothing below the G string, for quarter tones, and for missing pitch', () => {
    expect(fingeringsFor(54)).toEqual([]);
    expect(fingeringsFor(69.5)).toEqual([]);
    expect(fingeringsFor(null)).toEqual([]);
    expect(fingeringsFor(undefined)).toEqual([]);
  });

  it('lists positions in ascending order and labels them', () => {
    const positions = fingeringsFor(74).map((f) => f.position);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(positionLabel(1)).toBe('1st');
    expect(positionLabel(3)).toBe('3rd');
  });

  it('puts the reference of 3rd position on its first finger and of 1st on the nut', () => {
    expect(REFERENCE_OFFSET).toEqual({ 1: 0, 3: 5 });
    for (let st = 0; st < 4; st++) {
      const f1 = fingeringsFor(OPEN_STRING_MIDI[st] + REFERENCE_OFFSET[3]).find((f) => f.position === 3);
      expect(f1?.primary).toMatchObject({ string: st, finger: 1, variant: 'normal' });
    }
  });

  it('places the notes of a bar at their own spots, both positions, without duplicates', () => {
    // F#4 (D string) and C5 (A string), plus repeats: 2nd finger is at offset 4 on one string and 3 on the other
    const spots = placementsForNotes([66, 72, 66, 69, 62]);
    const keys = spots.map((p) => `${p.position}-${p.string}-${p.offset}`);
    expect(new Set(keys).size).toBe(keys.length);
    // 3rd position first so 1st-position marks draw on top
    expect(spots[0].position).toBe(3);
    expect(spots.at(-1)?.position).toBe(1);
    // Not a uniform grid: the same finger lands on different offsets on different strings
    const second = spots.filter((p) => p.position === 1 && p.finger === 2);
    expect(new Set(second.map((p) => p.offset)).size).toBeGreaterThan(1);
    expect(placementsForNotes([])).toEqual([]);
    expect(placementsForNotes([30])).toEqual([]);
  });
});
