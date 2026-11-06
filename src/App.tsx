import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { type StoredScore, BUILT_IN_SCORES } from './modules/score-engine/scoreStore';
import { extractScoreTimeline } from './modules/score-engine/timelineExtractor';
import { applyNoteGradeToSvg, resetSvgNoteColors } from './components/ScoreViewport';
import { AppShell, PAGE_ROUTES, pageFromHash, type AppPage } from './components/AppShell';
import { PlayPage } from './pages/PlayPage';
import { SongsPage } from './pages/SongsPage';
import { TunerPage } from './pages/TunerPage';
import { SettingsPage } from './pages/SettingsPage';
import { ResultSheet } from './components/play/ResultSheet';
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
  type PracticeSessionSummary,
  DEFAULT_MIXER_SETTINGS,
  getToleranceCents,
} from './types/music';
import { midiNoteToFrequency } from './modules/pitch-detection/pitchMath';
import { NotationProvider } from './modules/notation/NotationContext';
import { loadHintsEnabled, saveHintsEnabled, recordEpisode } from './modules/fingerboard/hintStats';
import { loadNotation, saveNotation, type NotationSystem } from './modules/notation/noteNames';
import {
  buildSessionResult,
  loopRangeFor,
  type LockEvent,
  type SessionResult,
} from './modules/practice-coach/sessionResult';
import { useLivePitch, isMicUnsupported } from './hooks/useLivePitch';

export interface AppProps {
  readonly initialAudioEngine?: AudioPlaybackEngine;
  readonly initialMicManager?: MicSessionManager;
  readonly initialScore?: StoredScore;
}

export default function App({ initialAudioEngine, initialMicManager, initialScore }: AppProps = {}) {
  // --- Navigation -----------------------------------------------------------
  const [activePage, setActivePage] = useState<AppPage>(() =>
    typeof window === 'undefined' ? 'songs' : pageFromHash(window.location.hash),
  );
  useEffect(() => {
    const onHash = () => setActivePage(pageFromHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const handleNavigate = useCallback((page: AppPage) => {
    setActivePage(page);
    const route = PAGE_ROUTES[page];
    if (typeof window !== 'undefined' && window.location.hash !== route) {
      window.location.hash = route;
    }
  }, []);

  // --- Engines (created once) ------------------------------------------------
  const [currentScore, setCurrentScore] = useState<StoredScore>(initialScore ?? BUILT_IN_SCORES[0]);
  const audioEngineRef = useRef<AudioPlaybackEngine | null>(null);
  if (!audioEngineRef.current) audioEngineRef.current = initialAudioEngine ?? new AudioPlaybackEngine();
  const audioEngine = audioEngineRef.current;
  const micManagerRef = useRef<MicSessionManager | null>(null);
  if (!micManagerRef.current) micManagerRef.current = initialMicManager ?? new MicSessionManager();
  const micManager = micManagerRef.current;

  // --- Settings ------------------------------------------------------------
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('wait-for-me');
  const [viewMode, setViewMode] = useState<'page' | 'ribbon'>(() =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 1023px)').matches
      ? 'ribbon'
      : 'page',
  );
  const [notation, setNotation] = useState<NotationSystem>(() => loadNotation());
  const handleNotationChange = (system: NotationSystem) => {
    setNotation(system);
    saveNotation(system);
  };
  const [hintsEnabled, setHintsEnabled] = useState<boolean>(() => loadHintsEnabled());
  const handleHintsEnabledChange = (enabled: boolean) => {
    setHintsEnabled(enabled);
    saveHintsEnabled(enabled);
  };
  const hintsEnabledRef = useRef(hintsEnabled);
  hintsEnabledRef.current = hintsEnabled;
  const [referenceA4Hz, setReferenceA4Hz] = useState<number>(440);
  const [strictness, setStrictness] = useState<IntonationStrictness>('medium');
  const [customToleranceCents, setCustomToleranceCents] = useState<number>(15);
  const [selectedMicDeviceId, setSelectedMicDeviceId] = useState<string | null>(null);
  const [tempoScale, setTempoScale] = useState<number>(1.0);
  const [countInBars, setCountInBars] = useState<1 | 2>(1);
  const [loopRange, setLoopRange] = useState<MeasureLoopRange | null>(null);
  const [mixer, setMixer] = useState<MixerSettings>(DEFAULT_MIXER_SETTINGS);
  const toleranceCents = getToleranceCents({ strictness, customToleranceCents });

  // --- Session ---------------------------------------------------------------
  const [result, setResult] = useState<SessionResult | null>(null);
  const [isResultDismissed, setIsResultDismissed] = useState(false);
  const [libraryNotice, setLibraryNotice] = useState<string | null>(null);
  const locksRef = useRef<LockEvent[]>([]);
  const modeRef = useRef(practiceMode);
  modeRef.current = practiceMode;
  const tempoRef = useRef(tempoScale);
  tempoRef.current = tempoScale;
  const [micStatus, setMicStatus] = useState<'unknown' | 'live' | 'unavailable'>(() =>
    isMicUnsupported() ? 'unavailable' : 'unknown',
  );

  const timeline = useMemo(() => {
    try {
      return extractScoreTimeline(currentScore.xmlContent);
    } catch (err) {
      console.warn('Failed to extract score timeline:', err);
      return extractScoreTimeline(BUILT_IN_SCORES[0].xmlContent);
    }
  }, [currentScore.xmlContent]);
  const totalMeasures = timeline.measures.length;

  // --- Practice controller ---------------------------------------------------
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
    hint: null,
    micError: null,
    awaitingReattack: false,
  });
  const controllerRef = useRef<PracticeController | null>(null);

  const handleNoteGraded = useCallback((event: NoteGradedEvent) => {
    const scoreContainer = document.getElementById('osmd-score-container');
    if (scoreContainer) applyNoteGradeToSvg(scoreContainer, event.svgTargetIds, event.grade);
    if (modeRef.current === 'wait-for-me') {
      locksRef.current.push({
        measureNumber: event.note.measureNumber,
        atMs: performance.now(),
        writtenMs: event.note.durationMs / Math.max(0.25, tempoRef.current),
      });
    }
  }, []);

  useEffect(() => {
    controllerRef.current?.dispose();
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
      onStateChange: setControllerState,
      onNoteGraded: handleNoteGraded,
      hintsEnabled: hintsEnabledRef.current,
      onHintEpisode: (e) => recordEpisode({ at: Date.now(), ...e }),
    });
    controllerRef.current = controller;
    setControllerState(controller.getState());
    setIsResultDismissed(false);
    const scoreContainer = document.getElementById('osmd-score-container');
    if (scoreContainer) resetSvgNoteColors(scoreContainer);
    return () => controller.dispose();
    // Recreated only when the piece or the mode changes; other settings are pushed below.
  }, [timeline, practiceMode]);

  useEffect(() => controllerRef.current?.setHintsEnabled(hintsEnabled), [hintsEnabled]);

  // The drone button always shows what the controller is really doing (it stops by itself when
  // the piece ends, or when practice stops)
  useEffect(() => {
    setMixer((prev) =>
      prev.droneActive === controllerState.isDronePlaying
        ? prev
        : { ...prev, droneActive: controllerState.isDronePlaying },
    );
  }, [controllerState.isDronePlaying]);
  useEffect(() => controllerRef.current?.setToleranceCents(toleranceCents), [toleranceCents]);
  useEffect(() => controllerRef.current?.setReferenceA4Hz(referenceA4Hz), [referenceA4Hz]);
  useEffect(() => controllerRef.current?.setTempoScale(tempoScale), [tempoScale]);
  useEffect(() => controllerRef.current?.setLoopRange(loopRange), [loopRange]);
  useEffect(() => controllerRef.current?.beatScheduler.setCountInBars(countInBars), [countInBars]);
  useEffect(() => () => controllerRef.current?.dispose(), []);

  const isActive = controllerState.isRunning && !controllerState.isPaused;

  // --- Results ----------------------------------------------------------------
  // Natural end of the piece (both modes).
  const finalizedSummaryRef = useRef<PracticeSessionSummary | null>(null);
  useEffect(() => {
    const summary = controllerState.sessionSummary;
    if (summary && !controllerState.isRunning && finalizedSummaryRef.current !== summary) {
      finalizedSummaryRef.current = summary;
      setResult(buildSessionResult({ mode: practiceMode, summary, locks: locksRef.current }));
      setIsResultDismissed(false);
    }
  }, [controllerState.sessionSummary, controllerState.isRunning, practiceMode]);

  // --- Transport ----------------------------------------------------------------
  const resetNoteColors = () => {
    const scoreContainer = document.getElementById('osmd-score-container');
    if (scoreContainer) resetSvgNoteColors(scoreContainer);
  };

  const handleStartPractice = async () => {
    setResult(null);
    setIsResultDismissed(false);
    locksRef.current = [];
    resetNoteColors();
    const controller = controllerRef.current;
    if (controller) {
      await controller.start();
      if (micStatus !== 'unavailable') setMicStatus(micManager.isRunning ? 'live' : 'unavailable');
    }
  };
  const handlePausePractice = () => controllerRef.current?.pause();
  const handleResumePractice = () => controllerRef.current?.resume();
  const handleStopPractice = () => {
    controllerRef.current?.stop();
    resetNoteColors();
  };

  const handleToggleDrone = () => {
    const isPlaying = controllerRef.current?.toggleReferenceDrone();
    setMixer((prev) => ({ ...prev, droneActive: Boolean(isPlaying) }));
  };
  const handleMixerChange = (newMixer: MixerSettings) => {
    setMixer(newMixer);
    audioEngine.applyMixerSettings(newMixer);
  };

  /** Feeds a perfect pitch for the current note: lets you try the flow without a microphone. */
  const handleSimulateInTuneNote = async () => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (!controller.isRunning) await handleStartPractice();
    const active = controller.activeNote;
    if (!active?.pitch) return;
    const targetHz = midiNoteToFrequency(active.pitch.midiNumber, referenceA4Hz);
    const t0 = audioEngine.audioContext.currentTime;
    if (controller.mode === 'wait-for-me') {
      // A short silence first, like a fresh bow stroke, so a repeated note counts again
      controller.handlePitchSample(null, t0);
      controller.handlePitchSample(null, t0 + 0.05);
      controller.handlePitchSample({ frequencyHz: targetHz, clarity: 0.98, rms: 0.08, audioTimeSec: t0 + 0.1 });
      controller.handlePitchSample({ frequencyHz: targetHz, clarity: 0.98, rms: 0.08, audioTimeSec: t0 + 0.26 });
    } else {
      controller.handlePitchSample({ frequencyHz: targetHz, clarity: 0.98, rms: 0.08, audioTimeSec: t0 });
    }
  };

  // --- Opening the play screen ------------------------------------------------
  const handlePlayScore = (score: StoredScore) => {
    controllerRef.current?.stop();
    setCurrentScore(score);
    setLoopRange(null);
    setResult(null);
    handleNavigate('play');
  };

  const handleClosePlay = () => {
    controllerRef.current?.stop();
    if (mixer.droneActive) setMixer((prev) => ({ ...prev, droneActive: false }));
    handleNavigate('songs');
  };

  const handleLoopHardBars = () => {
    const range = result ? loopRangeFor(result.hardBars) : null;
    if (!range) return;
    setLoopRange(range);
    controllerRef.current?.setLoopRange(range);
    setIsResultDismissed(true);
    void handleStartPractice();
  };

  const handlePlayAgain = () => {
    setIsResultDismissed(true);
    void handleStartPractice();
  };

  // --- Play screen copy -------------------------------------------------------
  const barsText = (range: MeasureLoopRange | null) =>
    range
      ? range.startMeasure === range.endMeasure
        ? `Bar ${range.startMeasure}`
        : `Bars ${range.startMeasure} to ${range.endMeasure}`
      : `${totalMeasures} ${totalMeasures === 1 ? 'bar' : 'bars'}`;
  const playTitle = currentScore.title;
  const playSubtitle = barsText(loopRange);
  const idleHint = loopRange
    ? 'The passage repeats until you stop. Slow it down in options if it helps.'
    : practiceMode === 'wait-for-me'
      ? 'Tap Start, then play. The music waits for each note.'
      : 'Tap Start for a count-in. The piano keeps going, so keep playing.';
  const barsInPlay = (() => {
    const first = loopRange?.startMeasure ?? 1;
    const last = loopRange?.endMeasure ?? Math.max(totalMeasures, 1);
    return Array.from({ length: last - first + 1 }, (_, i) => first + i);
  })();

  // Notes of the bar being played, for the fingering hint's faint context
  const barMidis = useMemo(() => {
    const bar = controllerState.currentMeasureNumber;
    return timeline.soloNotes
      .filter((n) => n.measureNumber === bar && n.pitch !== null)
      .map((n) => n.pitch!.midiNumber);
  }, [timeline, controllerState.currentMeasureNumber]);

  const livePitch = useLivePitch(micManager, activePage === 'play' && isActive);
  const showResult = result !== null && !isResultDismissed && !controllerState.isRunning && activePage === 'play';

  return (
    <NotationProvider system={notation}>
      <AppShell activePage={activePage} onNavigate={handleNavigate}>
        {activePage !== 'songs' && libraryNotice && (
          <div
            role="status"
            aria-live="polite"
            data-testid="library-notice"
            className="w-full max-w-xl mx-auto px-4 pt-2"
          >
            <div
              className="p-3 rounded-[16px] flex items-center justify-between gap-3 text-[14px] leading-snug"
              style={{ backgroundColor: '#fde8ee', color: '#7a1832' }}
            >
              <span>{libraryNotice}</span>
              <button
                type="button"
                onClick={() => setLibraryNotice(null)}
                aria-label="Dismiss library notice"
                className="px-2 py-1 rounded text-[13px] font-bold cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {activePage === 'songs' && (
          <SongsPage
            currentScoreId={currentScore.id}
            onPlayScore={handlePlayScore}
            libraryNotice={libraryNotice}
            onLibraryNotice={setLibraryNotice}
          />
        )}

        {activePage === 'play' && (
          <PlayPage
            title={playTitle}
            subtitle={playSubtitle}
            idleHint={idleHint}
            currentScore={currentScore}
            totalMeasures={totalMeasures}
            controllerState={controllerState}
            practiceMode={practiceMode}
            onPracticeModeChange={setPracticeMode}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            loopRange={loopRange}
            onLoopRangeChange={setLoopRange}
            onStartPractice={handleStartPractice}
            onPausePractice={handlePausePractice}
            onResumePractice={handleResumePractice}
            onStopPractice={handleStopPractice}
            onClose={handleClosePlay}
            onSimulateInTuneNote={handleSimulateInTuneNote}
            showSimulate={micStatus === 'unavailable'}
            onToggleDrone={handleToggleDrone}
            mixer={mixer}
            onMixerChange={handleMixerChange}
            tempoScale={tempoScale}
            onTempoScaleChange={setTempoScale}
            countInBars={countInBars}
            onCountInBarsChange={setCountInBars}
            strictness={strictness}
            onStrictnessChange={setStrictness}
            toleranceCents={toleranceCents}
            referenceA4Hz={referenceA4Hz}
            livePitch={livePitch}
            barMidis={barMidis}
            micManager={micManager}
            onRetryMic={() => void controllerRef.current?.retryMic()}
          />
        )}

        {activePage === 'tune' && (
          <TunerPage
            referenceA4Hz={referenceA4Hz}
            toleranceCents={toleranceCents}
            audioEngine={audioEngine}
            micManager={micManager}
          />
        )}

        {activePage === 'settings' && (
          <SettingsPage
            referenceA4Hz={referenceA4Hz}
            onReferenceA4Change={setReferenceA4Hz}
            strictness={strictness}
            onStrictnessChange={setStrictness}
            customToleranceCents={customToleranceCents}
            onCustomToleranceCentsChange={setCustomToleranceCents}
            selectedMicDeviceId={selectedMicDeviceId}
            onSelectedMicDeviceIdChange={setSelectedMicDeviceId}
            notation={notation}
            onNotationChange={handleNotationChange}
            hintsEnabled={hintsEnabled}
            onHintsEnabledChange={handleHintsEnabledChange}
          />
        )}

        {showResult && result && (
          <ResultSheet
            result={result}
            title={playTitle}
            subtitle={playSubtitle}
            barsInPlay={barsInPlay}
            onLoopHardBars={handleLoopHardBars}
            onPlayAgain={handlePlayAgain}
            onDismiss={() => setIsResultDismissed(true)}
          />
        )}
      </AppShell>
    </NotationProvider>
  );
}
