/**
 * Turns a finished practice pass into a result: the numbers worth showing and the bars
 * worth looping. Pure and deterministic (no React, no AudioContext).
 */
import type { PracticeMode, PracticeSessionSummary } from '../../types/music';

/** One locked note in Wait-for-Me, timestamped on the UI clock (ms). */
export interface LockEvent {
  readonly measureNumber: number;
  readonly atMs: number;
  /** Written duration of this note at the session tempo (ms). */
  readonly writtenMs: number;
}

export interface SessionResult {
  readonly mode: PracticeMode;
  readonly summary: PracticeSessionSummary;
  /** Bars worth looping: intonation misses (Play-Along) or long stalls (Wait-for-Me). */
  readonly hardBars: readonly number[];
}

/**
 * Bars where the player stalled: the time to reach a note (from the previous lock)
 * exceeded 3x the previous note's written length plus 1.5 s.
 */
export function findStallBars(locks: readonly LockEvent[]): number[] {
  const bars = new Set<number>();
  for (let i = 1; i < locks.length; i++) {
    const waited = locks[i].atMs - locks[i - 1].atMs;
    if (waited > locks[i - 1].writtenMs * 3 + 1500) bars.add(locks[i].measureNumber);
  }
  return [...bars].sort((a, b) => a - b);
}

export function buildSessionResult(input: {
  readonly mode: PracticeMode;
  readonly summary: PracticeSessionSummary;
  readonly locks: readonly LockEvent[];
}): SessionResult {
  return {
    mode: input.mode,
    summary: input.summary,
    hardBars:
      input.mode === 'play-along' ? [...input.summary.problemMeasures] : findStallBars(input.locks),
  };
}

/** Collapses a list of bars into one contiguous loop range covering them. */
export function loopRangeFor(bars: readonly number[]): { startMeasure: number; endMeasure: number } | null {
  if (bars.length === 0) return null;
  return { startMeasure: Math.min(...bars), endMeasure: Math.max(...bars) };
}

// --- Live pitch classification ----------------------------------------------

export type PitchVerdict = 'silent' | 'in-tune' | 'flat' | 'sharp';

export interface PitchReading {
  readonly verdict: PitchVerdict;
  /** True when within 2x tolerance ("nearly there"). */
  readonly close: boolean;
  readonly cents: number | null;
}

export function classifyCents(cents: number | null, toleranceCents: number): PitchReading {
  if (cents === null || !Number.isFinite(cents)) {
    return { verdict: 'silent', close: false, cents: null };
  }
  const abs = Math.abs(cents);
  if (abs <= toleranceCents) return { verdict: 'in-tune', close: true, cents };
  return {
    verdict: cents < 0 ? 'flat' : 'sharp',
    close: abs <= toleranceCents * 2,
    cents,
  };
}
