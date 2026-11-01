import { type PitchSample } from '../../types/music';
import { MIN_VIOLIN_HZ, MAX_VIOLIN_HZ } from './pitchMath';

export interface PitchSmoothingFilterOptions {
  /** Minimum McLeod Pitch Method clarity score (0.0 to 1.0). Default: 0.85 */
  readonly minClarity?: number;
  /** Minimum RMS energy level to reject room silence and unvoiced bow noise. Default: 0.008 */
  readonly minRms?: number;
  /** Sliding window size for median filter. Default: 3 */
  readonly windowSize?: number;
  /** Audio elapsed time in seconds beyond which silence resets the window. Default: 0.08 (80ms) */
  readonly silenceResetSec?: number;
}

/**
 * Robust filter for live violin pitch samples.
 *
 * 1. Clarity gating: Rejects samples with clarity < minClarity (0.85) to discard bow scratch/scrape.
 * 2. RMS gating: Rejects samples below minRms (0.008) to suppress background room noise.
 * 3. Range gating: Clamps to acoustic violin range [175 Hz, 3600 Hz].
 * 4. 3-frame median filtering: Suppresses single-frame harmonic octave jumps on weak fundamental
 *    open strings (G3/D4).
 * 5. Silence reset: Clears the median window when silence or gaps exceed silenceResetSec (80ms).
 */
export class PitchSmoothingFilter {
  readonly minClarity: number;
  readonly minRms: number;
  readonly windowSize: number;
  readonly silenceResetSec: number;

  private _window: number[] = [];
  private _lastValidAudioTimeSec: number | null = null;

  constructor(options: PitchSmoothingFilterOptions = {}) {
    this.minClarity = options.minClarity ?? 0.85;
    this.minRms = options.minRms ?? 0.008;
    this.windowSize = options.windowSize ?? 3;
    this.silenceResetSec = options.silenceResetSec ?? 0.08;
  }

  get window(): readonly number[] {
    return this._window;
  }

  get lastValidAudioTimeSec(): number | null {
    return this._lastValidAudioTimeSec;
  }

  /**
   * Resets internal sliding window and timing state.
   */
  reset(): void {
    this._window = [];
    this._lastValidAudioTimeSec = null;
  }

  /**
   * Evaluates a raw PitchSample and returns either a median-smoothed PitchSample
   * or null if the sample failed clarity, RMS, or frequency boundary checks.
   */
  processSample(sample: PitchSample): PitchSample | null {
    const isInvalid =
      !Number.isFinite(sample.frequencyHz) ||
      sample.clarity < this.minClarity ||
      sample.rms < this.minRms ||
      sample.frequencyHz < MIN_VIOLIN_HZ ||
      sample.frequencyHz > MAX_VIOLIN_HZ;

    if (isInvalid) {
      if (
        this._lastValidAudioTimeSec !== null &&
        sample.audioTimeSec - this._lastValidAudioTimeSec > this.silenceResetSec
      ) {
        this._window = [];
      }
      return null;
    }

    // If silence elapsed since the previous valid sample, reset the median window
    if (
      this._lastValidAudioTimeSec !== null &&
      sample.audioTimeSec - this._lastValidAudioTimeSec > this.silenceResetSec
    ) {
      this._window = [];
    }

    this._lastValidAudioTimeSec = sample.audioTimeSec;

    this._window.push(sample.frequencyHz);
    if (this._window.length > this.windowSize) {
      this._window.shift();
    }

    const medianHz = this.computeMedian(this._window);

    return {
      frequencyHz: medianHz,
      clarity: sample.clarity,
      rms: sample.rms,
      audioTimeSec: sample.audioTimeSec,
    };
  }

  private computeMedian(values: readonly number[]): number {
    const len = values.length;
    if (len === 0) return 0;
    if (len === 1) return values[0];

    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(len / 2);
    if (len % 2 !== 0) {
      return sorted[mid];
    }
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
}
