import { useState } from 'react';
import { AlertTriangle, CloudDownload, Check, Trash2, LogIn, RefreshCw } from 'lucide-react';
import { libraryKey, type LibraryEntry } from '../../modules/library/libraryClient';
import type { UseLibrary } from '../../hooks/useLibrary';

export interface LibrarySectionProps {
  readonly library: UseLibrary;
  /** File names of the scores already on this device. */
  readonly localFileNames: readonly string[];
  /** Fetches a library file and keeps it on this device. */
  readonly onAdd: (entry: LibraryEntry) => Promise<void>;
}

function titleOf(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || name;
}

function sizeOf(bytes: number): string {
  return bytes < 1024 * 100 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const CARD = { backgroundColor: 'var(--plate)', border: '1px solid var(--rule)' } as const;

/**
 * Songs shared across devices. Hidden when the server has no library (dev server, plain static
 * host). Who may open it is decided by the login middleware in front of the server.
 */
export function LibrarySection({ library, localFileNames, onAdd }: LibrarySectionProps) {
  const { state } = library;
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (state === 'loading' || state === 'offline' || state.status === 'unavailable') return null;

  const run = async (name: string, action: () => Promise<void>) => {
    setMessage(null);
    setBusy(name);
    try {
      await action();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong with the library.');
    } finally {
      setBusy(null);
    }
  };

  const localKeys = new Set(localFileNames.map(libraryKey));

  return (
    <section aria-label="Shared library" data-testid="library-section">
      <h2 className="mt-6 mb-2 text-[15px] font-bold" style={{ color: 'var(--ink-2)' }}>
        Shared library
      </h2>

      {state.status === 'signin' && (
        <div className="p-4 rounded-[20px] space-y-3" style={CARD}>
          <p className="text-[15px] leading-snug">
            Sign in to see the scores you share between your devices.
          </p>
          <button
            type="button"
            onClick={() => window.location.assign('/library/')}
            className="min-h-11 px-4 rounded-full inline-flex items-center gap-2 text-[15px] font-bold cursor-pointer"
            style={{ backgroundColor: 'var(--ebony)', color: 'var(--bone)' }}
          >
            <LogIn className="w-4 h-4" aria-hidden />
            Sign in
          </button>
        </div>
      )}

      {state.status === 'error' && (
        <div role="status" className="p-4 rounded-[20px] space-y-3" style={CARD}>
          <p className="text-[15px] leading-snug flex gap-2" style={{ color: 'var(--ink-2)' }}>
            <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden />
            {state.message}
          </p>
          <button
            type="button"
            onClick={() => void library.refresh()}
            className="min-h-11 px-4 rounded-full inline-flex items-center gap-2 text-[15px] font-bold cursor-pointer"
            style={{ backgroundColor: 'var(--ebony)', color: 'var(--bone)' }}
          >
            <RefreshCw className="w-4 h-4" aria-hidden />
            Try again
          </button>
        </div>
      )}

      {state.status === 'available' && (
        <>
          {message && (
            <div
              role="alert"
              className="mb-2 p-3 rounded-[16px] flex gap-2 text-[15px] leading-snug"
              style={{ backgroundColor: '#fde8ee', color: '#7a1832' }}
            >
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />
              <p>{message}</p>
            </div>
          )}

          {state.entries.length > 0 ? (
            <ul className="space-y-2">
              {state.entries.map((entry) => {
                const onDevice = localKeys.has(libraryKey(entry.name));
                const working = busy === entry.name;
                return (
                  <li key={entry.name} className="flex items-stretch gap-1">
                    <div className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 rounded-[20px]" style={CARD}>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[17px] font-extrabold leading-tight break-words">
                          {titleOf(entry.name)}
                        </span>
                        <span className="block text-[14px] mt-0.5" style={{ color: 'var(--ink-2)' }}>
                          {sizeOf(entry.size)}
                        </span>
                      </span>
                      {onDevice ? (
                        <span
                          className="inline-flex items-center gap-1 text-[14px] font-bold shrink-0"
                          style={{ color: 'var(--tune)' }}
                        >
                          <Check className="w-4 h-4" aria-hidden />
                          On this device
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={working}
                          onClick={() => void run(entry.name, () => onAdd(entry))}
                          aria-label={`Add ${titleOf(entry.name)} to this device`}
                          className="min-h-11 px-3.5 rounded-full inline-flex items-center gap-1.5 text-[15px] font-bold shrink-0 cursor-pointer disabled:opacity-50"
                          style={{ backgroundColor: 'var(--ebony)', color: 'var(--bone)' }}
                        >
                          <CloudDownload className="w-4 h-4" aria-hidden />
                          {working ? 'Adding…' : 'Add'}
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => {
                        if (window.confirm(`Remove "${titleOf(entry.name)}" from the shared library? Copies on your devices stay.`)) {
                          void run(entry.name, () => library.remove(entry.name));
                        }
                      }}
                      aria-label={`Remove ${titleOf(entry.name)} from the library`}
                      className="w-12 shrink-0 rounded-[20px] flex items-center justify-center cursor-pointer disabled:opacity-50"
                      style={{ color: 'var(--sharp)' }}
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[15px]" style={{ color: 'var(--ink-2)' }}>
              Nothing here yet. Scores you add are kept here and show up on your other devices.
            </p>
          )}

          <label className="mt-3 flex items-center gap-3 min-h-11 text-[15px] cursor-pointer">
            <input
              type="checkbox"
              checked={library.autoUpload}
              onChange={(e) => library.setAutoUpload(e.target.checked)}
              className="w-5 h-5"
              style={{ accentColor: 'var(--ebony)' }}
            />
            Also save new scores to the library
          </label>
        </>
      )}
    </section>
  );
}
