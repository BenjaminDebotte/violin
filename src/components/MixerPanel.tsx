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
      className={`bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5 text-zinc-100 shadow-xl flex flex-col gap-5 ${className}`}
      data-testid="mixer-panel"
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-emerald-400" />
          <h2 className="font-semibold text-base sm:text-lg tracking-wide">Mixer & Tempo Controls</h2>
        </div>
      </div>

      {/* 3-Channel Volume & Mute Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Solo Violin Channel */}
        <div className="bg-zinc-800/70 border border-zinc-700/60 rounded-lg p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-emerald-400">Solo Violin</span>
            <button
              type="button"
              onClick={handleSoloMuteToggle}
              aria-label={mixer.soloMuted ? 'Unmute Solo Violin' : 'Mute Solo Violin'}
              className={`p-1.5 rounded transition-colors text-xs flex items-center gap-1 font-medium ${
                mixer.soloMuted
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
                  : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
              }`}
            >
              {mixer.soloMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              {mixer.soloMuted ? 'Muted' : 'Mute'}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(mixer.soloVolume * 100)}
              onChange={handleSoloVolumeChange}
              aria-label="Solo Violin Volume"
              disabled={mixer.soloMuted}
              className="w-full accent-emerald-500 h-1.5 bg-zinc-700 rounded-lg cursor-pointer disabled:opacity-40"
            />
            <span className="text-xs font-mono w-10 text-right text-zinc-400">
              {mixer.soloMuted ? '0%' : `${Math.round(mixer.soloVolume * 100)}%`}
            </span>
          </div>
        </div>

        {/* Accompaniment Channel */}
        <div className="bg-zinc-800/70 border border-zinc-700/60 rounded-lg p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-400">Accompaniment</span>
            <button
              type="button"
              onClick={handleAccompanimentMuteToggle}
              aria-label={mixer.accompanimentMuted ? 'Unmute Accompaniment' : 'Mute Accompaniment'}
              className={`p-1.5 rounded transition-colors text-xs flex items-center gap-1 font-medium ${
                mixer.accompanimentMuted
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
                  : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
              }`}
            >
              {mixer.accompanimentMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              {mixer.accompanimentMuted ? 'Muted' : 'Mute'}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(mixer.accompanimentVolume * 100)}
              onChange={handleAccompanimentVolumeChange}
              aria-label="Accompaniment Volume"
              disabled={mixer.accompanimentMuted}
              className="w-full accent-blue-500 h-1.5 bg-zinc-700 rounded-lg cursor-pointer disabled:opacity-40"
            />
            <span className="text-xs font-mono w-10 text-right text-zinc-400">
              {mixer.accompanimentMuted ? '0%' : `${Math.round(mixer.accompanimentVolume * 100)}%`}
            </span>
          </div>
        </div>

        {/* Metronome Channel */}
        <div className="bg-zinc-800/70 border border-zinc-700/60 rounded-lg p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-amber-400">Metronome</span>
            <button
              type="button"
              onClick={handleMetronomeMuteToggle}
              aria-label={mixer.metronomeMuted ? 'Unmute Metronome' : 'Mute Metronome'}
              className={`p-1.5 rounded transition-colors text-xs flex items-center gap-1 font-medium ${
                mixer.metronomeMuted
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
                  : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
              }`}
            >
              {mixer.metronomeMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              {mixer.metronomeMuted ? 'Muted' : 'Mute'}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(mixer.metronomeVolume * 100)}
              onChange={handleMetronomeVolumeChange}
              aria-label="Metronome Volume"
              disabled={mixer.metronomeMuted}
              className="w-full accent-amber-500 h-1.5 bg-zinc-700 rounded-lg cursor-pointer disabled:opacity-40"
            />
            <span className="text-xs font-mono w-10 text-right text-zinc-400">
              {mixer.metronomeMuted ? '0%' : `${Math.round(mixer.metronomeVolume * 100)}%`}
            </span>
          </div>
        </div>
      </div>

      {/* Tempo & Count-In Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
        {/* Tempo Scaling Controls */}
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-zinc-300">
              <Gauge className="w-4 h-4 text-emerald-400" />
              <span>Tempo Scale</span>
            </div>
            <span className="text-sm font-mono font-semibold text-emerald-400">
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
            className="w-full accent-emerald-500 h-1.5 bg-zinc-700 rounded-lg cursor-pointer"
          />

          {/* Quick Preset Buttons */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs text-zinc-400 mr-1">Presets:</span>
            {TEMPO_PRESETS.map((preset) => {
              const presetPct = Math.round(preset * 100);
              const isActive = currentTempoPct === presetPct;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onTempoScaleChange(preset)}
                  className={`flex-1 py-1 px-2 text-xs font-medium rounded transition-colors ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow'
                      : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
                  }`}
                >
                  {presetPct}%
                </button>
              );
            })}
          </div>
        </div>

        {/* Count-In & Reference Drone Controls */}
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 flex flex-col gap-3 justify-between">
          {/* Count-in Selector */}
          <div>
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-zinc-300 mb-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>Count-in Metronome</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onCountInBarsChange(1)}
                aria-label="1 Bar Count-in"
                className={`py-1.5 px-3 text-xs font-medium rounded transition-colors text-center ${
                  countInBars === 1
                    ? 'bg-amber-600 text-white shadow font-semibold'
                    : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
                }`}
              >
                1 Bar
              </button>
              <button
                type="button"
                onClick={() => onCountInBarsChange(2)}
                aria-label="2 Bars Count-in"
                className={`py-1.5 px-3 text-xs font-medium rounded transition-colors text-center ${
                  countInBars === 2
                    ? 'bg-amber-600 text-white shadow font-semibold'
                    : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
                }`}
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
              className={`w-full py-2 px-3 rounded-lg text-xs sm:text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                mixer.droneActive
                  ? 'bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold shadow-lg shadow-amber-500/20'
                  : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200'
              }`}
            >
              <Radio className={`w-4 h-4 ${mixer.droneActive ? 'animate-pulse text-zinc-950' : 'text-zinc-400'}`} />
              <span>
                {mixer.droneActive
                  ? `Stop Drone${droneTargetNoteName ? ` (${droneTargetNoteName})` : ''}`
                  : `Play Reference Drone${droneTargetNoteName ? ` (${droneTargetNoteName})` : ''}`}
              </span>
            </button>
            {droneTargetNoteName && (
              <p className="text-[11px] text-zinc-400 text-center mt-1">
                Target pitch: <span className="text-zinc-200 font-mono font-medium">{droneTargetNoteName}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
