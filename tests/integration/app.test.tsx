import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import App from '../../src/App';
import { resetInMemoryScoreStore } from '../../src/modules/score-engine/scoreStore';

const singleNoteXml = (title: string, measureNumber = 1, beats = 4) => `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>${title}</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Solo Violin</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="${measureNumber}">
      <attributes>
        <divisions>4</divisions>
        <time><beats>${beats}</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

const vivaldiXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Vivaldi Spring Solo</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Solo Violin</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>E</step><octave>5</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

const feedback = () => screen.getByRole('region', { name: 'Pitch feedback' });

describe('App integration: mobile-first Songs / Play / Tune / Settings', () => {
  beforeEach(() => {
    resetInMemoryScoreStore();
    localStorage.clear();
    window.location.hash = '#/practice';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Play screen (legacy #/practice route) -------------------------------------
  it('opens the focused play screen with score, pitch feedback and one primary action', () => {
    render(<App />);

    expect(screen.getByTestId('play-page')).toBeInTheDocument();
    // Full-bleed: no tab bar while playing
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Twinkle, Twinkle, Little Star' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Practice' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop and Reset Practice' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Practice options' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Loop bars' })).toBeInTheDocument();

    // Glanceable feedback: target note, hold ring, drone, no-mic simulation
    expect(within(feedback()).getByText('D4')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Hold progress' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hear D4' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /simulate an in-tune note/i })).toBeInTheDocument();

    // Mode and score layout switches
    expect(screen.getByRole('radio', { name: 'Wait for me' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Full page' })).toHaveAttribute('aria-checked', 'true');

    expect(screen.getByRole('region', { name: 'Score' })).toBeInTheDocument();
    expect(document.getElementById('osmd-score-container')).toBeInTheDocument();
  });

  // 2. Navigation ------------------------------------------------------------------
  it('lands on Songs and navigates Tune and Settings through the tab bar', () => {
    window.location.hash = '';
    render(<App />);

    expect(screen.getByTestId('songs-page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Songs' })).toBeInTheDocument();
    expect(screen.getByText('Built into the app')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Learn' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Tune' }));
    expect(screen.getByRole('heading', { name: 'Tune' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Tuner HUD' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'String G3 drone' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Settings' }));
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('Tuning reference')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Songs' }));
    expect(screen.getByTestId('songs-page')).toBeInTheDocument();
  });

  // 3. Import validation & switching scores ----------------------------------------
  it('rejects .mscz and .pdf with MuseScore export instructions, imports .musicxml, and opens built-in songs', async () => {
    window.location.hash = '#/songs';
    render(<App />);

    const fileInput = screen.getByTestId('score-file-input');

    fireEvent.change(fileInput, {
      target: { files: [new File(['binary-content'], 'sonata.mscz', { type: 'application/octet-stream' })] },
    });
    const msczAlert = await screen.findByRole('alert', { name: 'Upload Validation Message' });
    expect(msczAlert).toHaveTextContent(/MuseScore files \(\.mscz \/ \.mscx\) cannot be read directly/i);
    expect(msczAlert).toHaveTextContent(/File -> Export -> MusicXML/i);

    fireEvent.change(fileInput, {
      target: { files: [new File(['pdf-content'], 'concerto.pdf', { type: 'application/pdf' })] },
    });
    const pdfAlert = await screen.findByRole('alert', { name: 'Upload Validation Message' });
    expect(pdfAlert).toHaveTextContent(/Raw PDF files are not supported/i);
    expect(pdfAlert).toHaveTextContent(/File -> Export -> MusicXML/i);

    fireEvent.change(fileInput, {
      target: { files: [new File([vivaldiXml], 'vivaldi.musicxml', { type: 'text/xml' })] },
    });
    // A valid import opens straight onto the play screen
    expect(await screen.findByRole('heading', { name: 'Vivaldi Spring Solo' })).toBeInTheDocument();
    expect(screen.getByTestId('play-page')).toBeInTheDocument();

    // Close returns to Songs, where the import is listed; open the built-in minuet
    fireEvent.click(screen.getByRole('button', { name: 'Close practice' }));
    expect(await screen.findByRole('button', { name: 'Play Vivaldi Spring Solo' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play Minuet & Tied Note Etude' }));
    expect(screen.getByRole('heading', { name: 'Minuet & Tied Note Etude' })).toBeInTheDocument();
  });

  // 4. Mode and layout toggles -------------------------------------------------------
  it('switches between Wait for me / Play along and Full page / Single line', () => {
    render(<App />);

    const wfm = screen.getByRole('radio', { name: 'Wait for me' });
    const along = screen.getByRole('radio', { name: 'Play along' });
    fireEvent.click(along);
    expect(along).toHaveAttribute('aria-checked', 'true');
    expect(wfm).toHaveAttribute('aria-checked', 'false');
    expect(within(feedback()).getByText(/count-in/i)).toBeInTheDocument();
    // Play along has no hold ring
    expect(screen.queryByRole('progressbar', { name: 'Hold progress' })).not.toBeInTheDocument();

    fireEvent.click(wfm);
    expect(wfm).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('progressbar', { name: 'Hold progress' })).toBeInTheDocument();

    const page = screen.getByRole('radio', { name: 'Full page' });
    const line = screen.getByRole('radio', { name: 'Single line' });
    fireEvent.click(line);
    expect(line).toHaveAttribute('aria-checked', 'true');
    expect(page).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(page);
    expect(page).toHaveAttribute('aria-checked', 'true');
  });

  // 5. Calibration from Settings reaches the play screen ------------------------------------
  it('changes A4 and strictness in Settings and reflects them in the play screen options', () => {
    window.location.hash = '#/me';
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '442 Hz (European)' }));
    fireEvent.click(screen.getByRole('button', { name: /Strict \(±8¢\)/ }));
    expect(screen.getByText(/within ±8 cents/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Songs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play Twinkle, Twinkle, Little Star' }));
    fireEvent.click(screen.getByRole('button', { name: 'Practice options' }));

    const sheet = screen.getByRole('dialog', { name: 'Practice options' });
    expect(within(sheet).getByRole('radio', { name: 'Strict ±8¢' })).toHaveAttribute('aria-checked', 'true');
    expect(within(sheet).getByText(/Tuned to A = 442 Hz/)).toBeInTheDocument();

    // Strictness can also be changed mid-practice from the sheet
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Easy ±25¢' }));
    expect(within(sheet).getByRole('radio', { name: 'Easy ±25¢' })).toHaveAttribute('aria-checked', 'true');
  });

  // 6. Wait-for-Me session ----------------------------------------------------------
  it('runs a Wait-for-Me session: simulated in-tune holds advance the target and colour noteheads green', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Start Practice' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause Practice' })).toBeInTheDocument());

    expect(within(feedback()).getByText('D4')).toBeInTheDocument();
    const firstNoteSvg = document.querySelector('[data-note-id="p0-m1-n0"] path');
    expect(firstNoteSvg?.getAttribute('fill')).toBe('#000000');

    const simulate = screen.getByRole('button', { name: /simulate an in-tune note/i });
    fireEvent.click(simulate);
    expect(firstNoteSvg?.getAttribute('fill')).toBe('#22c55e');
    expect(within(feedback()).getByText('D4')).toBeInTheDocument();
    // The echo of the graded note floods the panel with the in-tune verdict
    expect(within(feedback()).getByText('In tune')).toBeInTheDocument();

    fireEvent.click(simulate);
    expect(document.querySelector('[data-note-id="p0-m1-n1"] path')?.getAttribute('fill')).toBe('#22c55e');
    expect(within(feedback()).getByText('A4')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pause Practice' }));
    expect(screen.getByRole('button', { name: 'Resume Practice' })).toBeInTheDocument();
    expect(within(feedback()).getByText('Paused')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Stop and Reset Practice' }));
    expect(screen.getByRole('button', { name: 'Start Practice' })).toBeInTheDocument();
  });

  // 7. Options sheet: mixer + drone ------------------------------------------------
  it('opens practice options, toggles mixer channels, and toggles the reference drone', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Practice options' }));
    expect(screen.getByRole('dialog', { name: 'Practice options' })).toBeInTheDocument();
    expect(screen.getByTestId('mixer-panel')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mute Solo Violin' }));
    expect(screen.getByRole('button', { name: 'Unmute Solo Violin' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mute Accompaniment' }));
    expect(screen.getByRole('button', { name: 'Unmute Accompaniment' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mute Metronome' }));
    expect(screen.getByRole('button', { name: 'Unmute Metronome' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close practice options' }));
    expect(screen.queryByRole('dialog', { name: 'Practice options' })).not.toBeInTheDocument();

    const drone = screen.getByRole('button', { name: 'Hear D4' });
    fireEvent.click(drone);
    expect(drone).toHaveAttribute('aria-pressed', 'true');
    expect(drone).toHaveTextContent('Stop drone');
    fireEvent.click(drone);
    expect(drone).toHaveAttribute('aria-pressed', 'false');
    expect(drone).toHaveTextContent('Hear D4');
  });

  // 8. Loop sheet --------------------------------------------------------------------
  it('sets and clears a bar loop from the loop sheet', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Loop bars' }));
    const sheet = screen.getByRole('dialog', { name: 'Loop bars' });
    fireEvent.change(within(sheet).getByLabelText('From bar'), { target: { value: '2' } });
    fireEvent.change(within(sheet).getByLabelText('To bar'), { target: { value: '4' } });

    expect(screen.getByRole('button', { name: 'Loop bars' })).toHaveTextContent('2–4');
    expect(screen.getByRole('heading', { name: 'Twinkle, Twinkle, Little Star' })).toBeInTheDocument();
    expect(screen.getByText('Bars 2 to 4')).toBeInTheDocument();

    fireEvent.click(within(sheet).getByRole('button', { name: 'Clear loop' }));
    expect(within(sheet).queryByRole('button', { name: 'Clear loop' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Loop bars' })).toHaveTextContent('Loop');
  });

  // 9. Result sheet at the end of a piece ---------------------------------------------
  it('shows the result sheet when a piece finishes', async () => {
    const score = {
      id: 'single-note',
      title: 'Single Note Etude',
      fileName: 'single-note.musicxml',
      format: 'musicxml' as const,
      isBuiltIn: false,
      xmlContent: singleNoteXml('Single Note Etude'),
    };
    render(<App initialScore={score} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start Practice' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause Practice' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /simulate an in-tune note/i }));

    const card = await screen.findByTestId('session-summary-card');
    expect(within(card).getByText('Beautifully done')).toBeInTheDocument();
    expect(within(card).getByText('1/1')).toBeInTheDocument();
    expect(within(card).getByText(/No bar stood out as hard/)).toBeInTheDocument();
    // No hard bars: play again is the primary action
    expect(within(card).getByRole('button', { name: 'Play again' })).toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: 'Close results' }));
    expect(screen.queryByTestId('session-summary-card')).not.toBeInTheDocument();
  });

  it('can start and stop a Play-Along session on a score whose first bar is numbered 2', async () => {
    const score = {
      id: 'single-note-problem',
      title: 'Problem Measure Etude',
      fileName: 'problem.musicxml',
      format: 'musicxml' as const,
      isBuiltIn: false,
      xmlContent: singleNoteXml('Problem Measure Etude', 2, 1),
    };
    render(<App initialScore={score} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Play along' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start Practice' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause Practice' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Stop and Reset Practice' }));
    expect(screen.getByRole('button', { name: 'Start Practice' })).toBeInTheDocument();
  });

  // 10. Songs -> Play -> back ----------------------------------------------------------
  it('opens a song from Songs and returns to Songs when the play screen is closed', () => {
    window.location.hash = '#/songs';
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Play Twinkle, Twinkle, Little Star' }));
    expect(screen.getByTestId('play-page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Twinkle, Twinkle, Little Star' })).toBeInTheDocument();
    expect(within(feedback()).getByText(/Tap Start, then play/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close practice' }));
    expect(screen.getByTestId('songs-page')).toBeInTheDocument();
  });
});
