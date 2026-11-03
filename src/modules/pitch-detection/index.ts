export {
  MIN_VIOLIN_HZ,
  MAX_VIOLIN_HZ,
  type DetectedMidiNote,
  midiNoteToFrequency,
  frequencyToCentsDelta,
  detectClosestMidiNote,
  computeRms,
} from './pitchMath';

export {
  PitchSmoothingFilter,
  type PitchSmoothingFilterOptions,
} from './pitchFilter';

export {
  classifyMicError,
  type MicErrorInfo,
  type MicErrorKind,
} from './micErrors';

export {
  MicSessionManager,
  listAudioInputDevices,
  type AudioInputDeviceInfo,
  type PitchSubscriber,
  type MicSessionManagerOptions,
} from './micSessionManager';
