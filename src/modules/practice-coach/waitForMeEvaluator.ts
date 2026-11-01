import {
  type PlayableNote,
  type PitchSample,
  type NoteEvaluationResult,
  type MeasureLoopRange,
} from '../../types/music';
import { frequencyToCentsDelta } from '../pitch-detection/pitchMath';

export interface WaitForMeEvaluatorOptions {
  /** Array of playable notes from ScoreTimeline.soloNotes */
  readonly notes: readonly PlayableNote[];
  /** Continuous in-tune hold duration in seconds required to lock and advance (default: 0.15 = 150ms) */
  readonly holdDurationSec?: number;
  /** Max allowed cents deviation from target pitch (default: 15 cents) */
  readonly toleranceCents?: number;
  /** Audio reference frequency for A4 in Hz (default: 440 Hz) */
  readonly referenceA4Hz?: number;
  /** Optional measure loop boundaries */
  readonly loopRange?: MeasureLoopRange | null;
}

export interface WaitForMeStepResult {
  /** Whether the current note locked in tune and advanced to the next note */
  readonly advanced: boolean;
  /** The note that just completed, or null if still holding / incomplete */
  readonly completedNote: PlayableNote | null;
  /** Note evaluation result for the completed note, or null */
  readonly completedResult: NoteEvaluationResult | null;
  /** SVG note IDs to color green in OSMD (including coalesced tied notes) */
  readonly svgTargetIds: readonly string[];
  /** The active target note after this step, or null if score completed */
  readonly currentNote: PlayableNote | null;
  /** The next target note after advancement, or null */
  readonly nextNote: PlayableNote | null;
  /** Current hold progress toward holdDurationSec, normalized from 0.0 to 1.0 */
  readonly holdProgress: number;
  /** Deviation in cents between detected sample and target pitch, or null */
  readonly centsDelta: number | null;
  /** True when the evaluator completes the last note and loops back to startMeasure */
  readonly loopRestarted: boolean;
  /** True when all notes in score/range are completed and loop is not active */
  readonly isComplete: boolean;
}

/**
 * Pure, deterministic Wait-for-Me intonation evaluator.
 *
 * Driven strictly by PitchSample.audioTimeSec hardware timestamps.
 * Skips rests automatically so the cursor only stops on playable solo notes.
 * Requires continuous in-tune pitch (default >= 150ms) to lock and advance.
 * Out-of-tune samples or pitch drops immediately reset the stability accumulator to 0,
 * ensuring transient bow-attack spikes (< 150ms) never cause false advancement.
 */
export class WaitForMeEvaluator {
  private readonly _allPlayableNotes: readonly PlayableNote[];
  private _activeNotes: readonly PlayableNote[];
  private _holdDurationSec: number;
  private _toleranceCents: number;
  private _referenceA4Hz: number;
  private _loopRange: MeasureLoopRange | null;

  private _currentIndex = 0;
  private _accumulatedHoldSec = 0;
  private _lastInTuneAudioTimeSec: number | null = null;
  private _results: NoteEvaluationResult[] = [];
  private _isComplete = false;

  constructor(options: WaitForMeEvaluatorOptions) {
    // Filter out rests (note.pitch === null) from the score timeline
    this._allPlayableNotes = Object.freeze(
      options.notes.filter(
        (note) => note.pitch !== null && note.pitch.midiNumber != null,
      ),
    );

    this._holdDurationSec = options.holdDurationSec ?? 0.15;
    this._toleranceCents = options.toleranceCents ?? 15;
    this._referenceA4Hz = options.referenceA4Hz ?? 440;
    this._loopRange = options.loopRange ?? null;

    this._activeNotes = this._filterNotesByLoop(
      this._allPlayableNotes,
      this._loopRange,
    );
    this._isComplete = this._activeNotes.length === 0;
  }

  // --- Getters ---

  public get currentNote(): PlayableNote | null {
    if (this._isComplete || this._currentIndex >= this._activeNotes.length) {
      return null;
    }
    return this._activeNotes[this._currentIndex] ?? null;
  }

  public get currentIndex(): number {
    return this._currentIndex;
  }

  public get activeNotes(): readonly PlayableNote[] {
    return this._activeNotes;
  }

  public get allPlayableNotes(): readonly PlayableNote[] {
    return this._allPlayableNotes;
  }

  public get holdProgress(): number {
    if (this._holdDurationSec <= 0) return 0;
    return Math.min(1, this._accumulatedHoldSec / this._holdDurationSec);
  }

  public get accumulatedHoldSec(): number {
    return this._accumulatedHoldSec;
  }

  public get toleranceCents(): number {
    return this._toleranceCents;
  }

  public get referenceA4Hz(): number {
    return this._referenceA4Hz;
  }

  public get holdDurationSec(): number {
    return this._holdDurationSec;
  }

  public get loopRange(): MeasureLoopRange | null {
    return this._loopRange;
  }

  public get results(): readonly NoteEvaluationResult[] {
    return this._results;
  }

  public get isComplete(): boolean {
    return this._isComplete;
  }

  // --- Configuration Mutators ---

  public setToleranceCents(toleranceCents: number): void {
    this._toleranceCents = Math.max(1, toleranceCents);
  }

  public setReferenceA4Hz(hz: number): void {
    this._referenceA4Hz = Math.max(200, Math.min(1000, hz));
  }

  public setHoldDurationSec(durationSec: number): void {
    this._holdDurationSec = Math.max(0.01, durationSec);
  }

  public setLoopRange(loopRange: MeasureLoopRange | null): void {
    this._loopRange = loopRange;
    this._activeNotes = this._filterNotesByLoop(
      this._allPlayableNotes,
      this._loopRange,
    );
    this.reset();
  }

  // --- Navigation & Reset ---

  public reset(): void {
    this._currentIndex = 0;
    this._accumulatedHoldSec = 0;
    this._lastInTuneAudioTimeSec = null;
    this._results = [];
    this._isComplete = this._activeNotes.length === 0;
  }

  public seekToNoteIndex(index: number): void {
    if (index >= 0 && index < this._activeNotes.length) {
      this._currentIndex = index;
      this._accumulatedHoldSec = 0;
      this._lastInTuneAudioTimeSec = null;
      this._isComplete = false;
    }
  }

  public seekToMeasure(measureNumber: number): void {
    const idx = this._activeNotes.findIndex(
      (n) => n.measureNumber >= measureNumber,
    );
    if (idx !== -1) {
      this.seekToNoteIndex(idx);
    }
  }

  // --- Pitch Processing ---

  /**
   * Processes a single PitchSample timestamped with Web Audio hardware seconds.
   *
   * When sample is within toleranceCents continuously for >= holdDurationSec,
   * the note locks 'green' and advances to the next playable note.
   * Dropped pitches (sample === null) or out-of-tune samples reset the hold timer to 0.
   */
  public processPitch(sample: PitchSample | null): WaitForMeStepResult {
    const targetNote = this.currentNote;

    // Score already complete or no playable notes in range
    if (this._isComplete || targetNote === null || targetNote.pitch === null) {
      return {
        advanced: false,
        completedNote: null,
        completedResult: null,
        svgTargetIds: [],
        currentNote: null,
        nextNote: null,
        holdProgress: 0,
        centsDelta: null,
        loopRestarted: false,
        isComplete: true,
      };
    }

    // 1. Silent or null sample -> pitch drop, immediately reset hold accumulator
    if (sample === null || sample.frequencyHz <= 0) {
      this._accumulatedHoldSec = 0;
      this._lastInTuneAudioTimeSec = null;
      return {
        advanced: false,
        completedNote: null,
        completedResult: null,
        svgTargetIds: [],
        currentNote: targetNote,
        nextNote: null,
        holdProgress: 0,
        centsDelta: null,
        loopRestarted: false,
        isComplete: false,
      };
    }

    // 2. Compute intonation cents deviation against target pitch
    const centsDelta = frequencyToCentsDelta(
      sample.frequencyHz,
      targetNote.pitch.midiNumber,
      this._referenceA4Hz,
    );
    const roundedCents = Math.round(centsDelta * 10) / 10;
    const isInTune = Math.abs(centsDelta) <= this._toleranceCents;

    // 3. Out-of-tune sample -> immediately reset stability accumulator
    if (!isInTune) {
      this._accumulatedHoldSec = 0;
      this._lastInTuneAudioTimeSec = null;
      return {
        advanced: false,
        completedNote: null,
        completedResult: null,
        svgTargetIds: [],
        currentNote: targetNote,
        nextNote: null,
        holdProgress: 0,
        centsDelta: roundedCents,
        loopRestarted: false,
        isComplete: false,
      };
    }

    // 4. In-tune sample -> accumulate hold duration via hardware timestamps
    if (this._lastInTuneAudioTimeSec === null) {
      this._lastInTuneAudioTimeSec = sample.audioTimeSec;
    } else {
      const deltaSec = Math.max(
        0,
        sample.audioTimeSec - this._lastInTuneAudioTimeSec,
      );
      this._accumulatedHoldSec += deltaSec;
      this._lastInTuneAudioTimeSec = sample.audioTimeSec;
    }

    // 5. Check if continuous hold threshold is reached
    if (this._accumulatedHoldSec >= this._holdDurationSec) {
      const completedNote = targetNote;
      const completedResult: NoteEvaluationResult = {
        noteId: completedNote.id,
        measureNumber: completedNote.measureNumber,
        status: 'green',
        centsDelta: roundedCents,
        onsetDeltaMs: null,
      };
      this._results.push(completedResult);

      const svgTargetIds: readonly string[] =
        completedNote.tiedNoteIds.length > 0
          ? completedNote.tiedNoteIds
          : [completedNote.id];

      // Reset hold accumulator for the next note
      this._accumulatedHoldSec = 0;
      this._lastInTuneAudioTimeSec = null;

      // Determine next note / loop wrap
      if (this._currentIndex + 1 < this._activeNotes.length) {
        this._currentIndex++;
        const nextNote = this._activeNotes[this._currentIndex];
        return {
          advanced: true,
          completedNote,
          completedResult,
          svgTargetIds,
          currentNote: nextNote,
          nextNote,
          holdProgress: 1,
          centsDelta: roundedCents,
          loopRestarted: false,
          isComplete: false,
        };
      }

      // Reached the end of active notes
      if (this._loopRange !== null) {
        // Wrap back to the first note of startMeasure
        this._currentIndex = 0;
        const nextNote = this._activeNotes[0] ?? null;
        return {
          advanced: true,
          completedNote,
          completedResult,
          svgTargetIds,
          currentNote: nextNote,
          nextNote,
          holdProgress: 1,
          centsDelta: roundedCents,
          loopRestarted: true,
          isComplete: false,
        };
      }

      // Entire score completed
      this._isComplete = true;
      return {
        advanced: true,
        completedNote,
        completedResult,
        svgTargetIds,
        currentNote: null,
        nextNote: null,
        holdProgress: 1,
        centsDelta: roundedCents,
        loopRestarted: false,
        isComplete: true,
      };
    }

    // 6. In tune, but hold threshold not reached yet
    const currentProgress = Math.min(
      1,
      this._accumulatedHoldSec / this._holdDurationSec,
    );
    return {
      advanced: false,
      completedNote: null,
      completedResult: null,
      svgTargetIds: [],
      currentNote: targetNote,
      nextNote: null,
      holdProgress: currentProgress,
      centsDelta: roundedCents,
      loopRestarted: false,
      isComplete: false,
    };
  }

  // --- Private Helpers ---

  private _filterNotesByLoop(
    notes: readonly PlayableNote[],
    loopRange: MeasureLoopRange | null,
  ): readonly PlayableNote[] {
    if (!loopRange) {
      return notes;
    }
    return Object.freeze(
      notes.filter(
        (note) =>
          note.measureNumber >= loopRange.startMeasure &&
          note.measureNumber <= loopRange.endMeasure,
      ),
    );
  }
}
