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

export interface UseLibrary {
  readonly state: LibraryState | 'loading';
  /** Add new scores to the library too (remembered on this device). */
  readonly autoUpload: boolean;
  readonly setAutoUpload: (on: boolean) => void;
  /** Reads the list again. */
  readonly refresh: () => Promise<void>;
  /** True when a piece with this file name is already in the library. */
  readonly has: (fileName: string) => boolean;
  /** Saves a file to the library unless a piece with the same name is already there. */
  readonly upload: (fileName: string, body: ArrayBuffer | string) => Promise<void>;
  readonly download: (name: string) => Promise<ArrayBuffer>;
  readonly remove: (name: string) => Promise<void>;
}

/** The shared library as seen from this device. Errors from upload / remove are thrown to the caller. */
export function useLibrary(): UseLibrary {
  const [state, setState] = useState<LibraryState | 'loading'>('loading');
  const [autoUpload, setAutoUploadState] = useState(loadAutoUpload);
  const alive = useRef(true);
  const stateRef = useRef(state);
  stateRef.current = state;

  const refresh = useCallback(async () => {
    const next = await fetchLibrary();
    if (alive.current) setState(next);
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
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

  const has = useCallback(
    (fileName: string) => {
      const s = stateRef.current;
      if (s === 'loading' || s.status !== 'available') return false;
      const key = libraryKey(fileName);
      return s.entries.some((e) => libraryKey(e.name) === key);
    },
    [],
  );

  const upload = useCallback(
    async (fileName: string, body: ArrayBuffer | string) => {
      if (has(fileName)) return;
      try {
        await uploadLibraryFile(sanitizeLibraryName(fileName), body);
      } catch (err) {
        if (err instanceof LibraryError && err.kind === 'signin') await refresh();
        throw err;
      }
      await refresh();
    },
    [has, refresh],
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
