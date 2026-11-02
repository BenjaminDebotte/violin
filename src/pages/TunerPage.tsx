import { useState, useEffect, useRef } from 'react';
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
  readonly roman: string;
  readonly note: string;
  readonly midi: number;
  /** Drawn thickness in px: the G string is the thickest, the E the thinnest. */
  readonly gauge: number;
  readonly hint: string;
}

const VIOLIN_STRINGS: readonly ViolinStringDef[] = [
  { roman: 'IV', note: 'G3', midi: 55, gauge: 5, hint: 'lowest' },
  { roman: 'III', note: 'D4', midi: 62, gauge: 4, hint: 'tune 2nd' },
  { roman: 'II', note: 'A4', midi: 69, gauge: 3, hint: 'tune 1st' },
  { roman: 'I', note: 'E5', midi: 76, gauge: 2, hint: 'highest' },
];

/**
 * Tune: the four open strings drawn as strings (thickest on the left). Tap one to hear a
 * sustained reference; the live needle below listens to your violin.
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

  return (
    <div className="flex-1 w-full max-w-xl mx-auto px-4 pt-[max(1rem,var(--safe-top))] pb-8 flex flex-col gap-5" data-testid="tuner-page">
      <div>
        <h1 className="text-[30px] font-extrabold tracking-tight">Tune</h1>
        <p className="text-[15px] mt-0.5" style={{ color: 'var(--ink-2)' }}>
          Tap a string to hear it, then match it on your violin. Tuned to A = {referenceA4Hz} Hz.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-2 rounded-[28px] p-2" style={{ backgroundColor: 'var(--ebony)' }}>
        {VIOLIN_STRINGS.map((str) => {
          const isPlaying = activeDroneMidi === str.midi;
          const label = noteName(str.note);
          return (
            <button
              key={str.note}
              type="button"
              onClick={() => handleToggleString(str.midi)}
              aria-label={`String ${label} drone`}
              aria-pressed={isPlaying}
              className="relative h-[220px] rounded-[22px] flex flex-col items-center pt-4 pb-3 cursor-pointer overflow-hidden"
              style={{
                backgroundColor: isPlaying ? 'var(--rosin)' : 'transparent',
                color: isPlaying ? 'var(--ink)' : 'var(--bone)',
              }}
            >
              <span className="relative z-10 text-[30px] font-extrabold leading-none">{label}</span>
              <span className="relative z-10 text-[12px] mt-1 tabular" style={{ opacity: 0.75 }}>
                {midiNoteToFrequency(str.midi, referenceA4Hz).toFixed(1)} Hz
              </span>
              <span
                aria-hidden="true"
                className={`absolute top-[76px] bottom-10 left-1/2 -translate-x-1/2 rounded-full ${isPlaying ? 'string-shimmer' : ''}`}
                style={{ width: str.gauge, backgroundColor: isPlaying ? 'var(--ebony)' : 'rgb(246 242 234 / 0.75)' }}
              />
              <span className="absolute bottom-3 text-[12px] font-bold" style={{ opacity: 0.8 }}>
                {isPlaying ? 'Playing' : str.hint}
              </span>
            </button>
          );
        })}
      </div>

      <section aria-label="Live tuner" className="space-y-2">
        <h2 className="text-[17px] font-extrabold">Listen to my violin</h2>
        <TunerHUD referenceA4Hz={referenceA4Hz} toleranceCents={toleranceCents} micManager={injectedMic} />
      </section>
    </div>
  );
}
