import { useEffect, useRef, useState } from 'react';
import { MicOff, Mic } from 'lucide-react';
import type { MicSessionManager } from '../../modules/pitch-detection/micSessionManager';
import type { MicErrorInfo } from '../../modules/pitch-detection/micErrors';

const BARS = 5;
/** Below this the room is just noise (about -40 dB). A bowed note is far above it. */
const SOUND_RMS = 0.01;
const QUIET_AFTER_MS = 5000;
const SHIFT_EVERY_MS = 70;

type Phase = 'idle' | 'listening' | 'quiet' | 'suspended';

/** -60 dB maps to 0 and -15 dB to 1, so the bars react to a quiet violin as well as a loud one. */
function levelFromRms(rms: number): number {
  if (!(rms > 0)) return 0;
  const db = 20 * Math.log10(rms);
  return Math.max(0, Math.min(1, (db + 60) / 45));
}

const LABEL: Record<Phase, string> = {
  idle: 'Mic idle',
  listening: 'Listening',
  quiet: 'Hearing nothing',
  suspended: 'Audio paused, tap',
};

export interface MicPillProps {
  readonly isRunning: boolean;
  readonly isPaused: boolean;
  readonly hasError: boolean;
  readonly micManager?: MicSessionManager;
}

/**
 * Proof that the phone is listening: a dot that breathes and bars that follow the sound
 * going into the microphone. Goes amber when nothing has been heard for a while (muted mic,
 * wrong input) or when the browser suspended audio (common on iOS after the app was hidden).
 * Bars are driven straight from the audio loop's last sample, without React renders.
 */
export function MicPill({ isRunning, isPaused, hasError, micManager }: MicPillProps) {
  const barRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [hearing, setHearing] = useState(false);

  useEffect(() => {
    const paint = (levels: readonly number[]) => {
      levels.forEach((level, i) => {
        const bar = barRefs.current[i];
        if (bar) bar.style.height = `${12 + 88 * level}%`;
      });
    };

    if (!isRunning || isPaused || hasError || !micManager) {
      setPhase('idle');
      setHearing(false);
      paint(new Array(BARS).fill(0));
      return;
    }

    const history: number[] = new Array(BARS).fill(0);
    let lastSoundAt = performance.now();
    let lastShiftAt = 0;
    let current: Phase = 'idle';
    let currentHearing = false;
    let raf = 0;

    const frame = (now: number) => {
      const sample = micManager.lastRawSample;
      const ctx = micManager.audioContext;
      const rms = sample?.rms ?? 0;
      const heard = rms >= SOUND_RMS;
      if (heard) lastSoundAt = now;

      let next: Phase;
      if (!micManager.isRunning) next = 'idle';
      else if (ctx && ctx.state !== 'running') next = 'suspended';
      else next = now - lastSoundAt > QUIET_AFTER_MS ? 'quiet' : 'listening';

      if (next !== current) {
        current = next;
        setPhase(next);
      }
      if (heard !== currentHearing) {
        currentHearing = heard;
        setHearing(heard);
      }
      if (now - lastShiftAt >= SHIFT_EVERY_MS) {
        lastShiftAt = now;
        history.shift();
        history.push(levelFromRms(rms));
        paint(history);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [isRunning, isPaused, hasError, micManager]);

  const live = phase === 'listening';
  const warn = phase === 'quiet' || phase === 'suspended';
  const dotColor = live ? 'var(--tune)' : warn ? 'var(--rosin)' : 'var(--muted)';
  const barColor = hearing ? 'var(--tune)' : warn ? 'var(--rosin)' : 'rgb(246 242 234 / 0.55)';

  const content = (
    <>
      <span
        aria-hidden
        className={`mic-dot h-2.5 w-2.5 rounded-full ${live ? 'mic-dot--live' : ''}`}
        style={{ backgroundColor: dotColor }}
      />
      <span aria-hidden className="flex h-5 w-[34px] items-center justify-between">
        {Array.from({ length: BARS }, (_, i) => (
          <span
            key={i}
            ref={(el) => {
              barRefs.current[i] = el;
            }}
            className="w-1 rounded-full"
            style={{ height: '12%', backgroundColor: barColor, transition: 'height 70ms linear' }}
          />
        ))}
      </span>
      <span className="text-[12px] font-bold leading-none">{hasError ? 'Mic off' : LABEL[phase]}</span>
    </>
  );

  const className =
    'inline-flex min-h-8 items-center gap-2 rounded-full px-3 text-[color:var(--bone)] shadow-sm';
  const style = { backgroundColor: 'rgb(34 29 25 / 0.88)' };

  if (phase === 'suspended') {
    return (
      <button
        type="button"
        data-testid="mic-pill"
        data-phase={phase}
        aria-label="Audio is paused. Tap to resume listening"
        onClick={() => void micManager?.audioContext?.resume()}
        className={`${className} cursor-pointer`}
        style={style}
      >
        {content}
      </button>
    );
  }
  return (
    <div
      data-testid="mic-pill"
      data-phase={phase}
      role="status"
      aria-label={`Microphone: ${hasError ? 'off' : LABEL[phase]}`}
      className={className}
      style={style}
    >
      {content}
    </div>
  );
}

export interface MicErrorBannerProps {
  readonly error: MicErrorInfo;
  readonly onRetry?: () => void;
}

/** Shown instead of silently carrying on when the microphone could not start. */
export function MicErrorBanner({ error, onRetry }: MicErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-[20px] px-3.5 py-2.5"
      style={{ backgroundColor: '#a81f45', color: '#ffffff' }}
    >
      <MicOff className="h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-[14px] font-bold leading-snug">{error.title}</p>
        <p className="text-[13px] leading-snug">
          {error.detail}
        </p>
      </div>
      {error.retryable && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[15px] font-bold"
          style={{ backgroundColor: 'var(--bone)', color: 'var(--ink)' }}
        >
          <Mic className="h-4 w-4" aria-hidden />
          Try again
        </button>
      )}
    </div>
  );
}
