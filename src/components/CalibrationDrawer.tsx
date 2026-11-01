import { useEffect } from 'react';
import {
  X,
  Sliders,
  Check,
  Headphones,
  Mic,
  Sparkles,
} from 'lucide-react';
import { type IntonationStrictness, getToleranceCents } from '../types/music';

export interface CalibrationDrawerProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly referenceA4Hz: number;
  readonly onReferenceA4Change: (hz: number) => void;
  readonly strictness: IntonationStrictness;
  readonly onStrictnessChange: (strictness: IntonationStrictness) => void;
  readonly customToleranceCents: number;
  readonly onCustomToleranceCentsChange: (cents: number) => void;
}

const STRICTNESS_OPTIONS: readonly {
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
 * Calibration Drawer / Modal.
 * Configures A4 reference tuning frequency (438–445 Hz), intonation strictness,
 * and provides Bluetooth earbuds + built-in microphone setup guidance.
 */
export function CalibrationDrawer({
  isOpen,
  onClose,
  referenceA4Hz,
  onReferenceA4Change,
  strictness,
  onStrictnessChange,
  customToleranceCents,
  onCustomToleranceCentsChange,
}: CalibrationDrawerProps) {
  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentTolerance = getToleranceCents({
    strictness,
    customToleranceCents,
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Calibration & Settings"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-slate-100">
              Audio Calibration & Strictness
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Calibration"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Reference A4 Frequency */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="calibration-a4-slider"
                className="text-sm font-semibold text-slate-200"
              >
                A4 Reference Pitch: <span className="text-emerald-400 font-mono">{referenceA4Hz} Hz</span>
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onReferenceA4Change(440)}
                  aria-label="Set A4 to 440 Hz"
                  className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium border transition cursor-pointer ${
                    referenceA4Hz === 440
                      ? 'bg-emerald-600 text-white border-emerald-500'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  440 Hz (Std)
                </button>
                <button
                  type="button"
                  onClick={() => onReferenceA4Change(442)}
                  aria-label="Set A4 to 442 Hz"
                  className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium border transition cursor-pointer ${
                    referenceA4Hz === 442
                      ? 'bg-emerald-600 text-white border-emerald-500'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  442 Hz (Orch)
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
              <span className="text-xs text-slate-500 font-mono">438 Hz</span>
              <input
                id="calibration-a4-slider"
                type="range"
                min="438"
                max="445"
                step="1"
                value={referenceA4Hz}
                onChange={(e) => onReferenceA4Change(parseInt(e.target.value, 10))}
                aria-label="Reference A4 Hz Slider"
                className="flex-1 accent-emerald-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
              />
              <span className="text-xs text-slate-500 font-mono">445 Hz</span>
            </div>
          </div>

          {/* Intonation Strictness */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-200">
                Intonation Strictness
              </span>
              <span className="text-xs text-emerald-400 font-mono font-medium">
                Active: ±{currentTolerance}¢
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {STRICTNESS_OPTIONS.map((opt) => {
                const isSelected = strictness === opt.id;
                return (
                  <div
                    key={opt.id}
                    onClick={() => onStrictnessChange(opt.id)}
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={0}
                    aria-label={opt.label}
                    className={`p-3 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-emerald-950/40 border-emerald-500/80 shadow-md shadow-emerald-950/30'
                        : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-slate-100">
                        {opt.id === 'custom'
                          ? `Custom (±${customToleranceCents}¢)`
                          : opt.label}
                      </span>
                      {isSelected && (
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-slate-400 leading-snug">
                      {opt.description}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Custom Strictness Slider */}
            {strictness === 'custom' && (
              <div className="mt-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between text-xs">
                  <label
                    htmlFor="calibration-custom-cents"
                    className="text-slate-300 font-medium"
                  >
                    Custom Tolerance Window:
                  </label>
                  <span className="font-mono text-emerald-400 font-bold">
                    ±{customToleranceCents}¢
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-500 font-mono">±3¢</span>
                  <input
                    id="calibration-custom-cents"
                    type="range"
                    min="3"
                    max="40"
                    step="1"
                    value={customToleranceCents}
                    onChange={(e) =>
                      onCustomToleranceCentsChange(parseInt(e.target.value, 10))
                    }
                    aria-label="Custom Tolerance Cents Slider"
                    className="flex-1 accent-emerald-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <span className="text-[11px] text-slate-500 font-mono">±40¢</span>
                </div>
              </div>
            )}
          </div>

          {/* Bluetooth Earbuds & Microphone Advice Tip */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold">
              <Headphones className="w-4 h-4 shrink-0" />
              <span>Bluetooth Earbuds & Microphone Tip</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              When playing with wireless Bluetooth earbuds (like AirPods), two-way voice protocol degrades microphone sampling and introduces delay.
            </p>
            <div className="flex items-start gap-2 bg-slate-900/90 rounded-lg p-2.5 border border-slate-800 text-xs text-slate-400">
              <Mic className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <p>
                <strong className="text-slate-200">Recommendation:</strong> Select your laptop or phone&apos;s <strong className="text-emerald-400">built-in device microphone</strong> in the Tuner HUD selector while listening to playback through your Bluetooth earbuds. This delivers pristine acoustic violin pitch pickup without wireless audio distortion.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Apply & Done"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-md transition cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Apply & Done</span>
          </button>
        </div>
      </div>
    </div>
  );
}
