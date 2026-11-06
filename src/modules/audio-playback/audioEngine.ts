import { type PlayableNote, type MixerSettings } from '../../types/music';
import { midiNoteToFrequency } from '../pitch-detection/pitchMath';

export interface AudioPlaybackEngineOptions {
  /** Optional pre-existing AudioContext instance for dependency injection */
  readonly audioContext?: AudioContext;
  /** Optional AudioContext constructor for dependency injection */
  readonly AudioContextClass?: typeof AudioContext;
  /** Optional flag to attempt smplr Soundfont instrument loading (default: false) */
  readonly soundfontEnabled?: boolean;
}

interface DroneOscillatorEntry {
  readonly osc: OscillatorNode;
  readonly isHarmonic: boolean;
  readonly gainNode?: GainNode;
}

interface ActiveVoice {
  readonly endTime: number;
  stop: (time?: number) => void;
}

interface SoundfontInstrument {
  start(options: { note: number; time?: number; duration?: number }): unknown;
  stop?(): void;
  loaded(): Promise<unknown>;
}

/**
 * Multi-track Web Audio playback engine.
 * Routes audio through 4 independent GainNodes (Solo Violin, Accompaniment, Metronome, Drone).
 * Features a warm built-in harmonic synth engine (fundamental + harmonics + Biquad low-pass filter + ADSR envelope)
 * with optional smplr Soundfont streaming when online and enabled.
 */
export class AudioPlaybackEngine {
  private readonly _audioContext: AudioContext;
  private readonly _ownsAudioContext: boolean;
  private readonly _options: AudioPlaybackEngineOptions;

  // 4 independent gain nodes connected directly to audioContext.destination
  private readonly _soloGain: GainNode;
  private readonly _accompanimentGain: GainNode;
  private readonly _metronomeGain: GainNode;
  private readonly _droneGain: GainNode;

  private _droneVolume = 0.8;
  private _isDronePlaying = false;
  private _currentDroneMidi: number | null = null;
  private _currentDroneFrequency: number | null = null;
  private _droneOscillators: DroneOscillatorEntry[] = [];
  private _activeVoices: ActiveVoice[] = [];

  // smplr soundfont instances (lazy/optional)
  private _soloSoundfont: SoundfontInstrument | null = null;
  private _accompSoundfont: SoundfontInstrument | null = null;
  private _soundfontLoaded = false;

  constructor(options: AudioPlaybackEngineOptions = {}) {
    this._options = options;

    if (options.audioContext) {
      this._audioContext = options.audioContext;
      this._ownsAudioContext = false;
    } else {
      const CtxClass =
        options.AudioContextClass ??
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

    // Initialize 4 independent GainNodes connected to destination
    this._soloGain = this._audioContext.createGain();
    this._accompanimentGain = this._audioContext.createGain();
    this._metronomeGain = this._audioContext.createGain();
    this._droneGain = this._audioContext.createGain();

    this._soloGain.connect(this._audioContext.destination);
    this._accompanimentGain.connect(this._audioContext.destination);
    this._metronomeGain.connect(this._audioContext.destination);
    this._droneGain.connect(this._audioContext.destination);

    // Default gains
    this._setGainParam(this._soloGain.gain, 1.0, 0);
    this._setGainParam(this._accompanimentGain.gain, 0.8, 0);
    this._setGainParam(this._metronomeGain.gain, 0.6, 0);
    this._setGainParam(this._droneGain.gain, 0.0, 0);

    if (options.soundfontEnabled) {
      this.loadSoundfonts().catch((err) => {
        console.warn('Failed to load Soundfonts, falling back to harmonic synth:', err);
      });
    }
  }

  // --- Getters ---

  public get options(): AudioPlaybackEngineOptions {
    return this._options;
  }

  public get audioContext(): AudioContext {
    return this._audioContext;
  }

  public get soloGain(): GainNode {
    return this._soloGain;
  }

  public get accompanimentGain(): GainNode {
    return this._accompanimentGain;
  }

  public get metronomeGain(): GainNode {
    return this._metronomeGain;
  }

  public get droneGain(): GainNode {
    return this._droneGain;
  }

  public get isDronePlaying(): boolean {
    return this._isDronePlaying;
  }

  public get currentDroneMidi(): number | null {
    return this._currentDroneMidi;
  }

  public get currentDroneFrequency(): number | null {
    return this._currentDroneFrequency;
  }

  public get isSoundfontLoaded(): boolean {
    return this._soundfontLoaded;
  }

  /**
   * Resumes the underlying AudioContext if it is currently suspended.
   */
  public async resume(): Promise<void> {
    if (
      this._audioContext.state === 'suspended' &&
      typeof this._audioContext.resume === 'function'
    ) {
      await this._audioContext.resume();
    }
  }

  // --- Mixer Settings ---

  /**
   * Immediately updates soloGain, accompanimentGain, and metronomeGain values
   * respecting mute toggles and current audio hardware timestamp.
   */
  public applyMixerSettings(mixer: MixerSettings): void {
    const now = this._audioContext.currentTime;

    // Solo Gain: Part 1 Solo Violin
    const soloVal = mixer.soloMuted ? 0 : Math.max(0, Math.min(1, mixer.soloVolume));
    this._setGainParam(this._soloGain.gain, soloVal, now);

    // Accompaniment Gain: Parts 2+ Accompaniment
    const accompVal = mixer.accompanimentMuted
      ? 0
      : Math.max(0, Math.min(1, mixer.accompanimentVolume));
    this._setGainParam(this._accompanimentGain.gain, accompVal, now);

    // Metronome Gain
    const metroVal = mixer.metronomeMuted
      ? 0
      : Math.max(0, Math.min(1, mixer.metronomeVolume));
    this._setGainParam(this._metronomeGain.gain, metroVal, now);

    // Drone Gain
    const droneVal = mixer.droneActive ? this._droneVolume : 0;
    this._setGainParam(this._droneGain.gain, droneVal, now);
    if (!mixer.droneActive && this._isDronePlaying) {
      this.stopDrone();
    }
  }

  public setDroneVolume(volume: number): void {
    this._droneVolume = Math.max(0, Math.min(1, volume));
    if (this._isDronePlaying) {
      this._setGainParam(this._droneGain.gain, this._droneVolume, this._audioContext.currentTime);
    }
  }

  // --- Playback Scheduling ---

  /**
   * Schedules a playable note at exact Web Audio hardware time.
   * Rests (note.pitch === null) are ignored.
   * Routes solo notes to soloGain, and accompaniment notes to accompanimentGain.
   */
  public scheduleNote(
    note: PlayableNote,
    startAudioTimeSec: number,
    durationSec: number,
    referenceA4Hz = 440,
  ): void {
    // Ignore rests
    if (!note.pitch || note.pitch.midiNumber == null) {
      return;
    }

    if (this._audioContext.state === 'suspended') {
      void this._audioContext.resume?.();
    }

    // Optional smplr Soundfont playback when loaded and reference pitch is standard 440Hz
    if (this._soundfontLoaded && referenceA4Hz === 440) {
      const sfPlayer = note.isSolo ? this._soloSoundfont : this._accompSoundfont;
      if (sfPlayer && typeof sfPlayer.start === 'function') {
        try {
          sfPlayer.start({
            note: note.pitch.midiNumber,
            time: startAudioTimeSec,
            duration: durationSec,
          });
          return;
        } catch {
          // Fall through to harmonic synth
        }
      }
    }

    // Built-in warm harmonic synth engine (fundamental + 2nd harmonic + low-pass filter + ADSR envelope)
    const targetFreq = midiNoteToFrequency(note.pitch.midiNumber, referenceA4Hz);
    const destGain = note.isSolo ? this._soloGain : this._accompanimentGain;

    const osc1 = this._audioContext.createOscillator();
    osc1.type = note.isSolo ? 'sawtooth' : 'triangle';
    if (typeof osc1.frequency.setValueAtTime === 'function') {
      osc1.frequency.setValueAtTime(targetFreq, startAudioTimeSec);
    }
    osc1.frequency.value = targetFreq;

    const osc2 = this._audioContext.createOscillator();
    osc2.type = 'sine';
    if (typeof osc2.frequency.setValueAtTime === 'function') {
      osc2.frequency.setValueAtTime(targetFreq * 2, startAudioTimeSec);
    }
    osc2.frequency.value = targetFreq * 2;

    const osc2Gain = this._audioContext.createGain();
    this._setGainParam(osc2Gain.gain, note.isSolo ? 0.35 : 0.2, startAudioTimeSec);

    const filter = this._audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    const cutoff = note.isSolo
      ? Math.min(3500, Math.max(1200, targetFreq * 3.5))
      : Math.min(2500, Math.max(800, targetFreq * 2.5));
    if (typeof filter.frequency.setValueAtTime === 'function') {
      filter.frequency.setValueAtTime(cutoff, startAudioTimeSec);
    }
    filter.frequency.value = cutoff;
    if (typeof filter.Q.setValueAtTime === 'function') {
      filter.Q.setValueAtTime(1.2, startAudioTimeSec);
    }

    const envelope = this._audioContext.createGain();
    const attackTime = note.isSolo ? 0.025 : 0.015;
    const decayTime = 0.035;
    const sustainLevel = note.isSolo ? 0.7 : 0.6;
    const releaseTime = 0.03;

    this._setGainParam(envelope.gain, 0.0001, startAudioTimeSec);
    if (typeof envelope.gain.linearRampToValueAtTime === 'function') {
      envelope.gain.linearRampToValueAtTime(0.85, startAudioTimeSec + attackTime);
      envelope.gain.linearRampToValueAtTime(sustainLevel, startAudioTimeSec + attackTime + decayTime);
    }
    const releaseStart = Math.max(
      startAudioTimeSec + attackTime + decayTime,
      startAudioTimeSec + durationSec - releaseTime,
    );
    if (typeof envelope.gain.setValueAtTime === 'function') {
      envelope.gain.setValueAtTime(sustainLevel, releaseStart);
    }
    if (typeof envelope.gain.exponentialRampToValueAtTime === 'function') {
      envelope.gain.exponentialRampToValueAtTime(0.0001, startAudioTimeSec + durationSec);
    }

    // Connect node graph
    osc1.connect(filter);
    osc2.connect(osc2Gain);
    osc2Gain.connect(filter);
    filter.connect(envelope);
    envelope.connect(destGain);

    const stopTime = startAudioTimeSec + durationSec + 0.05;
    osc1.start(startAudioTimeSec);
    osc1.stop(stopTime);
    osc2.start(startAudioTimeSec);
    osc2.stop(stopTime);

    const now = this._audioContext.currentTime;
    this._activeVoices = this._activeVoices.filter((v) => v.endTime > now);

    const voiceEntry: ActiveVoice = {
      endTime: stopTime,
      stop: (time = 0) => {
        try {
          osc1.stop(time);
          osc2.stop(time);
          osc1.disconnect();
          osc2.disconnect();
          filter.disconnect();
          envelope.disconnect();
        } catch {
          // already stopped
        }
      },
    };
    this._activeVoices.push(voiceEntry);
  }

  /**
   * Schedules a crisp woodblock/click tone through metronomeGain.
   * Downbeat: 1200 Hz accent. Upbeat: 800 Hz.
   */
  public scheduleMetronomeClick(startAudioTimeSec: number, isDownbeat: boolean): void {
    if (this._audioContext.state === 'suspended') {
      void this._audioContext.resume?.();
    }

    const osc = this._audioContext.createOscillator();
    const clickGain = this._audioContext.createGain();

    const freq = isDownbeat ? 1200 : 800;
    osc.type = 'triangle';
    if (typeof osc.frequency.setValueAtTime === 'function') {
      osc.frequency.setValueAtTime(freq, startAudioTimeSec);
      if (typeof osc.frequency.exponentialRampToValueAtTime === 'function') {
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, startAudioTimeSec + 0.035);
      }
    }
    osc.frequency.value = freq;

    this._setGainParam(clickGain.gain, 1.0, startAudioTimeSec);
    if (typeof clickGain.gain.exponentialRampToValueAtTime === 'function') {
      clickGain.gain.exponentialRampToValueAtTime(0.001, startAudioTimeSec + 0.035);
    }

    osc.connect(clickGain);
    clickGain.connect(this._metronomeGain);

    const stopTime = startAudioTimeSec + 0.04;
    osc.start(startAudioTimeSec);
    osc.stop(stopTime);
  }

  // --- Reference Drone ---

  /**
   * Starts or updates a sustained, warm reference drone tone at midiNoteToFrequency(midiNote, referenceA4Hz)
   * routed through droneGain.
   */
  public startDrone(midiNote: number, referenceA4Hz = 440): void {
    if (this._audioContext.state === 'suspended') {
      void this._audioContext.resume?.();
    }

    const freq = midiNoteToFrequency(midiNote, referenceA4Hz);
    const now = this._audioContext.currentTime;

    if (this._isDronePlaying && this._droneOscillators.length > 0) {
      for (const item of this._droneOscillators) {
        const f = item.isHarmonic ? freq * 2 : freq;
        if (typeof item.osc.frequency.setValueAtTime === 'function') {
          item.osc.frequency.setValueAtTime(f, now);
        }
        item.osc.frequency.value = f;
      }
      this._currentDroneMidi = midiNote;
      this._currentDroneFrequency = freq;
      return;
    }

    this.stopDrone();

    const osc1 = this._audioContext.createOscillator();
    osc1.type = 'triangle';
    if (typeof osc1.frequency.setValueAtTime === 'function') {
      osc1.frequency.setValueAtTime(freq, now);
    }
    osc1.frequency.value = freq;

    const osc2 = this._audioContext.createOscillator();
    osc2.type = 'sine';
    if (typeof osc2.frequency.setValueAtTime === 'function') {
      osc2.frequency.setValueAtTime(freq * 2, now);
    }
    osc2.frequency.value = freq * 2;

    const osc2Gain = this._audioContext.createGain();
    this._setGainParam(osc2Gain.gain, 0.25, now);

    const droneVoiceGain = this._audioContext.createGain();
    this._setGainParam(droneVoiceGain.gain, 0.0001, now);
    if (typeof droneVoiceGain.gain.linearRampToValueAtTime === 'function') {
      droneVoiceGain.gain.linearRampToValueAtTime(0.7, now + 0.05);
    }
    droneVoiceGain.gain.value = 0.7;

    const filter = this._audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    if (typeof filter.frequency.setValueAtTime === 'function') {
      filter.frequency.setValueAtTime(1500, now);
    }
    filter.frequency.value = 1500;

    osc1.connect(filter);
    osc2.connect(osc2Gain);
    osc2Gain.connect(filter);
    filter.connect(droneVoiceGain);
    droneVoiceGain.connect(this._droneGain);

    osc1.start(now);
    osc2.start(now);

    this._droneOscillators = [
      { osc: osc1, isHarmonic: false, gainNode: droneVoiceGain },
      { osc: osc2, isHarmonic: true },
    ];
    this._isDronePlaying = true;
    this._currentDroneMidi = midiNote;
    this._currentDroneFrequency = freq;

    this._setGainParam(this._droneGain.gain, this._droneVolume, now);
  }

  public stopDrone(): void {
    if (!this._isDronePlaying && this._droneOscillators.length === 0) {
      return;
    }

    const now = this._audioContext.currentTime;
    const droneVoiceGain = this._droneOscillators[0]?.gainNode;

    if (droneVoiceGain && typeof droneVoiceGain.gain.linearRampToValueAtTime === 'function') {
      droneVoiceGain.gain.linearRampToValueAtTime(0.0001, now + 0.04);
    }

    const oscsToStop = [...this._droneOscillators];
    this._droneOscillators = [];
    this._isDronePlaying = false;
    this._currentDroneMidi = null;
    this._currentDroneFrequency = null;

    for (const item of oscsToStop) {
      try {
        item.osc.stop(now + 0.05);
      } catch {
        // ignore
      }
    }
    this._setGainParam(this._droneGain.gain, 0, now + 0.05);
  }

  // --- Teardown & Optional Soundfont Loader ---

  public async loadSoundfonts(): Promise<boolean> {
    try {
      const { Soundfont } = await import('smplr');
      this._soloSoundfont = new Soundfont(this._audioContext, {
        instrument: 'violin',
        destination: this._soloGain,
      });
      this._accompSoundfont = new Soundfont(this._audioContext, {
        instrument: 'acoustic_grand_piano',
        destination: this._accompanimentGain,
      });
      await Promise.all([this._soloSoundfont.loaded(), this._accompSoundfont.loaded()]);
      this._soundfontLoaded = true;
      return true;
    } catch {
      this._soundfontLoaded = false;
      return false;
    }
  }

  public stopActiveNotes(): void {
    for (const voice of this._activeVoices) {
      voice.stop();
    }
    this._activeVoices = [];
    this._soloSoundfont?.stop?.();
    this._accompSoundfont?.stop?.();
  }

  public stopAll(): void {
    this.stopDrone();
    this.stopActiveNotes();
  }

  public async close(): Promise<void> {
    this.stopAll();
    if (this._ownsAudioContext && this._audioContext) {
      try {
        await this._audioContext.close();
      } catch {
        // ignore
      }
    }
  }

  private _setGainParam(param: AudioParam, targetValue: number, time: number): void {
    try {
      if (typeof param.setValueAtTime === 'function') {
        param.setValueAtTime(targetValue, time);
      }
    } catch {
      // ignore
    }
    param.value = targetValue;
  }
}
