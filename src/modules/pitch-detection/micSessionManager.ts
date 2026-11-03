import { PitchDetector } from 'pitchy';
import { type PitchSample } from '../../types/music';
import { computeRms } from './pitchMath';
import { PitchSmoothingFilter } from './pitchFilter';

export interface AudioInputDeviceInfo {
  readonly deviceId: string;
  readonly label: string;
}

export type PitchSubscriber = (
  sample: PitchSample | null,
  rawSample: PitchSample,
) => void;

export interface MicSessionManagerOptions {
  /** Optional pre-existing AudioContext to reuse */
  readonly audioContext?: AudioContext;
  /** Optional AudioContext constructor for dependency injection in tests */
  readonly AudioContextClass?: typeof AudioContext;
  /** FFT analysis buffer size (default: 2048) */
  readonly fftSize?: number;
  /** Analysis timer interval in milliseconds (default: 20ms) */
  readonly intervalMs?: number;
  /** Custom smoothing filter instance */
  readonly filter?: PitchSmoothingFilter;
}

/**
 * Enumerate available microphone devices on the system.
 * Filters to 'audioinput' devices and provides fallback names if browser privacy hides labels.
 */
export async function listAudioInputDevices(): Promise<readonly AudioInputDeviceInfo[]> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.enumerateDevices !== 'function'
  ) {
    return [];
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audioinput')
      .map((d, index) => ({
        deviceId: d.deviceId,
        label: d.label?.trim() ? d.label.trim() : `Microphone ${index + 1}`,
      }));
  } catch (err) {
    console.warn('Failed to enumerate audio input devices:', err);
    return [];
  }
}

/**
 * Web Audio microphone session manager running pitchy McLeod Pitch Method on a decoupled
 * 20ms polling loop without triggering React renders on every audio frame.
 *
 * Requests unfiltered microphone audio ({ echoCancellation: false, noiseSuppression: false, autoGainControl: false }),
 * reads AudioContext.sampleRate dynamically after acquisition (to adapt to Bluetooth HFP rate shifts),
 * and feeds samples through a 3-frame median PitchSmoothingFilter.
 */
export class MicSessionManager {
  readonly fftSize: number;
  readonly intervalMs: number;

  private _options: MicSessionManagerOptions;
  private _filter: PitchSmoothingFilter;
  private _audioContext: AudioContext | null = null;
  private _ownsAudioContext = false;
  private _stream: MediaStream | null = null;
  private _sourceNode: MediaStreamAudioSourceNode | null = null;
  private _analyserNode: AnalyserNode | null = null;
  private _detector: PitchDetector<Float32Array> | null = null;
  private _buffer: Float32Array | null = null;
  private _timerId: ReturnType<typeof setInterval> | null = null;
  private _isRunning = false;
  private _selectedDeviceId: string | null = null;
  private _subscribers = new Set<PitchSubscriber>();
  private _lastFilteredSample: PitchSample | null = null;
  private _lastRawSample: PitchSample | null = null;

  constructor(options: MicSessionManagerOptions = {}) {
    this._options = options;
    this.fftSize = options.fftSize ?? 2048;
    this.intervalMs = options.intervalMs ?? 20;
    this._filter = options.filter ?? new PitchSmoothingFilter();

    if (options.audioContext) {
      this._audioContext = options.audioContext;
      this._ownsAudioContext = false;
    }
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  get selectedDeviceId(): string | null {
    return this._selectedDeviceId;
  }

  get audioContext(): AudioContext | null {
    return this._audioContext;
  }

  get sampleRate(): number {
    return this._audioContext?.sampleRate ?? 0;
  }

  get stream(): MediaStream | null {
    return this._stream;
  }

  get analyserNode(): AnalyserNode | null {
    return this._analyserNode;
  }

  get filter(): PitchSmoothingFilter {
    return this._filter;
  }

  get lastFilteredSample(): PitchSample | null {
    return this._lastFilteredSample;
  }

  get lastRawSample(): PitchSample | null {
    return this._lastRawSample;
  }

  /**
   * Subscribes to pitch detection events on the decoupled timer loop.
   * Returns an unsubscribe function.
   */
  subscribe(callback: PitchSubscriber): () => void {
    this._subscribers.add(callback);
    return () => {
      this._subscribers.delete(callback);
    };
  }

  /**
   * Starts microphone acquisition and the 20ms pitch detection loop.
   * If a previous session is running, cleanly stops it before starting.
   */
  async start(deviceId?: string): Promise<void> {
    if (this._isRunning) {
      this.stop();
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      throw new Error('navigator.mediaDevices.getUserMedia is not supported in this environment');
    }

    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    this._stream = stream;
    this._selectedDeviceId = deviceId ?? null;

    try {
      // Create or resume AudioContext AFTER stream acquisition
      if (!this._audioContext) {
        const CtxClass =
          this._options.AudioContextClass ??
          (typeof window !== 'undefined'
            ? window.AudioContext ||
              (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
            : undefined);

        if (!CtxClass) {
          throw new Error('AudioContext is not supported in this environment');
        }

        this._audioContext = new CtxClass();
        this._ownsAudioContext = true;
      }

      if (this._audioContext.state === 'suspended') {
        await this._audioContext.resume();
      }

      // Connect MediaStreamAudioSourceNode -> AnalyserNode
      this._sourceNode = this._audioContext.createMediaStreamSource(stream);
      this._analyserNode = this._audioContext.createAnalyser();
      this._analyserNode.fftSize = this.fftSize;
      this._sourceNode.connect(this._analyserNode);

      // Initialize pitch detector & scratch buffer
      this._detector = PitchDetector.forFloat32Array(this.fftSize);
      this._buffer = new Float32Array(this.fftSize);
    } catch (err) {
      // Do not leave the microphone open (and its indicator on) after a failed start
      this.stop();
      throw err;
    }

    this._isRunning = true;

    // Start decoupled 20ms timer
    this._timerId = setInterval(() => {
      this.tick();
    }, this.intervalMs);
  }

  /**
   * Executes a single pitch detection evaluation cycle.
   * Decoupled from React renders; invokes subscribers directly.
   */
  tick(): void {
    if (
      !this._isRunning ||
      !this._analyserNode ||
      !this._audioContext ||
      !this._detector ||
      !this._buffer
    ) {
      return;
    }

    this._analyserNode.getFloatTimeDomainData(this._buffer);
    const rms = computeRms(this._buffer);

    // Read dynamic sample rate (Bluetooth HFP changes sample rates at runtime)
    const sampleRate = this._audioContext.sampleRate;
    const [frequencyHz, clarity] = this._detector.findPitch(this._buffer, sampleRate);
    const audioTimeSec = this._audioContext.currentTime;

    const rawSample: PitchSample = {
      frequencyHz,
      clarity,
      rms,
      audioTimeSec,
    };

    const filteredSample = this._filter.processSample(rawSample);
    this._lastRawSample = rawSample;
    this._lastFilteredSample = filteredSample;

    for (const subscriber of this._subscribers) {
      try {
        subscriber(filteredSample, rawSample);
      } catch (err) {
        console.error('Error in pitch subscriber callback', err);
      }
    }
  }

  /**
   * Cleans up audio tracks, nodes, timer, and internal filter.
   */
  stop(): void {
    if (this._timerId !== null) {
      clearInterval(this._timerId);
      this._timerId = null;
    }

    if (this._stream) {
      for (const track of this._stream.getTracks()) {
        track.stop();
      }
      this._stream = null;
    }

    if (this._sourceNode) {
      try {
        this._sourceNode.disconnect();
      } catch {
        // Audio node may already be disconnected
      }
      this._sourceNode = null;
    }

    if (this._analyserNode) {
      try {
        this._analyserNode.disconnect();
      } catch {
        // Audio node may already be disconnected
      }
      this._analyserNode = null;
    }

    if (this._ownsAudioContext && this._audioContext) {
      try {
        this._audioContext.close();
      } catch {
        // Audio context may already be closed
      }
      this._audioContext = null;
    }

    this._filter.reset();
    this._isRunning = false;
    this._lastRawSample = null;
    this._lastFilteredSample = null;
  }
}
