import { describe, it, expect } from 'vitest';
import { HintTracker, isHarmonicRelation, type HintInput } from '../../src/modules/practice-coach/hintTracker';
import {
  summarize,
  median,
  recordEpisode,
  loadEpisodes,
  clearEpisodes,
  type HintEpisode,
} from '../../src/modules/fingerboard/hintStats';

const hz = (midi: number, cents = 0) => 440 * Math.pow(2, (midi - 69 + cents / 100) / 12);

const input = (over: Partial<HintInput> & Pick<HintInput, 'audioTimeSec'>): HintInput => ({
  noteKey: '0',
  targetMidi: 69,
  frequencyHz: null,
  referenceA4Hz: 440,
  toleranceCents: 15,
  ...over,
});

/** Feeds samples every 20 ms from t0 to t1 (inclusive) and returns the first time a hint appeared. */
function run(
  tracker: HintTracker,
  t0: number,
  t1: number,
  make: (t: number) => Partial<HintInput>,
): { firstHintAt: number | null } {
  let firstHintAt: number | null = null;
  for (let t = t0; t <= t1 + 1e-9; t += 0.02) {
    const r = tracker.update(input({ audioTimeSec: t, ...make(t) }));
    if (r !== null && firstHintAt === null) firstHintAt = t;
  }
  return { firstHintAt };
}

describe('HintTracker: stuck', () => {
  it('fires after 2 s of silence on the same target, not before', () => {
    const tr = new HintTracker();
    const { firstHintAt } = run(tr, 0, 3, () => ({ frequencyHz: null }));
    expect(firstHintAt).toBeGreaterThanOrEqual(2 - 1e-6);
    expect(firstHintAt).toBeLessThan(2.05);
    expect(tr.hint).toBe('stuck');
  });

  it('does not fire while the player is currently in tune (the hold is about to lock)', () => {
    const tr = new HintTracker();
    const { firstHintAt } = run(tr, 0, 3, (t) => ({ frequencyHz: t < 1 ? hz(69, 40) : hz(69, 5) }));
    expect(firstHintAt).toBeNull();
  });

  it('fires once per note: a new note key starts a new clock and clears the hint', () => {
    const tr = new HintTracker();
    run(tr, 0, 2.5, () => ({}));
    expect(tr.hint).toBe('stuck');
    tr.update(input({ audioTimeSec: 2.52, noteKey: '1', targetMidi: 71 }));
    expect(tr.hint).toBeNull();
    expect(tr.activeSince).toBeCloseTo(2.52);
    const { firstHintAt } = run(tr, 2.54, 4.6, () => ({ noteKey: '1', targetMidi: 71 }));
    expect(firstHintAt).toBeGreaterThanOrEqual(2.52 + 2 - 1e-6);
  });

  it('forgets everything on reset (pause, stop, loop change)', () => {
    const tr = new HintTracker();
    run(tr, 0, 2.5, () => ({}));
    tr.reset();
    expect(tr.hint).toBeNull();
    expect(tr.noteKey).toBeNull();
    // After a long pause the clock restarts from the next sample instead of jumping.
    const r = tr.update(input({ audioTimeSec: 60 }));
    expect(r).toBeNull();
  });
});

describe('HintTracker: wrong note', () => {
  it('fires for a steady wrong note after the sustain time and the arm delay', () => {
    const tr = new HintTracker();
    // Target A4, player sustains C5 (3 semitones up) from t = 0.
    const { firstHintAt } = run(tr, 0, 1.5, () => ({ frequencyHz: hz(72) }));
    expect(tr.hint).toBe('wrong-note');
    // Armed 0.45 s after the note became the target, sustained 0.3 s.
    expect(firstHintAt).toBeGreaterThanOrEqual(0.45 - 1e-6);
    expect(firstHintAt).toBeLessThan(0.6);
  });

  it('ignores the previous note still ringing after a lock (ring-through)', () => {
    const tr = new HintTracker();
    // Note 0: target A4, locked while sounding A4.
    run(tr, 0, 0.2, () => ({ frequencyHz: hz(69) }));
    // Note 1: target E5 (7 semitones up). The player still sounds A4 for a full second.
    const { firstHintAt } = run(tr, 0.22, 1.2, () => ({ noteKey: '1', targetMidi: 76, frequencyHz: hz(69) }));
    expect(firstHintAt).toBeNull();
  });

  it('arms again once a new sound starts, so a real wrong note is still caught', () => {
    const tr = new HintTracker();
    run(tr, 0, 0.2, () => ({ frequencyHz: hz(69) }));
    run(tr, 0.22, 0.5, () => ({ noteKey: '1', targetMidi: 76, frequencyHz: hz(69) })); // ringing
    run(tr, 0.52, 0.7, () => ({ noteKey: '1', targetMidi: 76, frequencyHz: null })); // bow lifts: 180 ms gap
    const { firstHintAt } = run(tr, 0.72, 2.0, () => ({ noteKey: '1', targetMidi: 76, frequencyHz: hz(74) }));
    expect(firstHintAt).not.toBeNull();
    expect(tr.hint).toBe('wrong-note');
  });

  it('does not treat a glide as a wrong note', () => {
    const tr = new HintTracker();
    // Slides from 60 cents flat through to 3 semitones sharp, 50 cents every 100 ms.
    const { firstHintAt } = run(tr, 0, 1.9, (t) => ({ frequencyHz: hz(69, -60 + Math.floor(t / 0.1) * 50) }));
    expect(firstHintAt).toBeNull();
  });

  it('does not treat an octave, twelfth or double octave detector error as a wrong note', () => {
    for (const semis of [12, 19, 24, -12]) {
      const tr = new HintTracker();
      const { firstHintAt } = run(tr, 0, 1.9, () => ({ frequencyHz: hz(69 + semis) }));
      expect(firstHintAt, `${semis} semitones`).toBeNull();
    }
    expect(isHarmonicRelation(12.3)).toBe(true);
    expect(isHarmonicRelation(7)).toBe(false);
  });

  it('survives a short filter dropout but not a long gap', () => {
    const shortGap = new HintTracker();
    const a = run(shortGap, 0, 1.2, (t) => ({ frequencyHz: t > 0.6 && t < 0.66 ? null : hz(72) }));
    expect(a.firstHintAt).not.toBeNull();

    const longGap = new HintTracker();
    // 200 ms bursts separated by 200 ms silence: the 0.3 s sustain never completes inside one burst.
    const b = run(longGap, 0, 1.9, (t) => ({ frequencyHz: t % 0.4 > 0.2 ? null : hz(72) }));
    expect(b.firstHintAt).toBeNull();
  });

  it('does not fire for notes within the wrong-note threshold (70 cents)', () => {
    const tr = new HintTracker();
    const { firstHintAt } = run(tr, 0, 1.9, () => ({ frequencyHz: hz(69, 60) }));
    expect(firstHintAt).toBeNull();
  });
});

describe('hintStats', () => {
  const ep = (o: Partial<HintEpisode>): HintEpisode => ({
    at: 0,
    hintsEnabled: true,
    reason: null,
    lockSec: 3,
    afterHintSec: null,
    ...o,
  });

  it('computes medians', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('summarises hints on vs off', () => {
    const s = summarize([
      ep({ reason: 'stuck', lockSec: 4, afterHintSec: 1.5 }),
      ep({ reason: 'wrong-note', lockSec: 2.6, afterHintSec: 0.5 }),
      ep({ hintsEnabled: false, lockSec: 6 }),
    ]);
    expect(s.withHints).toEqual({ n: 2, medianLockSec: 3.3, medianAfterHintSec: 1 });
    expect(s.withoutHints).toEqual({ n: 1, medianLockSec: 6 });
  });

  it('does not let a fast wrong-note lock skew the comparison, but keeps its time after the hint', () => {
    const s = summarize([
      ep({ reason: 'wrong-note', lockSec: 0.8, afterHintSec: 0.3 }),
      ep({ reason: 'stuck', lockSec: 4, afterHintSec: 1.5 }),
      ep({ hintsEnabled: false, lockSec: 3 }),
    ]);
    expect(s.withHints.n).toBe(1);
    expect(s.withHints.medianLockSec).toBe(4);
    expect(s.withHints.medianAfterHintSec).toBe(0.9);
    expect(s.withoutHints).toEqual({ n: 1, medianLockSec: 3 });
  });

  it('stores episodes locally, skips quick locks without hints, and clears', () => {
    localStorage.clear();
    recordEpisode(ep({ lockSec: 0.4 }));
    expect(loadEpisodes()).toHaveLength(0);
    recordEpisode(ep({ lockSec: 2.5 }));
    recordEpisode(ep({ lockSec: 0.9, reason: 'wrong-note', afterHintSec: 0.3 }));
    expect(loadEpisodes()).toHaveLength(2);
    localStorage.setItem('violin-coach:hint-episodes', '{not json');
    expect(loadEpisodes()).toEqual([]);
    recordEpisode(ep({ lockSec: 3 }));
    clearEpisodes();
    expect(loadEpisodes()).toEqual([]);
  });
});
