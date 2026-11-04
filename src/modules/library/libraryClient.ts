/**
 * Client for the shared score library: a folder on the server (a mounted volume in the cluster)
 * that every device can list, read and add to. The server is plain nginx (see nginx/default.conf);
 * who may use it is decided in front of it by the login middleware, not here.
 */

export const LIBRARY_BASE = '/library/files/';
/** Same cap as the server (client_max_body_size), so a too-big file is refused before sending. */
export const MAX_LIBRARY_FILE_BYTES = 10 * 1024 * 1024;
/** Sent on writes. A page on another site cannot add it without a CORS preflight the server refuses. */
const WRITE_HEADER = { 'X-Violin-Library': '1' } as const;
const TIMEOUT_MS = 10_000;

export interface LibraryEntry {
  readonly name: string;
  readonly size: number;
  readonly modifiedAt: number;
}

export type LibraryState =
  /** The library answered with its list. */
  | { readonly status: 'available'; readonly entries: readonly LibraryEntry[] }
  /** This server has no library (dev server, a plain static host). Nothing is shown. */
  | { readonly status: 'unavailable' }
  /** The login middleware wants a session first. */
  | { readonly status: 'signin' }
  | { readonly status: 'error'; readonly message: string };

export type LibraryErrorKind = 'signin' | 'too-large' | 'rejected' | 'unavailable' | 'network' | 'http';

export class LibraryError extends Error {
  constructor(
    readonly kind: LibraryErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'LibraryError';
  }
}

type FetchLike = typeof fetch;

const ALLOWED_EXTENSIONS = ['.musicxml', '.mxl', '.xml'] as const;

/**
 * A file name the server accepts: letters, digits and . _ ( ) - only, a MusicXML extension,
 * at most 100 characters. Anything else becomes a dash.
 */
export function sanitizeLibraryName(fileName: string): string {
  const trimmed = fileName.trim();
  const dot = trimmed.lastIndexOf('.');
  const rawExt = dot > 0 ? trimmed.slice(dot).toLowerCase() : '';
  const ext = (ALLOWED_EXTENSIONS as readonly string[]).includes(rawExt) ? rawExt : '.musicxml';
  const rawBase = dot > 0 && rawExt === ext ? trimmed.slice(0, dot) : trimmed;
  let base = rawBase
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._()-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/[-._]+$/, '');
  if (!base) base = 'score';
  base = base.slice(0, 100 - ext.length);
  return `${base}${ext}`;
}

/** Name without its extension, lower case: two files with the same key are the same piece. */
export function libraryKey(fileName: string): string {
  return sanitizeLibraryName(fileName).replace(/\.[^.]+$/, '').toLowerCase();
}

function urlFor(name: string): string {
  return `${LIBRARY_BASE}${encodeURIComponent(name)}`;
}

async function request(input: string, init: RequestInit, fetchImpl: FetchLike): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetchImpl(input, {
      credentials: 'same-origin',
      // A login redirect points to another origin and cannot be followed by fetch. Seeing it as an
      // opaque redirect tells us "sign in", which a CORS error would not.
      redirect: 'manual',
      cache: 'no-store',
      signal: controller.signal,
      ...init,
    });
  } catch (err) {
    throw new LibraryError(
      'network',
      err instanceof DOMException && err.name === 'AbortError'
        ? 'The library took too long to answer.'
        : 'The library cannot be reached (offline?).',
    );
  } finally {
    clearTimeout(timer);
  }
}

function needsSignIn(res: Response): boolean {
  return res.type === 'opaqueredirect' || res.status === 0 || res.status === 401;
}

function failure(res: Response, what: string): LibraryError {
  if (needsSignIn(res)) return new LibraryError('signin', 'Sign in to use the library.');
  if (res.status === 413) return new LibraryError('too-large', 'The file is too big for the library (10 MB at most).');
  if (res.status === 403) return new LibraryError('rejected', `The library refused to ${what} (not allowed).`);
  if (res.status === 404) return new LibraryError('unavailable', 'This server has no library.');
  return new LibraryError('http', `The library could not ${what} (error ${res.status}).`);
}

function toEntries(json: unknown): LibraryEntry[] {
  if (!Array.isArray(json)) return [];
  const out: LibraryEntry[] = [];
  for (const item of json) {
    if (typeof item !== 'object' || item === null) continue;
    const e = item as Record<string, unknown>;
    if (e.type !== 'file' || typeof e.name !== 'string') continue;
    if (!(ALLOWED_EXTENSIONS as readonly string[]).some((ext) => (e.name as string).toLowerCase().endsWith(ext))) continue;
    const modified = typeof e.mtime === 'string' ? Date.parse(e.mtime) : NaN;
    out.push({
      name: e.name,
      size: typeof e.size === 'number' ? e.size : 0,
      modifiedAt: Number.isNaN(modified) ? 0 : modified,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Asks the server what is in the library, and in what state the library is. */
export async function fetchLibrary(fetchImpl: FetchLike = fetch): Promise<LibraryState> {
  let res: Response;
  try {
    res = await request(LIBRARY_BASE, { headers: { Accept: 'application/json' } }, fetchImpl);
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'The library cannot be reached.' };
  }
  if (needsSignIn(res)) return { status: 'signin' };
  if (res.status === 404) return { status: 'unavailable' };
  if (res.status === 403) return { status: 'error', message: 'Your account is not allowed to use the library.' };
  if (!res.ok) return { status: 'error', message: `The library answered with an error (${res.status}).` };
  // A dev server answers every path with the app itself (HTML): there is no library there
  if (!(res.headers.get('content-type') ?? '').includes('json')) return { status: 'unavailable' };
  try {
    return { status: 'available', entries: toEntries(await res.json()) };
  } catch {
    return { status: 'error', message: 'The library sent an answer that could not be read.' };
  }
}

export async function downloadLibraryFile(name: string, fetchImpl: FetchLike = fetch): Promise<ArrayBuffer> {
  const res = await request(urlFor(name), {}, fetchImpl);
  if (!res.ok) throw failure(res, 'send that file');
  return res.arrayBuffer();
}

export async function uploadLibraryFile(
  name: string,
  body: ArrayBuffer | string,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const size = typeof body === 'string' ? new Blob([body]).size : body.byteLength;
  if (size > MAX_LIBRARY_FILE_BYTES) {
    throw new LibraryError('too-large', 'The file is too big for the library (10 MB at most).');
  }
  const res = await request(urlFor(name), { method: 'PUT', headers: WRITE_HEADER, body }, fetchImpl);
  if (!res.ok) throw failure(res, 'save that file');
}

export async function deleteLibraryFile(name: string, fetchImpl: FetchLike = fetch): Promise<void> {
  const res = await request(urlFor(name), { method: 'DELETE', headers: WRITE_HEADER }, fetchImpl);
  if (!res.ok && res.status !== 404) throw failure(res, 'remove that file');
}
