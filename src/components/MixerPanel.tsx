import React from 'react';
import { Volume2, VolumeX, Sliders, Gauge, Clock, Radio } from 'lucide-react';
import { type MixerSettings } from '../types/music';

export interface MixerPanelProps {
  /** 4-Channel mixer settings for volume levels and mute states */
  readonly mixer: MixerSettings;
  /** Callback invoked when any mixer volume or mute state changes */
  readonly onMixerChange: (settings: MixerSettings) => void;
  /** Tempo scaling factor between 0.25 (25%) and 1.50 (150%) */
  readonly tempoScale: number;
  /** Callback invoked when tempo scale changes */
  readonly onTempoScaleChange: (scale: number) => void;
  /** Number of count-in bars (1 or 2) */
  readonly countInBars: 1 | 2;
  /** Callback invoked when count-in bar count changes */
  readonly onCountInBarsChange: (bars: 1 | 2) => void;
  /** Optional target note name (e.g. "A4" or "D4") for drone display */
  readonly droneTargetNoteName?: string | null;
  /** Optional callback when drone toggle is clicked; falls back to updating mixer.droneActive */
  readonly onToggleDrone?: () => void;
  /** Optional additional container CSS classes */
  readonly className?: string;
}

const TEMPO_PRESETS = [0.5, 0.75, 1.0, 1.25] as const;

/**
 * 4-Channel Audio Mixer, Tempo Scaler & Metronome / Reference Drone Control Panel.
 * Provides independent volume sliders & mute toggles for Solo Violin, Accompaniment, and Metronome,
 * tempo scaling (25%–150%) with quick preset buttons, 1/2 bar count-in selection,
 * and a sustained reference drone toggle with active pitch display.
 */
export function MixerPanel({
  mixer,
  onMixerChange,
  tempoScale,
  onTempoScaleChange,
  countInBars,
  onCountInBarsChange,
  droneTargetNoteName,
  onToggleDrone,
  className = '',
}: MixerPanelProps) {
  const currentTempoPct = Math.round(tempoScale * 100);

  const handleSoloVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value) / 100;
    onMixerChange({ ...mixer, soloVolume: val });
  };

  const handleSoloMuteToggle = () => {
    onMixerChange({ ...mixer, soloMuted: !mixer.soloMuted });
  };

  const handleAccompanimentVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value) / 100;
    onMixerChange({ ...mixer, accompanimentVolume: val });
  };

  const handleAccompanimentMuteToggle = () => {
    onMixerChange({ ...mixer, accompanimentMuted: !mixer.accompanimentMuted });
  };

  const handleMetronomeVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value) / 100;
    onMixerChange({ ...mixer, metronomeVolume: val });
  };

  const handleMetronomeMuteToggle = () => {
    onMixerChange({ ...mixer, metronomeMuted: !mixer.metronomeMuted });
  };

  const handleTempoSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value) / 100;
    onTempoScaleChange(val);
  };

  const handleDroneToggle = () => {
    if (onToggleDrone) {
      onToggleDrone();
    } else {
      onMixerChange({ ...mixer, droneActive: !mixer.droneActive });
    }
  };

  return (
    <div
      className={`rounded-xl p-4 sm:p-5 shadow-sm border flex flex-col gap-4 font-sans ${className}`}
      style={{
        backgroundColor: 'var(--color-paper)',
        borderColor: 'var(--color-rule)',
        color: 'var(--color-ink)',
      }}
      data-testid="mixer-panel"
    >
      {/* Panel Header */}
      <div
        className="flex items-center justify-between border-b pb-3"
        style={{ borderColor: 'var(--color-rule)' }}
      >
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
          <h2 className="font-display font-bold text-sm sm:text-base tracking-tight">
            Mixer & Tempo Controls
          </h2>
        </div>
      </div>

      {/* 3-Channel Volume & Mute Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Solo Violin Channel */}
        <div
          className="rounded-lg p-3 flex flex-col gap-2 border"
          style={{
            backgroundColor: 'var(--color-paper-2)',
            borderColor: 'var(--color-rule)',
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
              Solo Violin
            </span>
            <button
              type="button"
              onClick={handleSoloMuteToggle}
              aria-label={mixer.soloMuted ? 'Unmute Solo Violin' : 'Mute Solo Violin'}
              className="p-1 px-2 rounded text-xs flex items-center gap-1 font-medium border cursor-pointer transition"
              style={{
                backgroundColor: mixer.soloMuted
                  ? 'oklch(56.0% 0.185 28 / 0.15)'
                  : 'var(--color-paper)',
                borderColor: mixer.soloMuted
                  ? 'var(--color-intonation-miss)'
                  : 'var(--color-rule)',
                color: mixer.soloMuted
                  ? 'var(--color-intonation-miss)'
                  : 'var(--color-ink-2)',
              }}
            >
              {mixer.soloMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              {mixer.soloMuted ? 'Muted' : 'Mute'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(mixer.soloVolume * 100)}
              onChange={handleSoloVolumeChange}
              aria-label="Solo Violin Volume"
              disabled={mixer.soloMuted}
              className="w-full h-1.5 rounded-lg cursor-pointer disabled:opacity-40"
              style={{ accentColor: 'var(--color-accent)' }}
            />
            <span className="text-xs font-mono w-10 text-right" style={{ color: 'var(--color-muted)' }}>
              {mixer.soloMuted ? '0%' : `${Math.round(mixer.soloVolume * 100)}%`}
            </span>
          </div>
        </div>

        {/* Accompaniment Channel */}
        <div
          className="rounded-lg p-3 flex flex-col gap-2 border"
          style={{
            backgroundColor: 'var(--color-paper-2)',
            borderColor: 'var(--color-rule)',
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: 'var(--color-ink)' }}>
              Accompaniment
            </span>
            <button
              type="button"
              onClick={handleAccompanimentMuteToggle}
              aria-label={mixer.accompanimentMuted ? 'Unmute Accompaniment' : 'Mute Accompaniment'}
              className="p-1 px-2 rounded text-xs flex items-center gap-1 font-medium border cursor-pointer transition"
              style={{
                backgroundColor: mixer.accompanimentMuted
                  ? 'oklch(56.0% 0.185 28 / 0.15)'
                  : 'var(--color-paper)',
                borderColor: mixer.accompanimentMuted
                  ? 'var(--color-intonation-miss)'
                  : 'var(--color-rule)',
                color: mixer.accompanimentMuted
                  ? 'var(--color-intonation-miss)'
                  : 'var(--color-ink-2)',
              }}
            >
              {mixer.accompanimentMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              {mixer.accompanimentMuted ? 'Muted' : 'Mute'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(mixer.accompanimentVolume * 100)}
              onChange={handleAccompanimentVolumeChange}
              aria-label="Accompaniment Volume"
              disabled={mixer.accompanimentMuted}
              className="w-full h-1.5 rounded-lg cursor-pointer disabled:opacity-40"
              style={{ accentColor: 'var(--color-accent)' }}
            />
            <span className="text-xs font-mono w-10 text-right" style={{ color: 'var(--color-muted)' }}>
              {mixer.accompanimentMuted ? '0%' : `${Math.round(mixer.accompanimentVolume * 100)}%`}
            </span>
          </div>
        </div>

        {/* Metronome Channel */}
        <div
          className="rounded-lg p-3 flex flex-col gap-2 border"
          style={{
            backgroundColor: 'var(--color-paper-2)',
            borderColor: 'var(--color-rule)',
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: 'var(--color-ink)' }}>
              Metronome
            </span>
            <button
              type="button"
              onClick={handleMetronomeMuteToggle}
              aria-label={mixer.metronomeMuted ? 'Unmute Metronome' : 'Mute Metronome'}
              className="p-1 px-2 rounded text-xs flex items-center gap-1 font-medium border cursor-pointer transition"
              style={{
                backgroundColor: mixer.metronomeMuted
                  ? 'oklch(56.0% 0.185 28 / 0.15)'
                  : 'var(--color-paper)',
                borderColor: mixer.metronomeMuted
                  ? 'var(--color-intonation-miss)'
                  : 'var(--color-rule)',
                color: mixer.metronomeMuted
                  ? 'var(--color-intonation-miss)'
                  : 'var(--color-ink-2)',
              }}
            >
              {mixer.metronomeMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              {mixer.metronomeMuted ? 'Muted' : 'Mute'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(mixer.metronomeVolume * 100)}
              onChange={handleMetronomeVolumeChange}
              aria-label="Metronome Volume"
              disabled={mixer.metronomeMuted}
              className="w-full h-1.5 rounded-lg cursor-pointer disabled:opacity-40"
              style={{ accentColor: 'var(--color-accent)' }}
            />
            <span className="text-xs font-mono w-10 text-right" style={{ color: 'var(--color-muted)' }}>
              {mixer.metronomeMuted ? '0%' : `${Math.round(mixer.metronomeVolume * 100)}%`}
            </span>
          </div>
        </div>
      </div>

      {/* Tempo & Count-In Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
        {/* Tempo Scaling Controls */}
        <div
          className="rounded-lg p-3 flex flex-col gap-2 border"
          style={{
            backgroundColor: 'var(--color-paper-2)',
            borderColor: 'var(--color-rule)',
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--color-ink)' }}>
              <Gauge className="w-3.5 h-3.5" style={{ color: 'var(--color-accent)' }} />
              <span>Tempo Scale</span>
            </div>
            <span className="text-xs font-mono font-bold" style={{ color: 'var(--color-accent)' }}>
              {currentTempoPct}%
            </span>
          </div>

          <input
            type="range"
            min="25"
            max="150"
            step="5"
            value={currentTempoPct}
            onChange={handleTempoSliderChange}
            aria-label="Tempo Scale"
            className="w-full h-1.5 rounded-lg cursor-pointer"
            style={{ accentColor: 'var(--color-accent)' }}
          />

          {/* Quick Preset Buttons */}
          <div className="flex items-center gap-1.5 pt-1">
            <span className="text-xs mr-1" style={{ color: 'var(--color-muted)' }}>Presets:</span>
            {TEMPO_PRESETS.map((preset) => {
              const presetPct = Math.round(preset * 100);
              const isActive = currentTempoPct === presetPct;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onTempoScaleChange(preset)}
                  className="flex-1 py-1 px-1.5 text-xs font-medium rounded border cursor-pointer transition"
                  style={{
                    backgroundColor: isActive ? 'var(--color-accent)' : 'var(--color-paper)',
                    borderColor: isActive ? 'var(--color-accent)' : 'var(--color-rule)',
                    color: isActive ? 'var(--color-accent-ink)' : 'var(--color-ink)',
                    fontWeight: isActive ? 600 : 500,
                  }}
                >
                  {presetPct}%
                </button>
              );
            })}
          </div>
        </div>

        {/* Count-In & Reference Drone Controls */}
        <div
          className="rounded-lg p-3 flex flex-col gap-3 justify-between border"
          style={{
            backgroundColor: 'var(--color-paper-2)',
            borderColor: 'var(--color-rule)',
          }}
        >
          {/* Count-in Selector */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: 'var(--color-ink)' }}>
              <Clock className="w-3.5 h-3.5" style={{ color: 'var(--color-accent)' }} />
              <span>Count-in Metronome</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onCountInBarsChange(1)}
                aria-label="1 Bar Count-in"
                className="py-1 px-2.5 text-xs rounded border cursor-pointer transition text-center"
                style={{
                  backgroundColor: countInBars === 1 ? 'var(--color-accent)' : 'var(--color-paper)',
                  borderColor: countInBars === 1 ? 'var(--color-accent)' : 'var(--color-rule)',
                  color: countInBars === 1 ? 'var(--color-accent-ink)' : 'var(--color-ink)',
                  fontWeight: countInBars === 1 ? 600 : 500,
                }}
              >
                1 Bar
              </button>
              <button
                type="button"
                onClick={() => onCountInBarsChange(2)}
                aria-label="2 Bars Count-in"
                className="py-1 px-2.5 text-xs rounded border cursor-pointer transition text-center"
                style={{
                  backgroundColor: countInBars === 2 ? 'var(--color-accent)' : 'var(--color-paper)',
                  borderColor: countInBars === 2 ? 'var(--color-accent)' : 'var(--color-rule)',
                  color: countInBars === 2 ? 'var(--color-accent-ink)' : 'var(--color-ink)',
                  fontWeight: countInBars === 2 ? 600 : 500,
                }}
              >
                2 Bars
              </button>
            </div>
          </div>

          {/* Reference Drone Toggle */}
          <div>
            <button
              type="button"
              onClick={handleDroneToggle}
              aria-label={mixer.droneActive ? 'Stop Drone' : 'Play Reference Drone'}
              className="w-full py-1.5 px-3 rounded text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-2 border"
              style={{
                backgroundColor: mixer.droneActive ? 'var(--color-accent)' : 'var(--color-paper)',
                borderColor: mixer.droneActive ? 'var(--color-accent)' : 'var(--color-rule)',
                color: mixer.droneActive ? 'var(--color-accent-ink)' : 'var(--color-ink)',
              }}
            >
              <Radio className={`w-3.5 h-3.5 ${mixer.droneActive ? 'animate-pulse' : ''}`} />
              <span>
                {mixer.droneActive
                  ? `Stop Drone${droneTargetNoteName ? ` (${droneTargetNoteName})` : ''}`
                  : `Play Reference Drone${droneTargetNoteName ? ` (${droneTargetNoteName})` : ''}`}
              </span>
            </button>
            {droneTargetNoteName && (
              <p className="text-[11px] text-center mt-1 font-mono" style={{ color: 'var(--color-muted)' }}>
                Target pitch: <span className="font-semibold" style={{ color: 'var(--color-ink)' }}>{droneTargetNoteName}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
