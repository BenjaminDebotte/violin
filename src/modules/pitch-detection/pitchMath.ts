import { type NoteStep } from '../../types/music';

/**
 * Standard acoustic violin frequency boundaries.
 * MIN_VIOLIN_HZ: 175 Hz (just below open G3 = 196 Hz).
 * MAX_VIOLIN_HZ: 3600 Hz (up to high A7 = 3520 Hz with safety headroom).
 */
export const MIN_VIOLIN_HZ = 175;
export const MAX_VIOLIN_HZ = 3600;

export interface DetectedMidiNote {
  readonly midiNumber: number;
  readonly step: NoteStep;
  readonly alter: number;
  readonly octave: number;
  readonly label: string;
  readonly centsDelta: number;
  readonly targetFrequencyHz: number;
}

const PITCH_CLASSES: ReadonlyArray<{ readonly step: NoteStep; readonly alter: number }> = [
  { step: 'C', alter: 0 },
  { step: 'C', alter: 1 },
  { step: 'D', alter: 0 },
  { step: 'D', alter: 1 },
  { step: 'E', alter: 0 },
  { step: 'F', alter: 0 },
  { step: 'F', alter: 1 },
  { step: 'G', alter: 0 },
  { step: 'G', alter: 1 },
  { step: 'A', alter: 0 },
  { step: 'A', alter: 1 },
  { step: 'B', alter: 0 },
];

/**
 * Converts a MIDI note number (e.g. 69 for A4) to its fundamental frequency in Hz,
 * scaled by the given reference A4 frequency (default 440 Hz).
 */
export function midiNoteToFrequency(midiNote: number, referenceA4Hz = 440): number {
  return referenceA4Hz * Math.pow(2, (midiNote - 69) / 12);
}

/**
 * Computes the deviation in cents between a detected frequency in Hz and a target MIDI note.
 * Positive cents = sharp (too high), negative cents = flat (too low).
 * 100 cents = 1 equal-tempered semitone.
 */
export function frequencyToCentsDelta(
  detectedHz: number,
  targetMidiNote: number,
  referenceA4Hz = 440,
): number {
  if (detectedHz <= 0) {
    return 0;
  }
  const targetHz = midiNoteToFrequency(targetMidiNote, referenceA4Hz);
  if (targetHz <= 0) {
    return 0;
  }
  return 1200 * Math.log2(detectedHz / targetHz);
}

/**
 * Identifies the closest MIDI note to a detected frequency in Hz,
 * returning the note name, octave, step, alter, cents delta, and target frequency.
 */
export function detectClosestMidiNote(
  detectedHz: number,
  referenceA4Hz = 440,
): DetectedMidiNote {
  if (detectedHz <= 0) {
    return {
      midiNumber: 0,
      step: 'C',
      alter: 0,
      octave: -1,
      label: 'C-1',
      centsDelta: 0,
      targetFrequencyHz: 0,
    };
  }

  const fractionalMidi = 69 + 12 * Math.log2(detectedHz / referenceA4Hz);
  const midiNumber = Math.round(fractionalMidi);
  const targetFrequencyHz = midiNoteToFrequency(midiNumber, referenceA4Hz);
  const centsDelta = frequencyToCentsDelta(detectedHz, midiNumber, referenceA4Hz);

  const octave = Math.floor(midiNumber / 12) - 1;
  const semitone = ((midiNumber % 12) + 12) % 12;
  const pitchClass = PITCH_CLASSES[semitone];

  const label = `${pitchClass.step}${pitchClass.alter === 1 ? '#' : ''}${octave}`;

  return {
    midiNumber,
    step: pitchClass.step,
    alter: pitchClass.alter,
    octave,
    label,
    centsDelta,
    targetFrequencyHz,
  };
}

/**
 * Computes the Root Mean Square (RMS) energy level of a time-domain Float32Array audio buffer.
 * Returns 0 if the buffer is empty.
 */
export function computeRms(buffer: Float32Array): number {
  const len = buffer.length;
  if (len === 0) {
    return 0;
  }
  let sumSquares = 0;
  for (let i = 0; i < len; i++) {
    const val = buffer[i];
    sumSquares += val * val;
  }
  return Math.sqrt(sumSquares / len);
}
