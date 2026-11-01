import React, { useState } from 'react';
import {
  Sparkles,
  Music,
  BookOpen,
  Volume2,
  VolumeX,
  Play,
  Pause,
  RotateCcw,
  Sliders,
  Repeat,
  X,
  Layout,
  Maximize2,
} from 'lucide-react';
import { type StoredScore } from '../modules/score-engine/scoreStore';
import { ScoreViewport } from '../components/ScoreViewport';
import { MixerPanel } from '../components/MixerPanel';
import {
  type PracticeControllerState,
} from '../modules/practice-coach/practiceController';
import {
  type PracticeMode,
  type MeasureLoopRange,
  type MixerSettings,
} from '../types/music';

export interface PracticeStudioPageProps {
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
  readonly onSimulateInTuneNote: () => void;
  readonly onToggleDrone: () => void;
  readonly mixer: MixerSettings;
  readonly onMixerChange: (mixer: MixerSettings) => void;
  readonly tempoScale: number;
  readonly onTempoScaleChange: (scale: number) => void;
  readonly countInBars: 1 | 2;
  readonly onCountInBarsChange: (bars: 1 | 2) => void;
  readonly onOpenLibrary: () => void;
}

/**
 * Distraction-Free Practice Studio Page (Direction 1: Urtext Archive).
 * Dedicates 85-90% of the viewport to the ScoreViewport on an unbleached warm ivory plate.
 * Features:
 * - Sub-header Bar: score title (Cardo serif), measure counter, Library quick-button,
 *   central Archival Pitch & 150ms Hold HUD pill, and Page/Ribbon mode switch.
 * - Center Score Plate: warm ivory plate containing ScoreViewport.
 * - Bottom Urtext Transport Dock: Wait-for-Me / Play-Along segmented switch,
 *   Start / Pause / Resume / Stop controls, Reference Drone toggle,
 *   Loop popover / inline controls, and Mixer & Tempo Popover.
 */
export function PracticeStudioPage({
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
  onSimulateInTuneNote,
  onToggleDrone,
  mixer,
  onMixerChange,
  tempoScale,
  onTempoScaleChange,
  countInBars,
  onCountInBarsChange,
  onOpenLibrary,
}: PracticeStudioPageProps) {
  const [isMixerPopoverOpen, setIsMixerPopoverOpen] = useState<boolean>(false);
  const [isLoopPopoverOpen, setIsLoopPopoverOpen] = useState<boolean>(false);

  // SVG clock-hand circle parameters: radius 14, circumference = 2 * PI * 14 ≈ 87.96
  const circleRadius = 14;
  const circumference = 2 * Math.PI * circleRadius;
  const progressPercent = Math.max(0, Math.min(1, controllerState.holdProgress));
  const strokeDashoffset = circumference - progressPercent * circumference;
  const clockAngleDeg = progressPercent * 360;

  // Active target note label
  const activeNoteLabel = controllerState.activeNote?.pitch?.label ?? '--';

  const handleStartMeasureChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = Number(e.target.value);
    const end = loopRange?.endMeasure ?? totalMeasures;
    if (val > end) {
      onLoopRangeChange({ startMeasure: val, endMeasure: val });
    } else {
      onLoopRangeChange({ startMeasure: val, endMeasure: end });
    }
  };

  const handleEndMeasureChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = Number(e.target.value);
    const start = loopRange?.startMeasure ?? 1;
    if (val < start) {
      onLoopRangeChange({ startMeasure: val, endMeasure: val });
    } else {
      onLoopRangeChange({ startMeasure: start, endMeasure: val });
    }
  };

  const handleClearLoop = () => {
    onLoopRangeChange(null);
  };

  return (
    <div
      className="flex-1 flex flex-col w-full max-w-7xl mx-auto px-2 sm:px-4 py-2 sm:py-3 gap-2 sm:gap-3"
      data-testid="practice-studio-page"
    >
      {/* 1. Compact Studio Sub-header Bar */}
      <section
        aria-label="Studio Sub-header Bar"
        className="flex flex-wrap items-center justify-between gap-2.5 px-3 py-2 rounded-lg border transition"
        style={{
          backgroundColor: 'var(--color-paper-2)',
          borderColor: 'var(--color-rule)',
        }}
      >
        {/* Left: Active score title + measure indicator + Library quick button */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="min-w-0">
            <h2
              className="font-display text-sm sm:text-base font-bold truncate"
              style={{ color: 'var(--color-ink)' }}
              title={currentScore.title}
            >
              {currentScore.title}
            </h2>
            <div
              className="text-[11px] font-mono leading-none truncate mt-0.5"
              style={{ color: 'var(--color-muted)' }}
            >
              Measure {controllerState.currentMeasureNumber} of {Math.max(totalMeasures, 1)}
              {loopRange && (
                <span className="ml-1.5 font-semibold" style={{ color: 'var(--color-accent)' }}>
                  (Loop {loopRange.startMeasure}–{loopRange.endMeasure})
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenLibrary}
            aria-label="Open Score Library"
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border transition cursor-pointer shrink-0"
            style={{
              backgroundColor: 'var(--color-paper)',
              borderColor: 'var(--color-rule)',
              color: 'var(--color-ink-2)',
            }}
          >
            <BookOpen className="w-3.5 h-3.5" style={{ color: 'var(--color-accent)' }} />
            <span className="hidden sm:inline">Library / Upload</span>
          </button>
        </div>

        {/* Center: Archival Pitch & 150ms Hold HUD Pill */}
        <div
          aria-label="Archival Pitch & Hold Pill"
          className="flex items-center gap-2 sm:gap-3 px-3 py-1.5 rounded-full border shadow-xs"
          style={{
            backgroundColor: 'var(--color-paper)',
            borderColor: 'var(--color-rule)',
          }}
        >
          {practiceMode === 'wait-for-me' ? (
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Target Note Badge */}
              <div className="flex items-baseline gap-1">
                <span className="text-xs font-sans font-medium" style={{ color: 'var(--color-muted)' }}>
                  Target Note:
                </span>
                <span
                  className="text-xs sm:text-sm font-mono font-bold"
                  style={{ color: 'var(--color-accent)' }}
                >
                  {activeNoteLabel}
                </span>
                <span className="text-[11px] font-mono text-xs hidden md:inline" style={{ color: 'var(--color-muted)' }}>
                  (Measure {controllerState.currentMeasureNumber})
                </span>
              </div>

              {/* Circular Clock-Hand SVG 150ms Hold Progress Ring */}
              <div className="flex items-center gap-1.5">
                <div className="relative w-[28px] h-[28px] flex items-center justify-center shrink-0">
                  <svg className="w-[28px] h-[28px] -rotate-90" viewBox="0 0 34 34" aria-hidden="true">
                    {/* Ring background */}
                    <circle
                      cx="17"
                      cy="17"
                      r={circleRadius}
                      fill="transparent"
                      stroke="var(--color-rule)"
                      strokeWidth="3"
                    />
                    {/* Meter progress ring */}
                    <circle
                      cx="17"
                      cy="17"
                      r={circleRadius}
                      fill="transparent"
                      stroke="var(--color-intonation-match)"
                      strokeWidth="3"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      className="transition-all duration-75"
                    />
                    {/* Clock hand line pointing from center */}
                    <line
                      x1="17"
                      y1="17"
                      x2={17 + 11 * Math.cos(((clockAngleDeg - 90) * Math.PI) / 180)}
                      y2={17 + 11 * Math.sin(((clockAngleDeg - 90) * Math.PI) / 180)}
                      stroke="var(--color-accent)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      className="transition-all duration-75"
                    />
                  </svg>
                </div>

                {/* Accessible Progressbar */}
                <div
                  role="progressbar"
                  aria-label="Wait-for-Me Hold Progress"
                  aria-valuenow={Math.round(progressPercent * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="w-12 sm:w-16 h-1.5 rounded-full overflow-hidden border"
                  style={{
                    backgroundColor: 'var(--color-paper-2)',
                    borderColor: 'var(--color-rule)',
                  }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-75"
                    style={{
                      width: `${Math.round(progressPercent * 100)}%`,
                      backgroundColor: 'var(--color-intonation-match)',
                    }}
                  />
                </div>

                <span className="text-[11px] font-mono tabular" style={{ color: 'var(--color-muted)' }}>
                  {Math.round(progressPercent * 100)}%
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <Music className="w-3.5 h-3.5" style={{ color: 'var(--color-accent)' }} />
              {controllerState.countInBeat ? (
                <span className="font-mono font-semibold animate-pulse" style={{ color: 'var(--color-accent)' }}>
                  Count-In: Bar {controllerState.countInBeat.bar}, Beat {controllerState.countInBeat.beat}/{controllerState.countInBeat.total}
                </span>
              ) : (
                <span className="font-sans" style={{ color: 'var(--color-ink-2)' }}>
                  Play-Along · Measure {controllerState.currentMeasureNumber}
                  {controllerState.loopCount > 0 && ` (Loop ${controllerState.loopCount})`}
                </span>
              )}
            </div>
          )}

          {/* Simulate In-Tune Note Button */}
          <button
            type="button"
            onClick={onSimulateInTuneNote}
            aria-label="Simulate In-Tune Note"
            title="Feeds continuous in-tune pitch sample (>= 150ms in Wait-for-Me) without microphone"
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition cursor-pointer border shrink-0"
            style={{
              backgroundColor: 'oklch(60.0% 0.155 148 / 0.12)',
              borderColor: 'oklch(60.0% 0.155 148 / 0.4)',
              color: 'var(--color-intonation-match)',
            }}
          >
            <Sparkles className="w-3 h-3" />
            <span className="hidden sm:inline">Simulate Note</span>
          </button>
        </div>

        {/* Right: View Mode Segmented Switch (Page View vs Mobile Ribbon) */}
        <div
          role="radiogroup"
          aria-label="Score View Mode"
          className="flex items-center p-0.5 rounded border"
          style={{
            backgroundColor: 'var(--color-paper)',
            borderColor: 'var(--color-rule)',
          }}
        >
          <button
            type="button"
            role="radio"
            aria-checked={viewMode === 'page'}
            aria-label="Page View Mode"
            onClick={() => onViewModeChange('page')}
            className="px-2.5 py-1 text-xs font-medium rounded transition cursor-pointer flex items-center gap-1"
            style={{
              backgroundColor: viewMode === 'page' ? 'var(--color-paper-3)' : 'transparent',
              color: viewMode === 'page' ? 'var(--color-ink)' : 'var(--color-muted)',
              fontWeight: viewMode === 'page' ? 600 : 500,
            }}
          >
            <Layout className="w-3 h-3" />
            <span className="hidden sm:inline">Page</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={viewMode === 'ribbon'}
            aria-label="Mobile Ribbon Mode"
            onClick={() => onViewModeChange('ribbon')}
            className="px-2.5 py-1 text-xs font-medium rounded transition cursor-pointer flex items-center gap-1"
            style={{
              backgroundColor: viewMode === 'ribbon' ? 'var(--color-paper-3)' : 'transparent',
              color: viewMode === 'ribbon' ? 'var(--color-ink)' : 'var(--color-muted)',
              fontWeight: viewMode === 'ribbon' ? 600 : 500,
            }}
          >
            <Maximize2 className="w-3 h-3" />
            <span className="hidden sm:inline">Ribbon</span>
          </button>
        </div>
      </section>

      {/* 2. Center Score Plate: 85-90% Viewport Warm Ivory Plate */}
      <section
        aria-label="Center Score Plate"
        className="flex-1 min-h-[460px] sm:min-h-[520px] rounded-lg p-3 sm:p-5 flex flex-col justify-start overflow-auto shadow-sm"
        style={{
          backgroundColor: 'var(--color-score-paper)',
          border: '1px solid var(--color-rule)',
        }}
      >
        <ScoreViewport
          xmlContent={currentScore.xmlContent}
          viewMode={viewMode}
          cursorStepIndex={controllerState.cursorStepIndex}
        />
      </section>

      {/* 3. Bottom Urtext Transport Dock */}
      <footer
        aria-label="Urtext Transport Dock"
        className="relative flex flex-wrap items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2 rounded-lg border shadow-xs"
        style={{
          backgroundColor: 'var(--color-paper-2)',
          borderColor: 'var(--color-rule)',
        }}
      >
        {/* Left: Practice Mode Selector & Primary Transport Buttons */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Mode Switch: Wait-for-Me vs Play-Along */}
          <div
            role="radiogroup"
            aria-label="Practice Interaction Mode"
            className="flex items-center p-0.5 rounded border"
            style={{
              backgroundColor: 'var(--color-paper)',
              borderColor: 'var(--color-rule)',
            }}
          >
            <button
              type="button"
              role="radio"
              aria-checked={practiceMode === 'wait-for-me'}
              aria-label="Wait-for-Me Mode"
              onClick={() => onPracticeModeChange('wait-for-me')}
              className="px-2.5 py-1 text-xs rounded transition cursor-pointer"
              style={{
                backgroundColor:
                  practiceMode === 'wait-for-me' ? 'var(--color-paper-3)' : 'transparent',
                color:
                  practiceMode === 'wait-for-me' ? 'var(--color-ink)' : 'var(--color-muted)',
                fontWeight: practiceMode === 'wait-for-me' ? 600 : 500,
              }}
            >
              Wait-for-Me
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={practiceMode === 'play-along'}
              aria-label="Play-Along Mode"
              onClick={() => onPracticeModeChange('play-along')}
              className="px-2.5 py-1 text-xs rounded transition cursor-pointer"
              style={{
                backgroundColor:
                  practiceMode === 'play-along' ? 'var(--color-paper-3)' : 'transparent',
                color:
                  practiceMode === 'play-along' ? 'var(--color-ink)' : 'var(--color-muted)',
                fontWeight: practiceMode === 'play-along' ? 600 : 500,
              }}
            >
              Play-Along
            </button>
          </div>

          {/* Transport buttons */}
          <div className="flex items-center gap-1.5">
            {!controllerState.isRunning ? (
              <button
                type="button"
                onClick={onStartPractice}
                aria-label="Start Practice"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold text-white transition cursor-pointer shadow-xs"
                style={{
                  backgroundColor: 'var(--color-accent)',
                }}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Start Practice</span>
              </button>
            ) : controllerState.isPaused ? (
              <button
                type="button"
                onClick={onResumePractice}
                aria-label="Resume Practice"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold text-white transition cursor-pointer"
                style={{
                  backgroundColor: 'var(--color-accent)',
                }}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Resume</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onPausePractice}
                aria-label="Pause Practice"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border transition cursor-pointer"
                style={{
                  backgroundColor: 'var(--color-paper)',
                  borderColor: 'var(--color-rule)',
                  color: 'var(--color-ink)',
                }}
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Pause</span>
              </button>
            )}

            <button
              type="button"
              onClick={onStopPractice}
              aria-label="Stop and Reset Practice"
              title="Stop and Reset Practice"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium border transition cursor-pointer"
              style={{
                backgroundColor: 'var(--color-paper)',
                borderColor: 'var(--color-rule)',
                color: 'var(--color-ink-2)',
              }}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Stop & Reset</span>
            </button>
          </div>
        </div>

        {/* Right: Reference Drone, Measure Loop Selector, and Mixer & Tempo Popover */}
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
          {/* Reference Drone Toggle */}
          <button
            type="button"
            onClick={onToggleDrone}
            aria-label="Toggle Reference Drone"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border transition cursor-pointer"
            style={{
              backgroundColor: mixer.droneActive ? 'var(--color-accent)' : 'var(--color-paper)',
              borderColor: mixer.droneActive ? 'var(--color-accent)' : 'var(--color-rule)',
              color: mixer.droneActive ? 'var(--color-accent-ink)' : 'var(--color-ink)',
            }}
          >
            {mixer.droneActive ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            <span>
              {mixer.droneActive
                ? `Stop Drone (${activeNoteLabel})`
                : `Drone (${activeNoteLabel})`}
            </span>
          </button>

          {/* Loop Popover / Inline Selects */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsLoopPopoverOpen((prev) => !prev)}
              aria-label="Toggle Loop Controls"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium border transition cursor-pointer"
              style={{
                backgroundColor: loopRange ? 'var(--color-paper-3)' : 'var(--color-paper)',
                borderColor: 'var(--color-rule)',
                color: loopRange ? 'var(--color-accent)' : 'var(--color-ink-2)',
              }}
            >
              <Repeat className="w-3.5 h-3.5" />
              <span>
                {loopRange ? `Loop M${loopRange.startMeasure}–${loopRange.endMeasure}` : 'Loop'}
              </span>
            </button>

            {/* Loop Popover Panel */}
            {isLoopPopoverOpen && (
              <div
                role="dialog"
                aria-label="Measure Loop Settings"
                className="absolute right-0 bottom-full mb-2 w-64 p-3 rounded-lg border shadow-lg z-30"
                style={{
                  backgroundColor: 'var(--color-paper)',
                  borderColor: 'var(--color-rule)',
                  color: 'var(--color-ink)',
                }}
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b" style={{ borderColor: 'var(--color-rule)' }}>
                  <span className="text-xs font-bold font-display">Measure Loop</span>
                  <button
                    type="button"
                    onClick={() => setIsLoopPopoverOpen(false)}
                    aria-label="Close Loop Panel"
                    className="p-1 rounded text-xs hover:opacity-75"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-muted)' }}>
                      Start Measure
                    </label>
                    <select
                      aria-label="Loop Start Measure"
                      value={loopRange?.startMeasure ?? 1}
                      onChange={handleStartMeasureChange}
                      className="w-full px-2 py-1 rounded border text-xs font-mono"
                      style={{
                        backgroundColor: 'var(--color-paper-2)',
                        borderColor: 'var(--color-rule)',
                        color: 'var(--color-ink)',
                      }}
                    >
                      {Array.from({ length: totalMeasures }, (_, i) => i + 1).map((m) => (
                        <option key={`loop-start-${m}`} value={m}>
                          Measure {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-muted)' }}>
                      End Measure
                    </label>
                    <select
                      aria-label="Loop End Measure"
                      value={loopRange?.endMeasure ?? totalMeasures}
                      onChange={handleEndMeasureChange}
                      className="w-full px-2 py-1 rounded border text-xs font-mono"
                      style={{
                        backgroundColor: 'var(--color-paper-2)',
                        borderColor: 'var(--color-rule)',
                        color: 'var(--color-ink)',
                      }}
                    >
                      {Array.from({ length: totalMeasures }, (_, i) => i + 1).map((m) => (
                        <option key={`loop-end-${m}`} value={m}>
                          Measure {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {loopRange && (
                  <div className="mt-3 pt-2 border-t flex justify-end" style={{ borderColor: 'var(--color-rule)' }}>
                    <button
                      type="button"
                      onClick={handleClearLoop}
                      aria-label="Clear Measure Loop"
                      className="px-2 py-1 rounded text-xs font-medium text-rose-700 hover:bg-rose-50 cursor-pointer"
                    >
                      Clear Loop
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mixer & Tempo Popover Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsMixerPopoverOpen((prev) => !prev)}
              aria-label="Toggle Mixer Popover"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition cursor-pointer tabular"
              style={{
                backgroundColor: isMixerPopoverOpen ? 'var(--color-paper-3)' : 'var(--color-paper)',
                borderColor: 'var(--color-rule)',
                color: 'var(--color-ink)',
              }}
            >
              <Sliders className="w-3.5 h-3.5" style={{ color: 'var(--color-accent)' }} />
              <span>Mixer · {Math.round(tempoScale * 100)}%</span>
            </button>

            {/* Floating Urtext Mixer & Tempo Popover Drawer */}
            {isMixerPopoverOpen && (
              <div
                role="dialog"
                aria-label="Mixer & Tempo Popover"
                className="absolute right-0 bottom-full mb-2 w-80 sm:w-96 p-4 rounded-lg border shadow-xl z-30"
                style={{
                  backgroundColor: 'var(--color-paper)',
                  borderColor: 'var(--color-rule)',
                  color: 'var(--color-ink)',
                }}
              >
                <div
                  className="flex items-center justify-between pb-2 mb-3 border-b"
                  style={{ borderColor: 'var(--color-rule)' }}
                >
                  <div className="flex items-center gap-1.5">
                    <Sliders className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
                    <h3 className="font-display text-sm font-bold">Mixer & Tempo</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMixerPopoverOpen(false)}
                    aria-label="Close Mixer Popover"
                    className="p-1 rounded text-xs hover:opacity-75 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Embedded MixerPanel styled in Direction 1 tokens */}
                <MixerPanel
                  mixer={mixer}
                  onMixerChange={onMixerChange}
                  tempoScale={tempoScale}
                  onTempoScaleChange={onTempoScaleChange}
                  countInBars={countInBars}
                  onCountInBarsChange={onCountInBarsChange}
                  droneTargetNoteName={controllerState.activeNote?.pitch?.label ?? null}
                  onToggleDrone={onToggleDrone}
                />
              </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
