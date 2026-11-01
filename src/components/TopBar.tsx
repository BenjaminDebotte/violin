import React from 'react';
import {
  Play,
  Pause,
  Square,
  BookOpen,
  Sliders,
  Repeat,
  X,
  FileText,
  AlignJustify,
} from 'lucide-react';
import { type PracticeMode, type MeasureLoopRange } from '../types/music';

export interface TopBarProps {
  readonly scoreTitle: string;
  readonly onOpenLibrary: () => void;
  readonly practiceMode: PracticeMode;
  readonly onPracticeModeChange: (mode: PracticeMode) => void;
  readonly isRunning: boolean;
  readonly isPaused: boolean;
  readonly onStartPractice: () => void;
  readonly onPausePractice: () => void;
  readonly onResumePractice: () => void;
  readonly onStopPractice: () => void;
  readonly viewMode: 'page' | 'ribbon';
  readonly onViewModeChange: (mode: 'page' | 'ribbon') => void;
  readonly totalMeasures: number;
  readonly loopRange: MeasureLoopRange | null;
  readonly onLoopRangeChange: (range: MeasureLoopRange | null) => void;
  readonly referenceA4Hz: number;
  readonly toleranceCents: number;
  readonly onOpenCalibration: () => void;
  readonly className?: string;
}

/**
 * Music-stand-friendly top navigation bar for Violin Coach.
 * Integrates score title, library access, practice modes (Wait-for-Me vs Play-Along),
 * transport controls, view toggle (Page vs Ribbon), measure looping, and calibration.
 */
export function TopBar({
  scoreTitle,
  onOpenLibrary,
  practiceMode,
  onPracticeModeChange,
  isRunning,
  isPaused,
  onStartPractice,
  onPausePractice,
  onResumePractice,
  onStopPractice,
  viewMode,
  onViewModeChange,
  totalMeasures,
  loopRange,
  onLoopRangeChange,
  referenceA4Hz,
  toleranceCents,
  onOpenCalibration,
  className = '',
}: TopBarProps) {
  const measureCount = Math.max(1, totalMeasures);
  const measureOptions = Array.from({ length: measureCount }, (_, i) => i + 1);

  const startMeasure = loopRange?.startMeasure ?? 1;
  const endMeasure = loopRange?.endMeasure ?? measureCount;

  const handleStartMeasureChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStart = parseInt(e.target.value, 10);
    const newEnd = Math.max(newStart, loopRange?.endMeasure ?? measureCount);
    onLoopRangeChange({ startMeasure: newStart, endMeasure: newEnd });
  };

  const handleEndMeasureChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newEnd = parseInt(e.target.value, 10);
    const newStart = Math.min(newEnd, loopRange?.startMeasure ?? 1);
    onLoopRangeChange({ startMeasure: newStart, endMeasure: newEnd });
  };

  const handleClearLoop = () => {
    onLoopRangeChange(null);
  };

  return (
    <header
      className={`bg-slate-900/95 backdrop-blur border-b border-slate-800 text-slate-100 px-3 py-2.5 sm:px-6 sm:py-3 shadow-lg select-none ${className}`}
      data-testid="top-bar"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left Section: Active Score Title & Library / Upload Button */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenLibrary}
            aria-label="Library / Upload"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 text-xs sm:text-sm font-medium transition cursor-pointer shrink-0 min-h-[38px]"
          >
            <BookOpen className="w-4 h-4 text-emerald-400" />
            <span>Library / Upload</span>
          </button>

          <div className="min-w-0">
            <h1
              className="text-sm sm:text-base font-bold text-slate-100 truncate max-w-[180px] sm:max-w-xs md:max-w-md"
              title={scoreTitle}
            >
              {scoreTitle || 'Twinkle, Twinkle, Little Star'}
            </h1>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              {totalMeasures} {totalMeasures === 1 ? 'Measure' : 'Measures'} · Violin Coach
            </p>
          </div>
        </div>

        {/* Center Section: Practice Mode & Transport Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Mode Selector */}
          <div
            className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs font-medium"
            role="radiogroup"
            aria-label="Practice Mode"
          >
            <button
              type="button"
              role="radio"
              aria-checked={practiceMode === 'wait-for-me'}
              onClick={() => onPracticeModeChange('wait-for-me')}
              className={`px-3 py-1.5 rounded-md transition cursor-pointer min-h-[34px] ${
                practiceMode === 'wait-for-me'
                  ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Wait-for-Me
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={practiceMode === 'play-along'}
              onClick={() => onPracticeModeChange('play-along')}
              className={`px-3 py-1.5 rounded-md transition cursor-pointer min-h-[34px] ${
                practiceMode === 'play-along'
                  ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Play-Along
            </button>
          </div>

          {/* Transport Controls */}
          <div className="flex items-center gap-1.5">
            {!isRunning ? (
              <button
                type="button"
                onClick={onStartPractice}
                aria-label="Start Practice"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold shadow-md shadow-emerald-950/40 transition cursor-pointer min-h-[38px]"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Start Practice</span>
              </button>
            ) : isPaused ? (
              <button
                type="button"
                onClick={onResumePractice}
                aria-label="Resume Practice"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold shadow-md transition cursor-pointer min-h-[38px]"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Resume</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onPausePractice}
                aria-label="Pause Practice"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs sm:text-sm font-semibold shadow-md transition cursor-pointer min-h-[38px]"
              >
                <Pause className="w-4 h-4 fill-white" />
                <span>Pause</span>
              </button>
            )}

            <button
              type="button"
              onClick={onStopPractice}
              aria-label="Stop & Reset"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:text-white text-xs sm:text-sm font-medium transition cursor-pointer min-h-[38px]"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span className="hidden sm:inline">Stop & Reset</span>
            </button>
          </div>
        </div>

        {/* Right Section: View Mode, Measure Loop & Calibration */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Toggle: Page View vs Mobile Ribbon */}
          <div
            className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs font-medium"
            role="radiogroup"
            aria-label="View Mode"
          >
            <button
              type="button"
              role="radio"
              aria-checked={viewMode === 'page'}
              onClick={() => onViewModeChange('page')}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md transition cursor-pointer min-h-[34px] ${
                viewMode === 'page'
                  ? 'bg-slate-700 text-slate-100 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Page View</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={viewMode === 'ribbon'}
              onClick={() => onViewModeChange('ribbon')}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md transition cursor-pointer min-h-[34px] ${
                viewMode === 'ribbon'
                  ? 'bg-slate-700 text-slate-100 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <AlignJustify className="w-3.5 h-3.5" />
              <span>Mobile Ribbon</span>
            </button>
          </div>

          {/* Measure Loop Range Selector */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/60 rounded-lg px-2 py-1 text-xs text-slate-300">
            <Repeat className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="hidden sm:inline text-slate-400">Loop:</span>
            <label className="sr-only" htmlFor="topbar-loop-start">
              Start Measure
            </label>
            <select
              id="topbar-loop-start"
              aria-label="Start Measure"
              value={loopRange ? startMeasure : ''}
              onChange={handleStartMeasureChange}
              className="bg-slate-900 border border-slate-700 text-slate-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="" disabled>
                M1
              </option>
              {measureOptions.map((m) => (
                <option key={`start-${m}`} value={m}>
                  M{m}
                </option>
              ))}
            </select>
            <span className="text-slate-500">–</span>
            <label className="sr-only" htmlFor="topbar-loop-end">
              End Measure
            </label>
            <select
              id="topbar-loop-end"
              aria-label="End Measure"
              value={loopRange ? endMeasure : ''}
              onChange={handleEndMeasureChange}
              className="bg-slate-900 border border-slate-700 text-slate-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="" disabled>
                M{measureCount}
              </option>
              {measureOptions.map((m) => (
                <option key={`end-${m}`} value={m}>
                  M{m}
                </option>
              ))}
            </select>

            {loopRange && (
              <button
                type="button"
                onClick={handleClearLoop}
                aria-label="Clear Loop"
                title="Clear Measure Loop"
                className="p-1 text-slate-400 hover:text-rose-400 transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Calibration Button */}
          <button
            type="button"
            onClick={onOpenCalibration}
            aria-label="Audio Calibration"
            title="Configure A4 tuning reference and intonation tolerance"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 text-xs font-mono transition cursor-pointer min-h-[38px]"
          >
            <Sliders className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              A4={referenceA4Hz}Hz · ±{toleranceCents}¢
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
