import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppShell } from '../../src/components/AppShell';
import { LibraryPage } from '../../src/pages/LibraryPage';
import { TunerPage } from '../../src/pages/TunerPage';
import { SettingsPage } from '../../src/pages/SettingsPage';
import { BUILT_IN_SCORES } from '../../src/modules/score-engine/scoreStore';
import { type AudioPlaybackEngine } from '../../src/modules/audio-playback/audioEngine';

describe('Task 7: AppShell Component', () => {
  it('renders ruled Urtext masthead with brand title, active score subtitle, and 4 navigation tabs', () => {
    const handleNavigate = vi.fn();
    render(
      <AppShell
        activePage="studio"
        onNavigate={handleNavigate}
        activeScoreTitle="Minuet in G major"
        referenceA4Hz={440}
        toleranceCents={15}
      >
        <div data-testid="shell-child">Studio Canvas</div>
      </AppShell>,
    );

    expect(screen.getByText('Urtext Violin Coach')).toBeDefined();
    expect(screen.getByText('· Minuet in G major')).toBeDefined();
    expect(screen.getByText('Studio Canvas')).toBeDefined();

    const studioTab = screen.getByLabelText('Practice Studio Tab');
    const libraryTab = screen.getByLabelText('Repertoire Library Tab');
    const tunerTab = screen.getByLabelText('Violin Tuner Tab');
    const settingsTab = screen.getByLabelText('Calibration Settings Tab');

    expect(studioTab).toBeDefined();
    expect(libraryTab).toBeDefined();
    expect(tunerTab).toBeDefined();
    expect(settingsTab).toBeDefined();

    // Studio is active
    expect(studioTab.getAttribute('aria-current')).toBe('page');
    expect(libraryTab.getAttribute('aria-current')).toBeNull();

    // Click Library tab
    fireEvent.click(libraryTab);
    expect(handleNavigate).toHaveBeenCalledWith('library');
  });

  it('renders quick status badge and navigates to settings on click', () => {
    const handleNavigate = vi.fn();
    const handleOpenCalibration = vi.fn();

    render(
      <AppShell
        activePage="studio"
        onNavigate={handleNavigate}
        referenceA4Hz={442}
        toleranceCents={8}
        onOpenCalibration={handleOpenCalibration}
      >
        <div>Content</div>
      </AppShell>,
    );

    const badge = screen.getByLabelText('Calibration Settings Badge');
    expect(badge.textContent).toContain('A4=442Hz · ±8¢');

    fireEvent.click(badge);
    expect(handleOpenCalibration).toHaveBeenCalled();
  });
});

describe('Task 8: Dedicated Pages (LibraryPage, TunerPage, SettingsPage)', () => {
  describe('LibraryPage', () => {
    it('renders built-in repertoire pieces and calls onSelectScore and onNavigateToStudio when clicking Open in Studio', () => {
      const handleSelect = vi.fn();
      const handleNavigateToStudio = vi.fn();

      render(
        <LibraryPage
          currentScoreId={BUILT_IN_SCORES[0].id}
          onSelectScore={handleSelect}
          onNavigateToStudio={handleNavigateToStudio}
        />,
      );

      expect(screen.getByText('Repertoire Catalogue')).toBeDefined();
      expect(screen.getByText('Built-in Conservatory Repertoire')).toBeDefined();
      expect(screen.getByText('Twinkle, Twinkle, Little Star')).toBeDefined();
      expect(screen.getByText('Minuet & Tied Note Etude')).toBeDefined();

      const openButtons = screen.getAllByRole('button', { name: /Open in Studio/i });
      expect(openButtons.length).toBeGreaterThanOrEqual(2);

      fireEvent.click(openButtons[0]);
      expect(handleSelect).toHaveBeenCalled();
      expect(handleNavigateToStudio).toHaveBeenCalled();
    });

    it('displays explicit MuseScore export instructions banner when invalid .mscz file is selected', async () => {
      render(
        <LibraryPage
          currentScoreId={BUILT_IN_SCORES[0].id}
          onSelectScore={vi.fn()}
        />,
      );

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).toBeDefined();

      const invalidFile = new File(['mock content'], 'concerto.mscz', {
        type: 'application/octet-stream',
      });

      fireEvent.change(fileInput, { target: { files: [invalidFile] } });

      const alertBanner = await screen.findByRole('alert');
      expect(alertBanner).toBeDefined();
      expect(alertBanner.textContent).toContain('MuseScore files (.mscz / .mscx) cannot be read directly');
      expect(alertBanner.textContent).toContain('File -> Export -> MusicXML');
    });
  });

  describe('TunerPage', () => {
    it('renders 4 open violin strings (G3, D4, A4, E5) and toggles reference drone', () => {
      const mockAudioEngine = {
        startDrone: vi.fn(),
        stopDrone: vi.fn(),
      };

      render(
        <TunerPage
          referenceA4Hz={440}
          toleranceCents={15}
          audioEngine={mockAudioEngine as unknown as AudioPlaybackEngine}
        />,
      );

      expect(screen.getByText('Violin Pegbox Tuner')).toBeDefined();
      expect(screen.getByText('G3')).toBeDefined();
      expect(screen.getByText('D4')).toBeDefined();
      expect(screen.getByText('A4')).toBeDefined();
      expect(screen.getByText('E5')).toBeDefined();

      const a4Btn = screen.getByRole('button', { name: /String A4 drone/i });
      fireEvent.click(a4Btn);
      expect(mockAudioEngine.startDrone).toHaveBeenCalledWith(69, 440);

      // Clicking again stops drone
      fireEvent.click(a4Btn);
      expect(mockAudioEngine.stopDrone).toHaveBeenCalled();
    });
  });

  describe('SettingsPage', () => {
    it('allows selecting A4 tuning presets and intonation strictness', () => {
      const handleA4Change = vi.fn();
      const handleStrictnessChange = vi.fn();
      const handleCustomCentsChange = vi.fn();

      render(
        <SettingsPage
          referenceA4Hz={440}
          onReferenceA4Change={handleA4Change}
          strictness="medium"
          onStrictnessChange={handleStrictnessChange}
          customToleranceCents={15}
          onCustomToleranceCentsChange={handleCustomCentsChange}
          selectedMicDeviceId={null}
        />,
      );

      expect(screen.getByText('Studio Calibration & Settings')).toBeDefined();

      // Click 442 Hz button
      const btn442 = screen.getByRole('button', { name: /442 Hz \(European\)/i });
      fireEvent.click(btn442);
      expect(handleA4Change).toHaveBeenCalledWith(442);

      // Click Strict intonation option
      const strictOption = screen.getByRole('button', { name: /Strict \(±8¢\)/i });
      fireEvent.click(strictOption);
      expect(handleStrictnessChange).toHaveBeenCalledWith('strict');

      // Verify Bluetooth Earbuds guide is present
      expect(screen.getByText(/Bluetooth Earbuds & Acoustic Setup Guide/i)).toBeDefined();
      expect(screen.getByText(/Bluetooth Transmission Latency/i)).toBeDefined();
    });
  });
});
