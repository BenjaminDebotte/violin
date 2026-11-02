import { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Disc } from 'lucide-react';
import { TunerHUD } from '../components/TunerHUD';
import { AudioPlaybackEngine } from '../modules/audio-playback/audioEngine';
import { MicSessionManager } from '../modules/pitch-detection/micSessionManager';
import { midiNoteToFrequency } from '../modules/pitch-detection/pitchMath';
import { useNoteName } from '../modules/notation/NotationContext';

export interface TunerPageProps {
  readonly referenceA4Hz: number;
  readonly toleranceCents?: number;
  readonly audioEngine?: AudioPlaybackEngine;
  readonly micManager?: MicSessionManager;
}

interface ViolinStringDef {
  readonly label: string;
  readonly note: string;
  readonly midi: number;
  readonly baseFrequency440: number;
  readonly description: string;
}

const VIOLIN_STRINGS: readonly ViolinStringDef[] = [
  { label: 'IV', note: 'G3', midi: 55, baseFrequency440: 196.0, description: 'G3 (lowest string, wound gut/silver)' },
  { label: 'III', note: 'D4', midi: 62, baseFrequency440: 293.66, description: 'D4 (warm middle string)' },
  { label: 'II', note: 'A4', midi: 69, baseFrequency440: 440.0, description: 'A4 (orchestral tuning reference)' },
  { label: 'I', note: 'E5', midi: 76, baseFrequency440: 659.25, description: 'E5 (highest string, steel)' },
];

/**
 * Dedicated 4-string open violin tuner page styled in Direction 1: Urtext Archive.
 * Interactive string peg cards play/toggle sustained reference drones via AudioPlaybackEngine.
 * Embeds TunerHUD for room-distance cent needle & live microphone pitch tracking.
 */
export function TunerPage({
  referenceA4Hz,
  toleranceCents = 15,
  audioEngine: injectedEngine,
  micManager: injectedMic,
}: TunerPageProps) {
  const noteName = useNoteName();
  const localEngineRef = useRef<AudioPlaybackEngine | null>(null);
  if (!injectedEngine && !localEngineRef.current) {
    localEngineRef.current = new AudioPlaybackEngine();
  }
  const audioEngine = injectedEngine ?? localEngineRef.current!;

  const [activeDroneMidi, setActiveDroneMidi] = useState<number | null>(null);

  // Stop drone on unmount
  useEffect(() => {
    return () => {
      audioEngine.stopDrone();
    };
  }, [audioEngine]);

  const handleToggleString = (midi: number) => {
    if (activeDroneMidi === midi) {
      audioEngine.stopDrone();
      setActiveDroneMidi(null);
    } else {
      audioEngine.startDrone(midi, referenceA4Hz);
      setActiveDroneMidi(midi);
    }
  };

  const handleStopAll = () => {
    audioEngine.stopDrone();
    setActiveDroneMidi(null);
  };

  // Calculate dial needle rotation degrees from cents (-50¢ = -90deg, 0¢ = 0deg, +50¢ = +90deg)
  const activeStringDef = VIOLIN_STRINGS.find((s) => s.midi === activeDroneMidi) ?? VIOLIN_STRINGS[2]; // Default to A4 if none active

  return (
    <div
      className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6"
      data-testid="tuner-page"
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
            Violin Pegbox Tuner
          </h2>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--color-muted)' }}>
            4-string open reference tones &amp; live room-distance intonation needle
          </p>
        </div>
        <div className="text-xs font-mono" style={{ color: 'var(--color-muted)' }}>
          Concert Reference: A4 = {referenceA4Hz} Hz
        </div>
      </div>

      {/* Centered Urtext Tuner Card Plate */}
      <div
        className="w-full max-w-[760px] mx-auto p-6 sm:p-8 border flex flex-col items-center gap-6"
        style={{
          backgroundColor: 'var(--color-score-paper)',
          borderColor: 'var(--color-rule)',
          borderRadius: '2px',
          boxShadow: '0 4px 16px var(--color-shadow)',
        }}
      >
        {/* Semi-circular engraved SVG cent dial from direction-1-urtext.html */}
        <div className="w-full max-w-[420px] flex flex-col items-center">
          <svg
            className="w-full h-auto select-none"
            viewBox="0 0 300 160"
            aria-label="Cent deviation meter"
          >
            {/* Dial background arc */}
            <path
              d="M 30 140 A 120 120 0 0 1 270 140"
              fill="none"
              stroke="var(--color-rule)"
              strokeWidth="12"
              strokeLinecap="round"
            />
            {/* Juniper in-tune sweet-spot arc (±5 cents) */}
            <path
              d="M 135 22 A 120 120 0 0 1 165 22"
              fill="none"
              stroke="var(--color-intonation-match)"
              strokeWidth="12"
            />
            {/* Cent tick marks */}
            <line x1="150" y1="20" x2="150" y2="34" stroke="var(--color-ink)" strokeWidth="2" />
            <line x1="90" y1="50" x2="98" y2="60" stroke="var(--color-muted)" strokeWidth="1.2" />
            <line x1="210" y1="50" x2="202" y2="60" stroke="var(--color-muted)" strokeWidth="1.2" />
            {/* Needle pointer */}
            <line
              x1="150"
              y1="140"
              x2="150"
              y2="28"
              stroke="var(--color-accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              style={{
                transformOrigin: '150px 140px',
                transform: 'rotate(0deg)',
                transition: 'transform 220ms cubic-bezier(0.18, 0.89, 0.32, 1.28)',
              }}
            />
            <circle cx="150" cy="140" r="7" fill="var(--color-accent)" />
            {/* Dial labels */}
            <text x="35" y="155" fontFamily="var(--font-mono)" fontSize="11" fill="var(--color-muted)">
              -50¢
            </text>
            <text
              x="150"
              y="55"
              fontFamily="var(--font-mono)"
              fontSize="12"
              fontWeight="600"
              fill="var(--color-ink)"
              textAnchor="middle"
            >
              0¢ In Tune
            </text>
            <text
              x="265"
              y="155"
              fontFamily="var(--font-mono)"
              fontSize="11"
              fill="var(--color-muted)"
              textAnchor="end"
            >
              +50¢
            </text>
          </svg>

          {/* Active String Readout */}
          <div className="text-center mt-1">
            <div
              className="font-display text-2xl font-bold"
              style={{ color: 'var(--color-ink)' }}
            >
              String {activeStringDef.label} · {noteName(activeStringDef.note)}
            </div>
            <div className="font-mono text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
              {midiNoteToFrequency(activeStringDef.midi, referenceA4Hz).toFixed(1)} Hz · Reference Tone
            </div>
          </div>
        </div>

        {/* 4 Interactive Open Violin String Peg Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
          {VIOLIN_STRINGS.map((str) => {
            const isPlaying = activeDroneMidi === str.midi;
            const currentHz = midiNoteToFrequency(str.midi, referenceA4Hz);

            return (
              <button
                key={str.note}
                type="button"
                onClick={() => handleToggleString(str.midi)}
                aria-label={`String ${noteName(str.note)} drone`}
                aria-pressed={isPlaying}
                className="p-3.5 border flex flex-col items-center justify-center gap-1 transition cursor-pointer text-center relative overflow-hidden"
                style={{
                  backgroundColor: isPlaying ? 'var(--color-accent)' : 'var(--color-paper-2)',
                  borderColor: isPlaying ? 'var(--color-accent)' : 'var(--color-rule)',
                  color: isPlaying ? 'var(--color-accent-ink)' : 'var(--color-ink)',
                  borderRadius: '2px',
                  boxShadow: isPlaying ? '0 2px 8px var(--color-shadow)' : 'none',
                }}
              >
                <span className="text-[11px] font-mono tracking-wider opacity-75 uppercase">
                  String {str.label}
                </span>
                <span className="font-display text-2xl font-bold">{noteName(str.note)}</span>
                <span className="text-xs font-mono tabular-nums opacity-85">
                  {currentHz.toFixed(1)} Hz
                </span>
                <span className="text-[10px] opacity-75 line-clamp-1">
                  {str.description.replace(str.note, noteName(str.note))}
                </span>

                <div
                  className="mt-1.5 flex items-center gap-1 text-[11px] font-mono px-2 py-0.5"
                  style={{
                    backgroundColor: isPlaying
                      ? 'oklch(97% 0.005 245 / 0.2)'
                      : 'var(--color-paper-3)',
                    borderRadius: '2px',
                  }}
                >
                  {isPlaying ? (
                    <>
                      <Volume2 className="w-3 h-3 animate-pulse" />
                      <span>Playing</span>
                    </>
                  ) : (
                    <>
                      <Disc className="w-3 h-3 opacity-60" />
                      <span>Play Drone</span>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Drone Controls Bar */}
        {activeDroneMidi !== null && (
          <div
            className="w-full p-3 border flex items-center justify-between gap-3 text-xs font-mono"
            style={{
              backgroundColor: 'var(--color-paper-2)',
              borderColor: 'var(--color-rule)',
              borderRadius: '2px',
            }}
          >
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
              <span>
                Sustaining drone for{' '}
                <strong style={{ color: 'var(--color-accent)' }}>
                  {noteName(VIOLIN_STRINGS.find((s) => s.midi === activeDroneMidi)?.note ?? '')}
                </strong>{' '}
                ({midiNoteToFrequency(activeDroneMidi, referenceA4Hz).toFixed(1)} Hz)
              </span>
            </div>
            <button
              type="button"
              onClick={handleStopAll}
              className="px-2.5 py-1 border transition cursor-pointer flex items-center gap-1"
              style={{
                borderColor: 'var(--color-accent)',
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-accent-ink)',
                borderRadius: '2px',
              }}
            >
              <VolumeX className="w-3.5 h-3.5" />
              <span>Stop Tone</span>
            </button>
          </div>
        )}
      </div>

      {/* Live Room-Distance Pitch Tracking HUD */}
      <section className="space-y-2 max-w-[760px] w-full mx-auto">
        <h3 className="font-display text-lg font-bold" style={{ color: 'var(--color-ink)' }}>
          Microphone Pitch HUD &amp; Deviation Needle
        </h3>
        <TunerHUD
          referenceA4Hz={referenceA4Hz}
          toleranceCents={toleranceCents}
          micManager={injectedMic}
          className="border shadow-sm"
        />
      </section>
    </div>
  );
}
