/**
 * Strict readonly TypeScript domain contracts for the Violin Coach PWA.
 * Shared across score-engine, pitch-detection, audio-playback, and practice-coach.
 */

export type NoteStep = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export interface NotePitch {
  readonly step: NoteStep;
  readonly alter: number;
  readonly octave: number;
  readonly midiNumber: number;
  readonly label: string;
  readonly frequencyHz440: number;
}

export interface PlayableNote {
  readonly id: string;
  readonly measureNumber: number;
  readonly partIndex: number;
  readonly isSolo: boolean;
  readonly pitch: NotePitch | null;
  readonly startBeat: number;
  readonly durationBeats: number;
  readonly startTimeMs: number;
  readonly durationMs: number;
  readonly cursorStepIndex: number;
  readonly tiedNoteIds: readonly string[];
}

export interface ScoreMeasureTimeSignature {
  readonly beats: number;
  readonly beatType: number;
}

export interface ScoreMeasure {
  readonly measureNumber: number;
  readonly startBeat: number;
  readonly durationBeats: number;
  readonly tempoBpm: number;
  readonly timeSignature: ScoreMeasureTimeSignature;
}

export interface ScoreTimeline {
  readonly scoreId: string;
  readonly title: string;
  readonly initialTempoBpm: number;
  readonly measures: readonly ScoreMeasure[];
  readonly soloNotes: readonly PlayableNote[];
  readonly accompanimentNotes: readonly PlayableNote[];
  readonly totalDurationMs: number;
  readonly totalBeats: number;
}

export interface PitchSample {
  readonly frequencyHz: number;
  readonly clarity: number;
  readonly rms: number;
  readonly audioTimeSec: number;
}

export type NoteGradeStatus = 'pending' | 'active' | 'green' | 'yellow' | 'red';
export type NoteGrade = NoteGradeStatus;

export interface NoteEvaluationResult {
  readonly noteId: string;
  readonly measureNumber: number;
  readonly status: 'green' | 'yellow' | 'red';
  readonly centsDelta: number | null;
  readonly onsetDeltaMs: number | null;
}

export interface PracticeSessionSummary {
  readonly totalNotes: number;
  readonly greenCount: number;
  readonly yellowCount: number;
  readonly redCount: number;
  readonly accuracyPercent: number;
  readonly averageAbsCentsDelta: number | null;
  readonly problemMeasures: readonly number[];
}

export type PracticeMode = 'wait-for-me' | 'play-along';

export type IntonationStrictness = 'easy' | 'medium' | 'strict' | 'custom';

export interface MixerSettings {
  readonly soloVolume: number;
  readonly soloMuted: boolean;
  readonly accompanimentVolume: number;
  readonly accompanimentMuted: boolean;
  readonly metronomeVolume: number;
  readonly metronomeMuted: boolean;
  readonly droneActive: boolean;
}

export interface MeasureLoopRange {
  readonly startMeasure: number;
  readonly endMeasure: number;
}

export interface PracticeSettings {
  readonly mode: PracticeMode;
  readonly tempoScale: number;
  readonly referenceA4Hz: number;
  readonly strictness: IntonationStrictness;
  readonly customToleranceCents: number;
  readonly countInBars: 0 | 1 | 2;
  readonly loopRange: MeasureLoopRange | null;
  readonly selectedMicDeviceId: string | null;
  readonly viewMode: 'page' | 'ribbon';
  readonly mixer: MixerSettings;
}

export const DEFAULT_MIXER_SETTINGS: MixerSettings = Object.freeze({
  soloVolume: 1.0,
  soloMuted: false,
  accompanimentVolume: 0.8,
  accompanimentMuted: false,
  metronomeVolume: 0.6,
  metronomeMuted: false,
  droneActive: false,
});

export const DEFAULT_PRACTICE_SETTINGS: PracticeSettings = Object.freeze({
  mode: 'wait-for-me',
  tempoScale: 1.0,
  referenceA4Hz: 440,
  strictness: 'medium',
  customToleranceCents: 15,
  countInBars: 1,
  loopRange: null,
  selectedMicDeviceId: null,
  viewMode: 'page',
  mixer: DEFAULT_MIXER_SETTINGS,
});

/**
 * Returns the intonation tolerance in cents for the given practice settings.
 * Easy: 25 cents
 * Medium: 15 cents
 * Strict: 8 cents
 * Custom: customToleranceCents (or fallback default 15)
 */
export function getToleranceCents(
  settings: {
    readonly strictness: IntonationStrictness;
    readonly customToleranceCents?: number;
  },
): number {
  switch (settings.strictness) {
    case 'easy':
      return 25;
    case 'medium':
      return 15;
    case 'strict':
      return 8;
    case 'custom':
      return settings.customToleranceCents ?? 15;
  }
}
