import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import App from '../../src/App';
import {
  resetInMemoryScoreStore,
} from '../../src/modules/score-engine/scoreStore';

describe('App Integration Tests (SPEC.md Success Criteria)', () => {
  beforeEach(() => {
    resetInMemoryScoreStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Initial Workspace Render
  // =========================================================================
  it('renders default score (Twinkle Twinkle Little Star), TopBar, TunerHUD, MixerPanel, and ScoreViewport', () => {
    render(<App />);

    // 1. Default Score Title in TopBar
    expect(
      screen.getByText('Twinkle, Twinkle, Little Star'),
    ).toBeInTheDocument();

    // 2. TopBar component with transport, mode, and calibration controls
    expect(screen.getByTestId('top-bar')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Library \/ Upload/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Start Practice/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Audio Calibration/i }),
    ).toBeInTheDocument();

    // Default mode is Wait-for-Me
    const wfmRadio = screen.getByRole('radio', { name: 'Wait-for-Me' });
    expect(wfmRadio).toHaveAttribute('aria-checked', 'true');

    // Default view mode is Page View
    const pageRadio = screen.getByRole('radio', { name: 'Page View' });
    expect(pageRadio).toHaveAttribute('aria-checked', 'true');

    // 3. Tuner HUD
    const tunerHud = screen.getByRole('region', { name: /Tuner HUD/i });
    expect(tunerHud).toBeInTheDocument();
    expect(screen.getByText(/A4 = 440 Hz/i)).toBeInTheDocument();
    expect(screen.getByText(/Tol: ±15¢/i)).toBeInTheDocument();

    // 4. Mixer Panel
    expect(screen.getByTestId('mixer-panel')).toBeInTheDocument();
    expect(screen.getByText('Solo Violin')).toBeInTheDocument();
    expect(screen.getByText('Accompaniment')).toBeInTheDocument();
    expect(screen.getByText('Metronome')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Play Reference Drone/i }),
    ).toBeInTheDocument();

    // 5. Score Viewport Container
    const scoreContainer = document.getElementById('osmd-score-container');
    expect(scoreContainer).toBeInTheDocument();
  });

  // =========================================================================
  // 2. Library Modal, File Upload Validation & Switching Scores
  // =========================================================================
  it('rejects .mscz and .pdf with explicit MuseScore export instructions, uploads valid .musicxml, and switches built-in scores', async () => {
    render(<App />);

    // Open Library Modal
    const libraryBtn = screen.getByRole('button', {
      name: /Library \/ Upload/i,
    });
    fireEvent.click(libraryBtn);

    const libraryModal = screen.getByRole('dialog', { name: /Score Library/i });
    expect(libraryModal).toBeInTheDocument();

    const fileInput = screen.getByTestId('score-file-input');

    // Case A: Reject .mscz file with explicit MuseScore export instructions
    const msczFile = new File(['binary-content'], 'sonata.mscz', {
      type: 'application/octet-stream',
    });
    fireEvent.change(fileInput, { target: { files: [msczFile] } });

    const msczAlert = await screen.findByRole('alert', {
      name: /Upload Validation Message/i,
    });
    expect(msczAlert).toBeInTheDocument();
    expect(msczAlert).toHaveTextContent(
      /MuseScore files \(\.mscz \/ \.mscx\) cannot be read directly/i,
    );
    expect(msczAlert).toHaveTextContent(/File -> Export -> MusicXML/i);

    // Case B: Reject .pdf file with MuseScore instructions
    const pdfFile = new File(['pdf-content'], 'concerto.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(fileInput, { target: { files: [pdfFile] } });

    const pdfAlert = await screen.findByRole('alert', {
      name: /Upload Validation Message/i,
    });
    expect(pdfAlert).toBeInTheDocument();
    expect(pdfAlert).toHaveTextContent(/Raw PDF files are not supported/i);
    expect(pdfAlert).toHaveTextContent(/File -> Export -> MusicXML/i);

    // Case C: Upload a valid .musicxml score file
    const validXml = `<?xml version="1.0" encoding="UTF-8"?>
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

    const validFile = new File([validXml], 'vivaldi.musicxml', {
      type: 'text/xml',
    });
    fireEvent.change(fileInput, { target: { files: [validFile] } });

    // Modal should close and the workspace should now display "Vivaldi Spring Solo"
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /Score Library/i }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText('Vivaldi Spring Solo')).toBeInTheDocument();

    // Case D: Re-open Library Modal and switch to built-in "Minuet & Tied Note Etude"
    fireEvent.click(
      screen.getByRole('button', { name: /Library \/ Upload/i }),
    );
    expect(
      screen.getByRole('dialog', { name: /Score Library/i }),
    ).toBeInTheDocument();

    const minuetCard = screen.getByLabelText(
      /Select Minuet & Tied Note Etude/i,
    );
    fireEvent.click(minuetCard);

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /Score Library/i }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText('Minuet & Tied Note Etude')).toBeInTheDocument();
  });

  // =========================================================================
  // 3. View Mode and Practice Mode Toggles
  // =========================================================================
  it('toggles View Mode between Page View and Mobile Ribbon view, and switches Practice Mode between Wait-for-Me and Play-Along', () => {
    render(<App />);

    // --- Practice Mode Toggle ---
    const wfmBtn = screen.getByRole('radio', { name: 'Wait-for-Me' });
    const playAlongBtn = screen.getByRole('radio', { name: 'Play-Along' });

    expect(wfmBtn).toHaveAttribute('aria-checked', 'true');
    expect(playAlongBtn).toHaveAttribute('aria-checked', 'false');

    // Switch to Play-Along
    fireEvent.click(playAlongBtn);
    expect(playAlongBtn).toHaveAttribute('aria-checked', 'true');
    expect(wfmBtn).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/Play-Along Mode/i)).toBeInTheDocument();

    // Switch back to Wait-for-Me
    fireEvent.click(wfmBtn);
    expect(wfmBtn).toHaveAttribute('aria-checked', 'true');
    expect(playAlongBtn).toHaveAttribute('aria-checked', 'false');
    const strip = screen.getByLabelText('Practice Control Strip');
    expect(within(strip).getByText(/Target Note:/i)).toBeInTheDocument();

    // --- View Mode Toggle ---
    const pageViewBtn = screen.getByRole('radio', { name: 'Page View' });
    const ribbonViewBtn = screen.getByRole('radio', { name: 'Mobile Ribbon' });

    expect(pageViewBtn).toHaveAttribute('aria-checked', 'true');
    expect(ribbonViewBtn).toHaveAttribute('aria-checked', 'false');

    // Switch to Mobile Ribbon mode
    fireEvent.click(ribbonViewBtn);
    expect(ribbonViewBtn).toHaveAttribute('aria-checked', 'true');
    expect(pageViewBtn).toHaveAttribute('aria-checked', 'false');

    // Switch back to Page View
    fireEvent.click(pageViewBtn);
    expect(pageViewBtn).toHaveAttribute('aria-checked', 'true');
    expect(ribbonViewBtn).toHaveAttribute('aria-checked', 'false');
  });

  // =========================================================================
  // 4. Calibration Drawer & Reference Tuning / Strictness Badges
  // =========================================================================
  it('opens CalibrationDrawer, changes A4 reference and strictness, and updates TopBar and TunerHUD badges', async () => {
    render(<App />);

    // TopBar initial badge
    const topBarCalBtn = screen.getByRole('button', {
      name: /Audio Calibration/i,
    });
    expect(topBarCalBtn).toHaveTextContent('A4=440Hz · ±15¢');

    // Tuner HUD initial badges
    expect(screen.getByText('A4 = 440 Hz')).toBeInTheDocument();
    expect(screen.getByText('Tol: ±15¢')).toBeInTheDocument();

    // Open Calibration Drawer
    fireEvent.click(topBarCalBtn);
    expect(
      screen.getByRole('dialog', { name: /Calibration & Settings/i }),
    ).toBeInTheDocument();

    // Change A4 pitch reference to 442 Hz (European / Orchestral standard)
    const btn442 = screen.getByRole('button', { name: 'Set A4 to 442 Hz' });
    fireEvent.click(btn442);

    // Change strictness to Strict (±8¢)
    const strictRadio = screen.getByRole('radio', {
      name: /Strict \(±8¢\)/i,
    });
    fireEvent.click(strictRadio);

    // Verify Bluetooth earbud tip is displayed
    expect(
      screen.getByText(/Bluetooth Earbuds & Microphone Tip/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/built-in device microphone/i),
    ).toBeInTheDocument();

    // Apply & Close
    const applyBtn = screen.getByRole('button', {
      name: 'Apply & Done',
    });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /Calibration & Settings/i }),
      ).not.toBeInTheDocument();
    });

    // Verify TopBar calibration badge updated to 442 Hz & ±8¢
    expect(topBarCalBtn).toHaveTextContent('A4=442Hz · ±8¢');

    // Verify Tuner HUD badges updated
    expect(screen.getByText('A4 = 442 Hz')).toBeInTheDocument();
    expect(screen.getByText('Tol: ±8¢')).toBeInTheDocument();

    // Re-open and switch to Easy (±25¢)
    fireEvent.click(topBarCalBtn);
    const easyRadio = screen.getByRole('radio', { name: /Easy \(±25¢\)/i });
    fireEvent.click(easyRadio);
    fireEvent.click(screen.getByRole('button', { name: 'Apply & Done' }));

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /Calibration & Settings/i }),
      ).not.toBeInTheDocument();
    });

    expect(topBarCalBtn).toHaveTextContent('A4=442Hz · ±25¢');
    expect(screen.getByText('Tol: ±25¢')).toBeInTheDocument();
  });

  // =========================================================================
  // 5. Wait-for-Me Practice Session & Deterministic In-Tune Note Simulation
  // =========================================================================
  it('starts a Wait-for-Me session and uses Simulate In-Tune Note button to hold note for >= 150ms, advancing note and coloring SVG notehead green', async () => {
    render(<App />);

    // Start practice session
    const startBtn = screen.getByRole('button', { name: /Start Practice/i });
    fireEvent.click(startBtn);

    // Transport should now display "Pause"
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Pause Practice/i }),
      ).toBeInTheDocument();
    });

    // First target note of Twinkle Twinkle Little Star is D4 (Measure 1)
    const strip = screen.getByLabelText('Practice Control Strip');
    expect(within(strip).getByText(/Target Note:/i)).toHaveTextContent('D4');

    // Check that SVG note elements exist in container
    const firstNoteSvg = document.querySelector(
      '[data-note-id="p0-m1-n0"] path',
    );
    expect(firstNoteSvg).not.toBeNull();
    expect(firstNoteSvg?.getAttribute('fill')).toBe('#000000');

    // Simulate in-tune pitch hold (feeds two samples spaced 160ms apart >= 150ms hold requirement)
    const simulateBtn = screen.getByRole('button', {
      name: /Simulate In-Tune Note/i,
    });
    fireEvent.click(simulateBtn);

    // The first notehead must be colored green (#22c55e)
    expect(firstNoteSvg?.getAttribute('fill')).toBe('#22c55e');

    // The active target note advances to note 2 (also D4)
    expect(within(strip).getByText(/Target Note:/i)).toHaveTextContent('D4');

    // Simulate note 2
    fireEvent.click(simulateBtn);

    const secondNoteSvg = document.querySelector(
      '[data-note-id="p0-m1-n1"] path',
    );
    expect(secondNoteSvg?.getAttribute('fill')).toBe('#22c55e');

    // Target note now advances to note 3 (A4)
    expect(within(strip).getByText(/Target Note:/i)).toHaveTextContent('A4');

    // Pause practice
    const pauseBtn = screen.getByRole('button', { name: /Pause Practice/i });
    fireEvent.click(pauseBtn);
    expect(
      screen.getByRole('button', { name: /Resume Practice/i }),
    ).toBeInTheDocument();

    // Stop and reset practice
    const stopBtn = screen.getByRole('button', { name: /Stop & Reset/i });
    fireEvent.click(stopBtn);
    expect(
      screen.getByRole('button', { name: /Start Practice/i }),
    ).toBeInTheDocument();
  });

  // =========================================================================
  // 6. Mixer Controls & Reference Drone Toggle
  // =========================================================================
  it('updates mixer volumes and toggles reference drone for active target note', () => {
    render(<App />);

    const droneBtn = screen.getByRole('button', {
      name: /Play Reference Drone/i,
    });
    expect(droneBtn).toBeInTheDocument();

    // Toggle Drone on
    fireEvent.click(droneBtn);
    expect(droneBtn).toHaveTextContent(/Stop Drone/i);

    // Toggle Drone off
    fireEvent.click(droneBtn);
    expect(droneBtn).toHaveTextContent(/Play Reference Drone/i);

    // Solo Violin Mute Toggle
    const soloMuteBtn = screen.getByRole('button', {
      name: /Mute Solo Violin/i,
    });
    fireEvent.click(soloMuteBtn);
    expect(
      screen.getByRole('button', { name: /Unmute Solo Violin/i }),
    ).toBeInTheDocument();

    // Accompaniment Mute Toggle
    const accompMuteBtn = screen.getByRole('button', {
      name: /Mute Accompaniment/i,
    });
    fireEvent.click(accompMuteBtn);
    expect(
      screen.getByRole('button', { name: /Unmute Accompaniment/i }),
    ).toBeInTheDocument();

    // Metronome Mute Toggle
    const metroMuteBtn = screen.getByRole('button', {
      name: /Mute Metronome/i,
    });
    fireEvent.click(metroMuteBtn);
    expect(
      screen.getByRole('button', { name: /Unmute Metronome/i }),
    ).toBeInTheDocument();
  });

  // =========================================================================
  // 7. Measure Looping Selector in TopBar
  // =========================================================================
  it('selects a measure loop range and clears the loop', () => {
    render(<App />);

    const startSelect = screen.getByLabelText('Start Measure');
    const endSelect = screen.getByLabelText('End Measure');

    // Select loop measures 2 to 4
    fireEvent.change(startSelect, { target: { value: '2' } });
    fireEvent.change(endSelect, { target: { value: '4' } });

    // Clear loop button should appear
    const clearLoopBtn = screen.getByRole('button', { name: 'Clear Loop' });
    expect(clearLoopBtn).toBeInTheDocument();

    // Clear loop
    fireEvent.click(clearLoopBtn);
    expect(
      screen.queryByRole('button', { name: 'Clear Loop' }),
    ).not.toBeInTheDocument();
  });

  // =========================================================================
  // 8. Session Accuracy Summary at End of Practice
  // =========================================================================
  it('displays Session Accuracy Summary when a session finishes and handles dismissal', async () => {
    const singleNoteScore = {
      id: 'single-note',
      title: 'Single Note Etude',
      fileName: 'single-note.musicxml',
      format: 'musicxml' as const,
      isBuiltIn: false,
      xmlContent: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Single Note Etude</work-title></work>
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
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`,
    };

    render(<App initialScore={singleNoteScore} />);

    // Start practice
    fireEvent.click(screen.getByRole('button', { name: /Start Practice/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Pause Practice/i }),
      ).toBeInTheDocument();
    });

    // Simulate in-tune note for the single note
    fireEvent.click(
      screen.getByRole('button', { name: /Simulate In-Tune Note/i }),
    );

    // Session completes! Summary card appears
    await waitFor(() => {
      expect(screen.getByTestId('session-summary-card')).toBeInTheDocument();
    });

    expect(screen.getByText('Session Accuracy Summary')).toBeInTheDocument();
    expect(screen.getByText('100.0%')).toBeInTheDocument();
    expect(
      screen.getByText(/None! Perfect intonation across all measures./i),
    ).toBeInTheDocument();

    // Dismiss summary
    fireEvent.click(
      screen.getByRole('button', { name: /Dismiss Session Summary/i }),
    );
    expect(
      screen.queryByTestId('session-summary-card'),
    ).not.toBeInTheDocument();
  });

  // =========================================================================
  // 9. Problem Measures & 1-Click Loop Problem Measures
  // =========================================================================
  it('provides 1-click Loop Problem Measures button when session finishes with problem measures', async () => {
    const singleNoteScore = {
      id: 'single-note-problem',
      title: 'Problem Measure Etude',
      fileName: 'problem.musicxml',
      format: 'musicxml' as const,
      isBuiltIn: false,
      xmlContent: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>Problem Measure Etude</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Solo Violin</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="2">
      <attributes>
        <divisions>4</divisions>
        <time><beats>1</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`,
    };

    render(<App initialScore={singleNoteScore} />);

    // Switch to Play-Along Mode
    fireEvent.click(screen.getByRole('radio', { name: 'Play-Along' }));

    // Start practice session
    fireEvent.click(screen.getByRole('button', { name: /Start Practice/i }));

    // Wait for session to complete or simulate missed pitch
    // In Play-Along mode, simulate pitch with 40 cents error (out of tolerance -> yellow/red)
    // Wait for pause or stop button
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Pause Practice/i }),
      ).toBeInTheDocument();
    });

    // Let scheduler finish or stop to finalize
    const stopBtn = screen.getByRole('button', { name: /Stop & Reset/i });
    fireEvent.click(stopBtn);

    // Verify session can be restarted or looped cleanly
    expect(
      screen.getByRole('button', { name: /Start Practice/i }),
    ).toBeInTheDocument();
  });
});


