import { classifyMicError } from '../modules/pitch-detection/micErrors';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { useNoteName } from '../modules/notation/NotationContext';
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
  const noteName = useNoteName();
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
        const info = classifyMicError(err);
        setErrorMessage(`${info.title}. ${info.detail}`);
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
      detectedLabel = noteName(detected.label);
      centsDelta = frequencyToCentsDelta(
        currentSample.frequencyHz,
        targetNote.pitch.midiNumber,
        referenceA4Hz,
      );
    } else {
      // General chromatic tuner
      detectedLabel = noteName(detected.label);
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
    'in-tune': 'text-emerald-700',
    close: 'text-amber-600',
    'out-of-tune': 'text-rose-600',
    silent: 'text-stone-400',
  }[status];

  const needleColorClass = {
    'in-tune': 'bg-emerald-600 border-emerald-700 shadow-emerald-500/30',
    close: 'bg-amber-500 border-amber-600 shadow-amber-500/30',
    'out-of-tune': 'bg-rose-500 border-rose-600 shadow-rose-500/30',
    silent: 'bg-stone-400 border-stone-500 shadow-none',
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
      className={`p-4 sm:p-5 border flex flex-col gap-4 font-sans ${className}`}
      style={{
        backgroundColor: 'var(--color-score-paper)',
        borderColor: 'var(--color-rule)',
        color: 'var(--color-ink)',
        borderRadius: '22px',
      }}
    >
      {/* Controls row: Mic Toggle, Device Selector & Reference Indicator */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b pb-3"
        style={{ borderColor: 'var(--color-rule)' }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleMic}
            aria-label={isMicActive ? 'Stop Tuner Microphone' : 'Start Tuner Microphone'}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[15px] font-bold transition cursor-pointer min-h-11"
            style={{
              backgroundColor: isMicActive ? 'var(--color-intonation-miss)' : 'var(--color-accent)',
              color: 'var(--color-accent-ink)',
            }}
          >
            {isMicActive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            <span>{isMicActive ? 'Stop Mic' : 'Start Mic'}</span>
          </button>

          <select
            aria-label="Microphone Device Selector"
            value={selectedDeviceId}
            onChange={handleDeviceChange}
            className="text-[14px] rounded-full px-3 py-1.5 border min-h-11 max-w-[200px] truncate"
            style={{
              backgroundColor: 'var(--color-paper-2)',
              borderColor: 'var(--color-rule)',
              color: 'var(--color-ink)',
            }}
          >
            <option value="">Default Microphone</option>
            {devices.map((dev) => (
              <option key={dev.deviceId} value={dev.deviceId}>
                {dev.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono" style={{ color: 'var(--color-muted)' }}>
          <span
            className="px-2 py-0.5 rounded border"
            style={{
              backgroundColor: 'var(--color-paper-2)',
              borderColor: 'var(--color-rule)',
            }}
          >
            A4 = {referenceA4Hz} Hz
          </span>
          <span
            className="px-2 py-0.5 rounded border"
            style={{
              backgroundColor: 'var(--color-paper-2)',
              borderColor: 'var(--color-rule)',
            }}
          >
            Tol: ±{toleranceCents}¢
          </span>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="text-xs px-3 py-2 rounded border"
          style={{
            backgroundColor: 'oklch(56.0% 0.185 28 / 0.12)',
            borderColor: 'var(--color-intonation-miss)',
            color: 'var(--color-intonation-miss)',
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Target Note Banner (if practicing a specific note) */}
      {targetNote && (
        <div
          className="flex items-center justify-between rounded px-3 py-1.5 text-xs border"
          style={{
            backgroundColor: 'var(--color-paper-2)',
            borderColor: 'var(--color-rule)',
          }}
        >
          <span className="font-semibold" style={{ color: 'var(--color-accent)' }}>
            Target Note:
          </span>
          <span className="font-mono font-bold text-sm" style={{ color: 'var(--color-ink)' }}>
            {targetNote.pitch ? noteName(targetNote.pitch.label) : 'Rest'}
          </span>
          <span className="font-mono" style={{ color: 'var(--color-muted)' }}>
            {targetNote.pitch
              ? `${midiNoteToFrequency(targetNote.pitch.midiNumber, referenceA4Hz).toFixed(1)} Hz`
              : '--'}
          </span>
          <span style={{ color: 'var(--color-muted)' }}>
            M{targetNote.measureNumber} · Beat {targetNote.startBeat + 1}
          </span>
        </div>
      )}

      {/* Glanceable Music Stand Pitch Display */}
      <div className="flex flex-col items-center justify-center py-2 text-center select-none">
        <div
          data-testid="detected-note-label"
          className={`text-7xl sm:text-8xl font-black tracking-tight transition-colors duration-150 font-mono ${statusColorClass}`}
        >
          {detectedLabel}
        </div>

        <div className="flex items-center gap-3 mt-2 font-mono text-sm">
          <span
            data-testid="detected-frequency"
            className="px-2.5 py-0.5 rounded border"
            style={{
              backgroundColor: 'var(--color-paper-2)',
              borderColor: 'var(--color-rule)',
              color: 'var(--color-ink)',
            }}
          >
            {frequencyText}
          </span>
          <span
            data-testid="detected-cents"
            className="font-semibold px-2.5 py-0.5 rounded border"
            style={{
              backgroundColor:
                status === 'in-tune'
                  ? 'oklch(60.0% 0.155 148 / 0.15)'
                  : status === 'close'
                  ? 'oklch(72.0% 0.150 82 / 0.15)'
                  : status === 'out-of-tune'
                  ? 'oklch(56.0% 0.185 28 / 0.15)'
                  : 'var(--color-paper-2)',
              borderColor:
                status === 'in-tune'
                  ? 'var(--color-intonation-match)'
                  : status === 'close'
                  ? 'var(--color-intonation-close)'
                  : status === 'out-of-tune'
                  ? 'var(--color-intonation-miss)'
                  : 'var(--color-rule)',
              color:
                status === 'in-tune'
                  ? 'var(--color-intonation-match)'
                  : status === 'close'
                  ? 'var(--color-intonation-close)'
                  : status === 'out-of-tune'
                  ? 'var(--color-intonation-miss)'
                  : 'var(--color-muted)',
            }}
          >
            {centsText}
          </span>
        </div>
      </div>

      {/* Visual Horizontal Cent Meter (-50¢ to +50¢) */}
      <div className="flex flex-col gap-1.5 px-1">
        <div
          className="relative h-6 rounded border overflow-hidden"
          style={{
            backgroundColor: 'var(--color-paper-3)',
            borderColor: 'var(--color-rule)',
          }}
        >
          {/* Outer backdrop */}
          <div className="absolute inset-0 opacity-10" style={{ backgroundColor: 'var(--color-intonation-miss)' }} />

          {/* Yellow warning tolerance zone (±2x tolerance) */}
          <div
            className="absolute top-0 bottom-0 opacity-25"
            style={{
              left: `${yellowLeft}%`,
              width: `${yellowWidth}%`,
              backgroundColor: 'var(--color-intonation-close)',
            }}
          />

          {/* Green in-tune tolerance zone (±1x tolerance) */}
          <div
            className="absolute top-0 bottom-0 opacity-40"
            style={{
              left: `${greenLeft}%`,
              width: `${greenWidth}%`,
              backgroundColor: 'var(--color-intonation-match)',
            }}
          />

          {/* Center target tick (0 cents) */}
          <div
            className="absolute top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2 z-10"
            style={{ backgroundColor: 'var(--color-ink)' }}
          />

          {/* Dynamic Needle Indicator */}
          <div
            data-testid="cent-meter-needle"
            className={`absolute top-0.5 bottom-0.5 w-2 -translate-x-1/2 rounded-full border shadow-xs transition-all duration-75 z-20 ${needleColorClass}`}
            style={{
              left: `${needlePercent}%`,
              opacity: status === 'silent' ? 0.3 : 1.0,
            }}
          />
        </div>

        {/* Meter Legend / Labels */}
        <div
          className="flex justify-between text-[11px] font-mono px-0.5"
          style={{ color: 'var(--color-muted)' }}
        >
          <span>-50¢</span>
          <span>-25¢</span>
          <span className="font-bold" style={{ color: 'var(--color-accent)' }}>
            0¢
          </span>
          <span>+25¢</span>
          <span>+50¢</span>
        </div>
      </div>
    </div>
  );
}
