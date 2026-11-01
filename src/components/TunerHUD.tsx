import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { type PlayableNote, type PitchSample } from '../types/music';
import {
  MicSessionManager,
  listAudioInputDevices,
  type AudioInputDeviceInfo,
} from '../modules/pitch-detection/micSessionManager';
import {
  detectClosestMidiNote,
  frequencyToCentsDelta,
  midiNoteToFrequency,
} from '../modules/pitch-detection/pitchMath';

export interface TunerHUDProps {
  /** Optional custom or injected MicSessionManager instance. If not provided, TunerHUD creates its own. */
  readonly micManager?: MicSessionManager;
  /** Optional target playable note (e.g. during interactive practice) */
  readonly targetNote?: PlayableNote | null;
  /** Tuning reference frequency for A4 in Hz (default: 440) */
  readonly referenceA4Hz?: number;
  /** Intonation tolerance in cents for the green in-tune zone (default: 15) */
  readonly toleranceCents?: number;
  /** Callback invoked when the microphone active state changes */
  readonly onMicStateChange?: (active: boolean) => void;
  /** Callback invoked when a new pitch sample is received */
  readonly onPitchSample?: (sample: PitchSample | null) => void;
  /** Optional additional container CSS classes */
  readonly className?: string;
}

export type IntonationStatus = 'in-tune' | 'close' | 'out-of-tune' | 'silent';

export function TunerHUD({
  micManager,
  targetNote,
  referenceA4Hz = 440,
  toleranceCents = 15,
  onMicStateChange,
  onPitchSample,
  className = '',
}: TunerHUDProps) {
  const internalManagerRef = useRef<MicSessionManager | null>(null);
  const activeManager = micManager ?? (internalManagerRef.current ??= new MicSessionManager());

  const [isMicActive, setIsMicActive] = useState<boolean>(activeManager.isRunning);
  const [devices, setDevices] = useState<readonly AudioInputDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [currentSample, setCurrentSample] = useState<PitchSample | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load available microphone input devices
  const refreshDevices = useCallback(async () => {
    try {
      const devList = await listAudioInputDevices();
      setDevices(devList);
    } catch (err) {
      console.warn('Failed to refresh microphone devices:', err);
    }
  }, []);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  // Subscribe to pitch events from the decoupled loop
  useEffect(() => {
    const unsubscribe = activeManager.subscribe((sample) => {
      setCurrentSample(sample);
      onPitchSample?.(sample);
    });

    return () => {
      unsubscribe();
    };
  }, [activeManager, onPitchSample]);

  // Clean up internal manager on unmount
  useEffect(() => {
    return () => {
      if (!micManager && internalManagerRef.current) {
        internalManagerRef.current.stop();
      }
    };
  }, [micManager]);

  // Handle microphone toggle
  const toggleMic = async () => {
    setErrorMessage(null);
    if (activeManager.isRunning) {
      activeManager.stop();
      setIsMicActive(false);
      setCurrentSample(null);
      onMicStateChange?.(false);
    } else {
      try {
        await activeManager.start(selectedDeviceId || undefined);
        setIsMicActive(true);
        onMicStateChange?.(true);
        // Refresh devices post-permission to get real hardware labels
        await refreshDevices();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to access microphone';
        setErrorMessage(msg);
        setIsMicActive(false);
        onMicStateChange?.(false);
      }
    }
  };

  // Handle microphone device switch
  const handleDeviceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newDeviceId = e.target.value;
    setSelectedDeviceId(newDeviceId);

    if (activeManager.isRunning) {
      try {
        await activeManager.start(newDeviceId || undefined);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to switch microphone';
        setErrorMessage(msg);
      }
    }
  };

  // Derive pitch information
  let detectedLabel = '--';
  let frequencyText = '-- Hz';
  let centsDelta = 0;
  let centsText = '--';
  let status: IntonationStatus = 'silent';

  if (currentSample && currentSample.frequencyHz > 0) {
    const detected = detectClosestMidiNote(currentSample.frequencyHz, referenceA4Hz);

    if (targetNote && targetNote.pitch) {
      // Practicing against a specific target note
      detectedLabel = detected.label;
      centsDelta = frequencyToCentsDelta(
        currentSample.frequencyHz,
        targetNote.pitch.midiNumber,
        referenceA4Hz,
      );
    } else {
      // General chromatic tuner
      detectedLabel = detected.label;
      centsDelta = detected.centsDelta;
    }

    frequencyText = `${currentSample.frequencyHz.toFixed(1)} Hz`;
    centsText = `${centsDelta >= 0 ? '+' : ''}${Math.round(centsDelta)}¢`;

    const absCents = Math.abs(centsDelta);
    if (absCents <= toleranceCents) {
      status = 'in-tune';
    } else if (absCents <= toleranceCents * 2) {
      status = 'close';
    } else {
      status = 'out-of-tune';
    }
  }

  // Cent meter needle position: -50¢ to +50¢ mapped to 0% to 100%
  const clampedCents = Math.max(-50, Math.min(50, centsDelta));
  const needlePercent = ((clampedCents + 50) / 100) * 100;

  // Status colors
  const statusColorClass = {
    'in-tune': 'text-emerald-400',
    close: 'text-amber-400',
    'out-of-tune': 'text-rose-400',
    silent: 'text-slate-400',
  }[status];

  const needleColorClass = {
    'in-tune': 'bg-emerald-400 border-emerald-300 shadow-emerald-500/50',
    close: 'bg-amber-400 border-amber-300 shadow-amber-500/50',
    'out-of-tune': 'bg-rose-400 border-rose-300 shadow-rose-500/50',
    silent: 'bg-slate-600 border-slate-500 shadow-none',
  }[status];

  // Visual tolerance zone widths in percentage (meter spans -50 to +50 cents = 100 cents)
  const greenLeft = Math.max(0, 50 - toleranceCents);
  const greenWidth = Math.min(100, toleranceCents * 2);

  const yellowLeft = Math.max(0, 50 - toleranceCents * 2);
  const yellowWidth = Math.min(100, toleranceCents * 4);

  return (
    <div
      role="region"
      aria-label="Tuner HUD"
      className={`bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-4 text-slate-100 ${className}`}
    >
      {/* Controls row: Mic Toggle, Device Selector & Reference Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleMic}
            aria-label={isMicActive ? 'Stop Tuner Microphone' : 'Start Tuner Microphone'}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 cursor-pointer min-h-[44px] ${
              isMicActive
                ? 'bg-rose-600 hover:bg-rose-500 text-white focus:ring-rose-500 shadow-lg shadow-rose-950/40'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white focus:ring-emerald-500 shadow-lg shadow-emerald-950/40'
            }`}
          >
            {isMicActive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            <span>{isMicActive ? 'Stop Mic' : 'Start Mic'}</span>
          </button>

          <select
            aria-label="Microphone Device Selector"
            value={selectedDeviceId}
            onChange={handleDeviceChange}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 min-h-[44px] max-w-[220px] truncate"
          >
            <option value="">Default Microphone</option>
            {devices.map((dev) => (
              <option key={dev.deviceId} value={dev.deviceId}>
                {dev.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
          <span className="bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/60">
            A4 = {referenceA4Hz} Hz
          </span>
          <span className="bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/60">
            Tol: ±{toleranceCents}¢
          </span>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="bg-rose-950/50 border border-rose-800 text-rose-300 text-xs px-3 py-2 rounded-lg"
        >
          {errorMessage}
        </div>
      )}

      {/* Target Note Banner (if practicing a specific note) */}
      {targetNote && (
        <div className="flex items-center justify-between bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-1.5 text-xs text-slate-300">
          <span className="font-semibold text-emerald-400">Target Note:</span>
          <span className="font-mono font-bold text-sm text-slate-100">
            {targetNote.pitch?.label ?? 'Rest'}
          </span>
          <span className="text-slate-400 font-mono">
            {targetNote.pitch
              ? `${midiNoteToFrequency(targetNote.pitch.midiNumber, referenceA4Hz).toFixed(1)} Hz`
              : '--'}
          </span>
          <span className="text-slate-400">
            M{targetNote.measureNumber} · Beat {targetNote.startBeat + 1}
          </span>
        </div>
      )}

      {/* Glanceable Music Stand Pitch Display */}
      <div className="flex flex-col items-center justify-center py-2 text-center select-none">
        <div
          data-testid="detected-note-label"
          className={`text-7xl sm:text-8xl font-black tracking-tight transition-colors duration-150 font-mono drop-shadow-md ${statusColorClass}`}
        >
          {detectedLabel}
        </div>

        <div className="flex items-center gap-4 mt-2 font-mono text-sm sm:text-base">
          <span
            data-testid="detected-frequency"
            className="text-slate-300 bg-slate-800/80 px-3 py-0.5 rounded-full border border-slate-700/60"
          >
            {frequencyText}
          </span>
          <span
            data-testid="detected-cents"
            className={`font-semibold px-3 py-0.5 rounded-full border ${
              status === 'in-tune'
                ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                : status === 'close'
                ? 'bg-amber-950/60 border-amber-800 text-amber-300'
                : status === 'out-of-tune'
                ? 'bg-rose-950/60 border-rose-800 text-rose-300'
                : 'bg-slate-800/80 border-slate-700/60 text-slate-400'
            }`}
          >
            {centsText}
          </span>
        </div>
      </div>

      {/* Visual Horizontal Cent Meter (-50¢ to +50¢) */}
      <div className="flex flex-col gap-1.5 px-2">
        <div className="relative h-6 bg-slate-950 rounded-lg border border-slate-800 overflow-hidden">
          {/* Outer red/gray backdrop covers entire -50 to +50 */}
          <div className="absolute inset-0 bg-rose-950/20" />

          {/* Yellow warning tolerance zone (±2x tolerance) */}
          <div
            className="absolute top-0 bottom-0 bg-amber-500/20 border-x border-amber-500/30"
            style={{
              left: `${yellowLeft}%`,
              width: `${yellowWidth}%`,
            }}
          />

          {/* Green in-tune tolerance zone (±1x tolerance) */}
          <div
            className="absolute top-0 bottom-0 bg-emerald-500/30 border-x border-emerald-500/50"
            style={{
              left: `${greenLeft}%`,
              width: `${greenWidth}%`,
            }}
          />

          {/* Center target tick (0 cents) */}
          <div className="absolute top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2 bg-slate-500/70 z-10" />

          {/* Dynamic Needle Indicator */}
          <div
            data-testid="cent-meter-needle"
            className={`absolute top-0.5 bottom-0.5 w-2 -translate-x-1/2 rounded-full border shadow-md transition-all duration-75 z-20 ${needleColorClass}`}
            style={{
              left: `${needlePercent}%`,
              opacity: status === 'silent' ? 0.3 : 1.0,
            }}
          />
        </div>

        {/* Meter Legend / Labels */}
        <div className="flex justify-between text-[11px] font-mono text-slate-400 px-0.5">
          <span>-50¢</span>
          <span>-25¢</span>
          <span className="text-emerald-400 font-bold">0¢</span>
          <span>+25¢</span>
          <span>+50¢</span>
        </div>
      </div>
    </div>
  );
}
