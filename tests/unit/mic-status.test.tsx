import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MicErrorBanner, MicPill } from '../../src/components/play/MicStatus';
import { classifyMicError } from '../../src/modules/pitch-detection/micErrors';
import type { MicSessionManager } from '../../src/modules/pitch-detection/micSessionManager';

function setSecure(value: boolean) {
  Object.defineProperty(window, 'isSecureContext', { value, configurable: true });
}

describe('classifyMicError', () => {
  afterEach(() => setSecure(true));

  it('names an insecure origin (http on a LAN address) as the cause when mediaDevices is missing', () => {
    setSecure(false);
    const info = classifyMicError(new Error('navigator.mediaDevices.getUserMedia is not supported in this environment'));
    expect(info.kind).toBe('insecure');
    expect(info.retryable).toBe(false);
  });

  it('reports an unsupported browser when the page is secure', () => {
    setSecure(true);
    expect(classifyMicError(new Error('getUserMedia is not supported')).kind).toBe('unsupported');
  });

  it.each([
    ['NotAllowedError', 'denied'],
    ['NotFoundError', 'no-device'],
    ['NotReadableError', 'busy'],
  ])('maps %s to %s and allows a retry', (name, kind) => {
    const info = classifyMicError(Object.assign(new Error('x'), { name }));
    expect(info.kind).toBe(kind);
    expect(info.retryable).toBe(true);
  });

  it('falls back to a generic message', () => {
    expect(classifyMicError(new Error('boom')).kind).toBe('other');
  });
});

describe('MicErrorBanner', () => {
  it('explains the problem and offers Try again when a retry can help', () => {
    const onRetry = vi.fn();
    render(<MicErrorBanner error={classifyMicError(Object.assign(new Error('x'), { name: 'NotAllowedError' }))} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Microphone is blocked');
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('offers no retry for an insecure page', () => {
    setSecure(false);
    render(<MicErrorBanner error={classifyMicError(new Error('not supported'))} onRetry={vi.fn()} />);
    setSecure(true);
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });
});

function fakeMic(over: { rms?: number; ctxState?: string; running?: boolean } = {}) {
  return {
    isRunning: over.running ?? true,
    lastRawSample: { frequencyHz: 440, clarity: 0.95, rms: over.rms ?? 0, audioTimeSec: 0 },
    audioContext: { state: over.ctxState ?? 'running', resume: vi.fn() },
  } as unknown as MicSessionManager;
}

describe('MicPill', () => {
  it('stays idle before practice starts', () => {
    render(<MicPill isRunning={false} isPaused={false} hasError={false} micManager={fakeMic()} />);
    expect(screen.getByTestId('mic-pill')).toHaveAttribute('data-phase', 'idle');
  });

  it('shows Mic off when the microphone failed', () => {
    render(<MicPill isRunning isPaused={false} hasError micManager={fakeMic()} />);
    expect(screen.getByTestId('mic-pill')).toHaveTextContent('Mic off');
  });

  it('shows Listening and moves its bars when sound reaches the microphone', async () => {
    render(<MicPill isRunning isPaused={false} hasError={false} micManager={fakeMic({ rms: 0.2 })} />);
    await waitFor(() => expect(screen.getByTestId('mic-pill')).toHaveAttribute('data-phase', 'listening'));
    await waitFor(() => {
      const heights = Array.from(screen.getByTestId('mic-pill').querySelectorAll<HTMLElement>('span[style*="height"]')).map((b) =>
        parseFloat(b.style.height),
      );
      expect(Math.max(...heights)).toBeGreaterThan(50);
    });
  });

  it('asks the player to tap when the browser suspended audio', async () => {
    const mic = fakeMic({ ctxState: 'suspended' });
    render(<MicPill isRunning isPaused={false} hasError={false} micManager={mic} />);
    const pill = await screen.findByRole('button', { name: /audio is paused/i });
    fireEvent.click(pill);
    expect(mic.audioContext?.resume).toHaveBeenCalled();
  });
});
