import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { SongsPage } from '../../src/pages/SongsPage';
import { resetInMemoryScoreStore, listStoredScores } from '../../src/modules/score-engine/scoreStore';
import { TWINKLE_MUSICXML } from '../../src/modules/score-engine/demoScores';

const LIST_URL = '/library/files/';
const listing = (names: string[]) =>
  new Response(
    JSON.stringify(names.map((name) => ({ name, type: 'file', mtime: 'Wed, 04 Nov 2026 13:06:00 GMT', size: 2048 }))),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

interface Server {
  files: Map<string, string>;
  puts: Array<{ url: string; headers: Record<string, string>; body: unknown }>;
  mode: 'ok' | 'signin' | 'none' | 'down';
}

function installServer(initial: Record<string, string> = {}): Server {
  const server: Server = { files: new Map(Object.entries(initial)), puts: [], mode: 'ok' };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      if (server.mode === 'down') throw new TypeError('Failed to fetch');
      if (server.mode === 'signin') return { type: 'opaqueredirect', status: 0, ok: false, headers: new Headers() } as unknown as Response;
      if (server.mode === 'none') return new Response('', { status: 404 });
      const method = init.method ?? 'GET';
      if (input === LIST_URL) return listing([...server.files.keys()]);
      const name = decodeURIComponent(input.slice(LIST_URL.length));
      if (method === 'PUT') {
        server.puts.push({ url: input, headers: init.headers as Record<string, string>, body: init.body });
        server.files.set(name, typeof init.body === 'string' ? init.body : 'binary');
        return new Response(null, { status: 201 });
      }
      if (method === 'DELETE') {
        server.files.delete(name);
        return new Response(null, { status: 204 });
      }
      const file = server.files.get(name);
      return file === undefined ? new Response('', { status: 404 }) : new Response(file);
    }),
  );
  return server;
}

const renderPage = (onPlayScore = vi.fn()) => ({ onPlayScore, ...render(<SongsPage currentScoreId="twinkle" onPlayScore={onPlayScore} />) });

beforeEach(() => {
  resetInMemoryScoreStore();
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('Shared library on the Songs page', () => {
  it('lists the library and adds a piece to this device, focusing the heading', async () => {
    installServer({ 'Twinkle-Copy.musicxml': TWINKLE_MUSICXML });
    renderPage();

    const library = await screen.findByTestId('library-section');
    expect(within(library).getByText('Twinkle Copy')).toBeInTheDocument();

    fireEvent.click(within(library).getByRole('button', { name: /add twinkle copy to this device/i }));
    await waitFor(() => expect(within(library).getByText('On this device')).toBeInTheDocument());
    expect((await listStoredScores()).some((s) => s.fileName === 'Twinkle-Copy.musicxml')).toBe(true);
    expect(document.activeElement).toBe(within(library).getByRole('heading', { name: /shared library/i }));
  });

  it('removes a piece from the library after confirming, keeping device copies and focusing heading', async () => {
    const server = installServer({ 'a.musicxml': TWINKLE_MUSICXML });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    const library = await screen.findByTestId('library-section');

    const removeBtn = within(library).getByRole('button', { name: /remove a from the library/i });
    expect(removeBtn.getAttribute('aria-label')).toBe('Remove a from the library');

    fireEvent.click(removeBtn);
    await waitFor(() => expect(server.files.size).toBe(0));
    expect(await within(library).findByText(/nothing here yet/i)).toBeInTheDocument();
    expect(document.activeElement).toBe(within(library).getByRole('heading', { name: /shared library/i }));
  });

  it('shows an admin-only message when DELETE returns 403', async () => {
    installServer({ 'protected.musicxml': TWINKLE_MUSICXML });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    // Mock DELETE returning 403
    vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      if (input === LIST_URL) return listing(['protected.musicxml']);
      if (method === 'DELETE') return new Response('', { status: 403 });
      return new Response(TWINKLE_MUSICXML);
    }));

    renderPage();
    const library = await screen.findByTestId('library-section');
    fireEvent.click(within(library).getByRole('button', { name: /remove protected from the library/i }));

    expect(await within(library).findByText(/writing to the library is for administrators/i)).toBeInTheDocument();
  });

  it('renders muted line when offline, without showing an error card', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    installServer();
    renderPage();

    const library = await screen.findByTestId('library-section');
    expect(within(library).getByText(/library unavailable offline/i)).toBeInTheDocument();
    expect(within(library).queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not remove anything when the player cancels', async () => {
    const server = installServer({ 'a.musicxml': TWINKLE_MUSICXML });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    const library = await screen.findByTestId('library-section');
    fireEvent.click(within(library).getByRole('button', { name: /remove a from the library/i }));
    expect(server.files.size).toBe(1);
  });

  it('saves a newly imported score to the library under a safe name', async () => {
    const server = installServer();
    const { onPlayScore } = renderPage();
    await screen.findByTestId('library-section');

    const file = new File([TWINKLE_MUSICXML], 'Étude n°3.musicxml', { type: 'application/xml' });
    fireEvent.change(screen.getByTestId('score-file-input'), { target: { files: [file] } });

    await waitFor(() => expect(onPlayScore).toHaveBeenCalled());
    await waitFor(() => expect(server.puts).toHaveLength(1));
    expect(server.puts[0].url).toBe('/library/files/Etude-n-3.musicxml');
    expect(server.puts[0].headers).toMatchObject({ 'X-Violin-Library': '1' });
  });

  it('keeps new scores on the device only when "also save" is switched off', async () => {
    const server = installServer();
    const { onPlayScore } = renderPage();
    const library = await screen.findByTestId('library-section');
    fireEvent.click(within(library).getByRole('checkbox', { name: /also save new scores/i }));

    const file = new File([TWINKLE_MUSICXML], 'local.musicxml');
    fireEvent.change(screen.getByTestId('score-file-input'), { target: { files: [file] } });
    await waitFor(() => expect(onPlayScore).toHaveBeenCalled());
    expect(server.puts).toHaveLength(0);
    localStorage.removeItem('violin-coach:library-autoupload');
  });

  it('does not upload a piece that is already in the library', async () => {
    const server = installServer({ 'twinkle-again.musicxml': TWINKLE_MUSICXML });
    const { onPlayScore } = renderPage();
    await screen.findByTestId('library-section');

    const file = new File([TWINKLE_MUSICXML], 'Twinkle again.musicxml');
    fireEvent.change(screen.getByTestId('score-file-input'), { target: { files: [file] } });
    await waitFor(() => expect(onPlayScore).toHaveBeenCalled());
    expect(server.puts).toHaveLength(0);
  });

  it('offers to send a device-only score to the library with "Only on this device" badge, and then stops offering it (A9)', async () => {
    localStorage.setItem('violin-coach:library-autoupload', 'off');
    const server = installServer();
    const { onPlayScore } = renderPage();
    await screen.findByTestId('library-section');

    const file = new File([TWINKLE_MUSICXML], 'Only here.musicxml');
    fireEvent.change(screen.getByTestId('score-file-input'), { target: { files: [file] } });
    await waitFor(() => expect(onPlayScore).toHaveBeenCalled());
    expect(server.puts).toHaveLength(0);

    // Verify "Only on this device" badge is rendered
    expect(screen.getByText('Only on this device')).toBeInTheDocument();

    const send = await screen.findByRole('button', { name: /to the shared library/i });
    fireEvent.click(send);
    await waitFor(() => expect(server.puts).toHaveLength(1));
    expect(server.puts[0].url).toBe('/library/files/Only-here.musicxml');
    expect(server.puts[0].body).toBe(TWINKLE_MUSICXML);

    // After save succeeds, badge and button disappear
    await waitFor(() => expect(screen.queryByRole('button', { name: /to the shared library/i })).not.toBeInTheDocument());
    expect(screen.queryByText('Only on this device')).not.toBeInTheDocument();
    localStorage.removeItem('violin-coach:library-autoupload');
  });

  it('prevents double sending on double click and displays error next to the row', async () => {
    localStorage.setItem('violin-coach:library-autoupload', 'off');
    const server = installServer();
    // Simulate slow / failing upload
    vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      if (input === LIST_URL) return listing([]);
      if (method === 'PUT') {
        server.puts.push({ url: input, headers: init.headers as Record<string, string>, body: init.body });
        return new Response('', { status: 403 });
      }
      return new Response('', { status: 404 });
    }));

    const { onPlayScore } = renderPage();
    await screen.findByTestId('library-section');

    const file = new File([TWINKLE_MUSICXML], 'Double tap.musicxml');
    fireEvent.change(screen.getByTestId('score-file-input'), { target: { files: [file] } });
    await waitFor(() => expect(onPlayScore).toHaveBeenCalled());

    const send = await screen.findByRole('button', { name: /to the shared library/i });
    // Double click rapidly
    fireEvent.click(send);
    fireEvent.click(send);

    // Only one PUT was sent
    await waitFor(() => expect(server.puts).toHaveLength(1));

    // Error message shows next to the row and at top of page
    const errs = await screen.findAllByText(/writing to the library is for administrators/i);
    expect(errs.length).toBeGreaterThanOrEqual(2);
    localStorage.removeItem('violin-coach:library-autoupload');
  });

  it('second import of the same name does not overwrite and displays "already in the library" (A8)', async () => {
    const server = installServer({ 'Twinkle.musicxml': TWINKLE_MUSICXML });
    const { onPlayScore } = renderPage();
    await screen.findByTestId('library-section');

    const file = new File([TWINKLE_MUSICXML], 'Twinkle.musicxml');
    fireEvent.change(screen.getByTestId('score-file-input'), { target: { files: [file] } });
    await waitFor(() => expect(onPlayScore).toHaveBeenCalled());

    expect(server.puts).toHaveLength(0);
    expect(await screen.findByText(/already in the library/i)).toBeInTheDocument();
  });

  it('uploads .mxl binary byte-for-byte and round trips back to device', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file(
      'META-INF/container.xml',
      `<?xml version="1.0"?><container><rootfiles><rootfile full-path="music.xml"/></rootfiles></container>`,
    );
    zip.file('music.xml', TWINKLE_MUSICXML);
    const mxlBytes = await zip.generateAsync({ type: 'uint8array' });

    const server = installServer();
    const { onPlayScore } = renderPage();
    await screen.findByTestId('library-section');

    const file = new File([mxlBytes], 'binary-score.mxl', { type: 'application/vnd.recordare.musicxml' });
    fireEvent.change(screen.getByTestId('score-file-input'), { target: { files: [file] } });
    await waitFor(() => expect(onPlayScore).toHaveBeenCalled());

    await waitFor(() => expect(server.puts).toHaveLength(1));
    expect(server.puts[0].url).toBe('/library/files/binary-score.mxl');

    // Verify bytes preserved
    const uploadedBytes = new Uint8Array(server.puts[0].body as ArrayBuffer);
    expect(uploadedBytes).toEqual(mxlBytes);
  });

  it('shows a Sign in button when the login middleware wants a session', async () => {
    const server = installServer();
    server.mode = 'signin';
    renderPage();
    const library = await screen.findByTestId('library-section');
    expect(within(library).getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows nothing when the server has no library', async () => {
    const server = installServer();
    server.mode = 'none';
    renderPage();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByTestId('library-section')).not.toBeInTheDocument();
  });

  it('says so, and lets the player try again, when the library cannot be reached', async () => {
    const server = installServer();
    server.mode = 'down';
    renderPage();
    const library = await screen.findByTestId('library-section');
    expect(within(library).getByText(/cannot be reached/i)).toBeInTheDocument();

    server.mode = 'ok';
    fireEvent.click(within(library).getByRole('button', { name: /try again/i }));
    expect(await within(library).findByText(/nothing here yet/i)).toBeInTheDocument();
  });
});
