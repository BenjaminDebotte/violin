import { useEffect, useState } from 'react';
import { Volume2, VolumeX, Sparkles, Hand } from 'lucide-react';
import { FingeringHint, type FingeringHintReason } from './FingeringHint';
import { fingeringsFor } from '../../modules/fingerboard/fingering';
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
  /** MIDI numbers of the notes in the current bar, for the fingering hint's faint context. */
  readonly barMidis?: readonly number[];
}

const PANEL_COLORS: Record<PitchReading['verdict'], string> = {
  silent: 'var(--ebony)',
  'in-tune': 'var(--tune)',
  flat: 'var(--flat)',
  sharp: 'var(--sharp)',
};

function noteFontSize(label: string): number {
  if (label.length <= 2) return 48;
  if (label.length === 3) return 38;
  if (label.length === 4) return 30;
  return 26;
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
  barMidis,
}: FeedbackPanelProps) {
  const noteName = useNoteName();
  const target = controllerState.activeNote?.pitch ?? null;

  // Fingering helper:
  // When toggled via the Hand button, it stays sticky across all notes and bars while playing
  // until the user explicitly toggles it off or clicks dismiss.
  // When sticky mode is off, automatic hints in Wait-for-Me (stuck / wrong-note) still appear per-note.
  const hintKey = `${controllerState.activeNote?.id ?? ''}|${controllerState.loopCount}`;
  const [followFingers, setFollowFingers] = useState<boolean>(false);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  const isPlayAlong = practiceMode === 'play-along';
  const canHint = target !== null && (isPlayAlong || !controllerState.countInBeat);
  const dismissed = dismissedFor === hintKey;

  const offered = !isPlayAlong && controllerState.hint !== null && !dismissed && !followFingers;
  const showHint = canHint && (followFingers || offered);
  const hintReason: FingeringHintReason = offered && controllerState.hint ? controllerState.hint.reason : 'request';
  const targetLabel = target ? noteName(target.label) : '--';

  const dismissHint = () => {
    setFollowFingers(false);
    setDismissedFor(hintKey);
  };

  const toggleHint = () => {
    if (showHint) {
      dismissHint();
    } else {
      setDismissedFor(null);
      setFollowFingers(true);
    }
  };

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

  const { isRunning, isPaused, countInBeat } = controllerState;

  let headline: string;
  let detail: string;
  if (countInBeat && isRunning) {
    headline = `${countInBeat.beat}`;
    detail = `Count-in, beat ${countInBeat.beat} of ${countInBeat.total}`;
  } else if (controllerState.awaitingReattack && isRunning && !isPaused && livePitch !== null && reading.verdict === 'in-tune') {
    // The previous identical note is still ringing: ask for a new bow stroke
    headline = `${targetLabel} again`;
    detail = 'Same note: lift the bow, then play it again';
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

  // 300° intonation gauge:
  // Top is 0 cents (12 o'clock, 270° in standard SVG coordinates).
  // 150° counter-clockwise for flat (down to -50¢).
  // 150° clockwise for sharp (up to +50¢).
  // 60° gap at the bottom (between 60° and 120°).
  const GAUGE_R = 54;
  const GAUGE_C = 2 * Math.PI * GAUGE_R; // ~339.292
  const TRACK_LEN = GAUGE_C * (300 / 360); // ~282.743
  const halfTolAngle = Math.min(150, (toleranceCents / 50) * 150);
  const tolLen = GAUGE_C * ((halfTolAngle * 2) / 360);
  const tolStartAngle = 270 - halfTolAngle;

  const hasCents = reading.cents !== null;
  const centsClamped = hasCents ? Math.max(-50, Math.min(50, reading.cents!)) : 0;
  const centsAngle = (centsClamped / 50) * 150;
  const barLen = hasCents ? Math.max(2, GAUGE_C * (Math.abs(centsAngle) / 360)) : 0;
  const barStartAngle = centsClamped >= 0 ? 270 : 270 - Math.abs(centsAngle);
  const beadAngleRad = ((270 + centsAngle) * Math.PI) / 180;
  const beadX = 66 + GAUGE_R * Math.cos(beadAngleRad);
  const beadY = 66 + GAUGE_R * Math.sin(beadAngleRad);

  return (
    <section
      aria-label="Pitch feedback"
      data-hint={showHint ? 'on' : undefined}
      className="play-panel relative rounded-[28px] p-3 flex flex-col gap-2 transition-colors duration-150"
      style={{ backgroundColor: PANEL_COLORS[reading.verdict], color: 'var(--bone)' }}
    >
      <div className="flex items-center gap-3">
        <div
          className="panel-ring relative shrink-0 w-[104px] h-[104px] flex items-center justify-center"
          data-testid="target-note"
        >
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 132 132" aria-hidden="true">
            {/* Background track (300° arc from 120° to 60° clockwise) */}
            <circle
              cx="66"
              cy="66"
              r={GAUGE_R}
              fill="none"
              stroke="rgb(246 242 234 / 0.16)"
              strokeWidth="8"
              strokeDasharray={`${TRACK_LEN} ${GAUGE_C}`}
              transform="rotate(120 66 66)"
              strokeLinecap="round"
            />
            {/* In-tune tolerance window centered at 12 o'clock (270°) */}
            <circle
              cx="66"
              cy="66"
              r={GAUGE_R}
              fill="none"
              stroke={onColor ? 'rgb(246 242 234 / 0.35)' : 'var(--tune)'}
              strokeWidth="8"
              strokeDasharray={`${tolLen} ${GAUGE_C}`}
              transform={`rotate(${tolStartAngle} 66 66)`}
              strokeLinecap="round"
              opacity={0.85}
            />
            {/* Center tick at 12 o'clock (0 cents) */}
            <line
              x1="66"
              y1="5"
              x2="66"
              y2="11"
              stroke="var(--bone)"
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity={0.7}
            />
            {/* Active pitch arc extending from 12 o'clock towards flat or sharp */}
            {hasCents && (
              <circle
                cx="66"
                cy="66"
                r={GAUGE_R}
                fill="none"
                stroke="var(--bone)"
                strokeWidth="8"
                strokeDasharray={`${barLen} ${GAUGE_C}`}
                transform={`rotate(${barStartAngle} 66 66)`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 90ms linear, transform 90ms linear' }}
              />
            )}
            {/* Pointer bead at live pitch offset */}
            {hasCents && (
              <circle
                cx={beadX}
                cy={beadY}
                r="6"
                fill="var(--bone)"
                stroke={PANEL_COLORS[reading.verdict]}
                strokeWidth="2.5"
                style={{ transition: 'cx 90ms linear, cy 90ms linear' }}
              />
            )}
            {/* Low (flat) and High (sharp) labels near bottom ends */}
            <text x="32" y="124" fontSize="10" fontWeight="bold" fill="var(--bone)" opacity="0.6" textAnchor="middle">
              ♭
            </text>
            <text x="100" y="124" fontSize="10" fontWeight="bold" fill="var(--bone)" opacity="0.6" textAnchor="middle">
              ♯
            </text>
          </svg>
          <div
            role="meter"
            aria-label="Intonation"
            aria-valuenow={Math.round(centsClamped)}
            aria-valuemin={-50}
            aria-valuemax={50}
            aria-valuetext={
              hasCents
                ? `${Math.round(reading.cents!)} cents ${reading.cents! < 0 ? 'flat' : reading.cents! > 0 ? 'sharp' : 'in tune'}`
                : 'Silent'
            }
            className="sr-only"
          />
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
            style={{ fontSize: countInBeat && isRunning ? 54 : 28, letterSpacing: '-0.01em' }}
          >
            {headline}
          </p>
          {detail ? (
            <p className="panel-hint text-[14px] leading-snug mt-1" style={{ opacity: 0.86 }} aria-live="polite">
              {detail}
            </p>
          ) : null}
          <p className="mt-1 text-[14px] tabular" style={{ opacity: 0.75 }}>
            {controllerState.loopCount > 0
              ? `Loop ${controllerState.loopCount + 1}, bar ${controllerState.currentMeasureNumber}`
              : `Bar ${controllerState.currentMeasureNumber}`}
            {reading.cents !== null && reading.verdict !== 'silent'
              ? `, ${reading.cents > 0 ? '+' : ''}${Math.round(reading.cents)} cents`
              : ''}
          </p>
        </div>

        <div className="flex flex-col shrink-0 gap-1.5 self-center">
          {canHint && (
            <button
              type="button"
              onClick={toggleHint}
              aria-pressed={showHint}
              aria-label="Show finger placement"
              title="Show where the finger goes"
              className="shrink-0 h-10 w-10 rounded-full inline-flex items-center justify-center cursor-pointer"
              style={{
                backgroundColor: showHint ? 'var(--bone)' : 'rgb(246 242 234 / 0.14)',
                color: showHint ? 'var(--ink)' : 'var(--bone)',
              }}
            >
              <Hand className="w-5 h-5" />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleDrone}
            aria-pressed={droneActive}
            disabled={!target}
            aria-label={droneActive ? 'Stop drone' : `Hear ${targetLabel}`}
            title={droneActive ? 'Stop drone' : `Hear ${targetLabel}`}
            className="shrink-0 h-10 w-10 rounded-full inline-flex items-center justify-center cursor-pointer disabled:opacity-40"
            style={{
              backgroundColor: droneActive ? 'var(--bone)' : 'rgb(246 242 234 / 0.14)',
              color: droneActive ? 'var(--ink)' : 'var(--bone)',
            }}
          >
            {droneActive ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            <span className="sr-only">{droneActive ? 'Stop drone' : `Hear ${targetLabel}`}</span>
          </button>
        </div>
      </div>

      {showHint && (
        <FingeringHint
          fingerings={fingeringsFor(target?.midiNumber)}
          barMidis={barMidis}
          reason={hintReason}
          onDismiss={dismissHint}
        />
      )}

      {showSimulate && (
        <button
          type="button"
          onClick={onSimulateInTuneNote}
          className="self-start min-h-9 px-3 rounded-full inline-flex items-center gap-1.5 text-[13px] font-semibold cursor-pointer"
          style={{ backgroundColor: 'rgb(246 242 234 / 0.14)', color: 'var(--bone)' }}
        >
          <Sparkles className="w-4 h-4" />
          No mic: simulate an in-tune note
        </button>
      )}
    </section>
  );
}
