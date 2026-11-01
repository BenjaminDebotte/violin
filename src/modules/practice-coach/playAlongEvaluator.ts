import {
  type PlayableNote,
  type PitchSample,
  type NoteEvaluationResult,
  type PracticeSessionSummary,
} from '../../types/music';
import { frequencyToCentsDelta } from '../pitch-detection/pitchMath';

/** Early grace window in seconds (100ms before scheduled note onset) */
export const EARLY_GRACE_SEC = 0.1;

/**
 * Late grace window in seconds (350ms after scheduled note end).
 * Forgives wireless Bluetooth earbud / headphone latency.
 */
export const LATE_GRACE_SEC = 0.35;

export interface PlayAlongEvaluatorOptions {
  /** Maximum cents deviation for 'green' (default: 15 cents) */
  readonly toleranceCents?: number;
  /** Audio reference frequency for A4 in Hz (default: 440 Hz) */
  readonly referenceA4Hz?: number;
}

export interface FinalizedNoteGrade {
  readonly note: PlayableNote;
  readonly result: NoteEvaluationResult;
  readonly svgTargetIds: readonly string[];
}

export interface PlayAlongStepResult {
  readonly finalizedGrades: readonly FinalizedNoteGrade[];
  readonly activeNotesCount: number;
}

interface ScheduledNoteEntry {
  readonly note: PlayableNote;
  readonly startAudioTimeSec: number;
  readonly endAudioTimeSec: number;
  readonly windowStartSec: number;
  readonly windowEndSec: number;
  readonly samples: PitchSample[];
  finalized: boolean;
  result: NoteEvaluationResult | null;
}

/**
 * Computes a comprehensive practice session summary over a set of note evaluation results.
 * Tracks green / yellow / red counts, accuracy percentage, average cents deviation,
 * and lists unique measure numbers with intonation errors ('yellow' or 'red').
 */
export function computeSessionSummary(
  results: readonly NoteEvaluationResult[],
): PracticeSessionSummary {
  const totalNotes = results.length;
  let greenCount = 0;
  let yellowCount = 0;
  let redCount = 0;
  let totalAbsCents = 0;
  let centsCount = 0;
  const problemMeasureSet = new Set<number>();

  for (const r of results) {
    if (r.status === 'green') {
      greenCount++;
    } else if (r.status === 'yellow') {
      yellowCount++;
      problemMeasureSet.add(r.measureNumber);
    } else if (r.status === 'red') {
      redCount++;
      problemMeasureSet.add(r.measureNumber);
    }

    if (r.centsDelta !== null) {
      totalAbsCents += Math.abs(r.centsDelta);
      centsCount++;
    }
  }

  const accuracyPercent =
    totalNotes > 0 ? Math.round((greenCount / totalNotes) * 1000) / 10 : 0;
  const averageAbsCentsDelta =
    centsCount > 0 ? Math.round((totalAbsCents / centsCount) * 10) / 10 : null;
  const problemMeasures = Object.freeze(
    Array.from(problemMeasureSet).sort((a, b) => a - b),
  );

  return {
    totalNotes,
    greenCount,
    yellowCount,
    redCount,
    accuracyPercent,
    averageAbsCentsDelta,
    problemMeasures,
  };
}

/**
 * Pure, deterministic Play-Along intonation evaluator with Bluetooth delay forgiveness.
 *
 * Expands each scheduled note's evaluation window by [start - 100ms, end + 350ms].
 * Validates incoming PitchSamples against target MIDI notes, grading each note:
 * - 'green':  <= 1x toleranceCents
 * - 'yellow': <= 2x toleranceCents
 * - 'red':    > 2x toleranceCents or 0 valid samples (missed note)
 */
export class PlayAlongEvaluator {
  private _toleranceCents: number;
  private _referenceA4Hz: number;
  private _scheduledNotes: ScheduledNoteEntry[] = [];
  private _results: NoteEvaluationResult[] = [];
  private _latestAudioTimeSec = 0;

  constructor(options: PlayAlongEvaluatorOptions = {}) {
    this._toleranceCents = options.toleranceCents ?? 15;
    this._referenceA4Hz = options.referenceA4Hz ?? 440;
  }

  // --- Getters ---

  public get toleranceCents(): number {
    return this._toleranceCents;
  }

  public get referenceA4Hz(): number {
    return this._referenceA4Hz;
  }

  public get results(): readonly NoteEvaluationResult[] {
    return this._results;
  }

  public get scheduledNotes(): readonly {
    readonly note: PlayableNote;
    readonly startAudioTimeSec: number;
    readonly endAudioTimeSec: number;
    readonly finalized: boolean;
  }[] {
    return this._scheduledNotes;
  }

  // --- Configuration ---

  public setToleranceCents(cents: number): void {
    this._toleranceCents = Math.max(1, cents);
  }

  public setReferenceA4Hz(hz: number): void {
    this._referenceA4Hz = Math.max(200, Math.min(1000, hz));
  }

  // --- Note Registration ---

  /**
   * Registers a scheduled note onset and duration from the BeatScheduler lookahead loop.
   * Rests (note.pitch === null) are automatically ignored.
   * Defines a forgiving window: [start - EARLY_GRACE_SEC, end + LATE_GRACE_SEC].
   */
  public registerScheduledNote(
    note: PlayableNote,
    startAudioTimeSec: number,
    endAudioTimeSec: number,
  ): void {
    if (note.pitch === null || note.pitch.midiNumber == null) {
      return;
    }

    // Guard against duplicate registrations of the same note window
    const existing = this._scheduledNotes.find(
      (entry) =>
        entry.note.id === note.id &&
        Math.abs(entry.startAudioTimeSec - startAudioTimeSec) < 0.001,
    );
    if (existing) {
      return;
    }

    const windowStartSec = Math.max(0, startAudioTimeSec - EARLY_GRACE_SEC);
    const windowEndSec = endAudioTimeSec + LATE_GRACE_SEC;

    this._scheduledNotes.push({
      note,
      startAudioTimeSec,
      endAudioTimeSec,
      windowStartSec,
      windowEndSec,
      samples: [],
      finalized: false,
      result: null,
    });
  }

  // --- Pitch & Time Processing ---

  /**
   * Ingests a live PitchSample and/or current audio timestamp.
   *
   * Matches valid samples to any active note windows that encompass sample.audioTimeSec.
   * Finalizes notes whose windows have elapsed (or locked early after noteEnd) and returns newly graded notes.
   */
  public processPitch(
    sample: PitchSample | null,
    currentAudioTimeSec?: number,
  ): PlayAlongStepResult {
    const nowTime =
      currentAudioTimeSec ?? sample?.audioTimeSec ?? this._latestAudioTimeSec;
    if (nowTime > this._latestAudioTimeSec) {
      this._latestAudioTimeSec = nowTime;
    }

    // 1. Associate valid pitch sample with any active matching note windows
    if (sample !== null && sample.frequencyHz > 0) {
      for (const entry of this._scheduledNotes) {
        if (entry.finalized) continue;
        if (
          sample.audioTimeSec >= entry.windowStartSec &&
          sample.audioTimeSec <= entry.windowEndSec
        ) {
          entry.samples.push(sample);
        }
      }
    }

    // 2. Finalize notes that have either passed windowEndSec or met early lock criteria
    const finalizedGrades: FinalizedNoteGrade[] = [];

    for (const entry of this._scheduledNotes) {
      if (entry.finalized) continue;

      const windowExpired = nowTime > entry.windowEndSec;
      const noteEndPassed = nowTime >= entry.endAudioTimeSec;
      const hasSufficientInTuneSamples =
        noteEndPassed && this._hasSufficientInTuneSamples(entry);

      if (windowExpired || hasSufficientInTuneSamples) {
        const grade = this._finalizeEntry(entry);
        finalizedGrades.push(grade);
      }
    }

    const activeNotesCount = this._scheduledNotes.filter(
      (e) => !e.finalized,
    ).length;

    return {
      finalizedGrades,
      activeNotesCount,
    };
  }

  /**
   * Finalizes all remaining unfinalized scheduled notes immediately (e.g. on stop or loop wrap).
   */
  public flush(currentAudioTimeSec?: number): readonly FinalizedNoteGrade[] {
    if (currentAudioTimeSec !== undefined && currentAudioTimeSec > this._latestAudioTimeSec) {
      this._latestAudioTimeSec = currentAudioTimeSec;
    }
    const finalizedGrades: FinalizedNoteGrade[] = [];
    for (const entry of this._scheduledNotes) {
      if (!entry.finalized) {
        finalizedGrades.push(this._finalizeEntry(entry));
      }
    }
    return Object.freeze(finalizedGrades);
  }

  /**
   * Clears all scheduled notes and accumulated results.
   */
  public reset(): void {
    this._scheduledNotes = [];
    this._results = [];
    this._latestAudioTimeSec = 0;
  }

  /**
   * Computes a session summary over all accumulated results so far.
   */
  public getSummary(): PracticeSessionSummary {
    return computeSessionSummary(this._results);
  }

  // --- Private Evaluation Methods ---

  private _hasSufficientInTuneSamples(entry: ScheduledNoteEntry): boolean {
    if (entry.samples.length < 3 || entry.note.pitch === null) {
      return false;
    }

    let inTuneCount = 0;
    for (const s of entry.samples) {
      const cents = frequencyToCentsDelta(
        s.frequencyHz,
        entry.note.pitch.midiNumber,
        this._referenceA4Hz,
      );
      if (Math.abs(cents) <= this._toleranceCents) {
        inTuneCount++;
      }
    }

    // At least 3 samples and majority in-tune
    return inTuneCount >= 3 && inTuneCount >= entry.samples.length * 0.6;
  }

  private _finalizeEntry(entry: ScheduledNoteEntry): FinalizedNoteGrade {
    entry.finalized = true;

    const note = entry.note;
    const targetMidi = note.pitch?.midiNumber ?? 69;

    let status: 'green' | 'yellow' | 'red';
    let centsDelta: number | null = null;
    let onsetDeltaMs: number | null = null;

    if (entry.samples.length === 0) {
      // Missed note — zero valid pitch samples received in window
      status = 'red';
      centsDelta = null;
      onsetDeltaMs = null;
    } else {
      const deltas = entry.samples.map((s) =>
        frequencyToCentsDelta(s.frequencyHz, targetMidi, this._referenceA4Hz),
      );

      // Median cents calculation
      const sorted = [...deltas].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median =
        sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];

      // Best (closest to target) cents calculation
      let best = deltas[0];
      for (const d of deltas) {
        if (Math.abs(d) < Math.abs(best)) {
          best = d;
        }
      }

      // Median/best selection: prefer median, allow best if student attacks with vibrato
      let representative = median;
      if (Math.abs(median) <= this._toleranceCents) {
        representative = median;
      } else if (Math.abs(best) <= this._toleranceCents) {
        representative = best;
      } else if (Math.abs(median) <= this._toleranceCents * 2) {
        representative = median;
      } else if (Math.abs(best) <= this._toleranceCents * 2) {
        representative = best;
      }

      centsDelta = Math.round(representative * 10) / 10;

      if (Math.abs(centsDelta) <= this._toleranceCents) {
        status = 'green';
      } else if (Math.abs(centsDelta) <= this._toleranceCents * 2) {
        status = 'yellow';
      } else {
        status = 'red';
      }

      // Onset timing delta relative to scheduled note start
      const firstSample = entry.samples[0];
      onsetDeltaMs = Math.round(
        (firstSample.audioTimeSec - entry.startAudioTimeSec) * 1000,
      );
    }

    const result: NoteEvaluationResult = {
      noteId: note.id,
      measureNumber: note.measureNumber,
      status,
      centsDelta,
      onsetDeltaMs,
    };

    entry.result = result;
    this._results.push(result);

    const svgTargetIds: readonly string[] =
      note.tiedNoteIds.length > 0 ? note.tiedNoteIds : [note.id];

    return {
      note,
      result,
      svgTargetIds,
    };
  }
}
