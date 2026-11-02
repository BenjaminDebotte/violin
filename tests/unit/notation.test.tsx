import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../../src/App';
import { formatNoteName, loadNotation, NOTATION_STORAGE_KEY } from '../../src/modules/notation/noteNames';

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

describe('notation setting in the app', () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '#/settings';
  });

  it('switches the tuner to Do Ré Mi, and persists the choice', () => {
    const { unmount } = render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /Do Ré Mi/ }));
    expect(localStorage.getItem(NOTATION_STORAGE_KEY)).toBe('solfege');

    fireEvent.click(screen.getByLabelText('Violin Tuner Tab'));
    expect(screen.getByLabelText('String Sol3 drone')).toBeInTheDocument();
    expect(screen.getByLabelText('String Mi5 drone')).toBeInTheDocument();
    unmount();

    expect(loadNotation()).toBe('solfege');
  });

  it('defaults to letters', () => {
    window.location.hash = '#/tuner';
    render(<App />);
    expect(screen.getByLabelText('String G3 drone')).toBeInTheDocument();
  });
});
