import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppShell, pageFromHash } from '../../src/components/AppShell';
import { SongsPage } from '../../src/pages/SongsPage';
import { TunerPage } from '../../src/pages/TunerPage';
import { SettingsPage } from '../../src/pages/SettingsPage';
import { BUILT_IN_SCORES } from '../../src/modules/score-engine/scoreStore';
import { type AudioPlaybackEngine } from '../../src/modules/audio-playback/audioEngine';

describe('Task 7: AppShell Component', () => {
  it('renders a three-tab navigation (Songs, Tune, Settings) with the active tab marked', () => {
    const handleNavigate = vi.fn();
    render(
      <AppShell activePage="songs" onNavigate={handleNavigate}>
        <div data-testid="shell-child">Songs Canvas</div>
      </AppShell>,
    );

    expect(screen.getByText('Songs Canvas')).toBeDefined();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(nav).toBeDefined();

    const songsTab = screen.getByRole('link', { name: 'Songs' });
    const tuneTab = screen.getByRole('link', { name: 'Tune' });
    const settingsTab = screen.getByRole('link', { name: 'Settings' });

    expect(songsTab.getAttribute('aria-current')).toBe('page');
    expect(tuneTab.getAttribute('aria-current')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Learn' })).toBeNull();
    expect(tuneTab.getAttribute('href')).toBe('#/tune');
    expect(settingsTab.getAttribute('href')).toBe('#/settings');

    fireEvent.click(tuneTab);
    expect(handleNavigate).toHaveBeenCalledWith('tune');

    // Footer with version and helpful info is visible
    expect(screen.getByTestId('app-footer')).toBeDefined();
    expect(screen.getByText(/Violin Coach/i)).toBeDefined();
    expect(screen.getByText(/Tuning: /i)).toBeDefined();
  });

  it('hides the tab bar and footer on the full-screen play page', () => {
    render(
      <AppShell activePage="play" onNavigate={vi.fn()}>
        <div>Play</div>
      </AppShell>,
    );
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
    expect(screen.queryByTestId('app-footer')).toBeNull();
  });

  it('maps legacy hashes onto the new pages', () => {
    expect(pageFromHash('#/practice')).toBe('play');
    expect(pageFromHash('#/library')).toBe('songs');
    expect(pageFromHash('#/tuner')).toBe('tune');
    expect(pageFromHash('#/settings')).toBe('settings');
    expect(pageFromHash('#/learn')).toBe('songs');
    expect(pageFromHash('')).toBe('songs');
  });
});

describe('Task 8: Dedicated Pages (SongsPage, TunerPage, SettingsPage)', () => {
  describe('SongsPage', () => {
    it('lists built-in pieces with their length and opens one for free play', () => {
      const handlePlay = vi.fn();
      render(<SongsPage currentScoreId={BUILT_IN_SCORES[0].id} onPlayScore={handlePlay} />);

      expect(screen.getByRole('heading', { name: 'Songs' })).toBeDefined();
      expect(screen.getByText('Built into the app')).toBeDefined();
      expect(screen.getByText('Twinkle, Twinkle, Little Star')).toBeDefined();
      expect(screen.getByText('Minuet & Tied Note Etude')).toBeDefined();
      expect(screen.getByText(/8 bars at 100 bpm/)).toBeDefined();

      const playButtons = screen.getAllByRole('button', { name: /^Play / });
      expect(playButtons.length).toBeGreaterThanOrEqual(2);
      fireEvent.click(playButtons[1]);
      expect(handlePlay).toHaveBeenCalledWith(expect.objectContaining({ id: 'minuet-tied' }));
    });

    it('displays explicit MuseScore export instructions banner when invalid .mscz file is selected', async () => {
      render(<SongsPage currentScoreId={BUILT_IN_SCORES[0].id} onPlayScore={vi.fn()} />);

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

      expect(screen.getByRole('heading', { name: 'Tune' })).toBeDefined();
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

      expect(screen.getByRole('heading', { name: 'Settings' })).toBeDefined();

      // Click 442 Hz button
      const btn442 = screen.getByRole('button', { name: /442 Hz \(European\)/i });
      fireEvent.click(btn442);
      expect(handleA4Change).toHaveBeenCalledWith(442);

      // Click Strict intonation option
      const strictOption = screen.getByRole('button', { name: /Strict \(±8¢\)/i });
      fireEvent.click(strictOption);
      expect(handleStrictnessChange).toHaveBeenCalledWith('strict');

      // Earbud / Bluetooth latency guidance is present
      expect(screen.getByText(/Earbuds and microphone tips/i)).toBeDefined();
      expect(screen.getByText(/Bluetooth delay is fine/i)).toBeDefined();
      expect(screen.getByText(/350 ms late/i)).toBeDefined();
    });

    it('toggles keep screen awake switch in Settings', () => {
      const handleWakeLockChange = vi.fn();
      render(
        <SettingsPage
          referenceA4Hz={440}
          onReferenceA4Change={vi.fn()}
          strictness="medium"
          onStrictnessChange={vi.fn()}
          customToleranceCents={15}
          onCustomToleranceCentsChange={vi.fn()}
          selectedMicDeviceId={null}
          wakeLockEnabled={true}
          onWakeLockEnabledChange={handleWakeLockChange}
        />,
      );

      const switchBtn = screen.getByRole('switch', { name: /keep screen awake/i });
      expect(switchBtn).toBeDefined();
      expect(switchBtn.getAttribute('aria-checked')).toBe('true');

      fireEvent.click(switchBtn);
      expect(handleWakeLockChange).toHaveBeenCalledWith(false);
    });
  });
});
