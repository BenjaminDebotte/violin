import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { RefreshCw, Check } from 'lucide-react';
import { type NotationSystem, formatNoteName } from '../modules/notation/noteNames';
import { type IntonationStrictness, getToleranceCents } from '../types/music';
import { clearEpisodes, loadEpisodes, summarize } from '../modules/fingerboard/hintStats';
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
  readonly hintsEnabled?: boolean;
  readonly onHintsEnabledChange?: (enabled: boolean) => void;
}

const STRICTNESS_PRESETS: readonly {
  readonly id: IntonationStrictness;
  readonly label: string;
  readonly description: string;
}[] = [
  { id: 'easy', label: 'Easy (±25¢)', description: 'Forgiving. Good for warm-ups and new pieces.' },
  { id: 'medium', label: 'Medium (±15¢)', description: 'The everyday setting.' },
  { id: 'strict', label: 'Strict (±8¢)', description: 'For auditions and chamber playing.' },
  { id: 'custom', label: 'Custom', description: 'Pick your own window, from ±3 to ±40 cents.' },
];

function Group({ title, hint, children }: { readonly title: string; readonly hint?: string; readonly children: ReactNode }) {
  return (
    <section className="p-4 space-y-3">
      <div>
        <h3 className="text-[17px] font-extrabold leading-tight">{title}</h3>
        {hint && (
          <p className="text-[14px] mt-0.5 leading-snug" style={{ color: 'var(--ink-2)' }}>
            {hint}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function choiceStyle(selected: boolean): React.CSSProperties {
  return {
    backgroundColor: selected ? 'var(--ebony)' : 'var(--plate-2)',
    color: selected ? 'var(--bone)' : 'var(--ink)',
    border: `1px solid ${selected ? 'var(--ebony)' : 'var(--rule)'}`,
  };
}

/**
 * Settings: note names, tuning reference, how strict "in tune" is,
 * microphone, and setup tips. All stored on this device.
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
  hintsEnabled = true,
  onHintsEnabledChange,
}: SettingsPageProps) {
  const [devices, setDevices] = useState<readonly AudioInputDeviceInfo[]>([]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const refreshDevices = useCallback(async () => {
    setIsRefreshing(true);
    try {
      setDevices(await listAudioInputDevices());
    } catch (err) {
      console.warn('Failed to list audio input devices:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  const [statsVersion, setStatsVersion] = useState(0);
  const stats = useMemo(() => summarize(loadEpisodes()), [statsVersion]);
  const fmt = (v: number | null) => (v === null ? 'n/a' : `${v.toFixed(1)} s`);

  const activeToleranceCents = getToleranceCents({ strictness, customToleranceCents });

  return (
    <div
      className="flex-1 w-full max-w-xl mx-auto px-4 pt-[max(1rem,var(--safe-top))] pb-8"
      data-testid="settings-page"
    >
      <h1 className="text-[30px] font-extrabold tracking-tight mb-3">Settings</h1>
      <div className="rounded-[24px] divide-y divide-[var(--rule)] overflow-hidden" style={{ backgroundColor: 'var(--plate)' }}>
        <Group title="Note names" hint="Used for the target note, the tuner and the drone.">
          <div role="radiogroup" aria-label="Note name notation" className="grid grid-cols-2 gap-2">
            {([
              { id: 'solfege', title: 'Do Ré Mi', sample: 'Do Ré Mi Fa Sol La Si' },
              { id: 'letters', title: 'A B C D E', sample: 'C D E F G A B' },
            ] as const).map((opt) => {
              const selected = notation === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onNotationChange?.(opt.id)}
                  className="px-3 py-3 rounded-[18px] text-left cursor-pointer min-h-11"
                  style={choiceStyle(selected)}
                >
                  <span className="block text-[17px] font-extrabold">{opt.title}</span>
                  <span className="block text-[13px] mt-0.5" style={{ opacity: 0.75 }}>
                    {opt.sample}
                  </span>
                  <span className="block text-[13px]" style={{ opacity: 0.75 }}>
                    A4 is {formatNoteName('A4', opt.id)}
                  </span>
                </button>
              );
            })}
          </div>
        </Group>

        <Group
          title="Finger hints"
          hint="In Wait for me, shows which string and finger a note is in 1st and 3rd position, after 2 seconds without finding it or when you play a wrong note."
        >
          <button
            type="button"
            role="switch"
            aria-checked={hintsEnabled}
            onClick={() => onHintsEnabledChange?.(!hintsEnabled)}
            className="w-full min-h-12 px-4 rounded-full inline-flex items-center justify-between text-[17px] font-bold cursor-pointer"
            style={{
              backgroundColor: hintsEnabled ? 'var(--ebony)' : 'var(--plate-2)',
              color: hintsEnabled ? 'var(--bone)' : 'var(--ink)',
              border: '1px solid var(--rule)',
            }}
          >
            <span>Finger hints</span>
            <span aria-hidden="true">{hintsEnabled ? 'On ●' : 'Off ○'}</span>
          </button>
          <div className="text-[14px] leading-snug space-y-1" style={{ color: 'var(--ink-2)' }}>
            <p>
              Notes that took 2 s or more to find, kept on this device only. Hints on: {stats.withHints.n} notes,
              median {fmt(stats.withHints.medianLockSec)} to find
              {stats.withHints.medianAfterHintSec !== null ? `, ${fmt(stats.withHints.medianAfterHintSec)} after the hint appeared` : ''}.
              Hints off: {stats.withoutHints.n} notes, median {fmt(stats.withoutHints.medianLockSec)}.
            </p>
            <button
              type="button"
              onClick={() => {
                clearEpisodes();
                setStatsVersion((v) => v + 1);
              }}
              className="min-h-11 px-3 rounded-full text-[14px] font-semibold cursor-pointer"
              style={{ backgroundColor: 'var(--plate-2)', border: '1px solid var(--rule)', color: 'var(--ink)' }}
            >
              Reset counters
            </button>
          </div>
        </Group>

        <Group title="Tuning reference" hint={`A = ${referenceA4Hz} Hz. Most teachers use 440; many European orchestras tune to 442.`}>
          <div className="grid grid-cols-2 gap-2">
            {([
              { hz: 440, label: '440 Hz (Standard)' },
              { hz: 442, label: '442 Hz (European)' },
            ] as const).map(({ hz, label }) => (
              <button
                key={hz}
                type="button"
                onClick={() => onReferenceA4Change(hz)}
                aria-pressed={referenceA4Hz === hz}
                className="min-h-12 rounded-full text-[15px] font-bold cursor-pointer"
                style={choiceStyle(referenceA4Hz === hz)}
              >
                {label}
              </button>
            ))}
          </div>
          <div>
            <div className="flex justify-between text-[13px] tabular" style={{ color: 'var(--ink-2)' }}>
              <span>438 Hz</span>
              <span className="font-extrabold text-[15px]" style={{ color: 'var(--ink)' }}>{referenceA4Hz} Hz</span>
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
              className="w-full h-11 cursor-pointer"
            />
          </div>
        </Group>

        <Group title="How strict is “in tune”?" hint={`Right now a note counts as in tune within ±${activeToleranceCents} cents.`}>
          <div className="grid grid-cols-2 gap-2">
            {STRICTNESS_PRESETS.map((opt) => {
              const isSelected = strictness === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onStrictnessChange(opt.id)}
                  aria-pressed={isSelected}
                  className="px-3 py-2.5 rounded-[18px] text-left cursor-pointer min-h-11"
                  style={choiceStyle(isSelected)}
                >
                  <span className="flex items-center gap-1 text-[15px] font-extrabold">
                    {opt.label}
                    {isSelected && <Check className="w-4 h-4" strokeWidth={3} />}
                  </span>
                  <span className="block text-[13px] leading-snug mt-0.5" style={{ opacity: 0.75 }}>
                    {opt.description}
                  </span>
                </button>
              );
            })}
          </div>
          {strictness === 'custom' && (
            <div>
              <div className="flex justify-between text-[13px] tabular" style={{ color: 'var(--ink-2)' }}>
                <span>±3¢</span>
                <span className="font-extrabold text-[15px]" style={{ color: 'var(--ink)' }}>±{customToleranceCents} cents</span>
                <span>±40¢</span>
              </div>
              <input
                type="range"
                min="3"
                max="40"
                step="1"
                value={customToleranceCents}
                onChange={(e) => onCustomToleranceCentsChange(parseInt(e.target.value, 10))}
                aria-label="Custom intonation tolerance in cents"
                className="w-full h-11 cursor-pointer"
              />
            </div>
          )}
        </Group>

        <Group title="Microphone" hint="Raw capture, without echo cancellation or noise suppression, so the violin's overtones survive.">
          <div className="flex items-center gap-2">
            <select
              id="mic-device-select"
              aria-label="Microphone input device"
              value={selectedMicDeviceId ?? ''}
              onChange={(e) => onSelectedMicDeviceIdChange?.(e.target.value || null)}
              className="flex-1 min-w-0 min-h-12 px-3 rounded-full text-[15px] cursor-pointer"
              style={{ backgroundColor: 'var(--plate-2)', border: '1px solid var(--rule)', color: 'var(--ink)' }}
            >
              <option value="">Default microphone</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Microphone (${d.deviceId.slice(0, 8)}…)`}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={refreshDevices}
              aria-label="Refresh microphone list"
              className="h-12 w-12 shrink-0 rounded-full flex items-center justify-center cursor-pointer"
              style={{ backgroundColor: 'var(--plate-2)', border: '1px solid var(--rule)', color: 'var(--ink)' }}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </Group>

        <section className="p-4">
          <details>
            <summary className="min-h-11 flex items-center text-[17px] font-extrabold cursor-pointer">
              Earbuds and microphone tips
            </summary>
            <div className="space-y-2 text-[15px] leading-relaxed pt-1" style={{ color: 'var(--ink-2)' }}>
              <p>
                <strong style={{ color: 'var(--ink)' }}>Bluetooth delay is fine.</strong> Wireless earbuds lag
                120 to 250 ms. Play along accepts notes from 100 ms early to 350 ms late, so the delay never
                counts against you.
              </p>
              <p>
                <strong style={{ color: 'var(--ink)' }}>Where to put the phone.</strong> On the music stand,
                half a metre to a metre and a half from the f-holes, microphone facing you.
              </p>
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}
