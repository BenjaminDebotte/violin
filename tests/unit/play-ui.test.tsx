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
  micError: null,
  awaitingReattack: false,
  ...overrides,
});

const centsAbove = (cents: number) => midiNoteToFrequency(69, 440) * Math.pow(2, cents / 1200);

function renderPanel(
  frequencyHz: number | null,
  state = running(),
  system: 'letters' | 'solfege' = 'letters',
  barMidis?: readonly number[],
) {
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
        barMidis={barMidis}
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

    const { rerender } = render(
      <NotationProvider system="letters">
        <FeedbackPanel
          controllerState={running({ mode: 'play-along', activeNote: a4, countInBeat: { bar: 1, beat: 1, total: 4 } })}
          practiceMode="play-along"
          livePitch={null}
          referenceA4Hz={440}
          toleranceCents={15}
          idleHint="Keep playing"
          droneActive={false}
          onToggleDrone={vi.fn()}
          showSimulate={false}
          onSimulateInTuneNote={vi.fn()}
          barMidis={[69, 62]}
        />
      </NotationProvider>,
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
      <NotationProvider system="letters">
        <FeedbackPanel
          controllerState={running({ mode: 'play-along', activeNote: d4, countInBeat: null })}
          practiceMode="play-along"
          livePitch={null}
          referenceA4Hz={440}
          toleranceCents={15}
          idleHint="Keep playing"
          droneActive={false}
          onToggleDrone={vi.fn()}
          showSimulate={false}
          onSimulateInTuneNote={vi.fn()}
          barMidis={[69, 62]}
        />
      </NotationProvider>,
    );
    const hintOnD4 = screen.getByRole('region', { name: 'Fingering hint' });
    expect(within(hintOnD4).getByText('Open D string')).toBeInTheDocument();
    expect(within(hintOnD4).queryByText('Open A string')).not.toBeInTheDocument();

    // Toggling off hides the hint
    fireEvent.click(screen.getByRole('button', { name: 'Show finger placement' }));
    expect(screen.queryByRole('region', { name: 'Fingering hint' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show finger placement' })).toHaveAttribute('aria-pressed', 'false');

    // Turn back on, then switch mode to wait-for-me: clears followFingers and keeps Wait-for-Me one-shot behaviour
    fireEvent.click(screen.getByRole('button', { name: 'Show finger placement' }));
    expect(screen.getByRole('region', { name: 'Fingering hint' })).toBeInTheDocument();
    rerender(
      <NotationProvider system="letters">
        <FeedbackPanel
          controllerState={running({ mode: 'wait-for-me', activeNote: d4 })}
          practiceMode="wait-for-me"
          livePitch={null}
          referenceA4Hz={440}
          toleranceCents={15}
          idleHint="Hold each note"
          droneActive={false}
          onToggleDrone={vi.fn()}
          showSimulate={false}
          onSimulateInTuneNote={vi.fn()}
          barMidis={[69, 62]}
        />
      </NotationProvider>,
    );
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
