import { useState } from 'react';
import { ChevronLeft, Play, Pause, Square, SlidersHorizontal, Repeat, FileText, AlignJustify } from 'lucide-react';
import { type StoredScore } from '../modules/score-engine/scoreStore';
import { ScoreViewport } from '../components/ScoreViewport';
import { MixerPanel } from '../components/MixerPanel';
import { FeedbackPanel } from '../components/play/FeedbackPanel';
import { MicErrorBanner, MicPill } from '../components/play/MicStatus';
import type { MicSessionManager } from '../modules/pitch-detection/micSessionManager';
import { Segmented, Sheet } from '../components/ui';
import { useNoteName } from '../modules/notation/NotationContext';
import type { PracticeControllerState } from '../modules/practice-coach/practiceController';
import type {
  IntonationStrictness,
  MeasureLoopRange,
  MixerSettings,
  PitchSample,
  PracticeMode,
} from '../types/music';

export interface PlayPageProps {
  readonly title: string;
  readonly subtitle: string;
  readonly idleHint: string;
  readonly currentScore: StoredScore;
  readonly totalMeasures: number;
  readonly controllerState: PracticeControllerState;
  readonly practiceMode: PracticeMode;
  readonly onPracticeModeChange: (mode: PracticeMode) => void;
  readonly viewMode: 'page' | 'ribbon';
  readonly onViewModeChange: (mode: 'page' | 'ribbon') => void;
  readonly loopRange: MeasureLoopRange | null;
  readonly onLoopRangeChange: (range: MeasureLoopRange | null) => void;
  readonly onStartPractice: () => void;
  readonly onPausePractice: () => void;
  readonly onResumePractice: () => void;
  readonly onStopPractice: () => void;
  readonly onClose: () => void;
  readonly onSimulateInTuneNote: () => void;
  readonly showSimulate: boolean;
  readonly onToggleDrone: () => void;
  readonly mixer: MixerSettings;
  readonly onMixerChange: (mixer: MixerSettings) => void;
  readonly tempoScale: number;
  readonly onTempoScaleChange: (scale: number) => void;
  readonly countInBars: 1 | 2;
  readonly onCountInBarsChange: (bars: 1 | 2) => void;
  readonly strictness: IntonationStrictness;
  readonly onStrictnessChange: (s: IntonationStrictness) => void;
  readonly toleranceCents: number;
  readonly referenceA4Hz: number;
  readonly livePitch: PitchSample | null;
  readonly barMidis?: readonly number[];
  /** Lets the play screen show that the microphone is live and how loud it hears you. */
  readonly micManager?: MicSessionManager;
  readonly onRetryMic?: () => void;
}

const ICON_BTN =
  'h-14 w-14 shrink-0 rounded-full flex flex-col items-center justify-center cursor-pointer disabled:opacity-35 disabled:cursor-default';

/**
 * Focused play screen. Top: where you are (title, bar tapes). Middle: the score plate with
 * the rosin playhead. Below it the glanceable feedback panel. Bottom, in the thumb zone:
 * mode switch and one big Start / Pause button.
 */
export function PlayPage(props: PlayPageProps) {
  const {
    title,
    subtitle,
    idleHint,
    currentScore,
    totalMeasures,
    controllerState,
    practiceMode,
    onPracticeModeChange,
    viewMode,
    onViewModeChange,
    loopRange,
    onLoopRangeChange,
    onStartPractice,
    onPausePractice,
    onResumePractice,
    onStopPractice,
    onClose,
    tempoScale,
  } = props;
  const noteName = useNoteName();
  const [openSheet, setOpenSheet] = useState<'options' | 'loop' | null>(null);

  const firstBar = loopRange?.startMeasure ?? 1;
  const lastBar = loopRange?.endMeasure ?? Math.max(totalMeasures, 1);
  const bars = Array.from({ length: lastBar - firstBar + 1 }, (_, i) => firstBar + i);
  const current = controllerState.currentMeasureNumber;
  const hasStarted = controllerState.isRunning;

  return (
    <div
      className="flex flex-col w-full max-w-[1200px] mx-auto px-3 lg:px-6 pt-[max(0.5rem,var(--safe-top))] pb-[max(0.75rem,var(--safe-bottom))] gap-2 h-dvh overflow-hidden"
      data-testid="play-page"
    >
      {/* Where am I */}
      <header className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close practice"
          className="h-11 w-11 shrink-0 rounded-full flex items-center justify-center cursor-pointer"
          style={{ color: 'var(--ink)' }}
        >
          <ChevronLeft className="w-7 h-7" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[18px] font-extrabold leading-tight truncate">{title}</h1>
          <p className="text-[14px] leading-tight truncate" style={{ color: 'var(--ink-2)' }}>
            {subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpenSheet('loop')}
          aria-label="Loop bars"
          aria-haspopup="dialog"
          className="min-h-11 px-3 rounded-full inline-flex items-center gap-1.5 text-[14px] font-bold cursor-pointer shrink-0"
          style={{
            backgroundColor: loopRange ? 'var(--rosin-soft)' : 'var(--plate)',
            color: loopRange ? 'var(--ink)' : 'var(--ink-2)',
            border: '1px solid var(--rule)',
          }}
        >
          <Repeat className="w-4 h-4" />
          <span className="tabular">
            {loopRange
              ? loopRange.startMeasure === loopRange.endMeasure
                ? `Bar ${loopRange.startMeasure}`
                : `${loopRange.startMeasure}–${loopRange.endMeasure}`
              : 'Loop'}
          </span>
        </button>
      </header>

      <div className="play-layout flex-1 min-h-0">
        {/* Bar tapes: one strip per bar in play, filled as you pass them */}
        <div className="play-tapes flex items-center gap-2 px-1" aria-label={`Bar ${current}, playing bars ${firstBar} to ${lastBar}`} role="img">
          <div className="flex-1 flex gap-[3px]">
            {bars.map((bar) => {
              const done = hasStarted ? bar < current : false;
              const isCurrent = hasStarted && bar === current;
              return (
                <span
                  key={bar}
                  className="h-2 flex-1 rounded-full"
                  style={{
                    backgroundColor: isCurrent ? 'var(--rosin)' : done ? 'var(--ebony)' : 'var(--rule)',
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Score plate */}
        <section
          aria-label="Score"
          className="play-score relative rounded-[22px] overflow-hidden flex flex-col min-h-0"
          style={{ backgroundColor: 'var(--plate)', boxShadow: '0 1px 0 var(--rule), 0 8px 24px rgb(34 29 25 / 0.06)' }}
        >
          <div className="absolute left-2 top-2 z-10">
            <MicPill
              isRunning={controllerState.isRunning}
              isPaused={controllerState.isPaused}
              hasError={controllerState.micError !== null}
              micManager={props.micManager}
            />
          </div>
          <div className="absolute right-2 top-2 z-10 flex rounded-full p-0.5" role="radiogroup" aria-label="Score layout" style={{ backgroundColor: 'var(--plate-2)', border: '1px solid var(--rule)' }}>
            {([
              { mode: 'ribbon', label: 'Single line', Icon: AlignJustify },
              { mode: 'page', label: 'Full page', Icon: FileText },
            ] as const).map(({ mode, label, Icon }) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={viewMode === mode}
                aria-label={label}
                onClick={() => onViewModeChange(mode)}
                className="h-11 w-11 rounded-full flex items-center justify-center cursor-pointer"
                style={{
                  backgroundColor: viewMode === mode ? 'var(--ebony)' : 'transparent',
                  color: viewMode === mode ? 'var(--bone)' : 'var(--ink-2)',
                }}
              >
                <Icon className="w-[18px] h-[18px]" />
              </button>
            ))}
          </div>
          <div className={`flex-1 min-h-0 overflow-auto px-2 ${viewMode === 'ribbon' ? 'pt-2' : 'pt-12'}`}>
            <ScoreViewport
              xmlContent={currentScore.xmlContent}
              viewMode={viewMode}
              cursorStepIndex={controllerState.cursorStepIndex}
              zoom={viewMode === 'ribbon' ? 1.1 : 1}
            />
          </div>
        </section>

        {controllerState.micError && <MicErrorBanner error={controllerState.micError} onRetry={props.onRetryMic} />}

        <FeedbackPanel
          controllerState={controllerState}
          practiceMode={practiceMode}
          livePitch={props.livePitch}
          referenceA4Hz={props.referenceA4Hz}
          toleranceCents={props.toleranceCents}
          idleHint={idleHint}
          droneActive={props.mixer.droneActive}
          onToggleDrone={props.onToggleDrone}
          showSimulate={props.showSimulate}
          onSimulateInTuneNote={props.onSimulateInTuneNote}
          barMidis={props.barMidis}
        />

        {/* Thumb zone */}
        <footer className="play-dock flex flex-col gap-2.5" aria-label="Practice controls">
          <Segmented<PracticeMode>
            label="Practice mode"
            value={practiceMode}
            onChange={onPracticeModeChange}
            options={[
              { value: 'wait-for-me', label: 'Wait for me' },
              { value: 'play-along', label: 'Play along' },
            ]}
          />
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onStopPractice}
              disabled={!controllerState.isRunning}
              aria-label="Stop and Reset Practice"
              className={ICON_BTN}
              style={{ backgroundColor: 'var(--plate)', color: 'var(--ink)', border: '1px solid var(--rule)' }}
            >
              <Square className="w-5 h-5 fill-current" />
            </button>

            {!controllerState.isRunning ? (
              <button
                type="button"
                onClick={onStartPractice}
                aria-label="Start Practice"
                className="flex-1 h-16 rounded-full inline-flex items-center justify-center gap-2 text-[20px] font-extrabold cursor-pointer active:translate-y-px"
                style={{ backgroundColor: 'var(--rosin)', color: 'var(--ink)', boxShadow: 'inset 0 -4px 0 rgb(34 29 25 / 0.18)' }}
              >
                <Play className="w-6 h-6 fill-current" />
                Start
              </button>
            ) : controllerState.isPaused ? (
              <button
                type="button"
                onClick={onResumePractice}
                aria-label="Resume Practice"
                className="flex-1 h-16 rounded-full inline-flex items-center justify-center gap-2 text-[20px] font-extrabold cursor-pointer"
                style={{ backgroundColor: 'var(--rosin)', color: 'var(--ink)', boxShadow: 'inset 0 -4px 0 rgb(34 29 25 / 0.18)' }}
              >
                <Play className="w-6 h-6 fill-current" />
                Resume
              </button>
            ) : (
              <button
                type="button"
                onClick={onPausePractice}
                aria-label="Pause Practice"
                className="flex-1 h-16 rounded-full inline-flex items-center justify-center gap-2 text-[20px] font-extrabold cursor-pointer"
                style={{ backgroundColor: 'var(--ebony)', color: 'var(--bone)' }}
              >
                <Pause className="w-6 h-6 fill-current" />
                Pause
              </button>
            )}

            <button
              type="button"
              onClick={() => setOpenSheet('options')}
              aria-label="Practice options"
              aria-haspopup="dialog"
              className={ICON_BTN}
              style={{ backgroundColor: 'var(--plate)', color: 'var(--ink)', border: '1px solid var(--rule)' }}
            >
              <SlidersHorizontal className="w-5 h-5" />
              <span className="text-[11px] font-bold tabular leading-none mt-0.5">{Math.round(tempoScale * 100)}%</span>
            </button>
          </div>
        </footer>
      </div>

      {openSheet === 'options' && (
        <Sheet label="Practice options" title="Practice options" onClose={() => setOpenSheet(null)} closeLabel="Close practice options">
          <div className="space-y-5">
            <div className="space-y-2">
              <h3 className="text-[15px] font-bold">How strict is “in tune”?</h3>
              <Segmented<IntonationStrictness>
                label="Intonation strictness"
                value={props.strictness}
                onChange={props.onStrictnessChange}
                options={[
                  { value: 'easy', label: 'Easy', ariaLabel: 'Easy ±25¢' },
                  { value: 'medium', label: 'Medium', ariaLabel: 'Medium ±15¢' },
                  { value: 'strict', label: 'Strict', ariaLabel: 'Strict ±8¢' },
                ]}
              />
              <p className="text-[14px]" style={{ color: 'var(--ink-2)' }}>
                {props.strictness === 'custom'
                  ? `Custom window of ±${props.toleranceCents} cents, set in Me. `
                  : `A note counts as in tune within ±${props.toleranceCents} cents. `}
                Tuned to A = {props.referenceA4Hz} Hz. Change the tuning in Me.
              </p>
            </div>
            <MixerPanel
              mixer={props.mixer}
              onMixerChange={props.onMixerChange}
              tempoScale={tempoScale}
              onTempoScaleChange={props.onTempoScaleChange}
              countInBars={props.countInBars}
              onCountInBarsChange={props.onCountInBarsChange}
              droneTargetNoteName={controllerState.activeNote?.pitch ? noteName(controllerState.activeNote.pitch.label) : null}
              onToggleDrone={props.onToggleDrone}
            />
          </div>
        </Sheet>
      )}

      {openSheet === 'loop' && (
        <LoopSheet
          totalMeasures={totalMeasures}
          loopRange={loopRange}
          onLoopRangeChange={onLoopRangeChange}
          onClose={() => setOpenSheet(null)}
        />
      )}
    </div>
  );
}

function LoopSheet({
  totalMeasures,
  loopRange,
  onLoopRangeChange,
  onClose,
}: {
  readonly totalMeasures: number;
  readonly loopRange: MeasureLoopRange | null;
  readonly onLoopRangeChange: (range: MeasureLoopRange | null) => void;
  readonly onClose: () => void;
}) {
  const measures = Array.from({ length: Math.max(totalMeasures, 1) }, (_, i) => i + 1);
  const start = loopRange?.startMeasure ?? 1;
  const end = loopRange?.endMeasure ?? Math.max(totalMeasures, 1);

  const setStart = (val: number) =>
    onLoopRangeChange(val > end ? { startMeasure: val, endMeasure: val } : { startMeasure: val, endMeasure: end });
  const setEnd = (val: number) =>
    onLoopRangeChange(val < start ? { startMeasure: val, endMeasure: val } : { startMeasure: start, endMeasure: val });

  const selectClass = 'w-full min-h-12 px-3 rounded-2xl text-[17px] font-bold tabular cursor-pointer';
  const selectStyle = { backgroundColor: 'var(--plate-2)', border: '1px solid var(--rule)', color: 'var(--ink)' };

  return (
    <Sheet label="Loop bars" title="Loop a few bars" onClose={onClose} closeLabel="Close loop settings">
      <p className="text-[15px] mb-4" style={{ color: 'var(--ink-2)' }}>
        The passage repeats until you stop. Short loops of one or two bars work best.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5">
          <span className="text-[14px] font-semibold" style={{ color: 'var(--ink-2)' }}>From bar</span>
          <select value={start} onChange={(e) => setStart(Number(e.target.value))} className={selectClass} style={selectStyle}>
            {measures.map((m) => (
              <option key={`s-${m}`} value={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-[14px] font-semibold" style={{ color: 'var(--ink-2)' }}>To bar</span>
          <select value={end} onChange={(e) => setEnd(Number(e.target.value))} className={selectClass} style={selectStyle}>
            {measures.map((m) => (
              <option key={`e-${m}`} value={m}>{m}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-5 flex gap-3">
        {loopRange && (
          <button
            type="button"
            onClick={() => onLoopRangeChange(null)}
            className="flex-1 min-h-12 rounded-full text-[16px] font-bold cursor-pointer"
            style={{ backgroundColor: 'var(--plate-2)', border: '1px solid var(--rule)' }}
          >
            Clear loop
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="flex-1 min-h-12 rounded-full text-[16px] font-extrabold cursor-pointer"
          style={{ backgroundColor: 'var(--ebony)', color: 'var(--bone)' }}
        >
          Done
        </button>
      </div>
    </Sheet>
  );
}
