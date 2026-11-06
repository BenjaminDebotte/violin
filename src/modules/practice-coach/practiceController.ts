import {
  type ScoreTimeline,
  type PlayableNote,
  type PitchSample,
  type PracticeMode,
  type NoteGradeStatus,
  type NoteEvaluationResult,
  type PracticeSessionSummary,
  type MeasureLoopRange,
  type PracticeSettings,
  DEFAULT_PRACTICE_SETTINGS,
  getToleranceCents,
} from '../../types/music';
import { AudioPlaybackEngine } from '../audio-playback/audioEngine';
import { BeatScheduler } from '../audio-playback/beatScheduler';
import { MicSessionManager } from '../pitch-detection/micSessionManager';
import { classifyMicError, type MicErrorInfo } from '../pitch-detection/micErrors';
import { WaitForMeEvaluator } from './waitForMeEvaluator';
import { PlayAlongEvaluator, computeSessionSummary } from './playAlongEvaluator';
import { HintTracker, type HintReason } from './hintTracker';

export interface NoteGradedEvent {
  readonly note: PlayableNote;
  readonly grade: NoteGradeStatus;
  readonly result: NoteEvaluationResult;
  readonly svgTargetIds: readonly string[];
}

/** A fingering hint on offer for the current target note (Wait-for-Me only). */
export interface PracticeHint {
  readonly reason: HintReason;
  /** Identity of the target note the hint belongs to. */
  readonly noteKey: string;
}

/** Emitted when a target note locks after taking long enough that a hint could have helped. */
export interface HintEpisodeEvent {
  readonly hintsEnabled: boolean;
  readonly reason: HintReason | null;
  readonly lockSec: number;
  readonly afterHintSec: number | null;
}

export interface PracticeControllerState {
  readonly mode: PracticeMode;
  readonly isRunning: boolean;
  readonly isPaused: boolean;
  readonly activeNote: PlayableNote | null;
  readonly cursorStepIndex: number;
  readonly currentMeasureNumber: number;
  readonly holdProgress: number;
  readonly latestNoteGrade: NoteGradedEvent | null;
  readonly sessionSummary: PracticeSessionSummary | null;
  readonly isDronePlaying: boolean;
  readonly loopCount: number;
  readonly countInBeat: {
    readonly bar: number;
    readonly beat: number;
    readonly total: number;
  } | null;
  /** Fingering hint for the current target note, or null. */
  readonly hint: PracticeHint | null;
  /** Why the microphone could not start, or null. The session still runs, but cannot hear you. */
  readonly micError: MicErrorInfo | null;
  /**
   * Wait-for-Me: the target repeats the note just played, and the player has to lift or
   * re-bow before it counts.
   */
  readonly awaitingReattack: boolean;
}

export type PracticeStateSubscriber = (state: PracticeControllerState) => void;

export interface PracticeControllerOptions {
  readonly timeline: ScoreTimeline;
  readonly audioEngine: AudioPlaybackEngine;
  readonly micSessionManager?: MicSessionManager;
  readonly settings?: Partial<PracticeSettings>;
  readonly holdDurationSec?: number;
  readonly onStateChange?: PracticeStateSubscriber;
  readonly onNoteGraded?: (event: NoteGradedEvent) => void;
  readonly onHintEpisode?: (episode: HintEpisodeEvent) => void;
  readonly hintsEnabled?: boolean;
}

/**
 * PracticeController unites the ScoreTimeline, Web Audio scheduler, mic pitch detector,
 * and deterministic intonation evaluators (Wait-for-Me & Play-Along).
 *
 * Emits live UI/OSMD state updates (active target note, cursor step index, hold progress,
 * latest note grade with svgTargetIds, end-of-session summary).
 * Exposes toggleReferenceDrone() for practicing with acoustic pitch reinforcement.
 */
export class PracticeController {
  private readonly _timeline: ScoreTimeline;
  private readonly _audioEngine: AudioPlaybackEngine;
  private readonly _micSessionManager: MicSessionManager | null;
  private readonly _onStateChangeCallback?: PracticeStateSubscriber;
  private readonly _onNoteGradedCallback?: (event: NoteGradedEvent) => void;
  private readonly _onHintEpisodeCallback?: (episode: HintEpisodeEvent) => void;

  private _mode: PracticeMode;
  private _tempoScale: number;
  private _referenceA4Hz: number;
  private _toleranceCents: number;
  private _loopRange: MeasureLoopRange | null;
  private _countInBars: 0 | 1 | 2;
  private _holdDurationSec: number;

  private _waitForMeEvaluator: WaitForMeEvaluator;
  private _playAlongEvaluator: PlayAlongEvaluator;
  private _beatScheduler: BeatScheduler;

  private _isRunning = false;
  private _isPaused = false;
  private _activeNote: PlayableNote | null = null;
  private _cursorStepIndex = 0;
  private _currentMeasureNumber = 1;
  private _holdProgress = 0;
  private _latestNoteGrade: NoteGradedEvent | null = null;
  private _sessionSummary: PracticeSessionSummary | null = null;
  private _isDronePlaying = false;
  private _loopCount = 0;
  private _countInBeat: {
    readonly bar: number;
    readonly beat: number;
    readonly total: number;
  } | null = null;

  private readonly _hintTracker = new HintTracker();
  private _hintsEnabled = true;
  private _hint: PracticeHint | null = null;

  private _subscribers = new Set<PracticeStateSubscriber>();
  private _micUnsubscribe: (() => void) | null = null;
  private _micError: MicErrorInfo | null = null;
  private _micConnecting: Promise<void> | null = null;
  private _playAlongPollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: PracticeControllerOptions) {
    this._timeline = options.timeline;
    this._audioEngine = options.audioEngine;
    this._micSessionManager = options.micSessionManager ?? null;
    this._onStateChangeCallback = options.onStateChange;
    this._onNoteGradedCallback = options.onNoteGraded;
    this._onHintEpisodeCallback = options.onHintEpisode;
    this._hintsEnabled = options.hintsEnabled ?? true;

    const s = options.settings ?? {};
    this._mode = s.mode ?? DEFAULT_PRACTICE_SETTINGS.mode;
    this._tempoScale = s.tempoScale ?? DEFAULT_PRACTICE_SETTINGS.tempoScale;
    this._referenceA4Hz =
      s.referenceA4Hz ?? DEFAULT_PRACTICE_SETTINGS.referenceA4Hz;
    this._loopRange = s.loopRange ?? DEFAULT_PRACTICE_SETTINGS.loopRange;
    this._countInBars = (s.countInBars ??
      DEFAULT_PRACTICE_SETTINGS.countInBars) as 0 | 1 | 2;
    this._holdDurationSec = options.holdDurationSec ?? 0.15;

    this._toleranceCents = getToleranceCents({
      strictness: s.strictness ?? DEFAULT_PRACTICE_SETTINGS.strictness,
      customToleranceCents:
        s.customToleranceCents ??
        DEFAULT_PRACTICE_SETTINGS.customToleranceCents,
    });

    // Initialize evaluators
    this._waitForMeEvaluator = new WaitForMeEvaluator({
      notes: this._timeline.soloNotes,
      holdDurationSec: this._holdDurationSec,
      toleranceCents: this._toleranceCents,
      referenceA4Hz: this._referenceA4Hz,
      loopRange: this._loopRange,
    });

    this._playAlongEvaluator = new PlayAlongEvaluator({
      toleranceCents: this._toleranceCents,
      referenceA4Hz: this._referenceA4Hz,
    });

    // Initialize scheduler
    this._beatScheduler = this._createBeatScheduler();

    // Initial state setup
    this._activeNote = this._waitForMeEvaluator.currentNote;
    this._cursorStepIndex = this._activeNote?.cursorStepIndex ?? 0;
    this._currentMeasureNumber = this._activeNote?.measureNumber ?? 1;
  }

  // --- Getters ---

  public get mode(): PracticeMode {
    return this._mode;
  }

  public get isRunning(): boolean {
    return this._isRunning;
  }

  public get isPaused(): boolean {
    return this._isPaused;
  }

  public get activeNote(): PlayableNote | null {
    return this._activeNote;
  }

  public get cursorStepIndex(): number {
    return this._cursorStepIndex;
  }

  public get currentMeasureNumber(): number {
    return this._currentMeasureNumber;
  }

  public get holdProgress(): number {
    return this._holdProgress;
  }

  public get latestNoteGrade(): NoteGradedEvent | null {
    return this._latestNoteGrade;
  }

  public get sessionSummary(): PracticeSessionSummary | null {
    return this._sessionSummary;
  }

  public get isDronePlaying(): boolean {
    return this._isDronePlaying;
  }

  public get loopCount(): number {
    return this._loopCount;
  }

  public get toleranceCents(): number {
    return this._toleranceCents;
  }

  public get referenceA4Hz(): number {
    return this._referenceA4Hz;
  }

  public get loopRange(): MeasureLoopRange | null {
    return this._loopRange;
  }

  public get waitForMeEvaluator(): WaitForMeEvaluator {
    return this._waitForMeEvaluator;
  }

  public get playAlongEvaluator(): PlayAlongEvaluator {
    return this._playAlongEvaluator;
  }

  public get beatScheduler(): BeatScheduler {
    return this._beatScheduler;
  }

  // --- State & Subscriptions ---

  public getState(): PracticeControllerState {
    return {
      mode: this._mode,
      isRunning: this._isRunning,
      isPaused: this._isPaused,
      activeNote: this._activeNote,
      cursorStepIndex: this._cursorStepIndex,
      currentMeasureNumber: this._currentMeasureNumber,
      holdProgress: this._holdProgress,
      latestNoteGrade: this._latestNoteGrade,
      sessionSummary: this._sessionSummary,
      isDronePlaying: this._isDronePlaying,
      loopCount: this._loopCount,
      countInBeat: this._countInBeat,
      hint: this._hint,
      micError: this._micError,
      awaitingReattack: this._mode === 'wait-for-me' && this._waitForMeEvaluator.awaitingReattack,
    };
  }

  public subscribe(listener: PracticeStateSubscriber): () => void {
    this._subscribers.add(listener);
    listener(this.getState());
    return () => {
      this._subscribers.delete(listener);
    };
  }

  // --- Playback / Practice Controls ---

  /**
   * Starts practice session according to current mode (Wait-for-Me vs. Play-Along).
   */
  public async start(): Promise<void> {
    this.stop();

    this._isRunning = true;
    this._isPaused = false;
    this._resetHint();
    this._sessionSummary = null;
    this._latestNoteGrade = null;
    this._loopCount = 0;
    this._countInBeat = null;

    if (this._mode === 'wait-for-me') {
      this._waitForMeEvaluator.reset();
      this._activeNote = this._waitForMeEvaluator.currentNote;
      this._cursorStepIndex = this._activeNote?.cursorStepIndex ?? 0;
      this._currentMeasureNumber = this._activeNote?.measureNumber ?? 1;
      this._holdProgress = 0;
    } else {
      this._playAlongEvaluator.reset();
    }

    // Show the running state at once: the permission prompt can stay open for a long time
    this._emitState();
    const micPromise = this._connectMic();
    await this._audioEngine.resume();

    if (this._isRunning && this._mode === 'play-along') {
      this._startPlayAlongPollTimer();
      this._beatScheduler.start();
      this._emitState();
    }

    await micPromise;
    this._emitState();
  }

  /**
   * Tries again to open the microphone (e.g. after the player allowed it in the browser
   * settings). Works while running and also after the session stopped or ended.
   */
  public async retryMic(): Promise<void> {
    await this._connectMic();
    this._emitState();
  }

  /**
   * Starts (or reuses) the mic and subscribes to its pitch samples. Records why it failed.
   * Single-flight: a second call while the first waits for the permission prompt joins it
   * instead of opening a second stream.
   */
  private _connectMic(): Promise<void> {
    this._micConnecting ??= this._openMic().finally(() => {
      this._micConnecting = null;
    });
    return this._micConnecting;
  }

  private async _openMic(): Promise<void> {
    this._micError = null;
    if (!this._micSessionManager) return;
    try {
      if (!this._micSessionManager.isRunning) {
        await this._micSessionManager.start();
      }
      this._micUnsubscribe?.();
      this._micUnsubscribe = this._micSessionManager.subscribe((sample, rawSample) => {
        // The raw sample always carries a hardware timestamp, so silence still advances clocks.
        this.handlePitchSample(sample, rawSample?.audioTimeSec);
      });
    } catch (err) {
      console.warn('Microphone not available for practice session:', err);
      this._micError = classifyMicError(err);
    }
  }

  /**
   * Pauses the practice session.
   */
  public pause(): void {
    if (!this._isRunning || this._isPaused) return;
    this._isPaused = true;
    this._resetHint();

    if (this._mode === 'play-along') {
      this._beatScheduler.pause();
    }

    this._emitState();
  }

  /**
   * Resumes a paused practice session.
   */
  public resume(): void {
    if (!this._isRunning || !this._isPaused) return;
    this._isPaused = false;
    this._resetHint();

    if (this._mode === 'play-along') {
      this._beatScheduler.resume();
    }

    this._emitState();
  }

  /**
   * Stops practice session, halting audio playback, schedulers, and reference drone.
   */
  public stop(): void {
    this._isRunning = false;
    this._isPaused = false;
    this._countInBeat = null;
    this._resetHint();

    if (this._mode === 'play-along') {
      this._beatScheduler.stop();
      this._stopPlayAlongPollTimer();
    }

    this._waitForMeEvaluator.reset();
    this._playAlongEvaluator.reset();
    this._resetCursorToStart();

    this._stopDrone();

    if (this._micUnsubscribe) {
      this._micUnsubscribe();
      this._micUnsubscribe = null;
    }

    this._emitState();
  }

  private _resetCursorToStart(): void {
    this._activeNote = this._waitForMeEvaluator.currentNote;
    this._cursorStepIndex = this._activeNote?.cursorStepIndex ?? 0;
    this._currentMeasureNumber =
      this._activeNote?.measureNumber ?? (this._loopRange?.startMeasure ?? 1);
    this._holdProgress = 0;
  }

  /** Silences the reference drone if it is playing. */
  private _stopDrone(): void {
    if (this._isDronePlaying) {
      this._audioEngine.stopDrone();
      this._isDronePlaying = false;
    }
  }

  /**
   * Frees internal timers and listeners.
   */
  public dispose(): void {
    this.stop();
    this._subscribers.clear();
  }

  // --- Reference Drone ---

  /**
   * Toggles the sustained reference drone tone for the active target note.
   * Returns true if drone is now playing, false if stopped.
   */
  public toggleReferenceDrone(): boolean {
    if (this._isDronePlaying) {
      this._audioEngine.stopDrone();
      this._isDronePlaying = false;
      this._emitState();
      return false;
    }

    const target = this._activeNote;
    if (target?.pitch?.midiNumber != null) {
      this._audioEngine.startDrone(
        target.pitch.midiNumber,
        this._referenceA4Hz,
      );
      this._isDronePlaying = true;
      this._emitState();
      return true;
    }

    return false;
  }

  // --- Pitch Ingestion (Deterministic & Mic-driven) ---

  /**
   * Feeds a single PitchSample to the active evaluator.
   * In Wait-for-Me mode, advances note on continuous stability.
   * In Play-Along mode, associates sample with scheduled note windows.
   */
  public handlePitchSample(
    sample: PitchSample | null,
    audioTimeSec?: number,
  ): void {
    if (!this._isRunning || this._isPaused) {
      return;
    }

    if (this._mode === 'wait-for-me') {
      const step = this._waitForMeEvaluator.processPitch(sample, audioTimeSec);

      if (step.advanced && step.completedNote && step.completedResult) {
        const gradeEvent: NoteGradedEvent = {
          note: step.completedNote,
          grade: step.completedResult.status,
          result: step.completedResult,
          svgTargetIds: step.svgTargetIds,
        };
        this._latestNoteGrade = gradeEvent;
        this._onNoteGradedCallback?.(gradeEvent);

        this._activeNote = step.currentNote;
        this._cursorStepIndex =
          this._activeNote?.cursorStepIndex ?? this._cursorStepIndex;
        this._currentMeasureNumber =
          this._activeNote?.measureNumber ?? this._currentMeasureNumber;

        if (step.loopRestarted) {
          this._loopCount++;
        }

        // Keep reference drone matched to target note pitch if active
        if (this._isDronePlaying && this._activeNote?.pitch?.midiNumber != null) {
          this._audioEngine.startDrone(
            this._activeNote.pitch.midiNumber,
            this._referenceA4Hz,
          );
        }

        if (step.isComplete) {
          this._sessionSummary = computeSessionSummary(
            this._waitForMeEvaluator.results,
          );
          this._isRunning = false;
          // The piece is over: the drone must not keep sounding
          this._stopDrone();
        }
      }

      this._updateHint(sample, audioTimeSec, step.advanced, step.awaitingReattack);
      this._holdProgress = step.holdProgress;
      this._emitState();
    } else {
      // Play-Along mode
      const now =
        audioTimeSec ??
        sample?.audioTimeSec ??
        this._audioEngine.audioContext.currentTime;

      const { finalizedGrades } = this._playAlongEvaluator.processPitch(
        sample,
        now,
      );

      for (const fg of finalizedGrades) {
        const gradeEvent: NoteGradedEvent = {
          note: fg.note,
          grade: fg.result.status,
          result: fg.result,
          svgTargetIds: fg.svgTargetIds,
        };
        this._latestNoteGrade = gradeEvent;
        this._onNoteGradedCallback?.(gradeEvent);
      }

      if (finalizedGrades.length > 0) {
        this._emitState();
      }
    }
  }

  // --- Dynamic Settings Mutators ---

  public setMode(mode: PracticeMode): void {
    if (this._mode === mode) return;
    const wasRunning = this._isRunning;
    this.stop();
    this._mode = mode;

    this._waitForMeEvaluator.reset();
    this._playAlongEvaluator.reset();
    this._resetCursorToStart();

    if (wasRunning) {
      this.start().catch((err) => {
        console.warn('Failed to restart practice controller after mode change:', err);
      });
    } else {
      this._emitState();
    }
  }

  public setTempoScale(scale: number): void {
    this._tempoScale = Math.max(0.25, Math.min(1.5, scale));
    this._beatScheduler.setTempoScale(this._tempoScale);
  }

  public setLoopRange(loopRange: MeasureLoopRange | null): void {
    this._loopRange = loopRange;
    this._resetHint();
    this._waitForMeEvaluator.setLoopRange(loopRange);
    this._beatScheduler.setLoopRange(loopRange);

    if (this._mode === 'wait-for-me' || !this._isRunning) {
      this._resetCursorToStart();
    }
    this._emitState();
  }

  public setHintsEnabled(enabled: boolean): void {
    if (this._hintsEnabled === enabled) return;
    this._hintsEnabled = enabled;
    if (!enabled && this._hint !== null) {
      this._hint = null;
      this._emitState();
    }
  }

  public setToleranceCents(cents: number): void {
    this._toleranceCents = Math.max(1, cents);
    this._waitForMeEvaluator.setToleranceCents(this._toleranceCents);
    this._playAlongEvaluator.setToleranceCents(this._toleranceCents);
  }

  public setReferenceA4Hz(hz: number): void {
    this._referenceA4Hz = Math.max(200, Math.min(1000, hz));
    this._waitForMeEvaluator.setReferenceA4Hz(this._referenceA4Hz);
    this._playAlongEvaluator.setReferenceA4Hz(this._referenceA4Hz);
    this._beatScheduler.setReferenceA4Hz(this._referenceA4Hz);

    if (this._isDronePlaying && this._activeNote?.pitch?.midiNumber != null) {
      this._audioEngine.startDrone(
        this._activeNote.pitch.midiNumber,
        this._referenceA4Hz,
      );
    }
  }

  public seekToMeasure(measureNumber: number): void {
    this._resetHint();
    if (this._mode === 'wait-for-me') {
      this._waitForMeEvaluator.seekToMeasure(measureNumber);
      this._activeNote = this._waitForMeEvaluator.currentNote;
      this._cursorStepIndex = this._activeNote?.cursorStepIndex ?? 0;
      this._currentMeasureNumber = measureNumber;
    } else {
      this._beatScheduler.seekToMeasure(measureNumber);
      this._currentMeasureNumber = measureNumber;
    }
    this._emitState();
  }

  // --- Private Helpers ---

  private _resetHint(): void {
    this._hintTracker.reset();
    this._hint = null;
  }

  /**
   * Wait-for-Me only. Runs the hint tracker on every sample (also silence) so the "stuck"
   * clock keeps going, records how long a note took to lock, and exposes a hint only when
   * hints are on and the reference drone is silent (the drone would be heard as the player).
   */
  private _updateHint(
    sample: PitchSample | null,
    audioTimeSec: number | undefined,
    advanced: boolean,
    awaitingReattack: boolean,
  ): void {
    const t = audioTimeSec ?? sample?.audioTimeSec ?? this._audioEngine.audioContext.currentTime;
    const tracker = this._hintTracker;
    const exposed = this._hintsEnabled && !this._isDronePlaying;

    if (advanced && tracker.noteKey !== null && !this._isDronePlaying) {
      const lockSec = t - tracker.activeSince;
      const shownAt = tracker.hintShownAt;
      const reason = this._hintsEnabled ? tracker.hint : null;
      this._onHintEpisodeCallback?.({
        hintsEnabled: this._hintsEnabled,
        reason,
        lockSec,
        afterHintSec: reason !== null && shownAt !== null ? t - shownAt : null,
      });
    }

    // The player is still on the previous (identical) note: nothing to hint about yet
    if (awaitingReattack) {
      this._hint = null;
      return;
    }

    const midi = this._activeNote?.pitch?.midiNumber ?? null;
    const noteKey = midi !== null ? String(this._waitForMeEvaluator.results.length) : null;
    const reason = tracker.update({
      noteKey,
      targetMidi: midi,
      audioTimeSec: t,
      frequencyHz: sample && sample.frequencyHz > 0 ? sample.frequencyHz : null,
      referenceA4Hz: this._referenceA4Hz,
      toleranceCents: this._toleranceCents,
    });

    if (!exposed || reason === null || noteKey === null) {
      this._hint = null;
    } else if (this._hint?.noteKey !== noteKey || this._hint.reason !== reason) {
      this._hint = { reason, noteKey };
    }
  }

  private _createBeatScheduler(): BeatScheduler {
    return new BeatScheduler({
      timeline: this._timeline,
      audioEngine: this._audioEngine,
      countInBars: this._countInBars,
      tempoScale: this._tempoScale,
      referenceA4Hz: this._referenceA4Hz,
      loopRange: this._loopRange,
      callbacks: {
        onCursorStepChange: (cursorStepIndex, measureNumber) => {
          this._handleSchedulerCursor(cursorStepIndex, measureNumber);
        },
        onCountInBeat: (bar, beat, total) => {
          this._countInBeat = { bar, beat, total };
          this._emitState();
        },
        onNoteScheduled: (note, startSec, endSec) => {
          if (note.isSolo) {
            this._playAlongEvaluator.registerScheduledNote(
              note,
              startSec,
              endSec,
            );
          }
        },
        onLoopRestart: (loopCount) => {
          this._loopCount = loopCount;
          this._emitState();
        },
        onPlaybackComplete: () => {
          this._handleSchedulerComplete();
        },
      },
    });
  }

  private _handleSchedulerCursor(
    cursorStepIndex: number,
    measureNumber: number,
  ): void {
    this._cursorStepIndex = cursorStepIndex;
    this._currentMeasureNumber = measureNumber;

    // Locate the corresponding solo note
    const matchedNote = this._timeline.soloNotes.find(
      (n) => n.cursorStepIndex === cursorStepIndex,
    );
    if (matchedNote) {
      this._activeNote = matchedNote;
    }

    // Check for any closed note evaluation windows
    const now = this._audioEngine.audioContext.currentTime;
    const { finalizedGrades } = this._playAlongEvaluator.processPitch(
      null,
      now,
    );
    for (const fg of finalizedGrades) {
      const gradeEvent: NoteGradedEvent = {
        note: fg.note,
        grade: fg.result.status,
        result: fg.result,
        svgTargetIds: fg.svgTargetIds,
      };
      this._latestNoteGrade = gradeEvent;
      this._onNoteGradedCallback?.(gradeEvent);
    }

    this._emitState();
  }

  private _handleSchedulerComplete(): void {
    const now = this._audioEngine.audioContext.currentTime;
    const flushed = this._playAlongEvaluator.flush(now);

    for (const fg of flushed) {
      const gradeEvent: NoteGradedEvent = {
        note: fg.note,
        grade: fg.result.status,
        result: fg.result,
        svgTargetIds: fg.svgTargetIds,
      };
      this._latestNoteGrade = gradeEvent;
      this._onNoteGradedCallback?.(gradeEvent);
    }

    this._sessionSummary = this._playAlongEvaluator.getSummary();
    this._isRunning = false;
    this._stopDrone();
    this._stopPlayAlongPollTimer();
    this._emitState();
  }

  private _startPlayAlongPollTimer(): void {
    this._stopPlayAlongPollTimer();
    // 30ms polling interval ensures missed notes finalize on time
    this._playAlongPollTimer = setInterval(() => {
      if (!this._isRunning || this._mode !== 'play-along' || this._isPaused) {
        return;
      }
      const now = this._audioEngine.audioContext.currentTime;
      const { finalizedGrades } = this._playAlongEvaluator.processPitch(
        null,
        now,
      );
      if (finalizedGrades.length > 0) {
        for (const fg of finalizedGrades) {
          const gradeEvent: NoteGradedEvent = {
            note: fg.note,
            grade: fg.result.status,
            result: fg.result,
            svgTargetIds: fg.svgTargetIds,
          };
          this._latestNoteGrade = gradeEvent;
          this._onNoteGradedCallback?.(gradeEvent);
        }
        this._emitState();
      }
    }, 30);
  }

  private _stopPlayAlongPollTimer(): void {
    if (this._playAlongPollTimer !== null) {
      clearInterval(this._playAlongPollTimer);
      this._playAlongPollTimer = null;
    }
  }

  private _emitState(): void {
    const state = this.getState();
    this._onStateChangeCallback?.(state);
    for (const sub of this._subscribers) {
      try {
        sub(state);
      } catch (err) {
        console.warn('Practice state subscriber threw an error:', err);
      }
    }
  }
}
