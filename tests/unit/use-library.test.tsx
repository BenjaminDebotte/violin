import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLibrary } from '../../src/hooks/useLibrary';

const listing = (names: string[]) =>
  new Response(
    JSON.stringify(names.map((name) => ({ name, type: 'file', mtime: 'Wed, 04 Nov 2026 13:06:00 GMT', size: 2048 }))),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

describe('useLibrary', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('shows state "offline" when navigator.onLine is false, making no network calls, and refreshes when coming online', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLibrary());

    expect(result.current.state).toBe('offline');
    expect(fetchMock).not.toHaveBeenCalled();

    // Now come online
    vi.stubGlobal('navigator', { onLine: true });
    fetchMock.mockResolvedValue(listing(['twinkle.musicxml']));

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(result.current.state).toMatchObject({
        status: 'available',
        entries: [expect.objectContaining({ name: 'twinkle.musicxml' })],
      });
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it('switches to state "offline" when offline event fires', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(listing(['twinkle.musicxml'])));

    const { result } = renderHook(() => useLibrary());

    await waitFor(() => {
      expect(result.current.state).toMatchObject({ status: 'available' });
    });

    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current.state).toBe('offline');
  });

  it('discards older list responses that arrive after a newer one (ordered refresh)', async () => {
    vi.stubGlobal('navigator', { onLine: true });

    let resolve1!: (val: Response) => void;
    let resolve2!: (val: Response) => void;
    const p1 = new Promise<Response>((res) => { resolve1 = res; });
    const p2 = new Promise<Response>((res) => { resolve2 = res; });

    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => p1)
      .mockImplementationOnce(() => p2);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLibrary());
    expect(result.current.state).toBe('loading');

    // Trigger second refresh while first is still pending
    let refreshPromise!: Promise<void>;
    act(() => {
      refreshPromise = result.current.refresh();
    });

    // Resolve newer request (p2) first with 'newer.musicxml'
    await act(async () => {
      resolve2(listing(['newer.musicxml']));
      await refreshPromise;
    });

    expect(result.current.state).toMatchObject({
      status: 'available',
      entries: [expect.objectContaining({ name: 'newer.musicxml' })],
    });

    // Resolve older request (p1) later with 'older.musicxml'
    await act(async () => {
      resolve1(listing(['older.musicxml']));
    });

    // State must NOT be overwritten by the stale p1 response!
    expect(result.current.state).toMatchObject({
      status: 'available',
      entries: [expect.objectContaining({ name: 'newer.musicxml' })],
    });
  });

  it('upload() while loading waits for the in-flight list instead of assuming absent', async () => {
    vi.stubGlobal('navigator', { onLine: true });

    let resolveInitial!: () => void;
    const initialGate = new Promise<void>((res) => { resolveInitial = res; });

    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/library/files/' && (!init?.method || init.method === 'GET')) {
        return initialGate.then(() => listing(['twinkle.musicxml']));
      }
      return Promise.resolve(new Response(null, { status: 201 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLibrary());
    expect(result.current.state).toBe('loading');

    // Call upload while still loading
    let uploadPromise!: Promise<'uploaded' | 'exists'>;
    act(() => {
      uploadPromise = result.current.upload('twinkle.musicxml', '<score/>');
    });

    // Resolve initial list
    await act(async () => {
      resolveInitial();
    });

    const outcome = await uploadPromise;
    expect(outcome).toBe('exists');

    // Verify PUT was never called because the file was found in the waited-for list
    const putCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(putCalls.length).toBe(0);
  });

  it('upload() reads a fresh list and does not overwrite if the server already has the piece', async () => {
    vi.stubGlobal('navigator', { onLine: true });

    // Initial list is empty (stale device state)
    let serverHasPiece = false;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url === '/library/files/' && method === 'GET') {
        return Promise.resolve(listing(serverHasPiece ? ['minuet.mxl'] : []));
      }
      if (method === 'PUT') {
        return Promise.resolve(new Response(null, { status: 201 }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLibrary());

    await waitFor(() => {
      expect(result.current.state).toMatchObject({ status: 'available', entries: [] });
    });

    // Now another client uploads 'minuet.mxl' onto the server
    serverHasPiece = true;

    // Local device calls upload('Minuet.mxl')
    let outcome!: 'uploaded' | 'exists';
    await act(async () => {
      outcome = await result.current.upload('Minuet.mxl', 'bytes');
    });

    expect(outcome).toBe('exists');
    // PUT was never called
    const putCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(putCalls.length).toBe(0);
  });

  it('maps a 409 Conflict from the server to "exists" and refreshes the list', async () => {
    vi.stubGlobal('navigator', { onLine: true });

    let fetchCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url === '/library/files/' && method === 'GET') {
        fetchCount++;
        // Fresh list check doesn't have it yet (race condition)
        return Promise.resolve(listing(fetchCount > 2 ? ['concurrent.xml'] : []));
      }
      if (method === 'PUT') {
        // Server rejects with 409 Conflict
        return Promise.resolve(new Response('', { status: 409 }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLibrary());

    await waitFor(() => {
      expect(result.current.state).toMatchObject({ status: 'available' });
    });

    let outcome!: 'uploaded' | 'exists';
    await act(async () => {
      outcome = await result.current.upload('concurrent.xml', '<score/>');
    });

    expect(outcome).toBe('exists');
  });

  it('returns "uploaded" on a successful upload and refreshes the list', async () => {
    vi.stubGlobal('navigator', { onLine: true });

    let files: string[] = [];
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url === '/library/files/' && method === 'GET') {
        return Promise.resolve(listing(files));
      }
      if (method === 'PUT') {
        files.push('new-piece.musicxml');
        return Promise.resolve(new Response(null, { status: 201 }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLibrary());

    await waitFor(() => {
      expect(result.current.state).toMatchObject({ status: 'available', entries: [] });
    });

    let outcome!: 'uploaded' | 'exists';
    await act(async () => {
      outcome = await result.current.upload('new-piece.musicxml', '<score/>');
    });

    expect(outcome).toBe('uploaded');
    expect(result.current.state).toMatchObject({
      status: 'available',
      entries: [expect.objectContaining({ name: 'new-piece.musicxml' })],
    });
  });

  it('upload() when offline keeps state "offline" and makes 0 fetch calls', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLibrary());
    expect(result.current.state).toBe('offline');

    await act(async () => {
      await expect(result.current.upload('offline.musicxml', '<score/>')).rejects.toMatchObject({
        kind: 'network',
        message: 'Library unavailable offline.',
      });
    });

    expect(result.current.state).toBe('offline');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('upload() when server returns "unavailable" or "signin" does not send a PUT', async () => {
    vi.stubGlobal('navigator', { onLine: true });

    let mode: 'unavailable' | 'signin' = 'unavailable';
    const fetchMock = vi.fn().mockImplementation(() => {
      if (mode === 'unavailable') {
        return Promise.resolve(new Response('', { status: 404 }));
      }
      return Promise.resolve(new Response('', { status: 401 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLibrary());
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'unavailable' });
    });

    await act(async () => {
      await expect(result.current.upload('piece.musicxml', '<score/>')).rejects.toMatchObject({
        kind: 'unavailable',
      });
    });
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);

    mode = 'signin';
    await act(async () => {
      await expect(result.current.upload('piece.musicxml', '<score/>')).rejects.toMatchObject({
        kind: 'signin',
      });
    });
    expect(result.current.state).toEqual({ status: 'signin' });
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
  });

  it('remove() and download() receiving 401 transition hook state to { status: "signin" }', async () => {
    vi.stubGlobal('navigator', { onLine: true });

    let sessionExpired = false;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url === '/library/files/' && method === 'GET') {
        return Promise.resolve(
          sessionExpired ? new Response('', { status: 401 }) : listing(['a.musicxml']),
        );
      }
      return Promise.resolve(new Response('', { status: 401 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLibrary());
    await waitFor(() => {
      expect(result.current.state).toMatchObject({ status: 'available' });
    });

    sessionExpired = true;
    await act(async () => {
      await expect(result.current.remove('a.musicxml')).rejects.toMatchObject({ kind: 'signin' });
    });
    expect(result.current.state).toEqual({ status: 'signin' });

    // Reset back to available and verify download() also transitions to signin on 401
    sessionExpired = false;
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.state).toMatchObject({ status: 'available' });

    sessionExpired = true;
    await act(async () => {
      await expect(result.current.download('a.musicxml')).rejects.toMatchObject({ kind: 'signin' });
    });
    expect(result.current.state).toEqual({ status: 'signin' });
  });
});
