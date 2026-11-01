import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Repeat,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
} from 'lucide-react';
import {
  type StoredScore,
  BUILT_IN_SCORES,
} from './modules/score-engine/scoreStore';
import { extractScoreTimeline } from './modules/score-engine/timelineExtractor';
import {
  applyNoteGradeToSvg,
  resetSvgNoteColors,
} from './components/ScoreViewport';
import { AppShell, type AppPage } from './components/AppShell';
import { PracticeStudioPage } from './pages/PracticeStudioPage';
import { LibraryPage } from './pages/LibraryPage';
import { TunerPage } from './pages/TunerPage';
import { SettingsPage } from './pages/SettingsPage';
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

function getPageFromHash(): AppPage {
  if (typeof window === 'undefined') return 'studio';
  const hash = window.location.hash.toLowerCase();
  if (hash.startsWith('#/library')) return 'library';
  if (hash.startsWith('#/tuner')) return 'tuner';
  if (hash.startsWith('#/settings')) return 'settings';
  return 'studio';
}

export default function App({
  initialAudioEngine,
  initialMicManager,
  initialScore,
}: AppProps = {}) {
  // Navigation State
  const [activePage, setActivePage] = useState<AppPage>(() => getPageFromHash());

  // Listen to hashchange events
  useEffect(() => {
    const handleHashChange = () => {
      setActivePage(getPageFromHash());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleNavigate = (page: AppPage) => {
    setActivePage(page);
    const route =
      page === 'library'
        ? '#/library'
        : page === 'tuner'
        ? '#/tuner'
        : page === 'settings'
        ? '#/settings'
        : '#/practice';
    if (typeof window !== 'undefined' && window.location.hash !== route) {
      window.location.hash = route;
    }
  };

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
  const [selectedMicDeviceId, setSelectedMicDeviceId] = useState<string | null>(null);
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
      // Feed two samples spaced 160ms apart to fulfill continuous >= 150ms hold
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
    <AppShell
      activePage={activePage}
      onNavigate={handleNavigate}
      activeScoreTitle={currentScore.title}
      referenceA4Hz={referenceA4Hz}
      toleranceCents={toleranceCents}
      onOpenCalibration={() => setIsCalibrationOpen(true)}
    >
      {/* 1. Practice Studio Page View */}
      {activePage === 'studio' && (
        <div className="flex-1 flex flex-col w-full">
          {/* End-of-Session Accuracy Summary Card */}
          {showSessionSummary && controllerState.sessionSummary && (
            <div className="max-w-7xl mx-auto w-full px-2 sm:px-4 pt-2">
              <section
                aria-label="Session Accuracy Summary"
                className="rounded-xl p-4 sm:p-5 border shadow-lg space-y-4 font-sans animate-in fade-in"
                style={{
                  backgroundColor: 'var(--color-paper-2)',
                  borderColor: 'var(--color-accent)',
                  color: 'var(--color-ink)',
                }}
                data-testid="session-summary-card"
              >
                <div
                  className="flex items-center justify-between border-b pb-3"
                  style={{ borderColor: 'var(--color-rule)' }}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--color-intonation-match)' }} />
                    <h2 className="font-display text-base sm:text-lg font-bold">
                      Session Accuracy Summary
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsSummaryDismissed(true)}
                    aria-label="Dismiss Session Summary"
                    className="p-1 rounded text-xs hover:opacity-75 cursor-pointer"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  <div
                    className="p-3 rounded-lg border text-center"
                    style={{
                      backgroundColor: 'var(--color-paper)',
                      borderColor: 'var(--color-rule)',
                    }}
                  >
                    <p className="text-xs mb-1" style={{ color: 'var(--color-muted)' }}>Accuracy</p>
                    <p
                      className="text-xl sm:text-2xl font-bold font-mono"
                      style={{ color: 'var(--color-intonation-match)' }}
                    >
                      {controllerState.sessionSummary.accuracyPercent.toFixed(1)}%
                    </p>
                  </div>

                  <div
                    className="p-3 rounded-lg border text-center"
                    style={{
                      backgroundColor: 'var(--color-paper)',
                      borderColor: 'var(--color-rule)',
                    }}
                  >
                    <p className="text-xs mb-1" style={{ color: 'var(--color-muted)' }}>In-Tune (Green)</p>
                    <p
                      className="text-xl sm:text-2xl font-bold font-mono flex items-center justify-center gap-1"
                      style={{ color: 'var(--color-intonation-match)' }}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {controllerState.sessionSummary.greenCount}
                    </p>
                  </div>

                  <div
                    className="p-3 rounded-lg border text-center"
                    style={{
                      backgroundColor: 'var(--color-paper)',
                      borderColor: 'var(--color-rule)',
                    }}
                  >
                    <p className="text-xs mb-1" style={{ color: 'var(--color-muted)' }}>Close (Yellow)</p>
                    <p
                      className="text-xl sm:text-2xl font-bold font-mono flex items-center justify-center gap-1"
                      style={{ color: 'var(--color-intonation-close)' }}
                    >
                      <AlertTriangle className="w-4 h-4" />
                      {controllerState.sessionSummary.yellowCount}
                    </p>
                  </div>

                  <div
                    className="p-3 rounded-lg border text-center"
                    style={{
                      backgroundColor: 'var(--color-paper)',
                      borderColor: 'var(--color-rule)',
                    }}
                  >
                    <p className="text-xs mb-1" style={{ color: 'var(--color-muted)' }}>Missed (Red)</p>
                    <p
                      className="text-xl sm:text-2xl font-bold font-mono flex items-center justify-center gap-1"
                      style={{ color: 'var(--color-intonation-miss)' }}
                    >
                      <XCircle className="w-4 h-4" />
                      {controllerState.sessionSummary.redCount}
                    </p>
                  </div>

                  <div
                    className="p-3 rounded-lg border text-center col-span-2 sm:col-span-1"
                    style={{
                      backgroundColor: 'var(--color-paper)',
                      borderColor: 'var(--color-rule)',
                    }}
                  >
                    <p className="text-xs mb-1" style={{ color: 'var(--color-muted)' }}>Avg Cents Offset</p>
                    <p className="text-xl sm:text-2xl font-bold font-mono" style={{ color: 'var(--color-ink)' }}>
                      {controllerState.sessionSummary.averageAbsCentsDelta !== null
                        ? `±${controllerState.sessionSummary.averageAbsCentsDelta.toFixed(1)}¢`
                        : '--'}
                    </p>
                  </div>
                </div>

                {/* Problem Measures & 1-Click Loop Action */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="text-xs" style={{ color: 'var(--color-ink-2)' }}>
                    <span className="font-semibold" style={{ color: 'var(--color-ink)' }}>
                      Problem Measures:{' '}
                    </span>
                    {controllerState.sessionSummary.problemMeasures.length > 0 ? (
                      <span className="font-mono font-medium" style={{ color: 'var(--color-intonation-close)' }}>
                        Measures {controllerState.sessionSummary.problemMeasures.join(', ')}
                      </span>
                    ) : (
                      <span className="font-medium" style={{ color: 'var(--color-intonation-match)' }}>
                        None! Perfect intonation across all measures.
                      </span>
                    )}
                  </div>

                  {controllerState.sessionSummary.problemMeasures.length > 0 && (
                    <button
                      type="button"
                      onClick={handleLoopProblemMeasures}
                      aria-label="Loop Problem Measures"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold text-white shadow-xs transition cursor-pointer"
                      style={{ backgroundColor: 'var(--color-accent)' }}
                    >
                      <Repeat className="w-3.5 h-3.5" />
                      <span>Loop Problem Measures (1-Click)</span>
                    </button>
                  )}
                </div>
              </section>
            </div>
          )}

          {/* Primary Distraction-free PracticeStudioPage */}
          <PracticeStudioPage
            currentScore={currentScore}
            totalMeasures={totalMeasures}
            controllerState={controllerState}
            practiceMode={practiceMode}
            onPracticeModeChange={(m) => setPracticeMode(m)}
            viewMode={viewMode}
            onViewModeChange={(m) => setViewMode(m)}
            loopRange={loopRange}
            onLoopRangeChange={(r) => setLoopRange(r)}
            onStartPractice={handleStartPractice}
            onPausePractice={handlePausePractice}
            onResumePractice={handleResumePractice}
            onStopPractice={handleStopPractice}
            onSimulateInTuneNote={handleSimulateInTuneNote}
            onToggleDrone={handleToggleDrone}
            mixer={mixer}
            onMixerChange={handleMixerChange}
            tempoScale={tempoScale}
            onTempoScaleChange={(s) => setTempoScale(s)}
            countInBars={countInBars}
            onCountInBarsChange={(b) => setCountInBars(b)}
            onOpenLibrary={() => setIsLibraryOpen(true)}
          />
        </div>
      )}

      {/* 2. Repertoire Library Page */}
      {activePage === 'library' && (
        <LibraryPage
          currentScoreId={currentScore.id}
          onSelectScore={handleSelectScore}
          onNavigateToStudio={() => handleNavigate('studio')}
        />
      )}

      {/* 3. 4-String Violin Pegbox Tuner Page */}
      {activePage === 'tuner' && (
        <TunerPage
          referenceA4Hz={referenceA4Hz}
          toleranceCents={toleranceCents}
          audioEngine={audioEngine}
          micManager={micManager}
        />
      )}

      {/* 4. Settings & Calibration Page */}
      {activePage === 'settings' && (
        <SettingsPage
          referenceA4Hz={referenceA4Hz}
          onReferenceA4Change={(hz) => setReferenceA4Hz(hz)}
          strictness={strictness}
          onStrictnessChange={(s) => setStrictness(s)}
          customToleranceCents={customToleranceCents}
          onCustomToleranceCentsChange={(c) => setCustomToleranceCents(c)}
          selectedMicDeviceId={selectedMicDeviceId}
          onSelectedMicDeviceIdChange={(id) => setSelectedMicDeviceId(id)}
        />
      )}

      {/* Quick Library Modal */}
      <LibraryModal
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        currentScoreId={currentScore.id}
        onSelectScore={handleSelectScore}
      />

      {/* Quick Calibration Drawer */}
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
    </AppShell>
  );
}
