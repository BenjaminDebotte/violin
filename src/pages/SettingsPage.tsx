import { useState, useEffect, useCallback } from 'react';
import {
  Mic,
  Sliders,
  Check,
  Headphones,
  Music2,
  RefreshCw,
  Info,
  Languages,
} from 'lucide-react';
import { type NotationSystem, formatNoteName } from '../modules/notation/noteNames';
import { type IntonationStrictness, getToleranceCents } from '../types/music';
import {
  listAudioInputDevices,
  type AudioInputDeviceInfo,
} from '../modules/pitch-detection/micSessionManager';

export interface SettingsPageProps {
  readonly referenceA4Hz: number;
  readonly onReferenceA4Change: (hz: number) => void;
  readonly strictness: IntonationStrictness;
  readonly onStrictnessChange: (strictness: IntonationStrictness) => void;
  readonly customToleranceCents: number;
  readonly onCustomToleranceCentsChange: (cents: number) => void;
  readonly selectedMicDeviceId: string | null;
  readonly onSelectedMicDeviceIdChange?: (deviceId: string | null) => void;
  readonly notation?: NotationSystem;
  readonly onNotationChange?: (system: NotationSystem) => void;
}

const STRICTNESS_PRESETS: readonly {
  readonly id: IntonationStrictness;
  readonly label: string;
  readonly cents: number;
  readonly description: string;
}[] = [
  {
    id: 'easy',
    label: 'Easy (±25¢)',
    cents: 25,
    description: 'Forgiving tolerance for warm-ups, sight-reading, and beginners.',
  },
  {
    id: 'medium',
    label: 'Medium (±15¢)',
    cents: 15,
    description: 'Recommended standard for daily acoustic violin practice.',
  },
  {
    id: 'strict',
    label: 'Strict (±8¢)',
    cents: 8,
    description: 'Narrow window for audition preparation and chamber intonation.',
  },
  {
    id: 'custom',
    label: 'Custom',
    cents: 15,
    description: 'Manually specify your desired intonation tolerance (±3¢ to ±40¢).',
  },
];

/**
 * Dedicated browsable Settings & Calibration page styled in Direction 1: Urtext Archive.
 * Configures Reference Pitch A4 (438–445 Hz slider + 440 Hz and 442 Hz presets),
 * Intonation Strictness (Easy ±25¢, Medium ±15¢, Strict ±8¢, Custom ±3¢–40¢ slider),
 * Microphone Input Device selector, and the Bluetooth Earbuds & Microphone acoustic setup guide.
 */
export function SettingsPage({
  referenceA4Hz,
  onReferenceA4Change,
  strictness,
  onStrictnessChange,
  customToleranceCents,
  onCustomToleranceCentsChange,
  selectedMicDeviceId,
  onSelectedMicDeviceIdChange,
  notation = 'letters',
  onNotationChange,
}: SettingsPageProps) {
  const [devices, setDevices] = useState<readonly AudioInputDeviceInfo[]>([]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const refreshDevices = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const devList = await listAudioInputDevices();
      setDevices(devList);
    } catch (err) {
      console.warn('Failed to list audio input devices:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  const activeToleranceCents = getToleranceCents({
    strictness,
    customToleranceCents,
  });

  return (
    <div
      className="flex-1 w-full max-w-[780px] mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6"
      data-testid="settings-page"
    >
      {/* Header */}
      <div
        className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 border-b pb-3"
        style={{ borderColor: 'var(--color-rule)' }}
      >
        <div>
          <h2
            className="font-display text-2xl sm:text-3xl font-bold tracking-tight"
            style={{ color: 'var(--color-ink)' }}
          >
            Studio Calibration &amp; Settings
          </h2>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>
            Acoustic hardware capture, concert reference calibration, and intonation window
          </p>
        </div>
        <div className="text-xs font-mono" style={{ color: 'var(--color-muted)' }}>
          Active: A4={referenceA4Hz}Hz · ±{activeToleranceCents}¢
        </div>
      </div>

      {/* Settings Card Ledger (Matches .settings-card in direction-1-urtext.html) */}
      <div
        className="border divide-y shadow-sm overflow-hidden"
        style={{
          borderColor: 'var(--color-rule)',
          backgroundColor: 'var(--color-score-paper)',
          borderRadius: '2px',
          boxShadow: '0 2px 8px var(--color-shadow)',
        }}
      >
        {/* 0. Note-name notation */}
        <div className="p-4 sm:p-5 space-y-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Languages className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
              <span className="font-display text-base font-bold" style={{ color: 'var(--color-ink)' }}>
                Note Names
              </span>
            </div>
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              How notes are labelled in the tuner, target note and drone.
            </p>
          </div>
          <div role="radiogroup" aria-label="Note name notation" className="grid grid-cols-2 gap-2">
            {([
              { id: 'solfege', title: 'Do Ré Mi', sample: 'Do · Ré · Mi · Fa · Sol · La · Si' },
              { id: 'letters', title: 'A B C D E', sample: 'C · D · E · F · G · A · B' },
            ] as const).map((opt) => {
              const selected = notation === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onNotationChange?.(opt.id)}
                  className="px-3 py-3 border text-left transition cursor-pointer min-h-11"
                  style={{
                    backgroundColor: selected ? 'var(--color-accent)' : 'var(--color-paper-2)',
                    borderColor: selected ? 'var(--color-accent)' : 'var(--color-rule)',
                    color: selected ? 'var(--color-accent-ink)' : 'var(--color-ink)',
                    borderRadius: '2px',
                  }}
                >
                  <div className="text-sm font-semibold">{opt.title}</div>
                  <div className="text-[11px] font-mono opacity-80 mt-0.5">{opt.sample}</div>
                  <div className="text-[11px] font-mono opacity-80">
                    A4 → {formatNoteName('A4', opt.id)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 1. Microphone Input Device Selection */}
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 max-w-md">
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
              <label
                htmlFor="mic-device-select"
                className="font-display text-base font-bold"
                style={{ color: 'var(--color-ink)' }}
              >
                Microphone Input Device
              </label>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>
              Select your acoustic microphone. Raw capture without browser echo cancellation or noise suppression preserves high-register violin harmonics.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              id="mic-device-select"
              aria-label="Microphone input device"
              value={selectedMicDeviceId ?? ''}
              onChange={(e) => onSelectedMicDeviceIdChange?.(e.target.value || null)}
              className="px-3 py-1.5 text-xs sm:text-sm border font-sans cursor-pointer"
              style={{
                backgroundColor: 'var(--color-paper-2)',
                borderColor: 'var(--color-rule)',
                color: 'var(--color-ink)',
                borderRadius: '2px',
              }}
            >
              <option value="">Default System Microphone</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Microphone (${d.deviceId.slice(0, 8)}...)`}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={refreshDevices}
              aria-label="Refresh microphone list"
              title="Refresh microphone list"
              className="p-2 border transition cursor-pointer hover:opacity-80"
              style={{
                borderColor: 'var(--color-rule)',
                backgroundColor: 'var(--color-paper-2)',
                color: 'var(--color-ink)',
                borderRadius: '2px',
              }}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* 2. Reference Pitch Calibration (A4 = 438–445 Hz) */}
        <div className="p-4 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Music2 className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
                <span
                  className="font-display text-base font-bold"
                  style={{ color: 'var(--color-ink)' }}
                >
                  Concert Reference Pitch (A4)
                </span>
              </div>
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                Standard US concert pitch is 440 Hz. European and chamber orchestras frequently calibrate to 442 Hz.
              </p>
            </div>

            {/* Quick 440 & 442 Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onReferenceA4Change(440)}
                className="px-3 py-1.5 text-xs font-mono font-semibold transition border cursor-pointer"
                style={{
                  backgroundColor: referenceA4Hz === 440 ? 'var(--color-accent)' : 'var(--color-paper-2)',
                  color: referenceA4Hz === 440 ? 'var(--color-accent-ink)' : 'var(--color-ink)',
                  borderColor: referenceA4Hz === 440 ? 'var(--color-accent)' : 'var(--color-rule)',
                  borderRadius: '2px',
                }}
              >
                440 Hz (Standard)
              </button>
              <button
                type="button"
                onClick={() => onReferenceA4Change(442)}
                className="px-3 py-1.5 text-xs font-mono font-semibold transition border cursor-pointer"
                style={{
                  backgroundColor: referenceA4Hz === 442 ? 'var(--color-accent)' : 'var(--color-paper-2)',
                  color: referenceA4Hz === 442 ? 'var(--color-accent-ink)' : 'var(--color-ink)',
                  borderColor: referenceA4Hz === 442 ? 'var(--color-accent)' : 'var(--color-rule)',
                  borderRadius: '2px',
                }}
              >
                442 Hz (European)
              </button>
            </div>
          </div>

          {/* Slider for continuous 438–445 Hz */}
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between text-xs font-mono" style={{ color: 'var(--color-muted)' }}>
              <span>438 Hz</span>
              <span className="font-bold text-sm" style={{ color: 'var(--color-accent)' }}>
                {referenceA4Hz} Hz
              </span>
              <span>445 Hz</span>
            </div>
            <input
              type="range"
              min="438"
              max="445"
              step="1"
              value={referenceA4Hz}
              onChange={(e) => onReferenceA4Change(parseInt(e.target.value, 10))}
              aria-label="Reference A4 tuning frequency in Hertz"
              className="w-full accent-[oklch(46.0%_0.165_245)] cursor-pointer"
            />
          </div>
        </div>

        {/* 3. Intonation Strictness Tolerance */}
        <div className="p-4 sm:p-5 space-y-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
              <span
                className="font-display text-base font-bold"
                style={{ color: 'var(--color-ink)' }}
              >
                Intonation Strictness Tolerance
              </span>
            </div>
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              Maximum pitch deviation before a played note is classified as out of tune.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {STRICTNESS_PRESETS.map((opt) => {
              const isSelected = strictness === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onStrictnessChange(opt.id)}
                  aria-pressed={isSelected}
                  className="px-3.5 py-2 border text-xs font-semibold transition cursor-pointer inline-flex items-center gap-1.5"
                  style={{
                    backgroundColor: isSelected ? 'var(--color-accent)' : 'var(--color-paper-2)',
                    borderColor: isSelected ? 'var(--color-accent)' : 'var(--color-rule)',
                    color: isSelected ? 'var(--color-accent-ink)' : 'var(--color-ink)',
                    borderRadius: '2px',
                    boxShadow: isSelected ? '0 1px 4px var(--color-shadow)' : 'none',
                  }}
                >
                  <span>{opt.label}</span>
                  {isSelected && (
                    <Check
                      className="w-3.5 h-3.5"
                      style={{ color: 'var(--color-accent-ink)' }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Custom Tolerance Slider */}
          {strictness === 'custom' && (
            <div
              className="p-3.5 border space-y-1.5"
              style={{
                backgroundColor: 'var(--color-paper-2)',
                borderColor: 'var(--color-rule)',
                borderRadius: '2px',
              }}
            >
              <div className="flex justify-between text-xs font-mono" style={{ color: 'var(--color-muted)' }}>
                <span>Narrow (±3¢)</span>
                <span className="font-bold text-sm" style={{ color: 'var(--color-accent)' }}>
                  ±{customToleranceCents} cents
                </span>
                <span>Broad (±40¢)</span>
              </div>
              <input
                type="range"
                min="3"
                max="40"
                step="1"
                value={customToleranceCents}
                onChange={(e) => onCustomToleranceCentsChange(parseInt(e.target.value, 10))}
                aria-label="Custom intonation tolerance in cents"
                className="w-full accent-[oklch(46.0%_0.165_245)] cursor-pointer"
              />
            </div>
          )}
        </div>

        {/* 4. Acoustic Setup Guide: Bluetooth Earbuds & Microphone */}
        <div className="p-4 sm:p-5 space-y-2">
          <div className="flex items-center gap-2">
            <Headphones className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
            <h3
              className="font-display text-base font-bold"
              style={{ color: 'var(--color-ink)' }}
            >
              Bluetooth Earbuds &amp; Acoustic Setup Guide
            </h3>
          </div>

          <div
            className="p-3.5 border text-xs leading-relaxed space-y-2"
            style={{
              backgroundColor: 'var(--color-score-paper)',
              borderColor: 'var(--color-rule)',
              color: 'var(--color-ink-2)',
              borderRadius: '2px',
            }}
          >
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--color-accent)' }} />
              <div>
                <strong>Bluetooth Transmission Latency:</strong> Wireless earbuds typically introduce between 120ms and 250ms of audio delay. Violin Coach’s <em>Play-Along</em> engine is engineered with an onset tolerance window of <strong>[-100ms, +350ms]</strong>, ensuring Bluetooth playback delay will not penalize your intonation evaluation score.
              </div>
            </div>

            <div className="flex items-start gap-2 pt-1 border-t" style={{ borderColor: 'var(--color-rule)' }}>
              <div className="w-4 shrink-0" />
              <div>
                <strong>Acoustic Placement:</strong> Place your device or USB microphone 0.5 to 1.5 meters from the violin f-holes. Ensure raw microphone capture without operating system speech processing for maximum pitch tracking accuracy on low G3 string harmonics.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
