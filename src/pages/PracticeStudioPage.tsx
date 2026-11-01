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
      {/* 1. Compact Studio Sub-header Bar (Matches .pitch-hud-bar in direction-1-urtext.html) */}
      <section
        aria-label="Studio Sub-header Bar"
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border transition max-w-[860px] w-full mx-auto"
        style={{
          backgroundColor: 'var(--color-score-paper)',
          borderColor: 'var(--color-rule)',
          borderRadius: '2px',
          boxShadow: '0 2px 6px var(--color-shadow)',
        }}
      >
        {/* Left: Active Pitch Readout */}
        <div
          aria-label="Archival Pitch & Hold Pill"
          className="flex items-center gap-3"
        >
          <span
            className="text-2xl font-mono font-semibold leading-none tabular"
            style={{ color: 'var(--color-ink)' }}
          >
            {activeNoteLabel}
          </span>
          {practiceMode === 'wait-for-me' ? (
            <span
              className="text-xs font-mono font-semibold px-2 py-0.5 tabular"
              style={{
                backgroundColor: 'var(--color-paper-2)',
                color: 'var(--color-intonation-match)',
                borderRadius: '2px',
              }}
            >
              Target Note: {activeNoteLabel} · M{controllerState.currentMeasureNumber}
            </span>
          ) : (
            <span
              className="text-xs font-mono font-semibold px-2 py-0.5 tabular"
              style={{
                backgroundColor: 'var(--color-paper-2)',
                color: 'var(--color-accent)',
                borderRadius: '2px',
              }}
            >
              Play-Along · M{controllerState.currentMeasureNumber}
            </span>
          )}
        </div>

        {/* Center: Circular Clock-Hand 150ms Hold Visualizer */}
        {practiceMode === 'wait-for-me' ? (
          <div className="flex items-center gap-2">
            <div className="relative w-[34px] h-[34px] flex items-center justify-center shrink-0">
              <svg className="w-[34px] h-[34px] -rotate-90" viewBox="0 0 34 34" aria-hidden="true">
                <circle
                  cx="17"
                  cy="17"
                  r={circleRadius}
                  fill="transparent"
                  stroke="var(--color-rule)"
                  strokeWidth="3"
                />
                <circle
                  cx="17"
                  cy="17"
                  r={circleRadius}
                  fill="transparent"
                  stroke="var(--color-accent)"
                  strokeWidth="3"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className="transition-all duration-75"
                />
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
            <div
              role="progressbar"
              aria-label="Wait-for-Me Hold Progress"
              aria-valuenow={Math.round(progressPercent * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="sr-only"
            />
            <span className="text-xs font-sans" style={{ color: 'var(--color-ink-2)' }}>
              150ms hold-to-lock ({Math.round(progressPercent * 100)}%)
            </span>
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

        {/* Right: Actions (Simulate 150ms Hold, Library, Page/Ribbon) */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onSimulateInTuneNote}
            aria-label="Simulate In-Tune Note"
            title="Feeds continuous in-tune pitch sample (>= 150ms in Wait-for-Me) without microphone"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition cursor-pointer border shrink-0"
            style={{
              backgroundColor: 'var(--color-accent)',
              borderColor: 'var(--color-accent)',
              color: 'var(--color-accent-ink)',
              borderRadius: '2px',
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Simulate 150ms Hold</span>
          </button>

          <button
            type="button"
            onClick={onOpenLibrary}
            aria-label="Open Score Library"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border transition cursor-pointer shrink-0"
            style={{
              backgroundColor: 'var(--color-paper-2)',
              borderColor: 'var(--color-rule)',
              color: 'var(--color-ink-2)',
              borderRadius: '2px',
            }}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Library</span>
          </button>

          <div
            role="radiogroup"
            aria-label="Score View Mode"
            className="flex items-center p-0.5 border"
            style={{
              backgroundColor: 'var(--color-paper)',
              borderColor: 'var(--color-rule)',
              borderRadius: '2px',
            }}
          >
            <button
              type="button"
              role="radio"
              aria-checked={viewMode === 'page'}
              aria-label="Page View Mode"
              onClick={() => onViewModeChange('page')}
              className="px-2 py-1 text-xs font-medium transition cursor-pointer flex items-center gap-1"
              style={{
                backgroundColor: viewMode === 'page' ? 'var(--color-paper-3)' : 'transparent',
                color: viewMode === 'page' ? 'var(--color-ink)' : 'var(--color-muted)',
                fontWeight: viewMode === 'page' ? 600 : 500,
                borderRadius: '2px',
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
              className="px-2 py-1 text-xs font-medium transition cursor-pointer flex items-center gap-1"
              style={{
                backgroundColor: viewMode === 'ribbon' ? 'var(--color-paper-3)' : 'transparent',
                color: viewMode === 'ribbon' ? 'var(--color-ink)' : 'var(--color-muted)',
                fontWeight: viewMode === 'ribbon' ? 600 : 500,
                borderRadius: '2px',
              }}
            >
              <Maximize2 className="w-3 h-3" />
              <span className="hidden sm:inline">Ribbon</span>
            </button>
          </div>
        </div>
      </section>

      {/* 2. Center Score Plate: 85-90% Viewport Warm Ivory Plate */}
      <section
        aria-label="Center Score Plate"
        className="flex-1 min-h-[460px] sm:min-h-[520px] p-4 sm:p-6 flex flex-col justify-start overflow-auto"
        style={{
          backgroundColor: 'var(--color-score-paper)',
          border: '1px solid var(--color-rule)',
          borderRadius: '2px',
          boxShadow: '0 4px 16px var(--color-shadow)',
        }}
      >
        {/* Engraved Urtext Score Header Box */}
        <div
          className="text-center border-b pb-3 mb-4 select-none"
          style={{ borderColor: 'var(--color-rule)' }}
        >
          <h2
            className="font-display text-[22px] font-bold tracking-tight"
            style={{ color: 'var(--color-ink)' }}
          >
            {currentScore.title}
          </h2>
          <div className="text-[13px] mt-1" style={{ color: 'var(--color-muted)' }}>
            G. Henle Verlag Urtext Archive Edition · Solo Violin &amp; Accompaniment
          </div>
          <div
            className="text-[12px] italic mt-0.5 font-mono"
            style={{ color: 'var(--color-ink-2)' }}
          >
            Measure {controllerState.currentMeasureNumber} of {Math.max(totalMeasures, 1)}
            {loopRange ? ` · Loop M${loopRange.startMeasure}–M${loopRange.endMeasure}` : ''}
          </div>
        </div>

        <ScoreViewport
          xmlContent={currentScore.xmlContent}
          viewMode={viewMode}
          cursorStepIndex={controllerState.cursorStepIndex}
        />
      </section>

      {/* 3. Bottom Urtext Transport Dock */}
      <footer
        aria-label="Urtext Transport Dock"
        className="relative flex flex-wrap items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2 border"
        style={{
          backgroundColor: 'var(--color-paper-2)',
          borderColor: 'var(--color-rule)',
          borderRadius: '2px',
          boxShadow: '0 2px 8px var(--color-shadow)',
        }}
      >
        {/* Left: Primary Transport Buttons followed by Mode Selector */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Transport buttons first on the left */}
          <div className="flex items-center gap-1.5">
            {!controllerState.isRunning ? (
              <button
                type="button"
                onClick={onStartPractice}
                aria-label="Start Practice"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition cursor-pointer shadow-xs border"
                style={{
                  backgroundColor: 'var(--color-accent)',
                  borderColor: 'var(--color-accent)',
                  color: 'var(--color-accent-ink)',
                  borderRadius: '2px',
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition cursor-pointer border"
                style={{
                  backgroundColor: 'var(--color-accent)',
                  borderColor: 'var(--color-accent)',
                  color: 'var(--color-accent-ink)',
                  borderRadius: '2px',
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border transition cursor-pointer"
                style={{
                  backgroundColor: 'var(--color-accent)',
                  borderColor: 'var(--color-accent)',
                  color: 'var(--color-accent-ink)',
                  borderRadius: '2px',
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
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border transition cursor-pointer"
              style={{
                backgroundColor: 'var(--color-paper)',
                borderColor: 'var(--color-rule)',
                color: 'var(--color-ink-2)',
                borderRadius: '2px',
              }}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Stop & Reset</span>
            </button>
          </div>

          {/* Mode Switch: Wait-for-Me vs Play-Along */}
          <div
            role="radiogroup"
            aria-label="Practice Interaction Mode"
            className="flex items-center p-0.5 border"
            style={{
              backgroundColor: 'var(--color-paper)',
              borderColor: 'var(--color-rule)',
              borderRadius: '2px',
            }}
          >
            <button
              type="button"
              role="radio"
              aria-checked={practiceMode === 'wait-for-me'}
              aria-label="Wait-for-Me Mode"
              onClick={() => onPracticeModeChange('wait-for-me')}
              className="px-2.5 py-1 text-xs transition cursor-pointer"
              style={{
                backgroundColor:
                  practiceMode === 'wait-for-me' ? 'var(--color-paper-3)' : 'transparent',
                color:
                  practiceMode === 'wait-for-me' ? 'var(--color-ink)' : 'var(--color-muted)',
                fontWeight: practiceMode === 'wait-for-me' ? 600 : 500,
                borderRadius: '2px',
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
              className="px-2.5 py-1 text-xs transition cursor-pointer"
              style={{
                backgroundColor:
                  practiceMode === 'play-along' ? 'var(--color-paper-3)' : 'transparent',
                color:
                  practiceMode === 'play-along' ? 'var(--color-ink)' : 'var(--color-muted)',
                fontWeight: practiceMode === 'play-along' ? 600 : 500,
                borderRadius: '2px',
              }}
            >
              Play-Along
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
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border transition cursor-pointer"
            style={{
              backgroundColor: mixer.droneActive ? 'var(--color-accent)' : 'var(--color-paper)',
              borderColor: mixer.droneActive ? 'var(--color-accent)' : 'var(--color-rule)',
              color: mixer.droneActive ? 'var(--color-accent-ink)' : 'var(--color-ink)',
              borderRadius: '2px',
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
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border transition cursor-pointer"
              style={{
                backgroundColor: loopRange ? 'var(--color-paper-3)' : 'var(--color-paper)',
                borderColor: 'var(--color-rule)',
                color: loopRange ? 'var(--color-accent)' : 'var(--color-ink-2)',
                borderRadius: '2px',
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
                className="absolute right-0 bottom-full mb-2 w-64 p-3 border shadow-lg z-30"
                style={{
                  backgroundColor: 'var(--color-paper)',
                  borderColor: 'var(--color-rule)',
                  color: 'var(--color-ink)',
                  borderRadius: '2px',
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
                      className="w-full px-2 py-1 border text-xs font-mono"
                      style={{
                        backgroundColor: 'var(--color-paper-2)',
                        borderColor: 'var(--color-rule)',
                        color: 'var(--color-ink)',
                        borderRadius: '2px',
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
                      className="w-full px-2 py-1 border text-xs font-mono"
                      style={{
                        backgroundColor: 'var(--color-paper-2)',
                        borderColor: 'var(--color-rule)',
                        color: 'var(--color-ink)',
                        borderRadius: '2px',
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
                      className="px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 cursor-pointer"
                      style={{ borderRadius: '2px' }}
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border transition cursor-pointer tabular"
              style={{
                backgroundColor: isMixerPopoverOpen ? 'var(--color-paper-3)' : 'var(--color-paper)',
                borderColor: 'var(--color-rule)',
                color: 'var(--color-ink)',
                borderRadius: '2px',
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
                className="absolute right-0 bottom-full mb-2 w-80 sm:w-96 p-4 border shadow-xl z-30"
                style={{
                  backgroundColor: 'var(--color-paper)',
                  borderColor: 'var(--color-rule)',
                  color: 'var(--color-ink)',
                  borderRadius: '2px',
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
