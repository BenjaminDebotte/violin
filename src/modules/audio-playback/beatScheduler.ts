import {
  type ScoreTimeline,
  type ScoreMeasure,
  type PlayableNote,
  type MeasureLoopRange,
} from '../../types/music';
import { AudioPlaybackEngine } from './audioEngine';

export interface BeatSchedulerCallbacks {
  readonly onCursorStepChange?: (
    cursorStepIndex: number,
    measureNumber: number,
    beatInMeasure: number,
  ) => void;
  readonly onCountInBeat?: (
    bar: number,
    beat: number,
    totalCountInBeats: number,
  ) => void;
  readonly onNoteScheduled?: (
    note: PlayableNote,
    noteStartAudioTimeSec: number,
    noteEndAudioTimeSec: number,
  ) => void;
  readonly onLoopRestart?: (loopCount: number) => void;
  readonly onPlaybackComplete?: () => void;
}

export interface BeatSchedulerOptions {
  readonly timeline: ScoreTimeline;
  readonly audioEngine: AudioPlaybackEngine;
  readonly audioContext?: AudioContext;
  readonly countInBars?: 0 | 1 | 2;
  readonly tempoScale?: number;
  readonly referenceA4Hz?: number;
  readonly loopRange?: MeasureLoopRange | null;
  readonly lookaheadSec?: number;
  readonly timerIntervalMs?: number;
  readonly callbacks?: BeatSchedulerCallbacks;
}

type UiEvent =
  | {
      readonly type: 'countIn';
      time: number;
      readonly bar: number;
      readonly beat: number;
      readonly total: number;
    }
  | {
      readonly type: 'cursor';
      time: number;
      readonly cursorStepIndex: number;
      readonly measureNumber: number;
      readonly beatInMeasure: number;
    }
  | {
      readonly type: 'loop';
      time: number;
      readonly loopCount: number;
    }
  | {
      readonly type: 'complete';
      time: number;
    };

/**
 * Sample-accurate lookahead beat and note scheduler over a ScoreTimeline.
 * Uses Web Audio hardware timestamps with dynamic tempo scaling (25%–150%),
 * 1–2 bar count-in metronome clicks, and measure looping without pitch distortion.
 */
export class BeatScheduler {
  private readonly _timeline: ScoreTimeline;
  private readonly _audioEngine: AudioPlaybackEngine;
  private readonly _audioContext: AudioContext;
  private readonly _lookaheadSec: number;
  private readonly _timerIntervalMs: number;

  private _countInBars: 0 | 1 | 2;
  private _tempoScale: number;
  private _referenceA4Hz: number;
  private _loopRange: MeasureLoopRange | null;
  private _callbacks: BeatSchedulerCallbacks;

  private _isPlaying = false;
  private _isPaused = false;
  private _loopCount = 0;
  private _timerId: ReturnType<typeof setInterval> | null = null;

  // Scheduling state
  private _countInActive = false;
  private _countInBeatIndex = 0;
  private _totalCountInBeats = 0;
  private _beatsPerBar = 4;
  private _countInTempoBpm = 100;
  private _currentMeasureIndex = 0;
  private _currentBeatInMeasure = 0;
  private _nextEventAudioTime = 0;
  private _allMeasuresScheduled = false;

  private _pendingUiEvents: UiEvent[] = [];

  constructor(options: BeatSchedulerOptions) {
    this._timeline = options.timeline;
    this._audioEngine = options.audioEngine;
    this._audioContext = options.audioContext ?? options.audioEngine.audioContext;
    this._countInBars = options.countInBars ?? 1;
    this._tempoScale = Math.max(0.25, Math.min(1.5, options.tempoScale ?? 1.0));
    this._referenceA4Hz = options.referenceA4Hz ?? 440;
    this._loopRange = options.loopRange ?? null;
    this._lookaheadSec = options.lookaheadSec ?? 0.1;
    this._timerIntervalMs = options.timerIntervalMs ?? 25;
    this._callbacks = options.callbacks ?? {};
  }

  // --- Getters ---

  public get isPlaying(): boolean {
    return this._isPlaying;
  }

  public get isPaused(): boolean {
    return this._isPaused;
  }

  public get tempoScale(): number {
    return this._tempoScale;
  }

  public get loopRange(): MeasureLoopRange | null {
    return this._loopRange;
  }

  public get loopCount(): number {
    return this._loopCount;
  }

  public get countInBars(): 0 | 1 | 2 {
    return this._countInBars;
  }

  public get audioContext(): AudioContext {
    return this._audioContext;
  }

  // --- Controls ---

  public setTempoScale(scale: number): void {
    this._tempoScale = Math.max(0.25, Math.min(1.5, scale));
  }

  public setLoopRange(range: MeasureLoopRange | null): void {
    this._loopRange = range;
  }

  public setCountInBars(bars: 0 | 1 | 2): void {
    this._countInBars = bars;
  }

  public setReferenceA4Hz(hz: number): void {
    this._referenceA4Hz = hz;
  }

  public setCallbacks(callbacks: BeatSchedulerCallbacks): void {
    this._callbacks = { ...this._callbacks, ...callbacks };
  }

  /**
   * Starts playback from the first eligible measure (with count-in if countInBars > 0).
   */
  public start(): void {
    if (this._isPlaying) {
      this.stop();
    }

    this._isPlaying = true;
    this._isPaused = false;
    this._loopCount = 0;
    this._allMeasuresScheduled = false;
    this._pendingUiEvents = [];

    const activeMeasures = this._getActiveMeasures();
    const firstMeasure = activeMeasures[0] ?? this._timeline.measures[0];
    const startingTempo = firstMeasure?.tempoBpm ?? this._timeline.initialTempoBpm ?? 100;
    const beatsPerBar = firstMeasure?.timeSignature?.beats ?? 4;
    const totalCountInBeats = this._countInBars * beatsPerBar;

    this._nextEventAudioTime = this._audioContext.currentTime;

    if (totalCountInBeats > 0) {
      this._countInActive = true;
      this._countInBeatIndex = 0;
      this._totalCountInBeats = totalCountInBeats;
      this._beatsPerBar = beatsPerBar;
      this._countInTempoBpm = startingTempo;
    } else {
      this._countInActive = false;
      this._countInBeatIndex = 0;
      this._totalCountInBeats = 0;
      this._currentMeasureIndex = 0;
      this._currentBeatInMeasure = 0;
    }

    // Start lookahead timer loop
    this._startTimer();

    // Run first tick immediately to schedule events in the immediate lookahead window
    this.tick();
  }

  public pause(): void {
    if (!this._isPlaying || this._isPaused) {
      return;
    }
    this._isPaused = true;
    this._isPlaying = false;
    this._stopTimer();
    this._audioEngine.stopActiveNotes();
  }

  public resume(): void {
    if (!this._isPaused) {
      return;
    }
    this._isPlaying = true;
    this._isPaused = false;

    // Shift upcoming event audio timestamps to resume from currentTime
    const now = this._audioContext.currentTime;
    const timeDelta = now - this._nextEventAudioTime;
    this._nextEventAudioTime = now;

    for (const ev of this._pendingUiEvents) {
      ev.time += timeDelta;
    }

    this._startTimer();
    this.tick();
  }

  public stop(): void {
    this._isPlaying = false;
    this._isPaused = false;
    this._loopCount = 0;
    this._stopTimer();
    this._pendingUiEvents = [];

    this._countInActive = false;
    this._countInBeatIndex = 0;
    this._currentMeasureIndex = 0;
    this._currentBeatInMeasure = 0;
    this._allMeasuresScheduled = false;

    this._audioEngine.stopAll();
  }

  public dispose(): void {
    this.stop();
  }

  /**
   * Deterministic lookahead tick.
   * Schedules Web Audio events up to audioContext.currentTime + lookaheadSec,
   * and dispatches visual/progress callbacks whose hardware timestamps have arrived.
   */
  public tick(): void {
    if (!this._isPlaying) {
      return;
    }

    const currentTime = this._audioContext.currentTime;
    const horizon = currentTime + this._lookaheadSec;
    const activeMeasures = this._getActiveMeasures();

    if (activeMeasures.length === 0) {
      this._callbacks.onPlaybackComplete?.();
      this.stop();
      return;
    }

    // 1. Lookahead scheduling pass
    while (this._nextEventAudioTime <= horizon && !this._allMeasuresScheduled) {
      // --- Count-In Metronome Clicks ---
      if (this._countInActive) {
        const bar = Math.floor(this._countInBeatIndex / this._beatsPerBar) + 1;
        const beat = (this._countInBeatIndex % this._beatsPerBar) + 1;
        const isDownbeat = (beat === 1);

        this._audioEngine.scheduleMetronomeClick(this._nextEventAudioTime, isDownbeat);

        this._pendingUiEvents.push({
          type: 'countIn',
          time: this._nextEventAudioTime,
          bar,
          beat,
          total: this._totalCountInBeats,
        });

        const beatSec = 60 / (this._countInTempoBpm * this._tempoScale);
        this._nextEventAudioTime += beatSec;
        this._countInBeatIndex++;

        if (this._countInBeatIndex >= this._totalCountInBeats) {
          this._countInActive = false;
          this._currentMeasureIndex = 0;
          this._currentBeatInMeasure = 0;
        }
        continue;
      }

      // --- Score Measures Playback ---
      const measure = activeMeasures[this._currentMeasureIndex];
      if (!measure) {
        break;
      }

      const beatSec = 60 / (measure.tempoBpm * this._tempoScale);
      const beatAudioTime = this._nextEventAudioTime;
      const isDownbeat = (this._currentBeatInMeasure === 0);

      // Metronome click for this beat
      this._audioEngine.scheduleMetronomeClick(beatAudioTime, isDownbeat);

      const beatTimelineStart = measure.startBeat + this._currentBeatInMeasure;
      const beatTimelineEnd = beatTimelineStart + 1.0;

      // Schedule Part 1 Solo Notes
      for (const note of this._timeline.soloNotes) {
        if (
          note.measureNumber === measure.measureNumber &&
          note.startBeat >= beatTimelineStart - 1e-4 &&
          note.startBeat < beatTimelineEnd - 1e-4
        ) {
          const offsetBeats = note.startBeat - beatTimelineStart;
          const noteStartAudio = beatAudioTime + offsetBeats * beatSec;
          const noteDurAudio = note.durationBeats * beatSec;

          this._audioEngine.scheduleNote(
            note,
            noteStartAudio,
            noteDurAudio,
            this._referenceA4Hz,
          );
          this._callbacks.onNoteScheduled?.(
            note,
            noteStartAudio,
            noteStartAudio + noteDurAudio,
          );

          this._pendingUiEvents.push({
            type: 'cursor',
            time: noteStartAudio,
            cursorStepIndex: note.cursorStepIndex,
            measureNumber: measure.measureNumber,
            beatInMeasure: this._currentBeatInMeasure + offsetBeats + 1,
          });
        }
      }

      // Schedule Parts 2+ Accompaniment Notes
      for (const note of this._timeline.accompanimentNotes) {
        if (
          note.measureNumber === measure.measureNumber &&
          note.startBeat >= beatTimelineStart - 1e-4 &&
          note.startBeat < beatTimelineEnd - 1e-4
        ) {
          const offsetBeats = note.startBeat - beatTimelineStart;
          const noteStartAudio = beatAudioTime + offsetBeats * beatSec;
          const noteDurAudio = note.durationBeats * beatSec;

          this._audioEngine.scheduleNote(
            note,
            noteStartAudio,
            noteDurAudio,
            this._referenceA4Hz,
          );
          this._callbacks.onNoteScheduled?.(
            note,
            noteStartAudio,
            noteStartAudio + noteDurAudio,
          );
        }
      }

      // Advance beat
      this._nextEventAudioTime += beatSec;
      this._currentBeatInMeasure++;

      // Check if current measure is finished
      if (this._currentBeatInMeasure >= measure.durationBeats - 1e-4) {
        this._currentMeasureIndex++;
        this._currentBeatInMeasure = 0;

        // Check if all active measures completed
        if (this._currentMeasureIndex >= activeMeasures.length) {
          if (this._loopRange) {
            this._loopCount++;
            this._pendingUiEvents.push({
              type: 'loop',
              time: this._nextEventAudioTime,
              loopCount: this._loopCount,
            });
            this._currentMeasureIndex = 0;
            this._currentBeatInMeasure = 0;
          } else {
            this._allMeasuresScheduled = true;
            this._pendingUiEvents.push({
              type: 'complete',
              time: this._nextEventAudioTime,
            });
            break;
          }
        }
      }
    }

    // 2. Dispatch pending UI events whose audio hardware time has arrived
    while (
      this._pendingUiEvents.length > 0 &&
      this._pendingUiEvents[0].time <= currentTime + 1e-4
    ) {
      const event = this._pendingUiEvents.shift()!;
      switch (event.type) {
        case 'countIn':
          this._callbacks.onCountInBeat?.(event.bar, event.beat, event.total);
          break;
        case 'cursor':
          this._callbacks.onCursorStepChange?.(
            event.cursorStepIndex,
            event.measureNumber,
            event.beatInMeasure,
          );
          break;
        case 'loop':
          this._callbacks.onLoopRestart?.(event.loopCount);
          break;
        case 'complete':
          this._callbacks.onPlaybackComplete?.();
          this.stop();
          return;
      }
    }
  }

  // --- Internals ---

  private _getActiveMeasures(): readonly ScoreMeasure[] {
    if (!this._loopRange) {
      return this._timeline.measures;
    }
    const { startMeasure, endMeasure } = this._loopRange;
    const filtered = this._timeline.measures.filter(
      (m) => m.measureNumber >= startMeasure && m.measureNumber <= endMeasure,
    );
    return filtered.length > 0 ? filtered : this._timeline.measures;
  }

  private _startTimer(): void {
    if (this._timerId) {
      clearInterval(this._timerId);
    }
    this._timerId = setInterval(() => {
      this.tick();
    }, this._timerIntervalMs);
  }

  private _stopTimer(): void {
    if (this._timerId) {
      clearInterval(this._timerId);
      this._timerId = null;
    }
  }
}
