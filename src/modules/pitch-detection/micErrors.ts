export type MicErrorKind = 'insecure' | 'denied' | 'no-device' | 'busy' | 'unsupported' | 'other';

export interface MicErrorInfo {
  readonly kind: MicErrorKind;
  /** One short line, shown in the banner. */
  readonly title: string;
  /** What to do about it. */
  readonly detail: string;
  /** Whether trying again can help without leaving the page. */
  readonly retryable: boolean;
}

function isInsecureOrigin(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext === false;
}

/**
 * Turns whatever getUserMedia (or our own guard) threw into something a player can act on.
 * Browsers only expose the microphone on https:// pages and on localhost, so opening the dev
 * server through a LAN address such as http://192.168.x.x from a phone ends up as `insecure`.
 */
export function classifyMicError(err: unknown): MicErrorInfo {
  const name = err instanceof Error || (typeof err === 'object' && err !== null && 'name' in err) ? String((err as { name?: unknown }).name) : '';
  const message = err instanceof Error ? err.message : '';

  if (/not supported/i.test(message) || name === 'TypeError') {
    if (isInsecureOrigin()) {
      return {
        kind: 'insecure',
        title: "Mic blocked: this page isn't https",
        detail: 'Browsers only allow the microphone on https:// pages or localhost. Open the app over https.',
        retryable: false,
      };
    }
    return {
      kind: 'unsupported',
      title: "This browser can't use the microphone",
      detail: 'Try a recent Chrome, Edge, Firefox or Safari.',
      retryable: false,
    };
  }
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return {
      kind: 'denied',
      title: 'Microphone is blocked',
      detail: 'Allow the microphone for this site in your browser settings.',
      retryable: true,
    };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') {
    return {
      kind: 'no-device',
      title: 'No microphone found',
      detail: 'Plug one in or pick another input in Settings.',
      retryable: true,
    };
  }
  if (name === 'NotReadableError' || name === 'AbortError' || name === 'TrackStartError') {
    return {
      kind: 'busy',
      title: 'The microphone is busy',
      detail: 'Another app or tab may be using it. Close it first.',
      retryable: true,
    };
  }
  return {
    kind: 'other',
    title: "Couldn't start the microphone",
    detail: message || 'Try again.',
    retryable: true,
  };
}
