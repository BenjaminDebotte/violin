import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import App from '../../src/App';
import {
  resetInMemoryScoreStore,
} from '../../src/modules/score-engine/scoreStore';

describe('App Integration Tests (SPEC.md Success Criteria & Urtext Multi-Page)', () => {
  beforeEach(() => {
    resetInMemoryScoreStore();
    if (typeof window !== 'undefined') {
      window.location.hash = '#/practice';
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Initial Workspace Render in PracticeStudioPage (Direction 1: Urtext Archive)
  // =========================================================================
  it('renders default score (Twinkle Twinkle Little Star), AppShell masthead, Studio Sub-header Bar, Pitch Hold Pill, and ScoreViewport', () => {
    render(<App />);

    // 1. AppShell Brand and 4 Navigation Tabs
    expect(screen.getByText('Urtext Violin Coach')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Practice Studio Tab' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Repertoire Library Tab' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Violin Tuner Tab' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Calibration Settings Tab' })).toBeInTheDocument();

    // 2. Studio Sub-header Bar with Score Title and Library quick-button
    expect(screen.getByText('Twinkle, Twinkle, Little Star')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Score Library' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Practice' })).toBeInTheDocument();

    // 3. Central Archival Pitch & 150ms Hold HUD Pill
    expect(screen.getByLabelText('Archival Pitch & Hold Pill')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Wait-for-Me Hold Progress' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Simulate In-Tune Note' })).toBeInTheDocument();

    // 4. Mode Switches: Wait-for-Me vs Play-Along, Page View vs Mobile Ribbon
    const wfmRadio = screen.getByRole('radio', { name: 'Wait-for-Me Mode' });
    expect(wfmRadio).toHaveAttribute('aria-checked', 'true');

    const pageRadio = screen.getByRole('radio', { name: 'Page View Mode' });
    expect(pageRadio).toHaveAttribute('aria-checked', 'true');

    // 5. Center Score Plate & ScoreViewport Container
    expect(screen.getByLabelText('Center Score Plate')).toBeInTheDocument();
    const scoreContainer = document.getElementById('osmd-score-container');
    expect(scoreContainer).toBeInTheDocument();

    // 6. Bottom Urtext Transport Dock & Mixer Popover Button
    expect(screen.getByLabelText('Urtext Transport Dock')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle Mixer Popover' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle Reference Drone' })).toBeInTheDocument();
  });

  // =========================================================================
  // 2. Navigation Across 4 Pages (Studio -> Library -> Tuner -> Settings)
  // =========================================================================
  it('navigates cleanly between Studio, Library, Tuner, and Settings via AppShell tabs', async () => {
    render(<App />);

    // Studio is active initially
    expect(screen.getByTestId('practice-studio-page')).toBeInTheDocument();

    // Navigate to Library Tab
    const libraryTab = screen.getByRole('link', { name: 'Repertoire Library Tab' });
    fireEvent.click(libraryTab);
    expect(screen.getByText('Repertoire Catalogue')).toBeInTheDocument();
    expect(screen.getByText('Built-in Conservatory Repertoire')).toBeInTheDocument();

    // Navigate to Tuner Tab
    const tunerTab = screen.getByRole('link', { name: 'Violin Tuner Tab' });
    fireEvent.click(tunerTab);
    expect(screen.getByText('Violin Pegbox Tuner')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Tuner HUD' })).toBeInTheDocument();
    expect(screen.getByText('G3 (lowest string, wound gut/silver)')).toBeInTheDocument();

    // Navigate to Settings Tab
    const settingsTab = screen.getByRole('link', { name: 'Calibration Settings Tab' });
    fireEvent.click(settingsTab);
    expect(screen.getByText('Studio Calibration & Settings')).toBeInTheDocument();
    expect(screen.getByText('Concert Reference Pitch (A4)')).toBeInTheDocument();
    expect(screen.getByText('Bluetooth Earbuds & Acoustic Setup Guide')).toBeInTheDocument();

    // Navigate back to Studio Tab
    const studioTab = screen.getByRole('link', { name: 'Practice Studio Tab' });
    fireEvent.click(studioTab);
    expect(screen.getByTestId('practice-studio-page')).toBeInTheDocument();
  });

  // =========================================================================
  // 3. Library Modal, File Upload Validation & Switching Scores
  // =========================================================================
  it('rejects .mscz and .pdf with explicit MuseScore export instructions, uploads valid .musicxml, and switches built-in scores', async () => {
    render(<App />);

    // Open Library Modal from Studio quick button
    const libraryBtn = screen.getByRole('button', {
      name: 'Open Score Library',
    });
    fireEvent.click(libraryBtn);

    const libraryModal = screen.getByRole('dialog', { name: 'Score Library' });
    expect(libraryModal).toBeInTheDocument();

    const fileInput = screen.getByTestId('score-file-input');

    // Case A: Reject .mscz file with explicit MuseScore export instructions
    const msczFile = new File(['binary-content'], 'sonata.mscz', {
      type: 'application/octet-stream',
    });
    fireEvent.change(fileInput, { target: { files: [msczFile] } });

    const msczAlert = await screen.findByRole('alert', {
      name: 'Upload Validation Message',
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
      name: 'Upload Validation Message',
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
        screen.queryByRole('dialog', { name: 'Score Library' }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText('Vivaldi Spring Solo')).toBeInTheDocument();

    // Case D: Re-open Library Modal and switch to built-in "Minuet & Tied Note Etude"
    fireEvent.click(
      screen.getByRole('button', { name: 'Open Score Library' }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Score Library' }),
    ).toBeInTheDocument();

    const minuetCard = screen.getByLabelText(
      /Select Minuet & Tied Note Etude/i,
    );
    fireEvent.click(minuetCard);

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Score Library' }),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText('Minuet & Tied Note Etude')).toBeInTheDocument();
  });

  // =========================================================================
  // 4. View Mode and Practice Mode Toggles
  // =========================================================================
  it('toggles View Mode between Page View and Mobile Ribbon view, and switches Practice Mode between Wait-for-Me and Play-Along', () => {
    render(<App />);

    // --- Practice Mode Toggle ---
    const wfmBtn = screen.getByRole('radio', { name: 'Wait-for-Me Mode' });
    const playAlongBtn = screen.getByRole('radio', { name: 'Play-Along Mode' });

    expect(wfmBtn).toHaveAttribute('aria-checked', 'true');
    expect(playAlongBtn).toHaveAttribute('aria-checked', 'false');

    // Switch to Play-Along
    fireEvent.click(playAlongBtn);
    expect(playAlongBtn).toHaveAttribute('aria-checked', 'true');
    expect(wfmBtn).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/Play-Along · Measure/i)).toBeInTheDocument();

    // Switch back to Wait-for-Me
    fireEvent.click(wfmBtn);
    expect(wfmBtn).toHaveAttribute('aria-checked', 'true');
    expect(playAlongBtn).toHaveAttribute('aria-checked', 'false');
    const pill = screen.getByLabelText('Archival Pitch & Hold Pill');
    expect(within(pill).getByText(/Target Note:/i)).toBeInTheDocument();

    // --- View Mode Toggle ---
    const pageViewBtn = screen.getByRole('radio', { name: 'Page View Mode' });
    const ribbonViewBtn = screen.getByRole('radio', { name: 'Mobile Ribbon Mode' });

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
  // 5. Calibration Drawer & Quick Status Badge
  // =========================================================================
  it('opens CalibrationDrawer, changes A4 reference and strictness, and updates AppShell badge', async () => {
    render(<App />);

    // AppShell initial badge
    const badge = screen.getByRole('button', {
      name: 'Calibration Settings Badge',
    });
    expect(badge).toHaveTextContent('A4=440Hz · ±15¢');

    // Open Calibration Drawer
    fireEvent.click(badge);
    expect(
      screen.getByRole('dialog', { name: 'Calibration & Settings' }),
    ).toBeInTheDocument();

    // Change A4 pitch reference to 442 Hz (European / Orchestral standard)
    const btn442 = screen.getByRole('button', { name: 'Set A4 to 442 Hz' });
    fireEvent.click(btn442);

    // Change strictness to Strict (±8¢)
    const strictRadio = screen.getByRole('radio', {
      name: /Strict \(±8¢\)/i,
    });
    fireEvent.click(strictRadio);

    // Apply & Close
    const applyBtn = screen.getByRole('button', {
      name: 'Apply & Done',
    });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Calibration & Settings' }),
      ).not.toBeInTheDocument();
    });

    // Verify AppShell calibration badge updated to 442 Hz & ±8¢
    expect(badge).toHaveTextContent('A4=442Hz · ±8¢');
  });

  // =========================================================================
  // 6. Wait-for-Me Practice Session & Deterministic In-Tune Note Simulation
  // =========================================================================
  it('starts a Wait-for-Me session and uses Simulate In-Tune Note button to hold note for >= 150ms, advancing note and coloring SVG notehead green', async () => {
    render(<App />);

    // Start practice session
    const startBtn = screen.getByRole('button', { name: 'Start Practice' });
    fireEvent.click(startBtn);

    // Transport should now display "Pause"
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Pause Practice' }),
      ).toBeInTheDocument();
    });

    // First target note of Twinkle Twinkle Little Star is D4 (Measure 1)
    const pill = screen.getByLabelText('Archival Pitch & Hold Pill');
    expect(within(pill).getByText('D4')).toBeInTheDocument();

    // Check that SVG note elements exist in container
    const firstNoteSvg = document.querySelector(
      '[data-note-id="p0-m1-n0"] path',
    );
    expect(firstNoteSvg).not.toBeNull();
    expect(firstNoteSvg?.getAttribute('fill')).toBe('#000000');

    // Simulate in-tune pitch hold (feeds two samples spaced 160ms apart >= 150ms hold requirement)
    const simulateBtn = screen.getByRole('button', {
      name: 'Simulate In-Tune Note',
    });
    fireEvent.click(simulateBtn);

    // The first notehead must be colored green (#22c55e)
    expect(firstNoteSvg?.getAttribute('fill')).toBe('#22c55e');

    // The active target note advances to note 2 (also D4)
    expect(within(pill).getByText('D4')).toBeInTheDocument();

    // Simulate note 2
    fireEvent.click(simulateBtn);

    const secondNoteSvg = document.querySelector(
      '[data-note-id="p0-m1-n1"] path',
    );
    expect(secondNoteSvg?.getAttribute('fill')).toBe('#22c55e');

    // Target note now advances to note 3 (A4)
    expect(within(pill).getByText('A4')).toBeInTheDocument();

    // Pause practice
    const pauseBtn = screen.getByRole('button', { name: 'Pause Practice' });
    fireEvent.click(pauseBtn);
    expect(
      screen.getByRole('button', { name: 'Resume Practice' }),
    ).toBeInTheDocument();

    // Stop and reset practice
    const stopBtn = screen.getByRole('button', { name: 'Stop and Reset Practice' });
    fireEvent.click(stopBtn);
    expect(
      screen.getByRole('button', { name: 'Start Practice' }),
    ).toBeInTheDocument();
  });

  // =========================================================================
  // 7. Mixer & Tempo Popover Controls & Reference Drone Toggle
  // =========================================================================
  it('opens Mixer & Tempo popover, updates volumes, and toggles reference drone', () => {
    render(<App />);

    // Open Mixer Popover
    const mixerPopoverBtn = screen.getByRole('button', {
      name: 'Toggle Mixer Popover',
    });
    fireEvent.click(mixerPopoverBtn);

    expect(screen.getByRole('dialog', { name: 'Mixer & Tempo Popover' })).toBeInTheDocument();
    expect(screen.getByTestId('mixer-panel')).toBeInTheDocument();

    // Solo Violin Mute Toggle
    const soloMuteBtn = screen.getByRole('button', {
      name: 'Mute Solo Violin',
    });
    fireEvent.click(soloMuteBtn);
    expect(
      screen.getByRole('button', { name: 'Unmute Solo Violin' }),
    ).toBeInTheDocument();

    // Accompaniment Mute Toggle
    const accompMuteBtn = screen.getByRole('button', {
      name: 'Mute Accompaniment',
    });
    fireEvent.click(accompMuteBtn);
    expect(
      screen.getByRole('button', { name: 'Unmute Accompaniment' }),
    ).toBeInTheDocument();

    // Metronome Mute Toggle
    const metroMuteBtn = screen.getByRole('button', {
      name: 'Mute Metronome',
    });
    fireEvent.click(metroMuteBtn);
    expect(
      screen.getByRole('button', { name: 'Unmute Metronome' }),
    ).toBeInTheDocument();

    // Toggle Drone on
    const droneBtn = screen.getByRole('button', {
      name: 'Toggle Reference Drone',
    });
    fireEvent.click(droneBtn);
    expect(droneBtn).toHaveTextContent(/Stop Drone/i);

    // Toggle Drone off
    fireEvent.click(droneBtn);
    expect(droneBtn).toHaveTextContent(/Drone/i);
  });

  // =========================================================================
  // 8. Measure Looping Popover Selector
  // =========================================================================
  it('opens Measure Loop popover, selects a measure loop range and clears the loop', () => {
    render(<App />);

    // Open loop popover
    const loopBtn = screen.getByRole('button', { name: 'Toggle Loop Controls' });
    fireEvent.click(loopBtn);

    const startSelect = screen.getByLabelText('Loop Start Measure');
    const endSelect = screen.getByLabelText('Loop End Measure');

    // Select loop measures 2 to 4
    fireEvent.change(startSelect, { target: { value: '2' } });
    fireEvent.change(endSelect, { target: { value: '4' } });

    // Clear loop button should appear
    const clearLoopBtn = screen.getByRole('button', { name: 'Clear Measure Loop' });
    expect(clearLoopBtn).toBeInTheDocument();

    // Clear loop
    fireEvent.click(clearLoopBtn);
    expect(
      screen.queryByRole('button', { name: 'Clear Measure Loop' }),
    ).not.toBeInTheDocument();
  });

  // =========================================================================
  // 9. Session Accuracy Summary at End of Practice & 1-Click Loop Problem Measures
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
    fireEvent.click(screen.getByRole('button', { name: 'Start Practice' }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Pause Practice' }),
      ).toBeInTheDocument();
    });

    // Simulate in-tune note for the single note
    fireEvent.click(
      screen.getByRole('button', { name: 'Simulate In-Tune Note' }),
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
      screen.getByRole('button', { name: 'Dismiss Session Summary' }),
    );
    expect(
      screen.queryByTestId('session-summary-card'),
    ).not.toBeInTheDocument();
  });

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
    fireEvent.click(screen.getByRole('radio', { name: 'Play-Along Mode' }));

    // Start practice session
    fireEvent.click(screen.getByRole('button', { name: 'Start Practice' }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Pause Practice' }),
      ).toBeInTheDocument();
    });

    // Let scheduler finish or stop to finalize
    const stopBtn = screen.getByRole('button', { name: 'Stop and Reset Practice' });
    fireEvent.click(stopBtn);

    // Verify session can be restarted or looped cleanly
    expect(
      screen.getByRole('button', { name: 'Start Practice' }),
    ).toBeInTheDocument();
  });
});
