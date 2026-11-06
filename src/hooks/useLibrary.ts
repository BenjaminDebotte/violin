import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LibraryError,
  deleteLibraryFile,
  downloadLibraryFile,
  fetchLibrary,
  libraryKey,
  sanitizeLibraryName,
  uploadLibraryFile,
  type LibraryState,
} from '../modules/library/libraryClient';

const AUTO_UPLOAD_KEY = 'violin-coach:library-autoupload';

function loadAutoUpload(): boolean {
  try {
    return globalThis.localStorage?.getItem(AUTO_UPLOAD_KEY) !== 'off';
  } catch {
    return true;
  }
}

export type UploadOutcome = 'uploaded' | 'exists';

export interface UseLibrary {
  readonly state: LibraryState | 'loading' | 'offline';
  /** Add new scores to the library too (remembered on this device). */
  readonly autoUpload: boolean;
  readonly setAutoUpload: (on: boolean) => void;
  /** Reads the list again. */
  readonly refresh: () => Promise<void>;
  /** True when a piece with this file name is already in the library. */
  readonly has: (fileName: string) => boolean;
  /** Saves a file to the library unless a piece with the same name is already there. */
  readonly upload: (fileName: string, body: ArrayBuffer | string) => Promise<UploadOutcome>;
  readonly download: (name: string) => Promise<ArrayBuffer>;
  readonly remove: (name: string) => Promise<void>;
}

/** The shared library as seen from this device. Errors from upload / remove are thrown to the caller. */
export function useLibrary(fetchLibraryImpl: typeof fetchLibrary = fetchLibrary): UseLibrary {
  const isInitiallyOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const [state, setState] = useState<LibraryState | 'loading' | 'offline'>(
    isInitiallyOffline ? 'offline' : 'loading',
  );
  const [autoUpload, setAutoUploadState] = useState(loadAutoUpload);
  const alive = useRef(true);
  const stateRef = useRef(state);
  stateRef.current = state;

  const refreshSeq = useRef(0);
  const inFlightList = useRef<Promise<LibraryState> | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      if (alive.current) setState('offline');
      return;
    }
    const seq = ++refreshSeq.current;
    const p = fetchLibraryImpl();
    inFlightList.current = p;
    try {
      const next = await p;
      if (alive.current && seq === refreshSeq.current) {
        setState(next);
      }
    } finally {
      if (inFlightList.current === p) {
        inFlightList.current = null;
      }
    }
  }, [fetchLibraryImpl]);

  useEffect(() => {
    alive.current = true;
    const handleOnline = () => {
      void refresh();
    };
    const handleOffline = () => {
      if (alive.current) setState('offline');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setState('offline');
    } else {
      void refresh();
    }

    return () => {
      alive.current = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refresh]);

  const setAutoUpload = useCallback((on: boolean) => {
    setAutoUploadState(on);
    try {
      globalThis.localStorage?.setItem(AUTO_UPLOAD_KEY, on ? 'on' : 'off');
    } catch {
      /* best effort */
    }
  }, []);

  const has = useCallback((fileName: string) => {
    const s = stateRef.current;
    if (typeof s === 'string' || s.status !== 'available') return false;
    const key = libraryKey(fileName);
    return s.entries.some((e) => libraryKey(e.name) === key);
  }, []);

  const upload = useCallback(
    async (fileName: string, body: ArrayBuffer | string): Promise<UploadOutcome> => {
      // If currently loading, wait for the in-flight list to finish instead of assuming absent
      if (stateRef.current === 'loading' && inFlightList.current) {
        await inFlightList.current;
      }

      // Always read a fresh list before uploading (Rule 2: never trust a stale list)
      const freshSeq = ++refreshSeq.current;
      const freshList = await fetchLibraryImpl();
      if (alive.current && freshSeq === refreshSeq.current) {
        setState(freshList);
      }

      if (freshList.status === 'available') {
        const targetKey = libraryKey(fileName);
        if (freshList.entries.some((e) => libraryKey(e.name) === targetKey)) {
          return 'exists';
        }
      }

      try {
        await uploadLibraryFile(sanitizeLibraryName(fileName), body);
      } catch (err) {
        if (err instanceof LibraryError) {
          if (err.kind === 'exists') {
            await refresh();
            return 'exists';
          }
          if (err.kind === 'signin') {
            await refresh();
          }
        }
        throw err;
      }
      await refresh();
      return 'uploaded';
    },
    [fetchLibraryImpl, refresh],
  );

  const remove = useCallback(
    async (name: string) => {
      await deleteLibraryFile(name);
      await refresh();
    },
    [refresh],
  );

  return { state, autoUpload, setAutoUpload, refresh, has, upload, download: downloadLibraryFile, remove };
}
