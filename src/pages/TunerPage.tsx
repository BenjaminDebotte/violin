import { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Disc } from 'lucide-react';
import { TunerHUD } from '../components/TunerHUD';
import { AudioPlaybackEngine } from '../modules/audio-playback/audioEngine';
import { MicSessionManager } from '../modules/pitch-detection/micSessionManager';
import { midiNoteToFrequency } from '../modules/pitch-detection/pitchMath';

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
            4-string open reference tones & live room-distance intonation needle
          </p>
        </div>
        <div className="text-xs font-mono" style={{ color: 'var(--color-muted)' }}>
          Concert Reference: A4 = {referenceA4Hz} Hz
        </div>
      </div>

      {/* 4 Interactive Open Violin String Peg Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {VIOLIN_STRINGS.map((str) => {
          const isPlaying = activeDroneMidi === str.midi;
          const currentHz = midiNoteToFrequency(str.midi, referenceA4Hz);

          return (
            <button
              key={str.note}
              type="button"
              onClick={() => handleToggleString(str.midi)}
              aria-label={`String ${str.note} drone`}
              aria-pressed={isPlaying}
              className="p-4 rounded-md border flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center relative overflow-hidden"
              style={{
                backgroundColor: isPlaying ? 'var(--color-accent)' : 'var(--color-paper-2)',
                borderColor: isPlaying ? 'var(--color-accent)' : 'var(--color-rule)',
                color: isPlaying ? 'var(--color-accent-ink)' : 'var(--color-ink)',
                boxShadow: isPlaying ? '0 2px 8px var(--color-shadow)' : 'none',
              }}
            >
              <span className="text-[11px] font-mono tracking-wider opacity-75 uppercase">
                String {str.label}
              </span>
              <span className="font-display text-3xl font-bold">{str.note}</span>
              <span className="text-xs font-mono tabular-nums opacity-85">
                {currentHz.toFixed(1)} Hz
              </span>
              <span className="text-[10px] opacity-75 line-clamp-1">
                {str.description}
              </span>

              <div
                className="mt-2 flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: isPlaying
                    ? 'oklch(97% 0.005 245 / 0.2)'
                    : 'var(--color-paper-3)',
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
          className="p-3 rounded-md border flex items-center justify-between gap-3 text-xs font-mono"
          style={{
            backgroundColor: 'var(--color-paper-2)',
            borderColor: 'var(--color-rule)',
          }}
        >
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
            <span>
              Sustaining drone for{' '}
              <strong style={{ color: 'var(--color-accent)' }}>
                {VIOLIN_STRINGS.find((s) => s.midi === activeDroneMidi)?.note}
              </strong>{' '}
              ({midiNoteToFrequency(activeDroneMidi, referenceA4Hz).toFixed(1)} Hz)
            </span>
          </div>
          <button
            type="button"
            onClick={handleStopAll}
            className="px-2.5 py-1 rounded border transition cursor-pointer flex items-center gap-1"
            style={{
              borderColor: 'var(--color-rule)',
              backgroundColor: 'var(--color-paper-3)',
              color: 'var(--color-ink)',
            }}
          >
            <VolumeX className="w-3.5 h-3.5" />
            <span>Mute Tone</span>
          </button>
        </div>
      )}

      {/* Live Room-Distance Pitch Tracking HUD */}
      <section className="space-y-2">
        <h3 className="font-display text-lg font-bold" style={{ color: 'var(--color-ink)' }}>
          Microphone Pitch HUD & Deviation Needle
        </h3>
        <TunerHUD
          referenceA4Hz={referenceA4Hz}
          toleranceCents={toleranceCents}
          micManager={injectedMic}
          className="rounded-md border shadow-sm"
        />
      </section>
    </div>
  );
}
