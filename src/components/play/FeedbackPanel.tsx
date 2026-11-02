import { useEffect, useState } from 'react';
import { Volume2, VolumeX, Sparkles } from 'lucide-react';
import { useNoteName } from '../../modules/notation/NotationContext';
import type { PracticeControllerState } from '../../modules/practice-coach/practiceController';
import type { PitchSample, PracticeMode } from '../../types/music';
import {
  detectClosestMidiNote,
  frequencyToCentsDelta,
} from '../../modules/pitch-detection/pitchMath';
import { classifyCents, type PitchReading } from '../../modules/practice-coach/sessionResult';

export interface FeedbackPanelProps {
  readonly controllerState: PracticeControllerState;
  readonly practiceMode: PracticeMode;
  readonly livePitch: PitchSample | null;
  readonly referenceA4Hz: number;
  readonly toleranceCents: number;
  /** Shown before the session starts (how this mode works). */
  readonly idleHint: string;
  readonly droneActive: boolean;
  readonly onToggleDrone: () => void;
  readonly showSimulate: boolean;
  readonly onSimulateInTuneNote: () => void;
}

const PANEL_COLORS: Record<PitchReading['verdict'], string> = {
  silent: 'var(--ebony)',
  'in-tune': 'var(--tune)',
  flat: 'var(--flat)',
  sharp: 'var(--sharp)',
};

const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;

function noteFontSize(label: string): number {
  if (label.length <= 2) return 60;
  if (label.length === 3) return 50;
  if (label.length === 4) return 40;
  return 34;
}

/**
 * The glanceable half of the play screen: the target note inside a hold ring, a verdict
 * in words and arrows (never colour alone), a cents meter, and the whole panel flooding
 * with the verdict colour so it reads from across the room.
 */
export function FeedbackPanel({
  controllerState,
  practiceMode,
  livePitch,
  referenceA4Hz,
  toleranceCents,
  idleHint,
  droneActive,
  onToggleDrone,
  showSimulate,
  onSimulateInTuneNote,
}: FeedbackPanelProps) {
  const noteName = useNoteName();
  const target = controllerState.activeNote?.pitch ?? null;
  const targetLabel = target ? noteName(target.label) : '--';

  // Briefly echo the last graded note when no live pitch is available (e.g. no mic).
  const [echo, setEcho] = useState<PitchReading | null>(null);
  useEffect(() => {
    const graded = controllerState.latestNoteGrade;
    if (!graded) return;
    const cents = graded.result.centsDelta;
    if (graded.grade === 'green') {
      setEcho({ verdict: 'in-tune', close: true, cents });
    } else {
      setEcho({
        verdict: (cents ?? 0) < 0 ? 'flat' : 'sharp',
        close: graded.grade === 'yellow',
        cents,
      });
    }
    const id = setTimeout(() => setEcho(null), 1400);
    return () => clearTimeout(id);
  }, [controllerState.latestNoteGrade]);

  let reading: PitchReading = { verdict: 'silent', close: false, cents: null };
  let heardLabel: string | null = null;
  if (livePitch && livePitch.frequencyHz > 0 && target) {
    const cents = frequencyToCentsDelta(livePitch.frequencyHz, target.midiNumber, referenceA4Hz);
    reading = classifyCents(cents, toleranceCents);
    if (Math.abs(cents) > 70) {
      heardLabel = noteName(detectClosestMidiNote(livePitch.frequencyHz, referenceA4Hz).label);
    }
  } else if (echo && controllerState.isRunning && !controllerState.isPaused) {
    reading = echo;
  }

  const { isRunning, isPaused, countInBeat, holdProgress } = controllerState;
  const showRing = practiceMode === 'wait-for-me';
  const progress = Math.max(0, Math.min(1, holdProgress));

  let headline: string;
  let detail: string;
  if (countInBeat && isRunning) {
    headline = `${countInBeat.beat}`;
    detail = `Count-in, beat ${countInBeat.beat} of ${countInBeat.total}`;
  } else if (reading.verdict === 'in-tune') {
    headline = 'In tune';
    detail = practiceMode === 'wait-for-me' ? 'Hold it…' : 'Lovely';
  } else if (reading.verdict === 'flat') {
    headline = reading.close ? 'A little flat' : 'Flat';
    detail = heardLabel ? `You're on ${heardLabel}. Go higher ↑` : 'Go higher ↑';
  } else if (reading.verdict === 'sharp') {
    headline = reading.close ? 'A little sharp' : 'Sharp';
    detail = heardLabel ? `You're on ${heardLabel}. Go lower ↓` : 'Go lower ↓';
  } else if (isPaused) {
    headline = 'Paused';
    detail = 'Tap Resume when you are ready';
  } else if (isRunning) {
    headline = practiceMode === 'wait-for-me' ? `Play ${targetLabel}` : 'Listening';
    detail = practiceMode === 'wait-for-me' ? 'The music waits for you' : 'Stay with the piano';
  } else {
    headline = 'Ready';
    detail = idleHint;
  }

  const onColor = reading.verdict !== 'silent';
  const markerPct = reading.cents === null ? 50 : 50 + Math.max(-50, Math.min(50, reading.cents));
  const zonePct = Math.min(100, toleranceCents * 2);

  return (
    <section
      aria-label="Pitch feedback"
      className="play-panel relative rounded-[28px] p-4 flex flex-col gap-3 transition-colors duration-150"
      style={{ backgroundColor: PANEL_COLORS[reading.verdict], color: 'var(--bone)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="panel-hint text-[15px] leading-snug min-h-[2.6em]" style={{ opacity: 0.86 }} aria-live="polite">
          {detail}
        </p>
        <button
          type="button"
          onClick={onToggleDrone}
          aria-pressed={droneActive}
          disabled={!target}
          className="shrink-0 min-h-11 px-3.5 rounded-full inline-flex items-center gap-1.5 text-[15px] font-bold cursor-pointer disabled:opacity-40"
          style={{
            backgroundColor: droneActive ? 'var(--bone)' : 'rgb(246 242 234 / 0.14)',
            color: droneActive ? 'var(--ink)' : 'var(--bone)',
          }}
        >
          {droneActive ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          {droneActive ? 'Stop drone' : `Hear ${targetLabel}`}
        </button>
      </div>

      <div className="flex items-center gap-4">
        <div
          className="panel-ring relative shrink-0 w-[132px] h-[132px] flex items-center justify-center"
          data-testid="target-note"
        >
          {showRing && (
            <>
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 132 132" aria-hidden="true">
                <circle cx="66" cy="66" r={RING_R} fill="none" stroke="rgb(246 242 234 / 0.16)" strokeWidth="9" />
                <circle
                  cx="66"
                  cy="66"
                  r={RING_R}
                  fill="none"
                  stroke={onColor ? 'var(--bone)' : 'var(--rosin)'}
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={RING_C}
                  strokeDashoffset={RING_C - progress * RING_C}
                  style={{ transition: 'stroke-dashoffset 80ms linear' }}
                />
              </svg>
              <div
                role="progressbar"
                aria-label="Hold progress"
                aria-valuenow={Math.round(progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                className="sr-only"
              />
            </>
          )}
          <span
            className="relative font-extrabold leading-none tabular"
            style={{ fontSize: noteFontSize(targetLabel), letterSpacing: '-0.02em' }}
            aria-label={`Target note ${targetLabel}`}
          >
            {targetLabel}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p
            className="font-extrabold leading-[1.05] break-words"
            style={{ fontSize: countInBeat && isRunning ? 64 : 30, letterSpacing: '-0.01em' }}
          >
            {headline}
          </p>
          <p className="mt-1 text-[15px] tabular" style={{ opacity: 0.8 }}>
            {controllerState.loopCount > 0
              ? `Loop ${controllerState.loopCount + 1}, bar ${controllerState.currentMeasureNumber}`
              : `Bar ${controllerState.currentMeasureNumber}`}
            {reading.cents !== null && reading.verdict !== 'silent'
              ? `, ${reading.cents > 0 ? '+' : ''}${Math.round(reading.cents)} cents`
              : ''}
          </p>
        </div>
      </div>

      {/* Cents meter: low (flat) on the left, high (sharp) on the right; the green zone is your tolerance */}
      <div aria-hidden="true" className="panel-meter px-1">
        <div className="relative h-3 rounded-full" style={{ backgroundColor: 'rgb(246 242 234 / 0.16)' }}>
          <div
            className="absolute top-0 bottom-0 rounded-full"
            style={{
              left: `${50 - zonePct / 2}%`,
              width: `${zonePct}%`,
              backgroundColor: onColor ? 'rgb(246 242 234 / 0.4)' : 'var(--tune)',
            }}
          />
          {reading.cents !== null && (
            <div
              className="absolute -top-1.5 h-6 w-6 -ml-3 rounded-full border-[3px]"
              style={{
                left: `${markerPct}%`,
                backgroundColor: 'var(--bone)',
                borderColor: PANEL_COLORS[reading.verdict],
                transition: 'left 90ms linear',
              }}
            />
          )}
        </div>
        <div className="mt-1 flex justify-between text-[13px]" style={{ opacity: 0.7 }}>
          <span>Low</span>
          <span>High</span>
        </div>
      </div>

      {showSimulate && (
        <button
          type="button"
          onClick={onSimulateInTuneNote}
          className="self-start min-h-11 px-3.5 rounded-full inline-flex items-center gap-1.5 text-[14px] font-semibold cursor-pointer"
          style={{ backgroundColor: 'rgb(246 242 234 / 0.14)', color: 'var(--bone)' }}
        >
          <Sparkles className="w-4 h-4" />
          No mic: simulate an in-tune note
        </button>
      )}
    </section>
  );
}
