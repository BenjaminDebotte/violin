/**
 * Client for the shared score library: a folder on the server (a mounted volume in the cluster)
 * that every device can list, read and add to. The server is plain nginx (see nginx/default.conf);
 * who may use it is decided in front of it by the login middleware, not here.
 */

export const LIBRARY_BASE = '/library/files/';
/** Same cap as the server (client_max_body_size), so a too-big file is refused before sending. */
export const MAX_LIBRARY_FILE_BYTES = 5 * 1024 * 1024;
/** Sent on writes. A page on another site cannot add it without a CORS preflight the server refuses. */
const WRITE_HEADER = { 'X-Violin-Library': '1' } as const;
const LIST_TIMEOUT_MS = 10_000;
const DOWNLOAD_TIMEOUT_MS = 15_000;
const DELETE_TIMEOUT_MS = 10_000;

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

export type LibraryErrorKind = 'signin' | 'too-large' | 'rejected' | 'unavailable' | 'network' | 'http' | 'exists';

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
 * Server filename validation pattern mirror (matches nginx/default.conf $library_write_denied):
 * Total length 1-100 chars, starts with [A-Za-z0-9], characters in [A-Za-z0-9._()-], ends with lower-case extension.
 */
export const SERVER_NAME_PATTERN = /^(?=[A-Za-z0-9._()-]{1,100}$)[A-Za-z0-9][A-Za-z0-9._()-]*\.(musicxml|mxl|xml)$/;

/** Deterministic 32-bit FNV-1a hash formatted as 8 lowercase hex digits. */
function hashString(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * A file name the server accepts: letters, digits and . _ ( ) - only, a MusicXML extension,
 * at most 100 characters. Anything else becomes a dash. If nothing is left (e.g. non-Latin scripts),
 * falls back to score-<8 hex digits>.
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
  if (!base) {
    base = `score-${hashString(rawBase || trimmed || fileName)}`;
  }
  base = base.slice(0, 100 - ext.length).replace(/[-._]+$/, '');
  if (!base) {
    base = 'score';
  }
  return `${base}${ext}`;
}

/** Name without its extension, lower case: two files with the same key are the same piece. */
export function libraryKey(fileName: string): string {
  return sanitizeLibraryName(fileName).replace(/\.[^.]+$/, '').toLowerCase();
}

/** Upload timeout scaled by size: 10s + 1s per 100 KB. */
export function uploadTimeoutMs(sizeBytes: number): number {
  return 10_000 + Math.ceil(sizeBytes / (100 * 1024)) * 1_000;
}

function urlFor(name: string): string {
  return `${LIBRARY_BASE}${encodeURIComponent(name)}`;
}

async function request(
  input: string,
  init: RequestInit,
  fetchImpl: FetchLike,
  timeoutMs: number = LIST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
  if (res.status === 409) return new LibraryError('exists', 'This piece is already in the library.');
  if (res.status === 413) return new LibraryError('too-large', 'The file is too big for the library (5 MB at most).');
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
    if (!SERVER_NAME_PATTERN.test(e.name)) continue;
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
    res = await request(LIBRARY_BASE, { headers: { Accept: 'application/json' } }, fetchImpl, LIST_TIMEOUT_MS);
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
  const res = await request(urlFor(name), {}, fetchImpl, DOWNLOAD_TIMEOUT_MS);
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
    throw new LibraryError('too-large', 'The file is too big for the library (5 MB at most).');
  }
  const timeoutMs = uploadTimeoutMs(size);
  const res = await request(urlFor(name), { method: 'PUT', headers: WRITE_HEADER, body }, fetchImpl, timeoutMs);
  if (!res.ok) throw failure(res, 'save that file');
}

export async function deleteLibraryFile(name: string, fetchImpl: FetchLike = fetch): Promise<void> {
  const res = await request(urlFor(name), { method: 'DELETE', headers: WRITE_HEADER }, fetchImpl, DELETE_TIMEOUT_MS);
  if (!res.ok && res.status !== 404) throw failure(res, 'remove that file');
}
