import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { FeedbackPanel } from '../../src/components/play/FeedbackPanel';
import { ResultSheet } from '../../src/components/play/ResultSheet';
import { PlayPage } from '../../src/pages/PlayPage';
import { NotationProvider } from '../../src/modules/notation/NotationContext';
import { buildSessionResult } from '../../src/modules/practice-coach/sessionResult';
import type { PracticeControllerState } from '../../src/modules/practice-coach/practiceController';
import type { PlayableNote } from '../../src/types/music';
import { midiNoteToFrequency } from '../../src/modules/pitch-detection/pitchMath';

const a4: PlayableNote = {
  id: 'p0-m1-n0',
  measureNumber: 1,
  partIndex: 0,
  isSolo: true,
  pitch: { step: 'A', alter: 0, octave: 4, midiNumber: 69, label: 'A4', frequencyHz440: 440 },
  startBeat: 0,
  durationBeats: 1,
  startTimeMs: 0,
  durationMs: 600,
  cursorStepIndex: 0,
  tiedNoteIds: [],
};

const running = (overrides: Partial<PracticeControllerState> = {}): PracticeControllerState => ({
  mode: 'wait-for-me',
  isRunning: true,
  isPaused: false,
  activeNote: a4,
  cursorStepIndex: 0,
  currentMeasureNumber: 1,
  holdProgress: 0.4,
  latestNoteGrade: null,
  sessionSummary: null,
  isDronePlaying: false,
  loopCount: 0,
  countInBeat: null,
  hint: null,
  micError: null,
  awaitingReattack: false,
  ...overrides,
});

const centsAbove = (cents: number) => midiNoteToFrequency(69, 440) * Math.pow(2, cents / 1200);

function panelElement(
  frequencyHz: number | null,
  state = running(),
  system: 'letters' | 'solfege' = 'letters',
  barMidis?: readonly number[],
) {
  return (
    <NotationProvider system={system}>
      <FeedbackPanel
        controllerState={state}
        practiceMode={state.mode}
        livePitch={frequencyHz === null ? null : { frequencyHz, clarity: 0.95, rms: 0.05, audioTimeSec: 0 }}
        referenceA4Hz={440}
        toleranceCents={15}
        idleHint={state.mode === 'play-along' ? 'Keep playing' : 'Hold each note'}
        droneActive={false}
        onToggleDrone={vi.fn()}
        showSimulate={false}
        onSimulateInTuneNote={vi.fn()}
        barMidis={barMidis}
      />
    </NotationProvider>
  );
}

function renderPanel(
  frequencyHz: number | null,
  state = running(),
  system: 'letters' | 'solfege' = 'letters',
  barMidis?: readonly number[],
) {
  return render(panelElement(frequencyHz, state, system, barMidis));
}

describe('FeedbackPanel live verdicts', () => {
  it('says in tune within tolerance and shows intonation meter', () => {
    renderPanel(centsAbove(6));
    expect(screen.getByText('In tune')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Intonation' })).toHaveAttribute('aria-valuenow', '6');
    expect(screen.getByText(/\+6 cents/)).toBeInTheDocument();
  });

  it('says a little flat with an upward instruction, not colour alone', () => {
    renderPanel(centsAbove(-22));
    expect(screen.getByText('A little flat')).toBeInTheDocument();
    expect(screen.getByText('Go higher ↑')).toBeInTheDocument();
    const meter = screen.getByRole('meter', { name: 'Intonation' });
    expect(meter).toHaveAttribute('aria-valuenow', '-22');
    expect(meter).toHaveAttribute('aria-valuetext', '-22 cents flat');
  });

  it('reports silent intonation meter when no pitch is detected', () => {
    renderPanel(null);
    const meter = screen.getByRole('meter', { name: 'Intonation' });
    expect(meter).toHaveAttribute('aria-valuenow', '0');
    expect(meter).toHaveAttribute('aria-valuetext', 'Silent');
  });

  it('names the note actually heard when far off', () => {
    renderPanel(midiNoteToFrequency(71, 440)); // B4 against an A4 target
    expect(screen.getByText('Sharp')).toBeInTheDocument();
    expect(screen.getByText("You're on B4. Go lower ↓")).toBeInTheDocument();
  });

  it('shows the count-in beat large during Play-Along count-in', () => {
    renderPanel(null, running({ mode: 'play-along', countInBeat: { bar: 1, beat: 3, total: 4 } }));
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Count-in, beat 3 of 4')).toBeInTheDocument();
  });
});

describe('FeedbackPanel fingering hint', () => {
  const stuck = { reason: 'stuck' as const, noteKey: '0' };

  it('shows nothing until offered or requested, then both positions for A4 without extra header', () => {
    renderPanel(null);
    expect(screen.queryByRole('region', { name: 'Fingering hint' })).not.toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Intonation' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show finger placement' }));
    const hint = screen.getByRole('region', { name: 'Fingering hint' });
    expect(within(hint).queryByText('Where to put your finger')).not.toBeInTheDocument();
    expect(within(hint).getByText('Open A string')).toBeInTheDocument();
    expect(within(hint).getByText('D string, finger 2')).toBeInTheDocument();
    expect(within(hint).getByText('1st')).toBeInTheDocument();
    expect(within(hint).getByText('3rd')).toBeInTheDocument();
    // The hint takes the meter's place; the target note and verdict stay on screen.
    expect(screen.getByTestId('target-note')).toBeInTheDocument();
  });

  it('draws the 3rd-position reference line, the bar\'s notes faintly, and colours the positions', () => {
    // A bar of D4 E4 F#4 A4 (the target is D4)
    renderPanel(null, running(), 'letters', [62, 64, 66, 69]);
    fireEvent.click(screen.getByRole('button', { name: 'Show finger placement' }));
    const hint = screen.getByRole('region', { name: 'Fingering hint' });
    expect(within(hint).getByTestId('third-position-line')).toBeInTheDocument();
    const ghosts = within(hint).getByTestId('bar-notes');
    expect(ghosts.querySelectorAll('[data-ghost="1"]').length).toBeGreaterThanOrEqual(4);
    expect(ghosts.querySelectorAll('[data-ghost="3"]').length).toBeGreaterThanOrEqual(3);
    // Position tags carry the position colours
    expect(within(hint).getByText('1st')).toHaveStyle({ backgroundColor: 'var(--pos1)' });
    expect(within(hint).getByText('3rd')).toHaveStyle({ backgroundColor: 'var(--pos3)' });
  });

  it('asks for a fresh bow stroke when the same note is still ringing', () => {
    renderPanel(440, running({ awaitingReattack: true }));
    expect(screen.getByText('A4 again')).toBeInTheDocument();
    expect(screen.getByText(/lift the bow/i)).toBeInTheDocument();
  });

  it('does not say "again" while nothing is sounding', () => {
    renderPanel(null, running({ awaitingReattack: true }));
    expect(screen.queryByText('A4 again')).not.toBeInTheDocument();
  });

  it('draws no faint notes when the bar is unknown', () => {
    renderPanel(null);
    fireEvent.click(screen.getByRole('button', { name: 'Show finger placement' }));
    expect(within(screen.getByRole('region', { name: 'Fingering hint' })).getByTestId('bar-notes').children).toHaveLength(0);
  });

  it('shows an offered hint with its reason and can be dismissed for this note', () => {
    renderPanel(null, running({ hint: stuck }));
    const hint = screen.getByRole('region', { name: 'Fingering hint' });
    expect(within(hint).getByText('Here it is')).toBeInTheDocument();
    fireEvent.click(within(hint).getByRole('button', { name: 'Hide finger hint' }));
    expect(screen.queryByRole('region', { name: 'Fingering hint' })).not.toBeInTheDocument();
  });

  it('uses the wrong-note headline', () => {
    renderPanel(null, running({ hint: { reason: 'wrong-note', noteKey: '0' } }));
    expect(screen.getByText('Not that one. Here it is')).toBeInTheDocument();
  });

  it('writes strings in Do Ré Mi without octave numbers', () => {
    renderPanel(null, running({ hint: stuck }), 'solfege');
    const hint = screen.getByRole('region', { name: 'Fingering hint' });
    expect(within(hint).getByText('Open La string')).toBeInTheDocument();
    expect(within(hint).getByText('Ré string, finger 2')).toBeInTheDocument();
  });

  it('says so when the note is outside 1st and 3rd position', () => {
    const low: PlayableNote = { ...a4, pitch: { ...a4.pitch!, midiNumber: 50, label: 'D3' } };
    renderPanel(null, running({ activeNote: low, hint: stuck }));
    expect(screen.getByText('Outside 1st and 3rd position')).toBeInTheDocument();
  });

  it('does not auto-offer stuck hints in Play-Along, and hides hints during Wait-for-Me count-in', () => {
    renderPanel(null, running({ mode: 'play-along', hint: stuck }));
    expect(screen.queryByRole('region', { name: 'Fingering hint' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show finger placement' })).toHaveAttribute('aria-pressed', 'false');

    const { unmount } = renderPanel(
      null,
      running({ mode: 'wait-for-me', countInBeat: { bar: 1, beat: 1, total: 4 }, hint: stuck }),
    );
    expect(screen.queryByRole('region', { name: 'Fingering hint' })).not.toBeInTheDocument();
    unmount();
  });

  it('toggles a sticky follow-fingers mode in Play-Along that updates across activeNote changes and count-in', () => {
    const d4: PlayableNote = {
      ...a4,
      id: 'p0-m1-n1',
      pitch: { step: 'D', alter: 0, octave: 4, midiNumber: 62, label: 'D4', frequencyHz440: 293.66 },
    };

    const { rerender } = renderPanel(
      null,
      running({ mode: 'play-along', activeNote: a4, countInBeat: { bar: 1, beat: 1, total: 4 } }),
      'letters',
      [69, 62],
    );

    const handBtn = screen.getByRole('button', { name: 'Show finger placement' });
    expect(handBtn).toHaveAttribute('aria-pressed', 'false');

    // Toggle on during count-in: shows the first note (A4)
    fireEvent.click(handBtn);
    expect(handBtn).toHaveAttribute('aria-pressed', 'true');
    const hintOnA4 = screen.getByRole('region', { name: 'Fingering hint' });
    expect(within(hintOnA4).getByText('Open A string')).toBeInTheDocument();
    expect(within(hintOnA4).getByText('D string, finger 2')).toBeInTheDocument();

    // Piece advances to D4: hint stays visible and updates to D4's fingerings
    rerender(
      panelElement(
        null,
        running({ mode: 'play-along', activeNote: d4, countInBeat: null }),
        'letters',
        [69, 62],
      ),
    );
    const hintOnD4 = screen.getByRole('region', { name: 'Fingering hint' });
    expect(within(hintOnD4).getByText('Open D string')).toBeInTheDocument();
    expect(within(hintOnD4).queryByText('Open A string')).not.toBeInTheDocument();

    // Toggling off hides the hint
    fireEvent.click(screen.getByRole('button', { name: 'Show finger placement' }));
    expect(screen.queryByRole('region', { name: 'Fingering hint' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show finger placement' })).toHaveAttribute('aria-pressed', 'false');

    // Turn back on, and advance notes in wait-for-me: remains visible and updates across notes
    fireEvent.click(screen.getByRole('button', { name: 'Show finger placement' }));
    expect(screen.getByRole('region', { name: 'Fingering hint' })).toBeInTheDocument();
    rerender(
      panelElement(
        null,
        running({ mode: 'wait-for-me', activeNote: d4 }),
        'letters',
        [69, 62],
      ),
    );
    expect(screen.getByRole('region', { name: 'Fingering hint' })).toBeInTheDocument();

    const e4: PlayableNote = {
      ...a4,
      id: 'p0-m1-n2',
      pitch: { step: 'E', alter: 0, octave: 4, midiNumber: 64, label: 'E4', frequencyHz440: 329.63 },
    };
    rerender(
      panelElement(
        null,
        running({ mode: 'wait-for-me', activeNote: e4 }),
        'letters',
        [69, 62, 64],
      ),
    );
    const hintOnE4 = screen.getByRole('region', { name: 'Fingering hint' });
    expect(within(hintOnE4).getByText('D string, finger 1')).toBeInTheDocument();

    // Explicitly dismissing hides the hint
    fireEvent.click(within(hintOnE4).getByRole('button', { name: 'Hide finger hint' }));
    expect(screen.queryByRole('region', { name: 'Fingering hint' })).not.toBeInTheDocument();
  });
});

describe('ResultSheet', () => {
  const playAlong = buildSessionResult({
    mode: 'play-along',
    summary: {
      totalNotes: 13,
      greenCount: 11,
      yellowCount: 1,
      redCount: 1,
      accuracyPercent: 84.6,
      averageAbsCentsDelta: 9.1,
      problemMeasures: [3, 4],
    },
    locks: [],
  });

  it('shows the accuracy, marks hard bars and offers a one-tap loop', () => {
    const onLoop = vi.fn();
    const onAgain = vi.fn();
    render(
      <ResultSheet
        result={playAlong}
        title="Twinkle, Twinkle, Little Star"
        subtitle="8 bars"
        barsInPlay={[1, 2, 3, 4, 5, 6, 7, 8]}
        onLoopHardBars={onLoop}
        onPlayAgain={onAgain}
        onDismiss={vi.fn()}
      />,
    );
    const card = screen.getByTestId('session-summary-card');
    expect(within(card).getByText('84.6%')).toBeInTheDocument();
    expect(within(card).getByText(/11 of 13 notes/)).toBeInTheDocument();
    expect(within(card).getByRole('img', { name: 'Hard bars: 3, 4' })).toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: 'Loop bars 3 to 4' }));
    expect(onLoop).toHaveBeenCalledTimes(1);
    fireEvent.click(within(card).getByRole('button', { name: 'Play again' }));
    expect(onAgain).toHaveBeenCalledTimes(1);
  });
});

describe('PlayPage mobile reorganization', () => {
  const dummyScore = {
    id: 'test-score',
    title: 'Test Piece',
    fileName: 'test.musicxml',
    format: 'musicxml' as const,
    xmlContent:
      '<score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list><part id="P1"><measure number="1"><note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note></measure></part></score-partwise>',
    isBuiltIn: true,
    source: 'builtin' as const,
    updatedAt: 0,
  };

  const dummyMixer = {
    soloVolume: 1,
    soloMuted: false,
    accompanimentVolume: 0.8,
    accompanimentMuted: false,
    metronomeVolume: 0.5,
    metronomeMuted: false,
    droneActive: false,
  };

  function renderPlayPage(overrides: Partial<PracticeControllerState> = {}) {
    const state = running(overrides);
    return render(
      <NotationProvider system="letters">
        <PlayPage
          title="Test Piece"
          subtitle="8 bars"
          idleHint="Play along"
          currentScore={dummyScore}
          totalMeasures={8}
          controllerState={state}
          practiceMode="wait-for-me"
          onPracticeModeChange={vi.fn()}
          viewMode="page"
          onViewModeChange={vi.fn()}
          loopRange={null}
          onLoopRangeChange={vi.fn()}
          onStartPractice={vi.fn()}
          onPausePractice={vi.fn()}
          onResumePractice={vi.fn()}
          onStopPractice={vi.fn()}
          onClose={vi.fn()}
          onSimulateInTuneNote={vi.fn()}
          showSimulate={false}
          onToggleDrone={vi.fn()}
          mixer={dummyMixer}
          onMixerChange={vi.fn()}
          tempoScale={1}
          onTempoScaleChange={vi.fn()}
          countInBars={1}
          onCountInBarsChange={vi.fn()}
          strictness="medium"
          onStrictnessChange={vi.fn()}
          toleranceCents={15}
          referenceA4Hz={440}
          livePitch={null}
        />
      </NotationProvider>,
    );
  }

  it('renders score completion percentage in the score header', () => {
    // Bar 1 of 8 = 0% completed
    const { rerender } = renderPlayPage({ isRunning: true, currentMeasureNumber: 1 });
    expect(screen.getByTestId('score-completion')).toHaveTextContent('0%');

    // Bar 5 of 8 = 50% completed ((5-1)/8 = 4/8 = 50%)
    rerender(
      <NotationProvider system="letters">
        <PlayPage
          title="Test Piece"
          subtitle="8 bars"
          idleHint="Play along"
          currentScore={dummyScore}
          totalMeasures={8}
          controllerState={running({ isRunning: true, currentMeasureNumber: 5 })}
          practiceMode="wait-for-me"
          onPracticeModeChange={vi.fn()}
          viewMode="page"
          onViewModeChange={vi.fn()}
          loopRange={null}
          onLoopRangeChange={vi.fn()}
          onStartPractice={vi.fn()}
          onPausePractice={vi.fn()}
          onResumePractice={vi.fn()}
          onStopPractice={vi.fn()}
          onClose={vi.fn()}
          onSimulateInTuneNote={vi.fn()}
          showSimulate={false}
          onToggleDrone={vi.fn()}
          mixer={dummyMixer}
          onMixerChange={vi.fn()}
          tempoScale={1}
          onTempoScaleChange={vi.fn()}
          countInBars={1}
          onCountInBarsChange={vi.fn()}
          strictness="medium"
          onStrictnessChange={vi.fn()}
          toleranceCents={15}
          referenceA4Hz={440}
          livePitch={null}
        />
      </NotationProvider>,
    );
    expect(screen.getByTestId('score-completion')).toHaveTextContent('50%');
  });

  it('renders single-row compact practice controls with mode switch and transport buttons', () => {
    // When idle: shows Start Practice
    const { rerender } = renderPlayPage({ isRunning: false });
    const dock = screen.getByRole('contentinfo', { name: 'Practice controls' });
    expect(within(dock).getByRole('radiogroup', { name: 'Practice mode' })).toBeInTheDocument();
    expect(within(dock).getByRole('radio', { name: 'Wait for me' })).toBeInTheDocument();
    expect(within(dock).getByRole('radio', { name: 'Play along' })).toBeInTheDocument();
    expect(within(dock).getByRole('button', { name: 'Stop and Reset Practice' })).toBeInTheDocument();
    expect(within(dock).getByRole('button', { name: 'Start Practice' })).toBeInTheDocument();
    expect(within(dock).getByRole('button', { name: 'Practice options' })).toBeInTheDocument();

    // When running: shows Pause Practice
    rerender(
      <NotationProvider system="letters">
        <PlayPage
          title="Test Piece"
          subtitle="8 bars"
          idleHint="Play along"
          currentScore={dummyScore}
          totalMeasures={8}
          controllerState={running({ isRunning: true, isPaused: false })}
          practiceMode="wait-for-me"
          onPracticeModeChange={vi.fn()}
          viewMode="page"
          onViewModeChange={vi.fn()}
          loopRange={null}
          onLoopRangeChange={vi.fn()}
          onStartPractice={vi.fn()}
          onPausePractice={vi.fn()}
          onResumePractice={vi.fn()}
          onStopPractice={vi.fn()}
          onClose={vi.fn()}
          onSimulateInTuneNote={vi.fn()}
          showSimulate={false}
          onToggleDrone={vi.fn()}
          mixer={dummyMixer}
          onMixerChange={vi.fn()}
          tempoScale={1}
          onTempoScaleChange={vi.fn()}
          countInBars={1}
          onCountInBarsChange={vi.fn()}
          strictness="medium"
          onStrictnessChange={vi.fn()}
          toleranceCents={15}
          referenceA4Hz={440}
          livePitch={null}
        />
      </NotationProvider>,
    );
    expect(within(dock).getByRole('button', { name: 'Pause Practice' })).toBeInTheDocument();
  });
});
