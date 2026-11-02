/**
 * Decides when to offer a fingering hint in Wait-for-Me. Pure and deterministic: it is
 * driven only by `audioTimeSec` (hardware seconds), never by timers, so it can be tested
 * without fake timers and it stops when the AudioContext is suspended.
 *
 * Two triggers per target note, each fires at most once per note:
 *  - 'stuck':      the note has been the target for `stuckAfterSec` without being locked.
 *  - 'wrong-note': a *different*, steady note is sounded (see guards below).
 *
 * Guards against false alarms:
 *  - Ring-through: right after a lock the player is still sounding the previous note, which
 *    is far from the new target. That pitch is ignored until a new sound starts (a pause
 *    longer than `dropoutSec`, or the pitch leaving the old note), and no wrong-note hint
 *    is possible for `armAfterSec` after the note changes.
 *  - Octave/twelfth/double-octave detector errors are never wrong notes.
 *  - Glides: the heard pitch must stay within `stableCents` of where it started for
 *    `sustainSec`; moving restarts the clock. Gaps up to `dropoutSec` are tolerated.
 */
export type HintReason = 'stuck' | 'wrong-note';

export interface HintTrackerOptions {
  readonly stuckAfterSec?: number;
  readonly sustainSec?: number;
  readonly armAfterSec?: number;
  readonly wrongNoteCents?: number;
  readonly stableCents?: number;
  readonly ringCents?: number;
  readonly dropoutSec?: number;
}

export interface HintInput {
  /** Identity of the current target note; changes on every lock and loop wrap. null = no target. */
  readonly noteKey: string | null;
  readonly targetMidi: number | null;
  readonly audioTimeSec: number;
  /** Detected pitch, or null for silence / filtered-out frames. */
  readonly frequencyHz: number | null;
  readonly referenceA4Hz: number;
  readonly toleranceCents: number;
}

const HARMONIC_SEMITONES = [12, 19, 24] as const;

/** True when the heard pitch is an octave, twelfth or double octave (either way) from the target. */
export function isHarmonicRelation(semitoneDiff: number): boolean {
  const abs = Math.abs(semitoneDiff);
  return HARMONIC_SEMITONES.some((h) => Math.abs(abs - h) <= 0.5);
}

export class HintTracker {
  readonly stuckAfterSec: number;
  readonly sustainSec: number;
  readonly armAfterSec: number;
  readonly wrongNoteCents: number;
  readonly stableCents: number;
  readonly ringCents: number;
  readonly dropoutSec: number;

  private _key: string | null = null;
  private _targetMidi: number | null = null;
  private _activeSince = 0;
  private _hint: HintReason | null = null;
  private _hintShownAt: number | null = null;
  private _ringMidi: number | null = null;
  private _lastValidT: number | null = null;
  private _wrongSince: number | null = null;
  private _wrongRef = 0;

  constructor(options: HintTrackerOptions = {}) {
    this.stuckAfterSec = options.stuckAfterSec ?? 2;
    this.sustainSec = options.sustainSec ?? 0.3;
    this.armAfterSec = options.armAfterSec ?? 0.45;
    this.wrongNoteCents = options.wrongNoteCents ?? 70;
    this.stableCents = options.stableCents ?? 30;
    this.ringCents = options.ringCents ?? 50;
    this.dropoutSec = options.dropoutSec ?? 0.08;
  }

  /** Time the current target note became active (audio seconds). */
  get activeSince(): number {
    return this._activeSince;
  }

  get hint(): HintReason | null {
    return this._hint;
  }

  get hintShownAt(): number | null {
    return this._hintShownAt;
  }

  get noteKey(): string | null {
    return this._key;
  }

  /** Forget everything (start, stop, pause, resume, seek, loop change). */
  reset(): void {
    this._key = null;
    this._targetMidi = null;
    this._hint = null;
    this._hintShownAt = null;
    this._ringMidi = null;
    this._lastValidT = null;
    this._wrongSince = null;
  }

  /** Feed one sample (also silence). Returns the hint currently active for this note, if any. */
  update(input: HintInput): HintReason | null {
    if (input.noteKey === null || input.targetMidi === null) {
      this.reset();
      return null;
    }
    const t = input.audioTimeSec;

    if (input.noteKey !== this._key) {
      // A new target. Whatever pitch is still ringing belongs to the previous target.
      this._ringMidi = this._key !== null ? this._targetMidi : null;
      this._key = input.noteKey;
      this._targetMidi = input.targetMidi;
      this._activeSince = t;
      this._hint = null;
      this._hintShownAt = null;
      this._wrongSince = null;
    }

    const valid = input.frequencyHz !== null && input.frequencyHz > 0;
    const heard = valid ? 69 + 12 * Math.log2((input.frequencyHz as number) / input.referenceA4Hz) : null;
    const gapBefore = this._lastValidT === null ? Infinity : t - this._lastValidT;
    if (valid) this._lastValidT = t;

    // New sound: a pause longer than a filter dropout ends the ring-through.
    if (this._ringMidi !== null) {
      if (!valid && gapBefore > this.dropoutSec) this._ringMidi = null;
      else if (valid && Math.abs((heard as number) - this._ringMidi) * 100 > this.ringCents) this._ringMidi = null;
    }

    if (this._hint === null) {
      const target = input.targetMidi;
      const ringing = this._ringMidi !== null && valid;
      const cents = heard === null ? null : (heard - target) * 100;

      // Wrong note
      if (valid && !ringing && cents !== null) {
        const wrong = Math.abs(cents) > this.wrongNoteCents && !isHarmonicRelation((heard as number) - target);
        if (!wrong) {
          this._wrongSince = null;
        } else if (
          this._wrongSince === null ||
          gapBefore > this.dropoutSec ||
          Math.abs((heard as number) - this._wrongRef) * 100 > this.stableCents
        ) {
          this._wrongSince = t;
          this._wrongRef = heard as number;
        } else if (t - this._wrongSince >= this.sustainSec && t - this._activeSince >= this.armAfterSec) {
          this._hint = 'wrong-note';
        }
      } else if (!valid && gapBefore > this.dropoutSec) {
        this._wrongSince = null;
      }

      // Stuck
      if (this._hint === null && t - this._activeSince >= this.stuckAfterSec) {
        const inTuneNow = cents !== null && Math.abs(cents) <= input.toleranceCents;
        if (!inTuneNow) this._hint = 'stuck';
      }

      if (this._hint !== null) this._hintShownAt = t;
    }

    return this._hint;
  }
}
