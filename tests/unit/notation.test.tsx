import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../../src/App';
import {
  formatNoteName,
  scoreNoteName,
  loadNotation,
  loadScoreNoteNames,
  saveScoreNoteNames,
  NOTATION_STORAGE_KEY,
  SCORE_NOTE_NAMES_STORAGE_KEY,
} from '../../src/modules/notation/noteNames';
import { buildNoteLabels } from '../../src/App';
import type { PlayableNote } from '../../src/types/music';

describe('formatNoteName', () => {
  it('keeps letters unchanged', () => {
    expect(formatNoteName('C#4', 'letters')).toBe('C#4');
  });

  it('maps letters to European solfège with accidentals and octaves', () => {
    expect(formatNoteName('C4', 'solfege')).toBe('Do4');
    expect(formatNoteName('D', 'solfege')).toBe('Ré');
    expect(formatNoteName('F#5', 'solfege')).toBe('Fa#5');
    expect(formatNoteName('Bb3', 'solfege')).toBe('Sib3');
    expect(formatNoteName('G3', 'solfege')).toBe('Sol3');
    expect(formatNoteName('A4', 'solfege')).toBe('La4');
    expect(formatNoteName('C-1', 'solfege')).toBe('Do-1');
  });

  it('leaves non-note strings untouched', () => {
    expect(formatNoteName('--', 'solfege')).toBe('--');
    expect(formatNoteName('Rest', 'solfege')).toBe('Rest');
  });
});

describe('scoreNoteName', () => {
  it('strips the octave in letters notation while keeping accidentals', () => {
    expect(scoreNoteName('G3', 'letters')).toBe('G');
    expect(scoreNoteName('C#4', 'letters')).toBe('C#');
    expect(scoreNoteName('Bb3', 'letters')).toBe('Bb');
    expect(scoreNoteName('F##5', 'letters')).toBe('F##');
    expect(scoreNoteName('C-1', 'letters')).toBe('C');
    expect(scoreNoteName('D', 'letters')).toBe('D');
  });

  it('converts to solfège without the octave', () => {
    expect(scoreNoteName('C4', 'solfege')).toBe('Do');
    expect(scoreNoteName('D4', 'solfege')).toBe('Ré');
    expect(scoreNoteName('E4', 'solfege')).toBe('Mi');
    expect(scoreNoteName('F#5', 'solfege')).toBe('Fa#');
    expect(scoreNoteName('G3', 'solfege')).toBe('Sol');
    expect(scoreNoteName('A4', 'solfege')).toBe('La');
    expect(scoreNoteName('Bb3', 'solfege')).toBe('Sib');
    expect(scoreNoteName('C-1', 'solfege')).toBe('Do');
  });

  it('returns odd or non-note input unchanged', () => {
    expect(scoreNoteName('--', 'letters')).toBe('--');
    expect(scoreNoteName('Rest', 'solfege')).toBe('Rest');
    expect(scoreNoteName('', 'letters')).toBe('');
  });
});

describe('Note names on the score setting and label map', () => {
  const sampleNotes: PlayableNote[] = [
    {
      id: 'p0-m1-n0',
      measureNumber: 1,
      partIndex: 0,
      isSolo: true,
      pitch: { step: 'F', alter: 1, octave: 4, midiNumber: 66, label: 'F#4', frequencyHz440: 369.99 },
      startBeat: 0,
      durationBeats: 1,
      startTimeMs: 0,
      durationMs: 500,
      cursorStepIndex: 0,
      tiedNoteIds: [],
    },
    {
      id: 'p0-m1-n1',
      measureNumber: 1,
      partIndex: 0,
      isSolo: true,
      pitch: null, // rest
      startBeat: 1,
      durationBeats: 1,
      startTimeMs: 500,
      durationMs: 500,
      cursorStepIndex: 1,
      tiedNoteIds: [],
    },
    {
      id: 'p0-m1-n2',
      measureNumber: 1,
      partIndex: 0,
      isSolo: true,
      pitch: { step: 'B', alter: -1, octave: 4, midiNumber: 70, label: 'Bb4', frequencyHz440: 466.16 },
      startBeat: 2,
      durationBeats: 1,
      startTimeMs: 1000,
      durationMs: 500,
      cursorStepIndex: 2,
      tiedNoteIds: [],
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '#/settings';
  });

  it('defaults to enabled and persists changes to localStorage', () => {
    expect(loadScoreNoteNames()).toBe(true);
    saveScoreNoteNames(false);
    expect(localStorage.getItem(SCORE_NOTE_NAMES_STORAGE_KEY)).toBe('off');
    expect(loadScoreNoteNames()).toBe(false);
    saveScoreNoteNames(true);
    expect(localStorage.getItem(SCORE_NOTE_NAMES_STORAGE_KEY)).toBe('on');
    expect(loadScoreNoteNames()).toBe(true);
  });

  it('builds a noteId -> formatted name map skipping rests, and returns undefined when off', () => {
    expect(buildNoteLabels(sampleNotes, 'letters', true)).toEqual({
      'p0-m1-n0': 'F#',
      'p0-m1-n2': 'Bb',
    });
    expect(buildNoteLabels(sampleNotes, 'solfege', true)).toEqual({
      'p0-m1-n0': 'Fa#',
      'p0-m1-n2': 'Sib',
    });
    expect(buildNoteLabels(sampleNotes, 'letters', false)).toBeUndefined();
  });

  it('toggles in Settings, persists, and omits noteLabels on PlayPage when switched off', () => {
    render(<App />);
    const toggle = screen.getByRole('switch', { name: /Note names on the score/i });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    // Navigate to play: noteLabels prop is present when on
    fireEvent.click(screen.getByRole('link', { name: 'Songs' }));
    window.location.hash = '#/play';
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(screen.getByTestId('score-scroll-viewport')).toHaveAttribute('data-note-labels', 'on');

    // Switch off in Settings
    window.location.hash = '#/settings';
    fireEvent(window, new HashChangeEvent('hashchange'));
    fireEvent.click(screen.getByRole('switch', { name: /Note names on the score/i }));
    expect(screen.getByRole('switch', { name: /Note names on the score/i })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(loadScoreNoteNames()).toBe(false);

    // Back to play: noteLabels prop is absent when off
    window.location.hash = '#/play';
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(screen.getByTestId('score-scroll-viewport')).not.toHaveAttribute('data-note-labels');
  });
});

describe('notation setting in the app', () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '#/settings';
  });

  it('switches the tuner to Do Ré Mi, and persists the choice', () => {
    const { unmount } = render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /Do Ré Mi/ }));
    expect(localStorage.getItem(NOTATION_STORAGE_KEY)).toBe('solfege');

    fireEvent.click(screen.getByRole('link', { name: 'Tune' }));
    expect(screen.getByLabelText('String Sol3 drone')).toBeInTheDocument();
    expect(screen.getByLabelText('String Mi5 drone')).toBeInTheDocument();
    unmount();

    expect(loadNotation()).toBe('solfege');
  });

  it('uses the chosen notation for the target note on the play screen', () => {
    localStorage.setItem(NOTATION_STORAGE_KEY, 'solfege');
    window.location.hash = '#/play';
    render(<App />);
    const target = screen.getByTestId('target-note');
    expect(target).toHaveTextContent('Ré4');
    expect(screen.getByRole('button', { name: 'Hear Ré4' })).toBeInTheDocument();
  });

  it('defaults to letters', () => {
    window.location.hash = '#/tuner';
    render(<App />);
    expect(screen.getByLabelText('String G3 drone')).toBeInTheDocument();
  });
});
