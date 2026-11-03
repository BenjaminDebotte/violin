import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { FeedbackPanel } from '../../src/components/play/FeedbackPanel';
import { ResultSheet } from '../../src/components/play/ResultSheet';
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
  ...overrides,
});

const centsAbove = (cents: number) => midiNoteToFrequency(69, 440) * Math.pow(2, cents / 1200);

function renderPanel(frequencyHz: number | null, state = running(), system: 'letters' | 'solfege' = 'letters') {
  return render(
    <NotationProvider system={system}>
      <FeedbackPanel
        controllerState={state}
        practiceMode={state.mode}
        livePitch={frequencyHz === null ? null : { frequencyHz, clarity: 0.95, rms: 0.05, audioTimeSec: 0 }}
        referenceA4Hz={440}
        toleranceCents={15}
        idleHint="Hold each note"
        droneActive={false}
        onToggleDrone={vi.fn()}
        showSimulate={false}
        onSimulateInTuneNote={vi.fn()}
      />
    </NotationProvider>,
  );
}

describe('FeedbackPanel live verdicts', () => {
  it('says in tune within tolerance and shows hold progress', () => {
    renderPanel(centsAbove(6));
    expect(screen.getByText('In tune')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Hold progress' })).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getByText(/\+6 cents/)).toBeInTheDocument();
  });

  it('says a little flat with an upward instruction, not colour alone', () => {
    renderPanel(centsAbove(-22));
    expect(screen.getByText('A little flat')).toBeInTheDocument();
    expect(screen.getByText('Go higher ↑')).toBeInTheDocument();
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

  it('shows nothing until offered or requested, then both positions for A4', () => {
    renderPanel(null);
    expect(screen.queryByRole('region', { name: 'Fingering hint' })).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Hold progress' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show finger placement' }));
    const hint = screen.getByRole('region', { name: 'Fingering hint' });
    expect(within(hint).getByText('Where to put your finger')).toBeInTheDocument();
    expect(within(hint).getByText('Open A string')).toBeInTheDocument();
    expect(within(hint).getByText('D string, finger 2')).toBeInTheDocument();
    expect(within(hint).getByText('1st')).toBeInTheDocument();
    expect(within(hint).getByText('3rd')).toBeInTheDocument();
    // The hint takes the meter's place; the target note and verdict stay on screen.
    expect(screen.getByTestId('target-note')).toBeInTheDocument();
  });

  it('draws the 3rd-position reference line, every finger faintly, and colours the positions', () => {
    renderPanel(null);
    fireEvent.click(screen.getByRole('button', { name: 'Show finger placement' }));
    const hint = screen.getByRole('region', { name: 'Fingering hint' });
    expect(within(hint).getByTestId('third-position-line')).toBeInTheDocument();
    const ghosts = within(hint).getByTestId('ghost-fingers');
    expect(ghosts.querySelectorAll('[data-ghost="1"]')).toHaveLength(20);
    expect(ghosts.querySelectorAll('[data-ghost="3"]')).toHaveLength(16);
    // Position tags carry the position colours
    expect(within(hint).getByText('1st')).toHaveStyle({ backgroundColor: 'var(--pos1)' });
    expect(within(hint).getByText('3rd')).toHaveStyle({ backgroundColor: 'var(--pos3)' });
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

  it('is not offered in Play-Along or during the count-in', () => {
    renderPanel(null, running({ mode: 'play-along', hint: stuck }));
    expect(screen.queryByRole('region', { name: 'Fingering hint' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show finger placement' })).not.toBeInTheDocument();
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
