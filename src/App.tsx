import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Sparkles,
  Repeat,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
  Music,
} from 'lucide-react';
import {
  type StoredScore,
  BUILT_IN_SCORES,
} from './modules/score-engine/scoreStore';
import { extractScoreTimeline } from './modules/score-engine/timelineExtractor';
import {
  ScoreViewport,
  applyNoteGradeToSvg,
  resetSvgNoteColors,
} from './components/ScoreViewport';
import { TopBar } from './components/TopBar';
import { TunerHUD } from './components/TunerHUD';
import { MixerPanel } from './components/MixerPanel';
import { LibraryModal } from './components/LibraryModal';
import { CalibrationDrawer } from './components/CalibrationDrawer';
import { AudioPlaybackEngine } from './modules/audio-playback/audioEngine';
import { MicSessionManager } from './modules/pitch-detection/micSessionManager';
import {
  PracticeController,
  type PracticeControllerState,
  type NoteGradedEvent,
} from './modules/practice-coach/practiceController';
import {
  type PracticeMode,
  type IntonationStrictness,
  type MeasureLoopRange,
  type MixerSettings,
  DEFAULT_MIXER_SETTINGS,
  getToleranceCents,
} from './types/music';
import { midiNoteToFrequency } from './modules/pitch-detection/pitchMath';

export interface AppProps {
  readonly initialAudioEngine?: AudioPlaybackEngine;
  readonly initialMicManager?: MicSessionManager;
  readonly initialScore?: StoredScore;
}

export default function App({
  initialAudioEngine,
  initialMicManager,
  initialScore,
}: AppProps = {}) {
  // Score & Engine references
  const [currentScore, setCurrentScore] = useState<StoredScore>(
    initialScore ?? BUILT_IN_SCORES[0],
  );

  const audioEngineRef = useRef<AudioPlaybackEngine | null>(null);
  if (!audioEngineRef.current) {
    audioEngineRef.current = initialAudioEngine ?? new AudioPlaybackEngine();
  }
  const audioEngine = audioEngineRef.current;

  const micManagerRef = useRef<MicSessionManager | null>(null);
  if (!micManagerRef.current) {
    micManagerRef.current = initialMicManager ?? new MicSessionManager();
  }
  const micManager = micManagerRef.current;

  // Settings State
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('wait-for-me');
  const [viewMode, setViewMode] = useState<'page' | 'ribbon'>('page');
  const [referenceA4Hz, setReferenceA4Hz] = useState<number>(440);
  const [strictness, setStrictness] = useState<IntonationStrictness>('medium');
  const [customToleranceCents, setCustomToleranceCents] = useState<number>(15);
  const [tempoScale, setTempoScale] = useState<number>(1.0);
  const [countInBars, setCountInBars] = useState<1 | 2>(1);
  const [loopRange, setLoopRange] = useState<MeasureLoopRange | null>(null);
  const [mixer, setMixer] = useState<MixerSettings>(DEFAULT_MIXER_SETTINGS);

  // Modals State
  const [isLibraryOpen, setIsLibraryOpen] = useState<boolean>(false);
  const [isCalibrationOpen, setIsCalibrationOpen] = useState<boolean>(false);
  const [isSummaryDismissed, setIsSummaryDismissed] = useState<boolean>(false);

  // Derived tolerance
  const toleranceCents = getToleranceCents({
    strictness,
    customToleranceCents,
  });

  // Extract score timeline
  const timeline = useMemo(() => {
    try {
      return extractScoreTimeline(currentScore.xmlContent);
    } catch (err) {
      console.warn('Failed to extract score timeline:', err);
      return extractScoreTimeline(BUILT_IN_SCORES[0].xmlContent);
    }
  }, [currentScore.xmlContent]);

  const totalMeasures = timeline.measures.length;

  // Practice Controller State
  const [controllerState, setControllerState] = useState<PracticeControllerState>({
    mode: practiceMode,
    isRunning: false,
    isPaused: false,
    activeNote: timeline.soloNotes[0] ?? null,
    cursorStepIndex: 0,
    currentMeasureNumber: 1,
    holdProgress: 0,
    latestNoteGrade: null,
    sessionSummary: null,
    isDronePlaying: false,
    loopCount: 0,
    countInBeat: null,
  });

  const controllerRef = useRef<PracticeController | null>(null);

  // Handle note graded event -> O(1) SVG notehead coloring
  const handleNoteGraded = useCallback((event: NoteGradedEvent) => {
    const scoreContainer = document.getElementById('osmd-score-container');
    if (scoreContainer) {
      applyNoteGradeToSvg(scoreContainer, event.svgTargetIds, event.grade);
    }
  }, []);

  // Initialize / Recreate PracticeController when score or mode changes
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.dispose();
    }

    const controller = new PracticeController({
      timeline,
      audioEngine,
      micSessionManager: micManager,
      settings: {
        mode: practiceMode,
        tempoScale,
        referenceA4Hz,
        strictness,
        customToleranceCents,
        countInBars,
        loopRange,
      },
      onStateChange: (newState) => {
        setControllerState(newState);
      },
      onNoteGraded: handleNoteGraded,
    });

    controllerRef.current = controller;
    setControllerState(controller.getState());
    setIsSummaryDismissed(false);

    // Reset SVG note colors for new controller / score
    const scoreContainer = document.getElementById('osmd-score-container');
    if (scoreContainer) {
      resetSvgNoteColors(scoreContainer);
    }

    return () => {
      controller.dispose();
    };
  }, [timeline, practiceMode]); // Recreate on timeline (score) or mode changes

  // Update dynamic properties on the existing controller
  useEffect(() => {
    const c = controllerRef.current;
    if (!c) return;
    c.setToleranceCents(toleranceCents);
  }, [toleranceCents]);

  useEffect(() => {
    const c = controllerRef.current;
    if (!c) return;
    c.setReferenceA4Hz(referenceA4Hz);
  }, [referenceA4Hz]);

  useEffect(() => {
    const c = controllerRef.current;
    if (!c) return;
    c.setTempoScale(tempoScale);
  }, [tempoScale]);

  useEffect(() => {
    const c = controllerRef.current;
    if (!c) return;
    c.setLoopRange(loopRange);
  }, [loopRange]);

  useEffect(() => {
    const c = controllerRef.current;
    if (!c) return;
    c.beatScheduler.setCountInBars(countInBars);
  }, [countInBars]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      controllerRef.current?.dispose();
    };
  }, []);

  // Transport handlers
  const handleStartPractice = async () => {
    setIsSummaryDismissed(false);
    const scoreContainer = document.getElementById('osmd-score-container');
    if (scoreContainer) {
      resetSvgNoteColors(scoreContainer);
    }
    if (controllerRef.current) {
      await controllerRef.current.start();
    }
  };

  const handlePausePractice = () => {
    controllerRef.current?.pause();
  };

  const handleResumePractice = () => {
    controllerRef.current?.resume();
  };

  const handleStopPractice = () => {
    controllerRef.current?.stop();
    const scoreContainer = document.getElementById('osmd-score-container');
    if (scoreContainer) {
      resetSvgNoteColors(scoreContainer);
    }
  };

  // Switch score handler
  const handleSelectScore = (score: StoredScore) => {
    if (controllerRef.current) {
      controllerRef.current.stop();
    }
    setCurrentScore(score);
    setLoopRange(null);
  };

  // Reference Drone toggle handler
  const handleToggleDrone = () => {
    const isPlaying = controllerRef.current?.toggleReferenceDrone();
    setMixer((prev) => ({ ...prev, droneActive: Boolean(isPlaying) }));
  };

  // Mixer change handler
  const handleMixerChange = (newMixer: MixerSettings) => {
    setMixer(newMixer);
    audioEngine.applyMixerSettings(newMixer);
  };

  // Simulate In-Tune Note test helper
  const handleSimulateInTuneNote = async () => {
    const controller = controllerRef.current;
    if (!controller) return;

    if (!controller.isRunning) {
      await controller.start();
    }

    const active = controller.activeNote;
    if (!active?.pitch) return;

    const targetHz = midiNoteToFrequency(active.pitch.midiNumber, referenceA4Hz);

    if (controller.mode === 'wait-for-me') {
      // Feed two samples spaced 160ms apart to fulfill the continuous >= 150ms hold requirement
      const t0 = audioEngine.audioContext.currentTime;
      controller.handlePitchSample({
        frequencyHz: targetHz,
        clarity: 0.98,
        rms: 0.08,
        audioTimeSec: t0,
      });
      controller.handlePitchSample({
        frequencyHz: targetHz,
        clarity: 0.98,
        rms: 0.08,
        audioTimeSec: t0 + 0.16,
      });
    } else {
      // Play-Along mode
      const now = audioEngine.audioContext.currentTime;
      controller.handlePitchSample({
        frequencyHz: targetHz,
        clarity: 0.98,
        rms: 0.08,
        audioTimeSec: now,
      });
    }
  };

  // 1-Click Loop Problem Measures
  const handleLoopProblemMeasures = () => {
    const summary = controllerState.sessionSummary;
    if (!summary || summary.problemMeasures.length === 0) return;

    const minM = Math.min(...summary.problemMeasures);
    const maxM = Math.max(...summary.problemMeasures);
    const range: MeasureLoopRange = { startMeasure: minM, endMeasure: maxM };

    setLoopRange(range);
    controllerRef.current?.setLoopRange(range);
    setIsSummaryDismissed(true);
    handleStartPractice();
  };

  const showSessionSummary =
    controllerState.sessionSummary !== null &&
    !controllerState.isRunning &&
    !isSummaryDismissed;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30">
      {/* TopBar */}
      <TopBar
        scoreTitle={currentScore.title}
        onOpenLibrary={() => setIsLibraryOpen(true)}
        practiceMode={practiceMode}
        onPracticeModeChange={(mode) => setPracticeMode(mode)}
        isRunning={controllerState.isRunning}
        isPaused={controllerState.isPaused}
        onStartPractice={handleStartPractice}
        onPausePractice={handlePausePractice}
        onResumePractice={handleResumePractice}
        onStopPractice={handleStopPractice}
        viewMode={viewMode}
        onViewModeChange={(m) => setViewMode(m)}
        totalMeasures={totalMeasures}
        loopRange={loopRange}
        onLoopRangeChange={(r) => setLoopRange(r)}
        referenceA4Hz={referenceA4Hz}
        toleranceCents={toleranceCents}
        onOpenCalibration={() => setIsCalibrationOpen(true)}
      />

      {/* Main Workspace Area */}
      <main className="flex-1 flex flex-col p-3 sm:p-5 gap-4 max-w-7xl mx-auto w-full">
        {/* Practice Helper & Simulator Strip */}
        <section
          aria-label="Practice Control Strip"
          className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-md text-xs sm:text-sm"
        >
          {/* Wait-for-Me 150ms Hold Progress or Play-Along Count-in */}
          <div className="flex items-center gap-3 min-w-0 flex-1 max-w-xl">
            {practiceMode === 'wait-for-me' ? (
              <div className="flex flex-col gap-1 w-full min-w-0">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-300 truncate">
                    Target Note:{' '}
                    <strong className="text-emerald-400 font-bold">
                      {controllerState.activeNote?.pitch?.label ?? '--'}
                    </strong>{' '}
                    (Measure {controllerState.currentMeasureNumber})
                  </span>
                  <span className="font-mono text-emerald-400 text-[11px]">
                    {Math.round(controllerState.holdProgress * 100)}% / 150ms
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Wait-for-Me Hold Progress"
                  aria-valuenow={Math.round(controllerState.holdProgress * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800"
                >
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-75"
                    style={{
                      width: `${Math.round(controllerState.holdProgress * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Music className="w-4 h-4 text-emerald-400 shrink-0" />
                {controllerState.countInBeat ? (
                  <span className="font-mono text-emerald-400 font-semibold animate-pulse">
                    Count-In: Bar {controllerState.countInBeat.bar}, Beat{' '}
                    {controllerState.countInBeat.beat} of{' '}
                    {controllerState.countInBeat.total}
                  </span>
                ) : (
                  <span>
                    Play-Along Mode · Measure {controllerState.currentMeasureNumber}
                    {controllerState.loopCount > 0 && ` (Loop ${controllerState.loopCount})`}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Test / Mic-free Helper: Simulate In-Tune Note */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSimulateInTuneNote}
              aria-label="Simulate In-Tune Note"
              title="Feeds continuous in-tune pitch sample (>= 150ms in Wait-for-Me) without a microphone"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold transition cursor-pointer min-h-[34px]"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Simulate In-Tune Note</span>
            </button>
          </div>
        </section>

        {/* End-of-Session Accuracy Summary Card */}
        {showSessionSummary && controllerState.sessionSummary && (
          <section
            aria-label="Session Accuracy Summary"
            className="bg-gradient-to-r from-slate-900 to-slate-900/90 border border-emerald-500/50 rounded-2xl p-5 shadow-2xl space-y-4 animate-in fade-in"
            data-testid="session-summary-card"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                <h2 className="text-base sm:text-lg font-bold text-slate-100">
                  Session Accuracy Summary
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsSummaryDismissed(true)}
                aria-label="Dismiss Session Summary"
                className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-center">
                <p className="text-xs text-slate-400 mb-1">Accuracy</p>
                <p className="text-xl sm:text-2xl font-black text-emerald-400 font-mono">
                  {controllerState.sessionSummary.accuracyPercent.toFixed(1)}%
                </p>
              </div>

              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-center">
                <p className="text-xs text-slate-400 mb-1">In-Tune (Green)</p>
                <p className="text-xl sm:text-2xl font-black text-emerald-400 font-mono flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  {controllerState.sessionSummary.greenCount}
                </p>
              </div>

              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-center">
                <p className="text-xs text-slate-400 mb-1">Close (Yellow)</p>
                <p className="text-xl sm:text-2xl font-black text-amber-400 font-mono flex items-center justify-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  {controllerState.sessionSummary.yellowCount}
                </p>
              </div>

              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-center">
                <p className="text-xs text-slate-400 mb-1">Missed (Red)</p>
                <p className="text-xl sm:text-2xl font-black text-rose-400 font-mono flex items-center justify-center gap-1">
                  <XCircle className="w-4 h-4" />
                  {controllerState.sessionSummary.redCount}
                </p>
              </div>

              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-center col-span-2 sm:col-span-1">
                <p className="text-xs text-slate-400 mb-1">Avg Cents Offset</p>
                <p className="text-xl sm:text-2xl font-black text-slate-200 font-mono">
                  {controllerState.sessionSummary.averageAbsCentsDelta !== null
                    ? `±${controllerState.sessionSummary.averageAbsCentsDelta.toFixed(1)}¢`
                    : '--'}
                </p>
              </div>
            </div>

            {/* Problem Measures & 1-Click Loop Action */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="text-xs text-slate-300">
                <span className="font-semibold text-slate-200">Problem Measures: </span>
                {controllerState.sessionSummary.problemMeasures.length > 0 ? (
                  <span className="text-amber-400 font-medium font-mono">
                    Measures {controllerState.sessionSummary.problemMeasures.join(', ')}
                  </span>
                ) : (
                  <span className="text-emerald-400 font-medium">
                    None! Perfect intonation across all measures.
                  </span>
                )}
              </div>

              {controllerState.sessionSummary.problemMeasures.length > 0 && (
                <button
                  type="button"
                  onClick={handleLoopProblemMeasures}
                  aria-label="Loop Problem Measures"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-md transition cursor-pointer"
                >
                  <Repeat className="w-3.5 h-3.5" />
                  <span>Loop Problem Measures (1-Click)</span>
                </button>
              )}
            </div>
          </section>
        )}

        {/* Score Viewport Container */}
        <section
          aria-label="Sheet Music Viewport"
          className="bg-white rounded-2xl p-4 shadow-xl flex-1 min-h-[360px] overflow-hidden border border-slate-800/20 text-slate-900"
        >
          <ScoreViewport
            xmlContent={currentScore.xmlContent}
            viewMode={viewMode}
            cursorStepIndex={controllerState.cursorStepIndex}
          />
        </section>

        {/* Bottom Section: Tuner HUD & Mixer Panel */}
        <section
          aria-label="Acoustic Tuner and Mixer"
          className="grid grid-cols-1 lg:grid-cols-2 gap-4"
        >
          {/* Tuner HUD */}
          <TunerHUD
            micManager={micManager}
            targetNote={controllerState.activeNote}
            referenceA4Hz={referenceA4Hz}
            toleranceCents={toleranceCents}
          />

          {/* 4-Channel Mixer & Tempo Controls */}
          <MixerPanel
            mixer={mixer}
            onMixerChange={handleMixerChange}
            tempoScale={tempoScale}
            onTempoScaleChange={(scale) => setTempoScale(scale)}
            countInBars={countInBars}
            onCountInBarsChange={(bars) => setCountInBars(bars)}
            droneTargetNoteName={controllerState.activeNote?.pitch?.label ?? null}
            onToggleDrone={handleToggleDrone}
          />
        </section>
      </main>

      {/* Library Modal */}
      <LibraryModal
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        currentScoreId={currentScore.id}
        onSelectScore={handleSelectScore}
      />

      {/* Calibration Drawer */}
      <CalibrationDrawer
        isOpen={isCalibrationOpen}
        onClose={() => setIsCalibrationOpen(false)}
        referenceA4Hz={referenceA4Hz}
        onReferenceA4Change={(hz) => setReferenceA4Hz(hz)}
        strictness={strictness}
        onStrictnessChange={(s) => setStrictness(s)}
        customToleranceCents={customToleranceCents}
        onCustomToleranceCentsChange={(c) => setCustomToleranceCents(c)}
      />
    </div>
  );
}
