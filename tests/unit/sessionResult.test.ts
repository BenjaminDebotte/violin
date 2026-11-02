import { describe, it, expect } from 'vitest';
import {
  buildSessionResult,
  classifyCents,
  findStallBars,
  loopRangeFor,
  type LockEvent,
} from '../../src/modules/practice-coach/sessionResult';
import type { PracticeSessionSummary } from '../../src/types/music';

const summary = (overrides: Partial<PracticeSessionSummary> = {}): PracticeSessionSummary => ({
  totalNotes: 4,
  greenCount: 4,
  yellowCount: 0,
  redCount: 0,
  accuracyPercent: 100,
  averageAbsCentsDelta: 3,
  problemMeasures: [],
  ...overrides,
});

const lock = (measureNumber: number, atMs: number, writtenMs = 600): LockEvent => ({
  measureNumber,
  atMs,
  writtenMs,
});

describe('sessionResult', () => {
  it('uses problem measures as hard bars in Play-Along', () => {
    const r = buildSessionResult({
      mode: 'play-along',
      summary: summary({ accuracyPercent: 75, problemMeasures: [3, 5] }),
      locks: [],
    });
    expect(r.hardBars).toEqual([3, 5]);
  });

  it('uses stalls as hard bars in Wait-for-Me and ignores problem measures', () => {
    const stalled = [lock(1, 0), lock(1, 600), lock(2, 9000), lock(2, 9600)];
    const r = buildSessionResult({
      mode: 'wait-for-me',
      summary: summary({ problemMeasures: [7] }),
      locks: stalled,
    });
    expect(r.hardBars).toEqual([2]);
  });

  it('finds no stall bars for a fluent pass or a single note', () => {
    expect(findStallBars([lock(1, 0), lock(1, 700), lock(1, 1400)])).toEqual([]);
    expect(findStallBars([lock(1, 0)])).toEqual([]);
  });

  it('collapses bars into one loop range', () => {
    expect(loopRangeFor([])).toBeNull();
    expect(loopRangeFor([5, 2, 3])).toEqual({ startMeasure: 2, endMeasure: 5 });
  });

  it('classifies live cents into in tune / flat / sharp with a close band', () => {
    expect(classifyCents(null, 15).verdict).toBe('silent');
    expect(classifyCents(-15, 15)).toMatchObject({ verdict: 'in-tune', close: true });
    expect(classifyCents(-22, 15)).toMatchObject({ verdict: 'flat', close: true });
    expect(classifyCents(40, 15)).toMatchObject({ verdict: 'sharp', close: false });
  });
});
