import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

import {
  MIN_VIOLIN_HZ,
  MAX_VIOLIN_HZ,
  midiNoteToFrequency,
  frequencyToCentsDelta,
  detectClosestMidiNote,
  computeRms,
} from '../../src/modules/pitch-detection/pitchMath';

import {
  PitchSmoothingFilter,
} from '../../src/modules/pitch-detection/pitchFilter';

import {
  MicSessionManager,
  listAudioInputDevices,
} from '../../src/modules/pitch-detection/micSessionManager';

import { TunerHUD } from '../../src/components/TunerHUD';
import { type PitchSample, type PlayableNote } from '../../src/types/music';

// =============================================================================
// 1. Pitch Math Suite
// =============================================================================
describe('Pitch Math (pitchMath.ts)', () => {
  describe('Constants', () => {
    it('defines MIN_VIOLIN_HZ at 175 Hz (below open G3=196 Hz)', () => {
      expect(MIN_VIOLIN_HZ).toBe(175);
    });

    it('defines MAX_VIOLIN_HZ at 3600 Hz (above high A7=3520 Hz)', () => {
      expect(MAX_VIOLIN_HZ).toBe(3600);
    });
  });

  describe('midiNoteToFrequency', () => {
    it('accurately computes open strings at standard A4 = 440 Hz reference', () => {
      // Open G3 = MIDI 55 (~196.00 Hz)
      expect(midiNoteToFrequency(55, 440)).toBeCloseTo(195.9977, 2);

      // Open D4 = MIDI 62 (~293.66 Hz)
      expect(midiNoteToFrequency(62, 440)).toBeCloseTo(293.6648, 2);

      // Open A4 = MIDI 69 (440.00 Hz)
      expect(midiNoteToFrequency(69, 440)).toBe(440);

      // Open E5 = MIDI 76 (~659.26 Hz)
      expect(midiNoteToFrequency(76, 440)).toBeCloseTo(659.2551, 2);
    });

    it('accurately computes open strings at orchestral A4 = 442 Hz reference', () => {
      // Open G3 = MIDI 55 at 442 Hz
      expect(midiNoteToFrequency(55, 442)).toBeCloseTo(196.8886, 2);

      // Open D4 = MIDI 62 at 442 Hz
      expect(midiNoteToFrequency(62, 442)).toBeCloseTo(294.9996, 2);

      // Open A4 = MIDI 69 at 442 Hz
      expect(midiNoteToFrequency(69, 442)).toBe(442);

      // Open E5 = MIDI 76 at 442 Hz
      expect(midiNoteToFrequency(76, 442)).toBeCloseTo(662.2517, 2);
    });

    it('defaults to referenceA4Hz = 440 when not specified', () => {
      expect(midiNoteToFrequency(69)).toBe(440);
    });
  });

  describe('frequencyToCentsDelta', () => {
    it('returns 0 cents when detected frequency exactly matches target', () => {
      expect(frequencyToCentsDelta(440, 69, 440)).toBeCloseTo(0, 5);
      expect(frequencyToCentsDelta(442, 69, 442)).toBeCloseTo(0, 5);
      expect(frequencyToCentsDelta(195.9977, 55, 440)).toBeCloseTo(0, 2);
    });

    it('calculates sharp (positive) cent offsets correctly', () => {
      // +10 cents sharp of A4 (440 Hz)
      const sharp10 = 440 * Math.pow(2, 10 / 1200);
      expect(frequencyToCentsDelta(sharp10, 69, 440)).toBeCloseTo(10, 3);

      // +25 cents sharp of G3 (55)
      const g3Hz = midiNoteToFrequency(55, 440);
      const sharp25 = g3Hz * Math.pow(2, 25 / 1200);
      expect(frequencyToCentsDelta(sharp25, 55, 440)).toBeCloseTo(25, 3);
    });

    it('calculates flat (negative) cent offsets correctly', () => {
      // -15 cents flat of A4 (440 Hz)
      const flat15 = 440 * Math.pow(2, -15 / 1200);
      expect(frequencyToCentsDelta(flat15, 69, 440)).toBeCloseTo(-15, 3);

      // -30 cents flat of E5 (76)
      const e5Hz = midiNoteToFrequency(76, 440);
      const flat30 = e5Hz * Math.pow(2, -30 / 1200);
      expect(frequencyToCentsDelta(flat30, 76, 440)).toBeCloseTo(-30, 3);
    });

    it('computes octave deviations as ±1200 cents', () => {
      expect(frequencyToCentsDelta(880, 69, 440)).toBeCloseTo(1200, 3);
      expect(frequencyToCentsDelta(220, 69, 440)).toBeCloseTo(-1200, 3);
    });

    it('handles zero or negative detected frequency gracefully without throwing', () => {
      expect(frequencyToCentsDelta(0, 69, 440)).toBe(0);
      expect(frequencyToCentsDelta(-100, 69, 440)).toBe(0);
    });
  });

  describe('detectClosestMidiNote', () => {
    it('detects exact open violin strings at A4=440 Hz', () => {
      const g3 = detectClosestMidiNote(195.998, 440);
      expect(g3.midiNumber).toBe(55);
      expect(g3.step).toBe('G');
      expect(g3.alter).toBe(0);
      expect(g3.octave).toBe(3);
      expect(g3.label).toBe('G3');
      expect(g3.centsDelta).toBeCloseTo(0, 1);
      expect(g3.targetFrequencyHz).toBeCloseTo(195.998, 2);

      const d4 = detectClosestMidiNote(293.665, 440);
      expect(d4.midiNumber).toBe(62);
      expect(d4.label).toBe('D4');
      expect(d4.centsDelta).toBeCloseTo(0, 1);

      const a4 = detectClosestMidiNote(440.0, 440);
      expect(a4.midiNumber).toBe(69);
      expect(a4.label).toBe('A4');
      expect(a4.centsDelta).toBeCloseTo(0, 1);

      const e5 = detectClosestMidiNote(659.255, 440);
      expect(e5.midiNumber).toBe(76);
      expect(e5.label).toBe('E5');
      expect(e5.centsDelta).toBeCloseTo(0, 1);
    });

    it('detects exact open violin strings at A4=442 Hz', () => {
      const a4 = detectClosestMidiNote(442.0, 442);
      expect(a4.midiNumber).toBe(69);
      expect(a4.label).toBe('A4');
      expect(a4.centsDelta).toBeCloseTo(0, 1);

      const g3 = detectClosestMidiNote(196.889, 442);
      expect(g3.midiNumber).toBe(55);
      expect(g3.label).toBe('G3');
      expect(g3.centsDelta).toBeCloseTo(0, 1);
    });

    it('identifies sharp notes like C#4 and F#4 correctly', () => {
      // C#4 = MIDI 61 (~277.18 Hz at A4=440)
      const cSharp4 = detectClosestMidiNote(277.18, 440);
      expect(cSharp4.midiNumber).toBe(61);
      expect(cSharp4.step).toBe('C');
      expect(cSharp4.alter).toBe(1);
      expect(cSharp4.octave).toBe(4);
      expect(cSharp4.label).toBe('C#4');

      // F#4 = MIDI 66 (~369.99 Hz at A4=440)
      const fSharp4 = detectClosestMidiNote(370.0, 440);
      expect(fSharp4.midiNumber).toBe(66);
      expect(fSharp4.step).toBe('F');
      expect(fSharp4.alter).toBe(1);
      expect(fSharp4.label).toBe('F#4');
    });

    it('accurately computes sharp and flat cents deltas for detuned notes', () => {
      // 445 Hz vs 440 Hz -> ~+19.56 cents sharp
      const sharpA4 = detectClosestMidiNote(445, 440);
      expect(sharpA4.midiNumber).toBe(69);
      expect(sharpA4.label).toBe('A4');
      expect(sharpA4.centsDelta).toBeCloseTo(19.56, 1);

      // 430 Hz vs 440 Hz -> ~-39.77 cents flat
      const flatA4 = detectClosestMidiNote(430, 440);
      expect(flatA4.midiNumber).toBe(69);
      expect(flatA4.label).toBe('A4');
      expect(flatA4.centsDelta).toBeCloseTo(-39.77, 1);
    });

    it('handles zero or negative frequency gracefully', () => {
      const res = detectClosestMidiNote(0);
      expect(res.midiNumber).toBe(0);
      expect(res.label).toBe('C-1');
      expect(res.centsDelta).toBe(0);
    });
  });

  describe('computeRms', () => {
    it('returns 0 for empty Float32Array', () => {
      expect(computeRms(new Float32Array(0))).toBe(0);
    });

    it('returns 0 for all-zero buffer', () => {
      const buf = new Float32Array(512);
      expect(computeRms(buf)).toBe(0);
    });

    it('returns 1.0 for DC buffer of 1s', () => {
      const buf = new Float32Array(256).fill(1.0);
      expect(computeRms(buf)).toBeCloseTo(1.0, 5);
    });

    it('computes theoretical RMS of a pure sine wave (Amplitude / sqrt(2))', () => {
      const N = 2048;
      const buf = new Float32Array(N);
      const amp = 0.8;
      for (let i = 0; i < N; i++) {
        buf[i] = amp * Math.sin((2 * Math.PI * 10 * i) / N);
      }
      const expectedRms = amp / Math.SQRT2;
      expect(computeRms(buf)).toBeCloseTo(expectedRms, 2);
    });
  });
});

// =============================================================================
// 2. Pitch Smoothing Filter Suite
// =============================================================================
describe('Pitch Smoothing Filter (pitchFilter.ts)', () => {
  let filter: PitchSmoothingFilter;

  beforeEach(() => {
    filter = new PitchSmoothingFilter();
  });

  it('initializes with specified default options', () => {
    expect(filter.minClarity).toBe(0.85);
    expect(filter.minRms).toBe(0.008);
    expect(filter.windowSize).toBe(3);
    expect(filter.silenceResetSec).toBe(0.08);
    expect(filter.window).toHaveLength(0);
    expect(filter.lastValidAudioTimeSec).toBeNull();
  });

  it('accepts custom filter options', () => {
    const custom = new PitchSmoothingFilter({
      minClarity: 0.9,
      minRms: 0.02,
      windowSize: 5,
      silenceResetSec: 0.15,
    });
    expect(custom.minClarity).toBe(0.9);
    expect(custom.minRms).toBe(0.02);
    expect(custom.windowSize).toBe(5);
    expect(custom.silenceResetSec).toBe(0.15);
  });

  it('rejects samples with clarity < minClarity (bow scratch / scrape)', () => {
    const lowClaritySample: PitchSample = {
      frequencyHz: 440,
      clarity: 0.84, // Below 0.85 default
      rms: 0.05,
      audioTimeSec: 1.0,
    };
    expect(filter.processSample(lowClaritySample)).toBeNull();
    expect(filter.window).toHaveLength(0);
  });

  it('rejects samples with rms < minRms (room noise / silence floor)', () => {
    const lowRmsSample: PitchSample = {
      frequencyHz: 440,
      clarity: 0.95,
      rms: 0.007, // Below 0.008 default
      audioTimeSec: 1.0,
    };
    expect(filter.processSample(lowRmsSample)).toBeNull();
    expect(filter.window).toHaveLength(0);
  });

  it('rejects frequencies outside acoustic violin range [175 Hz, 3600 Hz]', () => {
    // Too low (e.g. 150 Hz)
    const lowPitch: PitchSample = {
      frequencyHz: 150,
      clarity: 0.95,
      rms: 0.05,
      audioTimeSec: 1.0,
    };
    expect(filter.processSample(lowPitch)).toBeNull();

    // Too high (e.g. 4000 Hz)
    const highPitch: PitchSample = {
      frequencyHz: 4000,
      clarity: 0.95,
      rms: 0.05,
      audioTimeSec: 1.02,
    };
    expect(filter.processSample(highPitch)).toBeNull();
  });

  it('accepts valid samples within bounds and populates sliding window', () => {
    const validSample: PitchSample = {
      frequencyHz: 440,
      clarity: 0.95,
      rms: 0.05,
      audioTimeSec: 1.0,
    };
    const result = filter.processSample(validSample);
    expect(result).not.toBeNull();
    expect(result?.frequencyHz).toBe(440);
    expect(result?.clarity).toBe(0.95);
    expect(result?.rms).toBe(0.05);
    expect(filter.window).toEqual([440]);
  });

  it('suppresses single-frame octave jumps via 3-frame median filtering', () => {
    // Simulating open G3 (196 Hz) with a single-frame harmonic octave spike (392 Hz)
    // Frame 1: 196 Hz
    const f1 = filter.processSample({
      frequencyHz: 196,
      clarity: 0.92,
      rms: 0.04,
      audioTimeSec: 0.02,
    });
    expect(f1?.frequencyHz).toBe(196);

    // Frame 2: 392 Hz (octave jump artifact)
    const f2 = filter.processSample({
      frequencyHz: 392,
      clarity: 0.90,
      rms: 0.04,
      audioTimeSec: 0.04,
    });
    // With 2 frames [196, 392], median is (196 + 392)/2 = 294
    expect(f2?.frequencyHz).toBe(294);

    // Frame 3: 196 Hz (recovers to true fundamental)
    const f3 = filter.processSample({
      frequencyHz: 196,
      clarity: 0.93,
      rms: 0.04,
      audioTimeSec: 0.06,
    });
    // With 3 frames [196, 392, 196], sorted is [196, 196, 392], median index 1 is 196 Hz!
    expect(f3?.frequencyHz).toBe(196);

    // Frame 4: 196 Hz (steady fundamental)
    const f4 = filter.processSample({
      frequencyHz: 196,
      clarity: 0.94,
      rms: 0.04,
      audioTimeSec: 0.08,
    });
    // Window is now [392, 196, 196], sorted is [196, 196, 392], median is 196 Hz!
    expect(f4?.frequencyHz).toBe(196);
  });

  it('resets sliding window when silence exceeds silenceResetSec (80ms)', () => {
    // 1. Play G3 (196 Hz) at t = 0.02
    filter.processSample({
      frequencyHz: 196,
      clarity: 0.92,
      rms: 0.04,
      audioTimeSec: 0.02,
    });
    expect(filter.window).toEqual([196]);

    // 2. Silence/invalid sample at t = 0.12 (gap of 100ms > 80ms silence threshold)
    const silent = filter.processSample({
      frequencyHz: 196,
      clarity: 0.1, // invalid
      rms: 0.001,
      audioTimeSec: 0.12,
    });
    expect(silent).toBeNull();
    // Window should be cleared due to elapsed silence
    expect(filter.window).toHaveLength(0);

    // 3. New note played at t = 0.14: E5 (659 Hz)
    const newNote = filter.processSample({
      frequencyHz: 659,
      clarity: 0.95,
      rms: 0.05,
      audioTimeSec: 0.14,
    });
    // Should immediately return 659 without being contaminated by the old 196 Hz sample
    expect(newNote?.frequencyHz).toBe(659);
    expect(filter.window).toEqual([659]);
  });

  it('resets window when time gap between valid samples exceeds silenceResetSec', () => {
    // First note at t = 0.0
    filter.processSample({
      frequencyHz: 196,
      clarity: 0.95,
      rms: 0.05,
      audioTimeSec: 0.0,
    });
    expect(filter.window).toEqual([196]);

    // Next valid note comes at t = 1.0 (1 full second later)
    const sampleAfterPause = filter.processSample({
      frequencyHz: 440,
      clarity: 0.95,
      rms: 0.05,
      audioTimeSec: 1.0,
    });

    expect(sampleAfterPause?.frequencyHz).toBe(440);
    expect(filter.window).toEqual([440]);
  });

  it('clears window and timing on reset()', () => {
    filter.processSample({
      frequencyHz: 440,
      clarity: 0.95,
      rms: 0.05,
      audioTimeSec: 1.0,
    });
    expect(filter.window).toHaveLength(1);

    filter.reset();
    expect(filter.window).toHaveLength(0);
    expect(filter.lastValidAudioTimeSec).toBeNull();
  });
});

// =============================================================================
// 3. Mic Session Manager Suite
// =============================================================================
describe('Mic Session Manager (micSessionManager.ts)', () => {
  let originalMediaDevices: MediaDevices | undefined;
  let mockGetUserMedia: ReturnType<typeof vi.fn>;
  let mockEnumerateDevices: ReturnType<typeof vi.fn>;
  let mockTrackStop: ReturnType<typeof vi.fn>;
  let mockStream: { getTracks: () => Array<{ stop: () => void; kind: string }> };

  // Mock AudioContext factory
  function createMockAudioContext(sampleRate = 44100, currentTime = 1.25) {
    return {
      sampleRate,
      currentTime,
      state: 'running' as AudioContextState,
      resume: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      createMediaStreamSource: vi.fn().mockReturnValue({
        connect: vi.fn(),
        disconnect: vi.fn(),
      }),
      createAnalyser: vi.fn().mockReturnValue({
        fftSize: 2048,
        connect: vi.fn(),
        disconnect: vi.fn(),
        getFloatTimeDomainData: vi.fn((buf: Float32Array) => {
          // Fill buffer with 440 Hz sine wave
          const sr = sampleRate;
          for (let i = 0; i < buf.length; i++) {
            buf[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr);
          }
        }),
      }),
    } as unknown as AudioContext;
  }

  beforeEach(() => {
    originalMediaDevices = navigator.mediaDevices;
    mockTrackStop = vi.fn();
    mockStream = {
      getTracks: () => [
        { stop: mockTrackStop, kind: 'audio' },
        { stop: mockTrackStop, kind: 'audio' },
      ],
    };

    mockGetUserMedia = vi.fn().mockResolvedValue(mockStream);
    mockEnumerateDevices = vi.fn().mockResolvedValue([
      { deviceId: 'default', kind: 'audioinput', label: 'Default Microphone' },
      { deviceId: 'usb-mic-1', kind: 'audioinput', label: 'Shure MV5' },
      { deviceId: 'cam-mic', kind: 'audioinput', label: '' },
      { deviceId: 'speaker-1', kind: 'audiooutput', label: 'Speakers' },
      { deviceId: 'webcam-1', kind: 'videoinput', label: 'HD Webcam' },
    ]);

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: mockGetUserMedia,
        enumerateDevices: mockEnumerateDevices,
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    if (originalMediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: originalMediaDevices,
        writable: true,
        configurable: true,
      });
    }
  });

  describe('listAudioInputDevices', () => {
    it('filters devices to audioinput and assigns fallback labels when empty', async () => {
      const devices = await listAudioInputDevices();
      expect(devices).toHaveLength(3);
      expect(devices[0]).toEqual({ deviceId: 'default', label: 'Default Microphone' });
      expect(devices[1]).toEqual({ deviceId: 'usb-mic-1', label: 'Shure MV5' });
      expect(devices[2]).toEqual({ deviceId: 'cam-mic', label: 'Microphone 3' });
    });

    it('returns empty array when navigator.mediaDevices is undefined', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      const devices = await listAudioInputDevices();
      expect(devices).toEqual([]);
    });
  });

  describe('MicSessionManager execution & constraints', () => {
    it('requests exact unfiltered MediaTrackConstraints without deviceId', async () => {
      const mockCtx = createMockAudioContext(44100);
      const manager = new MicSessionManager({ audioContext: mockCtx });

      await manager.start();

      expect(mockGetUserMedia).toHaveBeenCalledWith({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      expect(manager.isRunning).toBe(true);
      expect(manager.selectedDeviceId).toBeNull();

      manager.stop();
    });

    it('requests exact unfiltered MediaTrackConstraints with exact deviceId selection', async () => {
      const mockCtx = createMockAudioContext(44100);
      const manager = new MicSessionManager({ audioContext: mockCtx });

      await manager.start('usb-mic-1');

      expect(mockGetUserMedia).toHaveBeenCalledWith({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          deviceId: { exact: 'usb-mic-1' },
        },
      });
      expect(manager.selectedDeviceId).toBe('usb-mic-1');

      manager.stop();
    });

    it('reads audioContext.sampleRate dynamically after acquisition (e.g. 16kHz Bluetooth HFP vs 48kHz)', async () => {
      // 16kHz (Bluetooth Hands-Free Profile)
      const hfpCtx = createMockAudioContext(16000, 2.5);
      const managerHfp = new MicSessionManager({ audioContext: hfpCtx });

      await managerHfp.start();
      expect(managerHfp.sampleRate).toBe(16000);

      let capturedSample: PitchSample | null = null;
      managerHfp.subscribe((sample) => {
        capturedSample = sample;
      });

      managerHfp.tick();
      expect(capturedSample).not.toBeNull();
      // Should detect ~440 Hz accurately using the 16000 sample rate
      expect(capturedSample!.frequencyHz).toBeCloseTo(440, 0);
      expect(capturedSample!.audioTimeSec).toBe(2.5);

      managerHfp.stop();

      // 48kHz (High fidelity USB mic)
      const hiFiCtx = createMockAudioContext(48000, 3.75);
      const managerHiFi = new MicSessionManager({ audioContext: hiFiCtx });

      await managerHiFi.start();
      expect(managerHiFi.sampleRate).toBe(48000);

      capturedSample = null;
      managerHiFi.subscribe((sample) => {
        capturedSample = sample;
      });

      managerHiFi.tick();
      expect(capturedSample).not.toBeNull();
      expect(capturedSample!.frequencyHz).toBeCloseTo(440, 0);
      expect(capturedSample!.audioTimeSec).toBe(3.75);

      managerHiFi.stop();
    });

    it('invokes subscribers on tick without throwing', async () => {
      const mockCtx = createMockAudioContext(44100);
      const manager = new MicSessionManager({ audioContext: mockCtx });
      await manager.start();

      const subscriber1 = vi.fn();
      const subscriber2 = vi.fn();

      const unsubscribe1 = manager.subscribe(subscriber1);
      manager.subscribe(subscriber2);

      manager.tick();
      expect(subscriber1).toHaveBeenCalledTimes(1);
      expect(subscriber2).toHaveBeenCalledTimes(1);

      // Unsubscribe listener 1
      unsubscribe1();
      manager.tick();
      expect(subscriber1).toHaveBeenCalledTimes(1);
      expect(subscriber2).toHaveBeenCalledTimes(2);

      manager.stop();
    });

    it('stop() cleanly stops all MediaStreamTracks and clears interval timer', async () => {
      const mockCtx = createMockAudioContext(44100);
      const manager = new MicSessionManager({ audioContext: mockCtx });

      await manager.start();
      expect(manager.isRunning).toBe(true);

      manager.stop();

      expect(mockTrackStop).toHaveBeenCalled();
      expect(manager.isRunning).toBe(false);
      expect(manager.stream).toBeNull();
      expect(manager.analyserNode).toBeNull();
      expect(manager.lastFilteredSample).toBeNull();
    });

    it('resumes suspended AudioContext during start()', async () => {
      const mockCtx = createMockAudioContext(44100);
      (mockCtx as { state: AudioContextState }).state = 'suspended';

      const manager = new MicSessionManager({ audioContext: mockCtx });
      await manager.start();

      expect(mockCtx.resume).toHaveBeenCalled();
      manager.stop();
    });
  });
});

// =============================================================================
// 4. Tuner HUD Component Suite
// =============================================================================
describe('Tuner HUD Component (TunerHUD.tsx)', () => {
  let mockTrackStop: ReturnType<typeof vi.fn>;
  let mockGetUserMedia: ReturnType<typeof vi.fn>;
  let mockEnumerateDevices: ReturnType<typeof vi.fn>;

  function createMockAudioContext(sampleRate = 44100) {
    return {
      sampleRate,
      currentTime: 1.0,
      state: 'running' as AudioContextState,
      resume: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      createMediaStreamSource: vi.fn().mockReturnValue({
        connect: vi.fn(),
        disconnect: vi.fn(),
      }),
      createAnalyser: vi.fn().mockReturnValue({
        fftSize: 2048,
        connect: vi.fn(),
        disconnect: vi.fn(),
        getFloatTimeDomainData: vi.fn((buf: Float32Array) => {
          for (let i = 0; i < buf.length; i++) {
            buf[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
          }
        }),
      }),
    } as unknown as AudioContext;
  }

  beforeEach(() => {
    mockTrackStop = vi.fn();
    mockGetUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: mockTrackStop, kind: 'audio' }],
    });
    mockEnumerateDevices = vi.fn().mockResolvedValue([
      { deviceId: 'mic-1', kind: 'audioinput', label: 'Internal Mic' },
      { deviceId: 'mic-2', kind: 'audioinput', label: 'USB Audio Device' },
    ]);

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: mockGetUserMedia,
        enumerateDevices: mockEnumerateDevices,
      },
      writable: true,
      configurable: true,
    });
  });

  it('renders idle state with "--" pitch display and microphone inactive', async () => {
    await act(async () => {
      render(React.createElement(TunerHUD));
    });

    expect(screen.getByText('Start Mic')).toBeInTheDocument();
    expect(screen.getByTestId('detected-note-label')).toHaveTextContent('--');
    expect(screen.getByTestId('detected-frequency')).toHaveTextContent('-- Hz');
    expect(screen.getByTestId('detected-cents')).toHaveTextContent('--');
    expect(screen.getByText('A4 = 440 Hz')).toBeInTheDocument();
  });

  it('populates microphone selector with enumerated devices', async () => {
    await act(async () => {
      render(React.createElement(TunerHUD));
    });

    const select = await screen.findByLabelText('Microphone Device Selector');
    expect(select).toBeInTheDocument();

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3); // Default, mic-1, mic-2
    expect(options[1]).toHaveTextContent('Internal Mic');
    expect(options[2]).toHaveTextContent('USB Audio Device');
  });

  it('toggles microphone active state on button click', async () => {
    const mockCtx = createMockAudioContext();
    const micManager = new MicSessionManager({ audioContext: mockCtx });
    const onMicChange = vi.fn();

    render(React.createElement(TunerHUD, { micManager, onMicStateChange: onMicChange }));

    const toggleBtn = screen.getByRole('button', { name: /start tuner microphone/i });
    await act(async () => {
      fireEvent.click(toggleBtn);
    });

    expect(onMicChange).toHaveBeenCalledWith(true);
    expect(screen.getByText('Stop Mic')).toBeInTheDocument();
    expect(micManager.isRunning).toBe(true);

    // Click again to stop
    const stopBtn = screen.getByRole('button', { name: /stop tuner microphone/i });
    await act(async () => {
      fireEvent.click(stopBtn);
    });

    expect(onMicChange).toHaveBeenCalledWith(false);
    expect(screen.getByText('Start Mic')).toBeInTheDocument();
    expect(micManager.isRunning).toBe(false);
  });

  it('updates note label, frequency, and cents meter when pitch sample arrives', async () => {
    const mockCtx = createMockAudioContext();
    const micManager = new MicSessionManager({ audioContext: mockCtx });

    render(React.createElement(TunerHUD, { micManager, toleranceCents: 15 }));

    // Start mic
    await act(async () => {
      await micManager.start();
    });

    // Fire tick with 440 Hz (A4)
    act(() => {
      micManager.tick();
    });

    expect(screen.getByTestId('detected-note-label')).toHaveTextContent('A4');
    expect(screen.getByTestId('detected-frequency')).toHaveTextContent('440.0 Hz');
    expect(screen.getByTestId('detected-cents')).toHaveTextContent('0¢');

    micManager.stop();
  });

  it('displays target note indicator and calculates cents offset against target', async () => {
    const mockCtx = createMockAudioContext();
    const micManager = new MicSessionManager({ audioContext: mockCtx });

    const targetNote: PlayableNote = {
      id: 'p0-m1-n0',
      measureNumber: 1,
      partIndex: 0,
      isSolo: true,
      pitch: {
        step: 'A',
        alter: 0,
        octave: 4,
        midiNumber: 69,
        label: 'A4',
        frequencyHz440: 440.0,
      },
      startBeat: 0,
      durationBeats: 1,
      startTimeMs: 0,
      durationMs: 500,
      cursorStepIndex: 0,
      tiedNoteIds: [],
    };

    render(
      React.createElement(TunerHUD, {
        micManager,
        targetNote,
        toleranceCents: 15,
      }),
    );

    // Target banner displayed
    expect(screen.getByText('Target Note:')).toBeInTheDocument();
    expect(screen.getByText('M1 · Beat 1')).toBeInTheDocument();

    await act(async () => {
      await micManager.start();
    });

    act(() => {
      micManager.tick();
    });

    expect(screen.getByTestId('detected-note-label')).toHaveTextContent('A4');
    expect(screen.getByTestId('detected-cents')).toHaveTextContent('0¢');

    micManager.stop();
  });

  it('renders horizontal cent meter needle within bounds', async () => {
    await act(async () => {
      render(React.createElement(TunerHUD));
    });

    const needle = screen.getByTestId('cent-meter-needle');
    expect(needle).toBeInTheDocument();
    expect(needle).toHaveStyle({ left: '50%' });
  });
});
