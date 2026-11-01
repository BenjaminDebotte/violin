import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import { AudioPlaybackEngine } from '../../src/modules/audio-playback/audioEngine';
import { BeatScheduler } from '../../src/modules/audio-playback/beatScheduler';
import { MixerPanel } from '../../src/components/MixerPanel';
import {
  type ScoreTimeline,
  type PlayableNote,
  type MixerSettings,
  DEFAULT_MIXER_SETTINGS,
} from '../../src/types/music';

// =============================================================================
// Mock AudioContext & Web Audio Nodes
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
  destination: { id: string };
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

    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return ctx as unknown as AudioContext & MockAudioContextState;
}

// =============================================================================
// Test Score Timeline Factory
// =============================================================================

function createTestScoreTimeline(): ScoreTimeline {
  return {
    scoreId: 'test-audio-score',
    title: 'Test Audio Score',
    initialTempoBpm: 120, // 120 BPM => 0.5s per beat at tempoScale 1.0
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
    soloNotes: [
      // Measure 1, beat 0: A4
      {
        id: 'solo-m1-n1',
        measureNumber: 1,
        partIndex: 0,
        isSolo: true,
        pitch: {
          step: 'A',
          alter: 0,
          octave: 4,
          midiNumber: 69,
          label: 'A4',
          frequencyHz440: 440,
        },
        startBeat: 0,
        durationBeats: 1,
        startTimeMs: 0,
        durationMs: 500,
        cursorStepIndex: 0,
        tiedNoteIds: [],
      },
      // Measure 1, beat 1: Rest (pitch = null)
      {
        id: 'solo-m1-rest',
        measureNumber: 1,
        partIndex: 0,
        isSolo: true,
        pitch: null,
        startBeat: 1,
        durationBeats: 1,
        startTimeMs: 500,
        durationMs: 500,
        cursorStepIndex: 1,
        tiedNoteIds: [],
      },
      // Measure 2, beat 0: D5 (2 beats)
      {
        id: 'solo-m2-n1',
        measureNumber: 2,
        partIndex: 0,
        isSolo: true,
        pitch: {
          step: 'D',
          alter: 0,
          octave: 5,
          midiNumber: 74,
          label: 'D5',
          frequencyHz440: 587.33,
        },
        startBeat: 4,
        durationBeats: 2,
        startTimeMs: 2000,
        durationMs: 1000,
        cursorStepIndex: 2,
        tiedNoteIds: [],
      },
      // Measure 3, beat 0: E5 (4 beats)
      {
        id: 'solo-m3-n1',
        measureNumber: 3,
        partIndex: 0,
        isSolo: true,
        pitch: {
          step: 'E',
          alter: 0,
          octave: 5,
          midiNumber: 76,
          label: 'E5',
          frequencyHz440: 659.25,
        },
        startBeat: 8,
        durationBeats: 4,
        startTimeMs: 4000,
        durationMs: 2000,
        cursorStepIndex: 3,
        tiedNoteIds: [],
      },
    ],
    accompanimentNotes: [
      // Measure 1, beat 0: C4
      {
        id: 'accomp-m1-n1',
        measureNumber: 1,
        partIndex: 1,
        isSolo: false,
        pitch: {
          step: 'C',
          alter: 0,
          octave: 4,
          midiNumber: 60,
          label: 'C4',
          frequencyHz440: 261.63,
        },
        startBeat: 0,
        durationBeats: 2,
        startTimeMs: 0,
        durationMs: 1000,
        cursorStepIndex: 0,
        tiedNoteIds: [],
      },
    ],
    totalDurationMs: 6000,
    totalBeats: 12,
  };
}

// =============================================================================
// 1. AudioPlaybackEngine Unit Tests
// =============================================================================

describe('AudioPlaybackEngine (audioEngine.ts)', () => {
  let mockCtx: ReturnType<typeof createMockAudioContext>;
  let engine: AudioPlaybackEngine;

  beforeEach(() => {
    mockCtx = createMockAudioContext(0);
    engine = new AudioPlaybackEngine({ audioContext: mockCtx });
  });

  afterEach(async () => {
    await engine.close();
  });

  describe('Initialization & 4 Independent GainNodes', () => {
    it('creates 4 independent GainNodes connected to audioContext.destination', () => {
      expect(engine.soloGain).toBeDefined();
      expect(engine.accompanimentGain).toBeDefined();
      expect(engine.metronomeGain).toBeDefined();
      expect(engine.droneGain).toBeDefined();

      // Ensure all 4 gain nodes connect to destination
      const destination = mockCtx.destination;
      const soloMock = engine.soloGain as unknown as MockGainNode;
      const accompMock = engine.accompanimentGain as unknown as MockGainNode;
      const metroMock = engine.metronomeGain as unknown as MockGainNode;
      const droneMock = engine.droneGain as unknown as MockGainNode;

      expect(soloMock.connectedTo).toContain(destination);
      expect(accompMock.connectedTo).toContain(destination);
      expect(metroMock.connectedTo).toContain(destination);
      expect(droneMock.connectedTo).toContain(destination);
    });

    it('sets appropriate default gains on initialization', () => {
      expect(engine.soloGain.gain.value).toBe(1.0);
      expect(engine.accompanimentGain.gain.value).toBe(0.8);
      expect(engine.metronomeGain.gain.value).toBe(0.6);
      expect(engine.droneGain.gain.value).toBe(0.0);
    });
  });

  describe('applyMixerSettings', () => {
    it('updates volumes and respects mute toggles in real-time', () => {
      const mixer: MixerSettings = {
        soloVolume: 0.85,
        soloMuted: false,
        accompanimentVolume: 0.5,
        accompanimentMuted: true,
        metronomeVolume: 0.7,
        metronomeMuted: false,
        droneActive: false,
      };

      engine.applyMixerSettings(mixer);

      expect(engine.soloGain.gain.value).toBe(0.85);
      expect(engine.accompanimentGain.gain.value).toBe(0); // muted
      expect(engine.metronomeGain.gain.value).toBe(0.7);
      expect(engine.droneGain.gain.value).toBe(0);
    });

    it('sets solo gain to 0 when soloMuted is true, and restores volume when unmuted', () => {
      engine.applyMixerSettings({
        ...DEFAULT_MIXER_SETTINGS,
        soloVolume: 0.9,
        soloMuted: true,
      });
      expect(engine.soloGain.gain.value).toBe(0);

      engine.applyMixerSettings({
        ...DEFAULT_MIXER_SETTINGS,
        soloVolume: 0.9,
        soloMuted: false,
      });
      expect(engine.soloGain.gain.value).toBe(0.9);
    });

    it('sets metronome gain to 0 when metronomeMuted is true', () => {
      engine.applyMixerSettings({
        ...DEFAULT_MIXER_SETTINGS,
        metronomeVolume: 0.6,
        metronomeMuted: true,
      });
      expect(engine.metronomeGain.gain.value).toBe(0);
    });

    it('sets droneGain to droneVolume when droneActive is true', () => {
      engine.applyMixerSettings({
        ...DEFAULT_MIXER_SETTINGS,
        droneActive: true,
      });
      expect(engine.droneGain.gain.value).toBeGreaterThan(0);
    });
  });

  describe('scheduleNote', () => {
    it('routes Solo notes into soloGain', () => {
      const soloNote: PlayableNote = {
        id: 'solo-1',
        measureNumber: 1,
        partIndex: 0,
        isSolo: true,
        pitch: {
          step: 'A',
          alter: 0,
          octave: 4,
          midiNumber: 69,
          label: 'A4',
          frequencyHz440: 440,
        },
        startBeat: 0,
        durationBeats: 1,
        startTimeMs: 0,
        durationMs: 500,
        cursorStepIndex: 0,
        tiedNoteIds: [],
      };

      engine.scheduleNote(soloNote, 1.0, 0.5, 440);

      // Verify envelope gain connects to soloGain
      const envelopeGain = mockCtx.createdGains[mockCtx.createdGains.length - 1];
      expect(envelopeGain.connectedTo).toContain(engine.soloGain);
    });

    it('routes Accompaniment notes into accompanimentGain', () => {
      const accompNote: PlayableNote = {
        id: 'accomp-1',
        measureNumber: 1,
        partIndex: 1,
        isSolo: false,
        pitch: {
          step: 'C',
          alter: 0,
          octave: 4,
          midiNumber: 60,
          label: 'C4',
          frequencyHz440: 261.63,
        },
        startBeat: 0,
        durationBeats: 2,
        startTimeMs: 0,
        durationMs: 1000,
        cursorStepIndex: 0,
        tiedNoteIds: [],
      };

      engine.scheduleNote(accompNote, 1.0, 1.0, 440);

      const envelopeGain = mockCtx.createdGains[mockCtx.createdGains.length - 1];
      expect(envelopeGain.connectedTo).toContain(engine.accompanimentGain);
    });

    it('ignores rests (note.pitch === null) without creating audio nodes', () => {
      const restNote: PlayableNote = {
        id: 'rest-1',
        measureNumber: 1,
        partIndex: 0,
        isSolo: true,
        pitch: null,
        startBeat: 1,
        durationBeats: 1,
        startTimeMs: 500,
        durationMs: 500,
        cursorStepIndex: 1,
        tiedNoteIds: [],
      };

      const oscCountBefore = mockCtx.createdOscillators.length;
      engine.scheduleNote(restNote, 1.5, 0.5, 440);
      const oscCountAfter = mockCtx.createdOscillators.length;

      expect(oscCountAfter).toBe(oscCountBefore);
    });

    it('honors referenceA4Hz (440 vs 442 Hz)', () => {
      const noteA4: PlayableNote = {
        id: 'test-a4',
        measureNumber: 1,
        partIndex: 0,
        isSolo: true,
        pitch: {
          step: 'A',
          alter: 0,
          octave: 4,
          midiNumber: 69,
          label: 'A4',
          frequencyHz440: 440,
        },
        startBeat: 0,
        durationBeats: 1,
        startTimeMs: 0,
        durationMs: 500,
        cursorStepIndex: 0,
        tiedNoteIds: [],
      };

      // Standard A440
      engine.scheduleNote(noteA4, 0.0, 0.5, 440);
      const oscA440 = mockCtx.createdOscillators[mockCtx.createdOscillators.length - 2];
      expect(oscA440.frequency.value).toBe(440);

      // Orchestral A442
      engine.scheduleNote(noteA4, 1.0, 0.5, 442);
      const oscA442 = mockCtx.createdOscillators[mockCtx.createdOscillators.length - 2];
      expect(oscA442.frequency.value).toBe(442);
    });
  });

  describe('scheduleMetronomeClick', () => {
    it('schedules a downbeat accent at 1200 Hz connected to metronomeGain', () => {
      engine.scheduleMetronomeClick(0.5, true);

      const osc = mockCtx.createdOscillators[mockCtx.createdOscillators.length - 1];
      const clickGain = mockCtx.createdGains[mockCtx.createdGains.length - 1];

      expect(osc.frequency.value).toBe(1200);
      expect(osc.connectedTo).toContain(clickGain);
      expect(clickGain.connectedTo).toContain(engine.metronomeGain);
      expect(osc.start).toHaveBeenCalledWith(0.5);
    });

    it('schedules an upbeat click at 800 Hz connected to metronomeGain', () => {
      engine.scheduleMetronomeClick(1.0, false);

      const osc = mockCtx.createdOscillators[mockCtx.createdOscillators.length - 1];
      expect(osc.frequency.value).toBe(800);
      expect(osc.start).toHaveBeenCalledWith(1.0);
    });
  });

  describe('startDrone & stopDrone', () => {
    it('starts sustained reference tone at target MIDI note frequency through droneGain', () => {
      // Start drone at A4 (MIDI 69) with reference 440Hz
      engine.startDrone(69, 440);

      expect(engine.isDronePlaying).toBe(true);
      expect(engine.currentDroneMidi).toBe(69);
      expect(engine.currentDroneFrequency).toBe(440);
      expect(engine.droneGain.gain.value).toBeGreaterThan(0);

      const osc1 = mockCtx.createdOscillators[mockCtx.createdOscillators.length - 2];
      expect(osc1.frequency.value).toBe(440);
      expect(osc1.start).toHaveBeenCalled();
    });

    it('accurately computes 442 Hz reference drone frequency', () => {
      engine.startDrone(69, 442);
      expect(engine.currentDroneFrequency).toBe(442);
      const osc1 = mockCtx.createdOscillators[mockCtx.createdOscillators.length - 2];
      expect(osc1.frequency.value).toBe(442);
    });

    it('smoothly updates frequency when pitch changes while already playing', () => {
      engine.startDrone(69, 440); // A4 = 440 Hz
      expect(engine.currentDroneMidi).toBe(69);

      // Change drone pitch to D5 (MIDI 74, ~587.33 Hz)
      engine.startDrone(74, 440);

      expect(engine.isDronePlaying).toBe(true);
      expect(engine.currentDroneMidi).toBe(74);
      expect(engine.currentDroneFrequency).toBeCloseTo(587.33, 1);
    });

    it('stops drone cleanly on stopDrone()', () => {
      engine.startDrone(69, 440);
      expect(engine.isDronePlaying).toBe(true);

      engine.stopDrone();
      expect(engine.isDronePlaying).toBe(false);
      expect(engine.currentDroneMidi).toBeNull();
      expect(engine.currentDroneFrequency).toBeNull();
    });
  });
});

// =============================================================================
// 2. BeatScheduler Unit Tests
// =============================================================================

describe('BeatScheduler (beatScheduler.ts)', () => {
  let mockCtx: ReturnType<typeof createMockAudioContext>;
  let engine: AudioPlaybackEngine;
  let timeline: ScoreTimeline;

  beforeEach(() => {
    mockCtx = createMockAudioContext(0);
    engine = new AudioPlaybackEngine({ audioContext: mockCtx });
    timeline = createTestScoreTimeline();
  });

  afterEach(() => {
    engine.close();
  });

  describe('Count-in Scheduling', () => {
    it('schedules 1-bar (4 clicks) count-in metronome beats before score notes start', () => {
      const onCountInBeat = vi.fn();
      const onNoteScheduled = vi.fn();

      const scheduler = new BeatScheduler({
        timeline,
        audioEngine: engine,
        audioContext: mockCtx,
        countInBars: 1, // 4 beats at 120 BPM = 2.0s
        tempoScale: 1.0,
        callbacks: {
          onCountInBeat,
          onNoteScheduled,
        },
      });

      // t = 0.0: start playback
      mockCtx.currentTime = 0.0;
      scheduler.start();

      // Beat 1 of count-in is at t = 0.0s
      expect(onCountInBeat).toHaveBeenCalledWith(1, 1, 4);

      // Step to t = 0.5s: Beat 2 of count-in
      mockCtx.currentTime = 0.5;
      scheduler.tick();
      expect(onCountInBeat).toHaveBeenCalledWith(1, 2, 4);

      // Step to t = 1.0s: Beat 3 of count-in
      mockCtx.currentTime = 1.0;
      scheduler.tick();
      expect(onCountInBeat).toHaveBeenCalledWith(1, 3, 4);

      // Step to t = 1.5s: Beat 4 of count-in
      mockCtx.currentTime = 1.5;
      scheduler.tick();
      expect(onCountInBeat).toHaveBeenCalledWith(1, 4, 4);

      // Prior to t = 2.0s, no score notes should have started
      const notesBefore2s = onNoteScheduled.mock.calls.filter(
        ([_note, start]) => start < 2.0,
      );
      expect(notesBefore2s).toHaveLength(0);

      // Step to t = 2.0s: Count-in has finished, Measure 1 Solo Note A4 starts!
      mockCtx.currentTime = 2.0;
      scheduler.tick();

      const noteAt2s = onNoteScheduled.mock.calls.find(
        ([note]) => note.id === 'solo-m1-n1',
      );
      expect(noteAt2s).toBeDefined();
      expect(noteAt2s![1]).toBeCloseTo(2.0, 2); // noteStartAudioTimeSec = 2.0s

      scheduler.stop();
    });

    it('schedules 2-bar (8 clicks) count-in metronome beats before score notes start', () => {
      const onCountInBeat = vi.fn();
      const onNoteScheduled = vi.fn();

      const scheduler = new BeatScheduler({
        timeline,
        audioEngine: engine,
        audioContext: mockCtx,
        countInBars: 2, // 8 beats at 120 BPM = 4.0s
        tempoScale: 1.0,
        callbacks: {
          onCountInBeat,
          onNoteScheduled,
        },
      });

      mockCtx.currentTime = 0.0;
      scheduler.start();

      // Jump forward to t = 3.5s (during 2nd bar of count-in)
      mockCtx.currentTime = 3.5;
      scheduler.tick();

      // Should have registered count-in beats up to bar 2
      expect(onCountInBeat).toHaveBeenCalledWith(1, 1, 8);
      expect(onCountInBeat).toHaveBeenCalledWith(2, 4, 8);

      // Step to t = 4.0s: Measure 1 begins
      mockCtx.currentTime = 4.0;
      scheduler.tick();

      const noteAt4s = onNoteScheduled.mock.calls.find(
        ([note]) => note.id === 'solo-m1-n1',
      );
      expect(noteAt4s).toBeDefined();
      expect(noteAt4s![1]).toBeCloseTo(4.0, 2);

      scheduler.stop();
    });
  });

  describe('tempoScale Dynamic Scaling', () => {
    it('scales beat and note duration by 0.5x (half tempo => double duration)', () => {
      const onNoteScheduled = vi.fn();

      const scheduler = new BeatScheduler({
        timeline,
        audioEngine: engine,
        audioContext: mockCtx,
        countInBars: 0, // Direct start without count-in
        tempoScale: 0.5, // 120 * 0.5 = 60 BPM => 1 beat = 1.0s (normally 0.5s)
        callbacks: {
          onNoteScheduled,
        },
      });

      mockCtx.currentTime = 0.0;
      scheduler.start();

      // Note 'solo-m1-n1' is 1 beat long. At 60 BPM, 1 beat = 1.0s duration!
      const scheduledNoteCall = onNoteScheduled.mock.calls.find(
        ([n]) => n.id === 'solo-m1-n1',
      );
      expect(scheduledNoteCall).toBeDefined();
      const [_note, startSec, endSec] = scheduledNoteCall!;
      expect(startSec).toBeCloseTo(0.0, 2);
      expect(endSec - startSec).toBeCloseTo(1.0, 2); // 1.0s duration instead of 0.5s

      scheduler.stop();
    });

    it('scales beat and note duration by 1.5x (150% tempo => shorter duration)', () => {
      const onNoteScheduled = vi.fn();

      const scheduler = new BeatScheduler({
        timeline,
        audioEngine: engine,
        audioContext: mockCtx,
        countInBars: 0,
        tempoScale: 1.5, // 120 * 1.5 = 180 BPM => 1 beat = 60/180 = 0.333s
        callbacks: {
          onNoteScheduled,
        },
      });

      mockCtx.currentTime = 0.0;
      scheduler.start();

      const scheduledNoteCall = onNoteScheduled.mock.calls.find(
        ([n]) => n.id === 'solo-m1-n1',
      );
      expect(scheduledNoteCall).toBeDefined();
      const [_note, startSec, endSec] = scheduledNoteCall!;
      expect(endSec - startSec).toBeCloseTo(60 / 180, 2); // ~0.333s

      scheduler.stop();
    });
  });

  describe('MeasureLoopRange ({ startMeasure, endMeasure })', () => {
    it('constrains playback to measures 2–3 and wraps back cleanly on loop completion', () => {
      const onNoteScheduled = vi.fn();
      const onLoopRestart = vi.fn();

      const scheduler = new BeatScheduler({
        timeline,
        audioEngine: engine,
        audioContext: mockCtx,
        countInBars: 0,
        tempoScale: 1.0, // 0.5s per beat
        loopRange: { startMeasure: 2, endMeasure: 3 },
        callbacks: {
          onNoteScheduled,
          onLoopRestart,
        },
      });

      mockCtx.currentTime = 0.0;
      scheduler.start();

      // Measure 1 notes should NOT be scheduled
      const measure1Notes = onNoteScheduled.mock.calls.filter(
        ([n]) => n.measureNumber === 1,
      );
      expect(measure1Notes).toHaveLength(0);

      // Measure 2 note should start right away at t = 0.0s
      const measure2Note = onNoteScheduled.mock.calls.find(
        ([n]) => n.measureNumber === 2,
      );
      expect(measure2Note).toBeDefined();
      expect(measure2Note![1]).toBeCloseTo(0.0, 2);

      // Measure 2 (4 beats = 2.0s) + Measure 3 (4 beats = 2.0s) = 4.0s total cycle
      // Advance to t = 4.0s when Measure 3 ends
      mockCtx.currentTime = 4.0;
      scheduler.tick();

      // Loop restart callback should be invoked!
      expect(onLoopRestart).toHaveBeenCalledWith(1);

      // And measure 2 should be scheduled again for the next cycle
      const allM2Notes = onNoteScheduled.mock.calls.filter(
        ([n]) => n.measureNumber === 2,
      );
      expect(allM2Notes.length).toBeGreaterThanOrEqual(2);

      scheduler.stop();
    });
  });

  describe('Cursor step callbacks and completion', () => {
    it('emits onCursorStepChange as audio hardware time reaches each note onset', () => {
      const onCursorStepChange = vi.fn();

      const scheduler = new BeatScheduler({
        timeline,
        audioEngine: engine,
        audioContext: mockCtx,
        countInBars: 0,
        tempoScale: 1.0,
        callbacks: {
          onCursorStepChange,
        },
      });

      mockCtx.currentTime = 0.0;
      scheduler.start();

      // Beat 0 note: cursorStepIndex 0
      expect(onCursorStepChange).toHaveBeenCalledWith(0, 1, 1);

      // Advance to beat 1 (rest with cursorStepIndex 1 at 0.5s)
      mockCtx.currentTime = 0.5;
      scheduler.tick();
      expect(onCursorStepChange).toHaveBeenCalledWith(1, 1, 2);

      scheduler.stop();
    });

    it('emits onPlaybackComplete when entire score finishes with loopRange: null', () => {
      const onPlaybackComplete = vi.fn();

      const scheduler = new BeatScheduler({
        timeline,
        audioEngine: engine,
        audioContext: mockCtx,
        countInBars: 0,
        tempoScale: 1.0,
        loopRange: null,
        callbacks: {
          onPlaybackComplete,
        },
      });

      mockCtx.currentTime = 0.0;
      scheduler.start();

      // Entire piece is 3 measures * 4 beats * 0.5s = 6.0s
      mockCtx.currentTime = 6.0;
      scheduler.tick();

      expect(onPlaybackComplete).toHaveBeenCalled();
      expect(scheduler.isPlaying).toBe(false);
    });
  });

  describe('Pause & Resume', () => {
    it('pauses and resumes playback smoothly', () => {
      const scheduler = new BeatScheduler({
        timeline,
        audioEngine: engine,
        audioContext: mockCtx,
        countInBars: 0,
        tempoScale: 1.0,
      });

      mockCtx.currentTime = 0.0;
      scheduler.start();
      expect(scheduler.isPlaying).toBe(true);

      scheduler.pause();
      expect(scheduler.isPaused).toBe(true);
      expect(scheduler.isPlaying).toBe(false);

      mockCtx.currentTime = 2.5;
      scheduler.resume();
      expect(scheduler.isPlaying).toBe(true);
      expect(scheduler.isPaused).toBe(false);

      scheduler.stop();
    });
  });
});

// =============================================================================
// 3. MixerPanel Component Unit Tests
// =============================================================================

describe('MixerPanel Component (MixerPanel.tsx)', () => {
  const defaultMixer: MixerSettings = {
    soloVolume: 0.9,
    soloMuted: false,
    accompanimentVolume: 0.75,
    accompanimentMuted: false,
    metronomeVolume: 0.6,
    metronomeMuted: false,
    droneActive: false,
  };

  it('renders volume sliders and mute buttons for Solo, Accompaniment, and Metronome', () => {
    render(
      React.createElement(MixerPanel, {
        mixer: defaultMixer,
        onMixerChange: vi.fn(),
        tempoScale: 1.0,
        onTempoScaleChange: vi.fn(),
        countInBars: 1,
        onCountInBarsChange: vi.fn(),
      }),
    );

    expect(screen.getByLabelText('Solo Violin Volume')).toBeInTheDocument();
    expect(screen.getByLabelText('Accompaniment Volume')).toBeInTheDocument();
    expect(screen.getByLabelText('Metronome Volume')).toBeInTheDocument();

    expect(screen.getByLabelText('Mute Solo Violin')).toBeInTheDocument();
    expect(screen.getByLabelText('Mute Accompaniment')).toBeInTheDocument();
    expect(screen.getByLabelText('Mute Metronome')).toBeInTheDocument();
  });

  it('handles volume slider changes', () => {
    const onMixerChange = vi.fn();
    render(
      React.createElement(MixerPanel, {
        mixer: defaultMixer,
        onMixerChange,
        tempoScale: 1.0,
        onTempoScaleChange: vi.fn(),
        countInBars: 1,
        onCountInBarsChange: vi.fn(),
      }),
    );

    const soloSlider = screen.getByLabelText('Solo Violin Volume');
    fireEvent.change(soloSlider, { target: { value: '80' } });

    expect(onMixerChange).toHaveBeenCalledWith(
      expect.objectContaining({ soloVolume: 0.8 }),
    );
  });

  it('handles mute button toggles', () => {
    const onMixerChange = vi.fn();
    render(
      React.createElement(MixerPanel, {
        mixer: defaultMixer,
        onMixerChange,
        tempoScale: 1.0,
        onTempoScaleChange: vi.fn(),
        countInBars: 1,
        onCountInBarsChange: vi.fn(),
      }),
    );

    const muteSoloBtn = screen.getByLabelText('Mute Solo Violin');
    fireEvent.click(muteSoloBtn);

    expect(onMixerChange).toHaveBeenCalledWith(
      expect.objectContaining({ soloMuted: true }),
    );
  });

  it('renders quick tempo preset buttons and handles clicks', () => {
    const onTempoScaleChange = vi.fn();
    render(
      React.createElement(MixerPanel, {
        mixer: defaultMixer,
        onMixerChange: vi.fn(),
        tempoScale: 1.0,
        onTempoScaleChange,
        countInBars: 1,
        onCountInBarsChange: vi.fn(),
      }),
    );

    // Preset buttons: 50%, 75%, 100%, 125%
    const preset75 = screen.getByRole('button', { name: '75%' });
    fireEvent.click(preset75);
    expect(onTempoScaleChange).toHaveBeenCalledWith(0.75);

    const preset125 = screen.getByRole('button', { name: '125%' });
    fireEvent.click(preset125);
    expect(onTempoScaleChange).toHaveBeenCalledWith(1.25);
  });

  it('switches count-in bars between 1 Bar and 2 Bars', () => {
    const onCountInBarsChange = vi.fn();
    render(
      React.createElement(MixerPanel, {
        mixer: defaultMixer,
        onMixerChange: vi.fn(),
        tempoScale: 1.0,
        onTempoScaleChange: vi.fn(),
        countInBars: 1,
        onCountInBarsChange,
      }),
    );

    const twoBarsBtn = screen.getByLabelText('2 Bars Count-in');
    fireEvent.click(twoBarsBtn);
    expect(onCountInBarsChange).toHaveBeenCalledWith(2);
  });

  it('renders reference drone button and displays target note name', () => {
    const onToggleDrone = vi.fn();
    render(
      React.createElement(MixerPanel, {
        mixer: { ...defaultMixer, droneActive: false },
        onMixerChange: vi.fn(),
        tempoScale: 1.0,
        onTempoScaleChange: vi.fn(),
        countInBars: 1,
        onCountInBarsChange: vi.fn(),
        droneTargetNoteName: 'A4',
        onToggleDrone,
      }),
    );

    expect(screen.getByText('Play Reference Drone (A4)')).toBeInTheDocument();
    expect(screen.getByText('A4')).toBeInTheDocument();

    const droneBtn = screen.getByLabelText('Play Reference Drone');
    fireEvent.click(droneBtn);
    expect(onToggleDrone).toHaveBeenCalledTimes(1);
  });

  it('shows Stop Drone state when drone is active', () => {
    render(
      React.createElement(MixerPanel, {
        mixer: { ...defaultMixer, droneActive: true },
        onMixerChange: vi.fn(),
        tempoScale: 1.0,
        onTempoScaleChange: vi.fn(),
        countInBars: 1,
        onCountInBarsChange: vi.fn(),
        droneTargetNoteName: 'D5',
      }),
    );

    expect(screen.getByText('Stop Drone (D5)')).toBeInTheDocument();
    expect(screen.getByLabelText('Stop Drone')).toBeInTheDocument();
  });
});
