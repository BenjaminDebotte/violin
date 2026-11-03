import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  type ScoreTimeline,
  type PlayableNote,
  type PitchSample,
  type NoteEvaluationResult,
} from '../../src/types/music';
import {
  WaitForMeEvaluator,
  PlayAlongEvaluator,
  computeSessionSummary,
  EARLY_GRACE_SEC,
  LATE_GRACE_SEC,
  PracticeController,
} from '../../src/modules/practice-coach';
import type { MicSessionManager } from '../../src/modules/pitch-detection/micSessionManager';
import { AudioPlaybackEngine } from '../../src/modules/audio-playback/audioEngine';

// =============================================================================
// Mock AudioContext & Web Audio Nodes (Strictly typed, zero 'any')
// =============================================================================

interface MockAudioParam {
  value: number;
  setValueAtTime: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
}

function createMockAudioParam(initialValue = 1.0): MockAudioParam {
  const param: MockAudioParam = {
    value: initialValue,
    setValueAtTime: vi.fn((val: number) => {
      param.value = val;
    }),
    linearRampToValueAtTime: vi.fn((val: number) => {
      param.value = val;
    }),
    exponentialRampToValueAtTime: vi.fn((val: number) => {
      param.value = val;
    }),
  };
  return param;
}

interface MockGainNode {
  readonly id: string;
  gain: MockAudioParam;
  connectedTo: unknown[];
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

interface MockOscillatorNode {
  readonly id: string;
  frequency: MockAudioParam;
  type: OscillatorType;
  connectedTo: unknown[];
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

interface MockBiquadFilterNode {
  readonly id: string;
  frequency: MockAudioParam;
  Q: MockAudioParam;
  type: BiquadFilterType;
  connectedTo: unknown[];
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

interface MockAudioContextState {
  currentTime: number;
  sampleRate: number;
  state: AudioContextState;
  destination: { readonly id: string };
  createdGains: MockGainNode[];
  createdOscillators: MockOscillatorNode[];
  createdFilters: MockBiquadFilterNode[];
  createGain: ReturnType<typeof vi.fn>;
  createOscillator: ReturnType<typeof vi.fn>;
  createBiquadFilter: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

function createMockAudioContext(initialTime = 0): AudioContext & MockAudioContextState {
  let gainIdCounter = 0;
  let oscIdCounter = 0;
  let filterIdCounter = 0;

  const createdGains: MockGainNode[] = [];
  const createdOscillators: MockOscillatorNode[] = [];
  const createdFilters: MockBiquadFilterNode[] = [];
  const destination = { id: 'audio-destination' };

  const ctx: MockAudioContextState = {
    currentTime: initialTime,
    sampleRate: 44100,
    state: 'running' as AudioContextState,
    destination,
    createdGains,
    createdOscillators,
    createdFilters,

    createGain: vi.fn(() => {
      const g: MockGainNode = {
        id: `gain-${++gainIdCounter}`,
        gain: createMockAudioParam(1.0),
        connectedTo: [],
        connect: vi.fn((target: unknown) => {
          g.connectedTo.push(target);
        }),
        disconnect: vi.fn(),
      };
      createdGains.push(g);
      return g;
    }),

    createOscillator: vi.fn(() => {
      const osc: MockOscillatorNode = {
        id: `osc-${++oscIdCounter}`,
        frequency: createMockAudioParam(440),
        type: 'sine',
        connectedTo: [],
        connect: vi.fn((target: unknown) => {
          osc.connectedTo.push(target);
        }),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      createdOscillators.push(osc);
      return osc;
    }),

    createBiquadFilter: vi.fn(() => {
      const f: MockBiquadFilterNode = {
        id: `filter-${++filterIdCounter}`,
        frequency: createMockAudioParam(2000),
        Q: createMockAudioParam(1.0),
        type: 'lowpass',
        connectedTo: [],
        connect: vi.fn((target: unknown) => {
          f.connectedTo.push(target);
        }),
        disconnect: vi.fn(),
      };
      createdFilters.push(f);
      return f;
    }),

    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };

  return ctx as unknown as AudioContext & MockAudioContextState;
}

// =============================================================================
// Helper Factories
// =============================================================================

function createMockPitchSample(
  frequencyHz: number,
  audioTimeSec: number,
  clarity = 0.95,
  rms = 0.1,
): PitchSample {
  return {
    frequencyHz,
    audioTimeSec,
    clarity,
    rms,
  };
}

function createSoloNote(
  id: string,
  measureNumber: number,
  midiNumber: number,
  label: string,
  freq440: number,
  cursorStepIndex: number,
  tiedNoteIds: readonly string[] = [],
): PlayableNote {
  return {
    id,
    measureNumber,
    partIndex: 0,
    isSolo: true,
    pitch: {
      step: label[0] as 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B',
      alter: label.includes('#') ? 1 : label.includes('b') ? -1 : 0,
      octave: parseInt(label.slice(-1), 10) || 4,
      midiNumber,
      label,
      frequencyHz440: freq440,
    },
    startBeat: (measureNumber - 1) * 4,
    durationBeats: 1,
    startTimeMs: (measureNumber - 1) * 2000,
    durationMs: 500,
    cursorStepIndex,
    tiedNoteIds,
  };
}

function createRestNote(id: string, measureNumber: number, cursorStepIndex: number): PlayableNote {
  return {
    id,
    measureNumber,
    partIndex: 0,
    isSolo: true,
    pitch: null,
    startBeat: (measureNumber - 1) * 4,
    durationBeats: 1,
    startTimeMs: (measureNumber - 1) * 2000,
    durationMs: 500,
    cursorStepIndex,
    tiedNoteIds: [],
  };
}

function createTestTimeline(): ScoreTimeline {
  const soloNotes: PlayableNote[] = [
    // Preceding rest (should be skipped)
    createRestNote('solo-rest-0', 1, 0),
    // Measure 1: A4 (midi 69, 440 Hz)
    createSoloNote('solo-m1-n1', 1, 69, 'A4', 440.0, 1),
    // Measure 1: B4 (midi 71, 493.88 Hz)
    createSoloNote('solo-m1-n2', 1, 71, 'B4', 493.88, 2),
    // Measure 2: C5 tied across barline (midi 72, 523.25 Hz)
    createSoloNote('solo-m2-n1', 2, 72, 'C5', 523.25, 3, ['solo-m2-n1', 'solo-m2-n2']),
    // Measure 3: D5 (midi 74, 587.33 Hz)
    createSoloNote('solo-m3-n1', 3, 74, 'D5', 587.33, 4),
  ];

  return {
    scoreId: 'test-coach-score',
    title: 'Practice Coach Test Score',
    initialTempoBpm: 120,
    measures: [
      {
        measureNumber: 1,
        startBeat: 0,
        durationBeats: 4,
        tempoBpm: 120,
        timeSignature: { beats: 4, beatType: 4 },
      },
      {
        measureNumber: 2,
        startBeat: 4,
        durationBeats: 4,
        tempoBpm: 120,
        timeSignature: { beats: 4, beatType: 4 },
      },
      {
        measureNumber: 3,
        startBeat: 8,
        durationBeats: 4,
        tempoBpm: 120,
        timeSignature: { beats: 4, beatType: 4 },
      },
    ],
    soloNotes,
    accompanimentNotes: [],
    totalDurationMs: 6000,
    totalBeats: 12,
  };
}

// =============================================================================
// Unit Tests: WaitForMeEvaluator
// =============================================================================

describe('WaitForMeEvaluator', () => {
  it('skips rests automatically and starts on the first playable note', () => {
    const timeline = createTestTimeline();
    const evaluator = new WaitForMeEvaluator({
      notes: timeline.soloNotes,
      holdDurationSec: 0.15,
      toleranceCents: 15,
    });

    // The first item in soloNotes was a rest ('solo-rest-0'), so cursor should start on 'solo-m1-n1' (A4)
    expect(evaluator.currentNote).not.toBeNull();
    expect(evaluator.currentNote?.id).toBe('solo-m1-n1');
    expect(evaluator.currentNote?.pitch?.midiNumber).toBe(69);
    expect(evaluator.currentIndex).toBe(0);
    expect(evaluator.holdProgress).toBe(0);
    expect(evaluator.isComplete).toBe(false);
  });

  it('continuous 150ms in-tune pitch advances to the next note and emits svgTargetIds', () => {
    const timeline = createTestTimeline();
    const evaluator = new WaitForMeEvaluator({
      notes: timeline.soloNotes,
      holdDurationSec: 0.15,
      toleranceCents: 15,
    });

    // Target note: A4 (440 Hz)
    // Sample 1 at t = 1.00s: in tune, hold begins (accumulated = 0s)
    let res = evaluator.processPitch(createMockPitchSample(440.0, 1.0));
    expect(res.advanced).toBe(false);
    expect(res.holdProgress).toBe(0);
    expect(res.centsDelta).toBeCloseTo(0, 1);

    // Sample 2 at t = 1.08s: in tune, accumulated = 0.08s
    res = evaluator.processPitch(createMockPitchSample(440.5, 1.08));
    expect(res.advanced).toBe(false);
    expect(res.holdProgress).toBeCloseTo(0.08 / 0.15, 2);
    expect(evaluator.currentNote?.id).toBe('solo-m1-n1');

    // Sample 3 at t = 1.16s: in tune, delta = 0.08s, accumulated = 0.16s >= 0.15s -> ADVANCE!
    res = evaluator.processPitch(createMockPitchSample(439.8, 1.16));
    expect(res.advanced).toBe(true);
    expect(res.holdProgress).toBe(1);
    expect(res.completedNote?.id).toBe('solo-m1-n1');
    expect(res.completedResult?.status).toBe('green');
    expect(res.svgTargetIds).toEqual(['solo-m1-n1']);
    expect(res.nextNote?.id).toBe('solo-m1-n2'); // advanced to B4
    expect(evaluator.currentNote?.id).toBe('solo-m1-n2');
    expect(evaluator.holdProgress).toBe(0); // reset for next note
  });

  it('emits coalesced tied note IDs in svgTargetIds when a tied note completes', () => {
    const timeline = createTestTimeline();
    const evaluator = new WaitForMeEvaluator({
      notes: timeline.soloNotes,
      holdDurationSec: 0.15,
      toleranceCents: 15,
    });

    // Advance to tied note: 'solo-m2-n1' (C5)
    evaluator.seekToNoteIndex(2);
    expect(evaluator.currentNote?.id).toBe('solo-m2-n1');
    expect(evaluator.currentNote?.tiedNoteIds).toEqual(['solo-m2-n1', 'solo-m2-n2']);

    // Hold C5 (523.25 Hz) for 150ms
    evaluator.processPitch(createMockPitchSample(523.25, 2.0));
    const res = evaluator.processPitch(createMockPitchSample(523.25, 2.16));

    expect(res.advanced).toBe(true);
    expect(res.completedNote?.id).toBe('solo-m2-n1');
    // Emits coalesced tied IDs so ScoreViewport colors both tied noteheads in OSMD
    expect(res.svgTargetIds).toEqual(['solo-m2-n1', 'solo-m2-n2']);
  });

  it('brief spikes (< 100ms) reset holdProgress to 0 and do NOT advance', () => {
    const timeline = createTestTimeline();
    const evaluator = new WaitForMeEvaluator({
      notes: timeline.soloNotes,
      holdDurationSec: 0.15,
      toleranceCents: 15,
    });

    // 1. In-tune sample at t = 1.00s
    evaluator.processPitch(createMockPitchSample(440.0, 1.0));

    // 2. In-tune sample at t = 1.08s (hold = 80ms)
    let res = evaluator.processPitch(createMockPitchSample(440.0, 1.08));
    expect(res.holdProgress).toBeCloseTo(0.08 / 0.15, 2);
    expect(res.advanced).toBe(false);

    // 3. Out-of-tune pitch spike at t = 1.10s (500 Hz: ~221 cents sharp) -> resets to 0!
    res = evaluator.processPitch(createMockPitchSample(500.0, 1.1));
    expect(res.advanced).toBe(false);
    expect(res.holdProgress).toBe(0);
    expect(evaluator.accumulatedHoldSec).toBe(0);

    // 4. Drop / null sample at t = 1.14s (silence) -> remains at 0
    res = evaluator.processPitch(null);
    expect(res.advanced).toBe(false);
    expect(res.holdProgress).toBe(0);

    // 5. In-tune sample again for another 80ms (t = 1.20s to 1.28s) -> still cannot advance
    evaluator.processPitch(createMockPitchSample(440.0, 1.2));
    res = evaluator.processPitch(createMockPitchSample(440.0, 1.28));
    expect(res.advanced).toBe(false);
    expect(res.holdProgress).toBeCloseTo(0.08 / 0.15, 2);
    expect(evaluator.currentNote?.id).toBe('solo-m1-n1'); // still on note 1
  });

  it('respects custom referenceA4Hz (442 Hz) and intonation tolerances (8, 15, 25 cents)', () => {
    const timeline = createTestTimeline();
    const evaluator = new WaitForMeEvaluator({
      notes: timeline.soloNotes,
      holdDurationSec: 0.15,
      referenceA4Hz: 442, // A4 = 442 Hz
      toleranceCents: 8, // Strict
    });

    // At A4 = 442 Hz, playing 440 Hz is ~ -7.84 cents flat
    // Strict tolerance (8 cents): |-7.84| <= 8 cents -> IN TUNE!
    evaluator.processPitch(createMockPitchSample(440.0, 1.0));
    let res = evaluator.processPitch(createMockPitchSample(440.0, 1.16));
    expect(res.advanced).toBe(true);

    // Reset back to A4
    evaluator.seekToNoteIndex(0);

    // Now test 437 Hz: against 442 Hz, delta is 1200 * log2(437/442) = -19.7 cents
    // With strict (8 cents): out of tune
    evaluator.setToleranceCents(8);
    res = evaluator.processPitch(createMockPitchSample(437.0, 2.0));
    expect(res.holdProgress).toBe(0);

    // With medium (15 cents): out of tune (19.7 > 15)
    evaluator.setToleranceCents(15);
    res = evaluator.processPitch(createMockPitchSample(437.0, 2.1));
    expect(res.holdProgress).toBe(0);

    // With easy (25 cents): IN TUNE (19.7 <= 25)!
    evaluator.setToleranceCents(25);
    evaluator.processPitch(createMockPitchSample(437.0, 3.0));
    res = evaluator.processPitch(createMockPitchSample(437.0, 3.16));
    expect(res.advanced).toBe(true);
  });

  it('wraps back to startMeasure on completion when MeasureLoopRange is active', () => {
    const timeline = createTestTimeline();
    // Loop only Measure 1 (contains notes 'solo-m1-n1' and 'solo-m1-n2')
    const evaluator = new WaitForMeEvaluator({
      notes: timeline.soloNotes,
      holdDurationSec: 0.15,
      toleranceCents: 15,
      loopRange: { startMeasure: 1, endMeasure: 1 },
    });

    expect(evaluator.activeNotes.length).toBe(2);
    expect(evaluator.currentNote?.id).toBe('solo-m1-n1');

    // 1. Complete note 1
    evaluator.processPitch(createMockPitchSample(440.0, 1.0));
    let res = evaluator.processPitch(createMockPitchSample(440.0, 1.16));
    expect(res.advanced).toBe(true);
    expect(res.nextNote?.id).toBe('solo-m1-n2');
    expect(res.loopRestarted).toBe(false);

    // 2. Complete note 2 (last note in measure 1 loop)
    // Note 2 is B4 = 493.88 Hz
    evaluator.processPitch(createMockPitchSample(493.88, 1.2));
    res = evaluator.processPitch(createMockPitchSample(493.88, 1.36));

    expect(res.advanced).toBe(true);
    expect(res.completedNote?.id).toBe('solo-m1-n2');
    expect(res.loopRestarted).toBe(true);
    expect(res.isComplete).toBe(false);
    // Cursor cleanly wrapped back to first note in loop ('solo-m1-n1')
    expect(res.nextNote?.id).toBe('solo-m1-n1');
    expect(evaluator.currentNote?.id).toBe('solo-m1-n1');
    expect(evaluator.currentIndex).toBe(0);
  });

  it('completes the entire score when loopRange is null', () => {
    const timeline = createTestTimeline();
    const evaluator = new WaitForMeEvaluator({
      notes: timeline.soloNotes,
      holdDurationSec: 0.15,
      toleranceCents: 15,
      loopRange: null,
    });

    // Jump to the last playable note ('solo-m3-n1', D5 = 587.33 Hz)
    evaluator.seekToNoteIndex(evaluator.activeNotes.length - 1);
    expect(evaluator.currentNote?.id).toBe('solo-m3-n1');

    evaluator.processPitch(createMockPitchSample(587.33, 5.0));
    const res = evaluator.processPitch(createMockPitchSample(587.33, 5.16));

    expect(res.advanced).toBe(true);
    expect(res.isComplete).toBe(true);
    expect(res.nextNote).toBeNull();
    expect(evaluator.isComplete).toBe(true);
    expect(evaluator.currentNote).toBeNull();
  });
});

// =============================================================================
// Unit Tests: PlayAlongEvaluator
// =============================================================================

describe('PlayAlongEvaluator', () => {
  it('exposes the standard grace window constants', () => {
    expect(EARLY_GRACE_SEC).toBe(0.1); // 100ms early
    expect(LATE_GRACE_SEC).toBe(0.35); // 350ms Bluetooth late grace
  });

  it('forgives wireless Bluetooth delay: late notes (250ms–340ms) grade green when <= 1x tolerance and yellow when <= 2x', () => {
    const evaluator = new PlayAlongEvaluator({ toleranceCents: 15, referenceA4Hz: 440 });
    const note1 = createSoloNote('pa-n1', 1, 69, 'A4', 440.0, 0); // A4
    const note2 = createSoloNote('pa-n2', 1, 71, 'B4', 493.88, 1); // B4

    // Note 1 scheduled: start = 1.0s, end = 1.5s
    // Forgiving window: [0.90s, 1.85s]
    evaluator.registerScheduledNote(note1, 1.0, 1.5);

    // Note 2 scheduled: start = 2.0s, end = 2.5s
    // Forgiving window: [1.90s, 2.85s]
    evaluator.registerScheduledNote(note2, 2.0, 2.5);

    // Note 1: Student plays ~280ms late after note end due to Bluetooth latency (t = 1.78s <= 1.85s)
    // Pitch is in-tune (441 Hz = +3.9 cents <= 15 cents = 1x tolerance)
    evaluator.processPitch(createMockPitchSample(441.0, 1.78));

    // Time advances past note 1 window (1.86s > 1.85s)
    let step = evaluator.processPitch(null, 1.86);
    expect(step.finalizedGrades.length).toBe(1);
    expect(step.finalizedGrades[0].note.id).toBe('pa-n1');
    expect(step.finalizedGrades[0].result.status).toBe('green');
    expect(step.finalizedGrades[0].result.centsDelta).toBeCloseTo(3.9, 1);

    // Note 2: Student plays ~300ms late after note end (t = 2.80s <= 2.85s)
    // Pitch is slightly off: 500 Hz for B4 (493.88 Hz) is ~ +21.3 cents (> 15, <= 30 cents = 2x tolerance)
    evaluator.processPitch(createMockPitchSample(500.0, 2.8));

    // Time advances past note 2 window (2.86s > 2.85s)
    step = evaluator.processPitch(null, 2.86);
    expect(step.finalizedGrades.length).toBe(1);
    expect(step.finalizedGrades[0].note.id).toBe('pa-n2');
    expect(step.finalizedGrades[0].result.status).toBe('yellow');
    expect(step.finalizedGrades[0].result.centsDelta).toBeCloseTo(21.3, 1);
  });

  it('grades missed notes and pitches exceeding 2x tolerance as red', () => {
    const evaluator = new PlayAlongEvaluator({ toleranceCents: 15, referenceA4Hz: 440 });
    const note1 = createSoloNote('pa-missed', 1, 69, 'A4', 440.0, 0);
    const note2 = createSoloNote('pa-out-of-tune', 1, 69, 'A4', 440.0, 1);

    // Note 1: Missed note (no pitch samples received)
    evaluator.registerScheduledNote(note1, 1.0, 1.4);
    // Window expires at 1.4 + 0.35 = 1.75s. Process at 1.80s:
    let step = evaluator.processPitch(null, 1.8);
    expect(step.finalizedGrades.length).toBe(1);
    expect(step.finalizedGrades[0].result.status).toBe('red');
    expect(step.finalizedGrades[0].result.centsDelta).toBeNull();

    // Note 2: Highly out-of-tune (520 Hz for A4 = +288 cents > 30 cents)
    evaluator.registerScheduledNote(note2, 2.0, 2.4);
    evaluator.processPitch(createMockPitchSample(520.0, 2.1));
    step = evaluator.processPitch(null, 2.8);
    expect(step.finalizedGrades.length).toBe(1);
    expect(step.finalizedGrades[0].result.status).toBe('red');
  });

  it('computeSessionSummary calculates exact counts, accuracyPercent, and problemMeasures', () => {
    const results: NoteEvaluationResult[] = [
      { noteId: 'n1', measureNumber: 1, status: 'green', centsDelta: 4.2, onsetDeltaMs: 12 },
      { noteId: 'n2', measureNumber: 1, status: 'green', centsDelta: -6.0, onsetDeltaMs: 18 },
      { noteId: 'n3', measureNumber: 2, status: 'yellow', centsDelta: 18.5, onsetDeltaMs: 50 },
      { noteId: 'n4', measureNumber: 3, status: 'red', centsDelta: 38.0, onsetDeltaMs: 90 },
      { noteId: 'n5', measureNumber: 2, status: 'red', centsDelta: null, onsetDeltaMs: null },
    ];

    const summary = computeSessionSummary(results);

    expect(summary.totalNotes).toBe(5);
    expect(summary.greenCount).toBe(2);
    expect(summary.yellowCount).toBe(1);
    expect(summary.redCount).toBe(2);
    // accuracyPercent = (2 / 5) * 100 = 40.0%
    expect(summary.accuracyPercent).toBe(40.0);
    // averageAbsCentsDelta = (4.2 + 6.0 + 18.5 + 38.0) / 4 = 66.7 / 4 = 16.675 -> 16.7
    expect(summary.averageAbsCentsDelta).toBe(16.7);
    // problemMeasures lists measures with yellow or red, deduplicated and sorted ascending: [2, 3]
    expect(summary.problemMeasures).toEqual([2, 3]);
  });

  it('computeSessionSummary handles empty results safely', () => {
    const summary = computeSessionSummary([]);
    expect(summary.totalNotes).toBe(0);
    expect(summary.greenCount).toBe(0);
    expect(summary.accuracyPercent).toBe(0);
    expect(summary.averageAbsCentsDelta).toBeNull();
    expect(summary.problemMeasures).toEqual([]);
  });
});

// =============================================================================
// Unit Tests: PracticeController Coordination
// =============================================================================

describe('PracticeController Coordination', () => {
  let mockAudioContext: AudioContext & MockAudioContextState;
  let audioEngine: AudioPlaybackEngine;
  let timeline: ScoreTimeline;

  beforeEach(() => {
    mockAudioContext = createMockAudioContext(0);
    audioEngine = new AudioPlaybackEngine({
      audioContext: mockAudioContext,
      soundfontEnabled: false,
    });
    timeline = createTestTimeline();
  });

  it('coordinates Wait-for-Me mode with pitch feedback and state updates', async () => {
    const stateUpdates: string[] = [];
    const gradedNotes: string[] = [];

    const controller = new PracticeController({
      timeline,
      audioEngine,
      settings: {
        mode: 'wait-for-me',
        referenceA4Hz: 440,
        strictness: 'medium',
      },
      holdDurationSec: 0.15,
      onStateChange: (state) => {
        stateUpdates.push(`${state.cursorStepIndex}:${state.holdProgress}`);
      },
      onNoteGraded: (event) => {
        gradedNotes.push(`${event.note.id}:${event.grade}`);
      },
    });

    expect(controller.mode).toBe('wait-for-me');
    expect(controller.isRunning).toBe(false);
    expect(controller.activeNote?.id).toBe('solo-m1-n1');

    await controller.start();
    expect(controller.isRunning).toBe(true);

    // Feed pitch samples to lock note 1 (A4 = 440 Hz)
    controller.handlePitchSample(createMockPitchSample(440.0, 1.0));
    controller.handlePitchSample(createMockPitchSample(440.0, 1.16));

    // Note 1 graded green and cursor advanced to note 2 ('solo-m1-n2', B4)
    expect(gradedNotes).toContain('solo-m1-n1:green');
    expect(controller.activeNote?.id).toBe('solo-m1-n2');
    expect(controller.cursorStepIndex).toBe(2);

    controller.stop();
    expect(controller.isRunning).toBe(false);
    controller.dispose();
  });

  it('toggles Reference Drone helper and keeps pitch synced with active note', async () => {
    const controller = new PracticeController({
      timeline,
      audioEngine,
      settings: {
        mode: 'wait-for-me',
        referenceA4Hz: 440,
      },
    });

    await controller.start();
    expect(controller.activeNote?.pitch?.midiNumber).toBe(69); // A4

    // 1. Toggle drone ON
    const started = controller.toggleReferenceDrone();
    expect(started).toBe(true);
    expect(controller.isDronePlaying).toBe(true);
    expect(audioEngine.isDronePlaying).toBe(true);
    expect(audioEngine.currentDroneMidi).toBe(69);

    // 2. Advance active note to B4 (midi 71) via continuous pitch
    controller.handlePitchSample(createMockPitchSample(440.0, 1.0));
    controller.handlePitchSample(createMockPitchSample(440.0, 1.16));

    // Drone pitch dynamically updated to B4 (71)
    expect(controller.activeNote?.id).toBe('solo-m1-n2');
    expect(audioEngine.currentDroneMidi).toBe(71);

    // 3. Toggle drone OFF
    const stopped = controller.toggleReferenceDrone();
    expect(stopped).toBe(false);
    expect(controller.isDronePlaying).toBe(false);
    expect(audioEngine.isDronePlaying).toBe(false);

    controller.dispose();
  });

  it('coordinates Play-Along mode scheduling and grading', async () => {
    const gradedNotes: string[] = [];

    const controller = new PracticeController({
      timeline,
      audioEngine,
      settings: {
        mode: 'play-along',
        countInBars: 0,
      },
      onNoteGraded: (event) => {
        gradedNotes.push(`${event.note.id}:${event.grade}`);
      },
    });

    await controller.start();
    expect(controller.mode).toBe('play-along');
    expect(controller.isRunning).toBe(true);

    // Simulate scheduling a solo note via controller's evaluator
    const note = timeline.soloNotes[1]; // 'solo-m1-n1'
    controller.playAlongEvaluator.registerScheduledNote(note, 1.0, 1.5);

    // Feed in-tune sample
    controller.handlePitchSample(createMockPitchSample(440.0, 1.2));

    // Advance time past late grace window (1.5 + 0.35 = 1.85s)
    controller.handlePitchSample(null, 1.9);

    expect(gradedNotes).toContain('solo-m1-n1:green');

    controller.stop();
    expect(controller.isRunning).toBe(false);
    controller.dispose();
  });

  it('handles loop restart in Wait-for-Me mode', async () => {
    const controller = new PracticeController({
      timeline,
      audioEngine,
      settings: {
        mode: 'wait-for-me',
        loopRange: { startMeasure: 1, endMeasure: 1 },
      },
    });

    await controller.start();
    expect(controller.loopCount).toBe(0);

    // Complete note 1 (A4)
    controller.handlePitchSample(createMockPitchSample(440.0, 1.0));
    controller.handlePitchSample(createMockPitchSample(440.0, 1.16));

    // Complete note 2 (B4)
    controller.handlePitchSample(createMockPitchSample(493.88, 1.2));
    controller.handlePitchSample(createMockPitchSample(493.88, 1.36));

    // Loop wrapped back to start!
    expect(controller.loopCount).toBe(1);
    expect(controller.activeNote?.id).toBe('solo-m1-n1');

    controller.dispose();
  });

  it('supports pause and resume', async () => {
    const controller = new PracticeController({
      timeline,
      audioEngine,
      settings: { mode: 'wait-for-me' },
    });

    await controller.start();
    expect(controller.isRunning).toBe(true);
    expect(controller.isPaused).toBe(false);

    controller.pause();
    expect(controller.isPaused).toBe(true);

    // While paused, pitch samples should be ignored
    controller.handlePitchSample(createMockPitchSample(440.0, 1.0));
    expect(controller.holdProgress).toBe(0);

    controller.resume();
    expect(controller.isPaused).toBe(false);

    controller.dispose();
  });

  it('reports why the microphone could not start instead of failing silently, and can retry', async () => {
    const start = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
      .mockResolvedValue(undefined);
    const mic = {
      isRunning: false,
      start,
      subscribe: vi.fn(() => () => {}),
    } as unknown as MicSessionManager;
    const controller = new PracticeController({
      timeline,
      audioEngine,
      micSessionManager: mic,
      settings: { mode: 'wait-for-me', referenceA4Hz: 440, strictness: 'medium' },
    });

    await controller.start();
    expect(controller.isRunning).toBe(true);
    expect(controller.getState().micError?.kind).toBe('denied');

    await controller.retryMic();
    expect(controller.getState().micError).toBeNull();
    expect(mic.subscribe).toHaveBeenCalledTimes(1);

    controller.dispose();
  });

  it('allows dynamic seeking to a measure', async () => {
    const controller = new PracticeController({
      timeline,
      audioEngine,
      settings: { mode: 'wait-for-me' },
    });

    await controller.start();
    expect(controller.activeNote?.id).toBe('solo-m1-n1');

    // Seek to Measure 3
    controller.seekToMeasure(3);
    expect(controller.activeNote?.measureNumber).toBe(3);
    expect(controller.activeNote?.id).toBe('solo-m3-n1');

    controller.dispose();
  });
});

describe('PracticeController fingering hints (Wait-for-Me)', () => {
  let audioEngine: AudioPlaybackEngine;
  let timeline: ScoreTimeline;

  beforeEach(() => {
    audioEngine = new AudioPlaybackEngine({
      audioContext: createMockAudioContext(0),
      soundfontEnabled: false,
    });
    timeline = createTestTimeline();
  });

  const silence = (controller: PracticeController, from: number, to: number) => {
    for (let t = from; t <= to + 1e-9; t += 0.02) controller.handlePitchSample(null, t);
  };

  it('offers a "stuck" hint after 2 s, clears it on lock, and reports the episode', async () => {
    const episodes: { reason: string | null; lockSec: number; afterHintSec: number | null }[] = [];
    const controller = new PracticeController({
      timeline,
      audioEngine,
      settings: { mode: 'wait-for-me', referenceA4Hz: 440, strictness: 'medium' },
      onHintEpisode: (e) => episodes.push(e),
    });
    await controller.start();

    silence(controller, 0, 1.9);
    expect(controller.getState().hint).toBeNull();
    silence(controller, 1.92, 2.2);
    expect(controller.getState().hint).toMatchObject({ reason: 'stuck' });
    const key = controller.getState().hint?.noteKey;

    // Lock the note (A4): hint disappears, the next target has none.
    controller.handlePitchSample(createMockPitchSample(440, 3.0));
    controller.handlePitchSample(createMockPitchSample(440, 3.16));
    expect(controller.activeNote?.id).toBe('solo-m1-n2');
    expect(controller.getState().hint).toBeNull();
    expect(episodes).toHaveLength(1);
    expect(episodes[0].reason).toBe('stuck');
    expect(episodes[0].lockSec).toBeGreaterThan(3);
    expect(episodes[0].afterHintSec).toBeGreaterThan(0.5);
    expect(key).toBeDefined();
    controller.dispose();
  });

  it('shows no hint when hints are off or the drone is playing, but still reports the episode', async () => {
    const episodes: { hintsEnabled: boolean; reason: string | null }[] = [];
    const controller = new PracticeController({
      timeline,
      audioEngine,
      settings: { mode: 'wait-for-me', referenceA4Hz: 440, strictness: 'medium' },
      hintsEnabled: false,
      onHintEpisode: (e) => episodes.push(e),
    });
    await controller.start();
    silence(controller, 0, 2.5);
    expect(controller.getState().hint).toBeNull();
    controller.handlePitchSample(createMockPitchSample(440, 3.0));
    controller.handlePitchSample(createMockPitchSample(440, 3.16));
    expect(episodes).toEqual([{ hintsEnabled: false, reason: null, lockSec: expect.any(Number), afterHintSec: null }]);

    controller.setHintsEnabled(true);
    controller.toggleReferenceDrone();
    silence(controller, 3.2, 6);
    expect(controller.getState().hint).toBeNull();
    controller.dispose();
  });

  it('restarts the clock after pause and resume', async () => {
    const controller = new PracticeController({
      timeline,
      audioEngine,
      settings: { mode: 'wait-for-me', referenceA4Hz: 440, strictness: 'medium' },
    });
    await controller.start();
    silence(controller, 0, 1.5);
    controller.pause();
    controller.resume();
    silence(controller, 30, 31.5);
    expect(controller.getState().hint).toBeNull();
    silence(controller, 31.52, 32.2);
    expect(controller.getState().hint).toMatchObject({ reason: 'stuck' });
    controller.dispose();
  });
});
