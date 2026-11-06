import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  LibraryError,
  MAX_LIBRARY_FILE_BYTES,
  deleteLibraryFile,
  downloadLibraryFile,
  fetchLibrary,
  libraryKey,
  sanitizeLibraryName,
  uploadLibraryFile,
  uploadTimeoutMs,
} from '../../src/modules/library/libraryClient';

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });
const opaqueRedirect = () => ({ type: 'opaqueredirect', status: 0, ok: false, headers: new Headers() }) as unknown as Response;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('sanitizeLibraryName', () => {
  // Parse the server pattern directly out of nginx/default.conf ($library_write_denied)
  const conf = readFileSync('nginx/default.conf', 'utf8');
  const match = conf.match(/\(\?!.*?\/library\/files\/(.*?)\)" 1;/);
  if (!match) throw new Error('Could not parse server pattern from nginx/default.conf');
  // Convert PCRE \z to JS $ for regex matching
  const SERVER_PATTERN = new RegExp('^' + match[1].replace(/\\z/g, '$'));

  it('keeps the same pattern as the server', () => {
    expect(conf).toContain('(?=[A-Za-z0-9._()-]{1,100}\\z)[A-Za-z0-9][A-Za-z0-9._()-]{0,100}\\.(musicxml|mxl|xml)\\z');
  });

  it.each([
    ['Twinkle.musicxml', 'Twinkle.musicxml'],
    ['Bach – Minuet n°1.mxl', 'Bach-Minuet-n-1.mxl'],
    ['Étude  n°3 (copie).MXL', 'Etude-n-3-(copie).mxl'],
    ['../../etc/passwd.xml', 'etc-passwd.xml'],
    ['.hidden.xml', 'hidden.xml'],
    ['scan.pdf', 'scan.pdf.musicxml'],
    ['no-extension', 'no-extension.musicxml'],
  ])('turns %j into %j', (input, expected) => {
    expect(sanitizeLibraryName(input)).toBe(expected);
  });

  it('gives a non-Latin-only name a deterministic score-<8 hex> base, differing for different names', () => {
    const resJp = sanitizeLibraryName('日本語.musicxml');
    const resCn = sanitizeLibraryName('中国語.musicxml');
    expect(resJp).toMatch(/^score-[0-9a-f]{8}\.musicxml$/);
    expect(resCn).toMatch(/^score-[0-9a-f]{8}\.musicxml$/);
    expect(resJp).not.toBe(resCn);
    // Deterministic across calls
    expect(sanitizeLibraryName('日本語.musicxml')).toBe(resJp);
    expect(sanitizeLibraryName('')).toMatch(/^score-[0-9a-f]{8}\.musicxml$/);
  });

  it('always yields a name the server accepts, even for hostile or very long names', () => {
    for (const input of [
      'a'.repeat(300) + '.mxl',
      '  ..  ',
      '<script>.xml',
      'a/b\\c.xml',
      '%2e%2e.xml',
      'x.mxl.mxl',
      '日本語.musicxml',
      '',
    ]) {
      const sanitized = sanitizeLibraryName(input);
      expect(sanitized).toMatch(SERVER_PATTERN);
      expect(sanitized.length).toBeLessThanOrEqual(100);
    }
  });

  it('gives the same key to the same piece whatever its extension or case', () => {
    expect(libraryKey('Minuet.MXL')).toBe(libraryKey('minuet.musicxml'));
    expect(libraryKey('Minuet 1.mxl')).toBe(libraryKey('Minuet-1.xml'));
    expect(libraryKey('Minuet.mxl')).not.toBe(libraryKey('Gavotte.mxl'));
  });
});

describe('fetchLibrary', () => {
  it('lists only MusicXML files matching the server pattern, sorted, with their size and date', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json([
        { name: 'b.mxl', type: 'file', mtime: 'Wed, 04 Nov 2026 13:06:00 GMT', size: 2048 },
        { name: 'a.musicxml', type: 'file', mtime: 'Wed, 04 Nov 2026 13:00:00 GMT', size: 10 },
        { name: 'notes.txt', type: 'file', mtime: 'x', size: 1 },
        { name: 'sub', type: 'directory', mtime: 'x' },
        { name: 'invalid.pdf', type: 'file', mtime: 'x', size: 10 },
        { name: 'UPPER.XML', type: 'file', mtime: 'x', size: 10 },
        { name: '.hidden.xml', type: 'file', mtime: 'x', size: 10 },
        { name: 'a'.repeat(97) + '.xml', type: 'file', mtime: 'x', size: 10 }, // 101 chars
      ]),
    );
    const state = await fetchLibrary(fetchImpl);
    expect(state).toMatchObject({ status: 'available' });
    if (state.status !== 'available') throw new Error('unreachable');
    expect(state.entries.map((e) => e.name)).toEqual(['a.musicxml', 'b.mxl']);
    expect(state.entries[1]).toMatchObject({ size: 2048, modifiedAt: Date.parse('Wed, 04 Nov 2026 13:06:00 GMT') });
    expect(fetchImpl).toHaveBeenCalledWith(
      '/library/files/',
      expect.objectContaining({ credentials: 'same-origin', redirect: 'manual', cache: 'no-store' }),
    );
  });

  it('asks to sign in when the login middleware redirects or answers 401', async () => {
    expect(await fetchLibrary(vi.fn().mockResolvedValue(opaqueRedirect()))).toEqual({ status: 'signin' });
    expect(await fetchLibrary(vi.fn().mockResolvedValue(new Response('', { status: 401 })))).toEqual({ status: 'signin' });
  });

  it('is unavailable when the server has no library (404, or the dev server answering with the app)', async () => {
    expect(await fetchLibrary(vi.fn().mockResolvedValue(new Response('', { status: 404 })))).toEqual({ status: 'unavailable' });
    const html = new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } });
    expect(await fetchLibrary(vi.fn().mockResolvedValue(html))).toEqual({ status: 'unavailable' });
  });

  it('reports other failures without throwing', async () => {
    const forbidden = await fetchLibrary(vi.fn().mockResolvedValue(new Response('', { status: 403 })));
    expect(forbidden.status).toBe('error');
    const boom = await fetchLibrary(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(boom).toMatchObject({ status: 'error', message: expect.stringMatching(/cannot be reached/i) });
    const broken = await fetchLibrary(
      vi.fn().mockResolvedValue(new Response('{nope', { status: 200, headers: { 'content-type': 'application/json' } })),
    );
    expect(broken.status).toBe('error');
  });
});

describe('uploadLibraryFile / downloadLibraryFile / deleteLibraryFile', () => {
  it('enforces 5 MB limit constant', () => {
    expect(MAX_LIBRARY_FILE_BYTES).toBe(5 * 1024 * 1024);
  });

  it('sends the file with the write header, to an encoded URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    await uploadLibraryFile('Etude-n-3-(copie).mxl', 'data', fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/library/files/Etude-n-3-(copie).mxl');
    expect(init).toMatchObject({ method: 'PUT', headers: { 'X-Violin-Library': '1' }, body: 'data' });
  });

  it('refuses a 0-byte file before sending anything', async () => {
    const fetchImpl = vi.fn();
    await expect(uploadLibraryFile('empty.xml', '', fetchImpl)).rejects.toMatchObject({
      kind: 'rejected',
      message: 'The file is empty.',
    });
    await expect(uploadLibraryFile('empty.mxl', new ArrayBuffer(0), fetchImpl)).rejects.toMatchObject({
      kind: 'rejected',
      message: 'The file is empty.',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a too-big file (>5 MB) before sending anything', async () => {
    const fetchImpl = vi.fn();
    await expect(uploadLibraryFile('big.mxl', new ArrayBuffer(MAX_LIBRARY_FILE_BYTES + 1), fetchImpl)).rejects.toMatchObject({
      kind: 'too-large',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [409, 'exists'],
    [413, 'too-large'],
    [403, 'rejected'],
    [401, 'signin'],
    [404, 'unavailable'],
    [500, 'http'],
  ])('maps a %i answer to "%s"', async (status, kind) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status }));
    await expect(uploadLibraryFile('a.mxl', 'x', fetchImpl)).rejects.toMatchObject({ kind });
    await expect(downloadLibraryFile('a.mxl', fetchImpl)).rejects.toBeInstanceOf(LibraryError);
  });

  it('scales upload timeout by file size (10s + 1s per 100 KB)', async () => {
    expect(uploadTimeoutMs(0)).toBe(10_000);
    expect(uploadTimeoutMs(100 * 1024)).toBe(11_000);
    expect(uploadTimeoutMs(200 * 1024)).toBe(12_000);

    vi.useFakeTimers();
    try {
      let capturedSignal: AbortSignal | undefined;
      const fetchImpl = vi.fn().mockImplementation((_url, init: RequestInit) => {
        capturedSignal = init.signal as AbortSignal;
        return new Promise((_, reject) => {
          capturedSignal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          });
        });
      });

      const uploadPromise = uploadLibraryFile('a.mxl', new ArrayBuffer(200 * 1024), fetchImpl);
      const assertion = expect(uploadPromise).rejects.toMatchObject({
        kind: 'network',
        message: expect.stringMatching(/took too long/i),
      });

      expect(fetchImpl).toHaveBeenCalled();
      expect(capturedSignal?.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(11_999);
      expect(capturedSignal?.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(2);
      expect(capturedSignal?.aborted).toBe(true);

      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('turns a redirect to the login page into "signin"', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(opaqueRedirect());
    await expect(uploadLibraryFile('a.mxl', 'x', fetchImpl)).rejects.toMatchObject({ kind: 'signin' });
  });

  it('downloads the bytes', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    expect(new Uint8Array(await downloadLibraryFile('a.mxl', fetchImpl))).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('deletes with the write header and treats "already gone" as done', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    await expect(deleteLibraryFile('a.mxl', fetchImpl)).resolves.toBeUndefined();
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: 'DELETE', headers: { 'X-Violin-Library': '1' } });
  });

  it('reports an unreachable server as a network error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(deleteLibraryFile('a.mxl', fetchImpl)).rejects.toMatchObject({ kind: 'network' });
  });
});
