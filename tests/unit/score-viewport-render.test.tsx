import { describe, it, expect, vi } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';

const SVG_NS = 'http://www.w3.org/2000/svg';

// A tiny OSMD stand-in: render() rebuilds an SVG with fresh, untagged note groups, exactly the
// behaviour of the real library that used to drop tags and colours.
vi.mock('opensheetmusicdisplay', () => {
  const instances: FakeOsmd[] = [];
  class FakeOsmd {
    container: HTMLElement;
    options: Record<string, unknown>;
    EngravingRules = { RenderSingleHorizontalStaffline: false };
    zoom = 1;
    AutoResizeEnabled = true;
    FollowCursor = true;
    renders = 0;
    private groups: SVGGElement[] = [];
    step = 0;
    Sheet = { Instruments: [{}] };
    cursor = {
      show: () => {},
      update: () => {},
      reset: () => {
        this.step = 0;
      },
      next: () => {
        this.step++;
      },
      iterator: { EndReached: false },
      cursorElement: null,
      GNotesUnderCursor: () => [this.gNote(this.step)],
    };
    constructor(container: HTMLElement, options: Record<string, unknown> = {}) {
      this.container = container;
      this.options = options;
      instances.push(this);
    }
    private gNote(i: number) {
      return { getSVGGElement: () => this.groups[i] ?? null };
    }
    get GraphicSheet() {
      return {
        MusicPages: [
          {
            MusicSystems: [
              {
                StaffLines: [
                  {
                    Measures: [
                      {
                        MeasureNumber: 1,
                        staffEntries: [0, 1, 2].map((i) => ({
                          graphicalVoiceEntries: [
                            { parentVoiceEntry: { ParentVoice: { Parent: { Id: 1 } } }, notes: [this.gNote(i)] },
                          ],
                        })),
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
    }
    load() {
      return Promise.resolve({});
    }
    render() {
      this.renders++;
      this.container.innerHTML = '';
      const svg = document.createElementNS(SVG_NS, 'svg');
      this.groups = [0, 1, 2].map(() => {
        const g = document.createElementNS(SVG_NS, 'g');
        g.appendChild(document.createElementNS(SVG_NS, 'path'));
        svg.appendChild(g);
        return g;
      });
      this.container.appendChild(svg);
    }
  }
  (globalThis as unknown as { __fakeOsmds: FakeOsmd[] }).__fakeOsmds = instances;
  return { OpenSheetMusicDisplay: FakeOsmd, CursorType: { Standard: 0 } };
});

import { ScoreViewport, applyNoteGradeToSvg, CURRENT_NOTE_CLASS } from '../../src/components/ScoreViewport';

const osmds = () =>
  (
    globalThis as unknown as {
      __fakeOsmds: Array<{
        renders: number;
        AutoResizeEnabled: boolean;
        FollowCursor: boolean;
        options: { cursorsOptions?: Array<{ follow?: boolean }> };
        step: number;
        render(): void;
      }>;
    }
  ).__fakeOsmds;
const latest = () => osmds()[osmds().length - 1];
const note = (id: string) => document.querySelector(`[data-note-id="${id}"]`);

describe('ScoreViewport after OSMD renders', () => {
  it('tags the notes and highlights the one under the cursor after loading', async () => {
    render(<ScoreViewport xmlContent="<a/>" viewMode="ribbon" zoom={1} />);
    await waitFor(() => expect(note('p0-m1-n0')).not.toBeNull());
    expect(note('p0-m1-n0')?.classList.contains(CURRENT_NOTE_CLASS)).toBe(true);
    expect(note('p0-m1-n1')?.classList.contains(CURRENT_NOTE_CLASS)).toBe(false);
  });

  it('keeps the played colours when the layout changes (zoom or view toggle re-renders)', async () => {
    const { rerender } = render(<ScoreViewport xmlContent="<a/>" viewMode="ribbon" zoom={1.1} />);
    await waitFor(() => expect(note('p0-m1-n0')).not.toBeNull());
    const container = document.getElementById('osmd-score-container')!;
    applyNoteGradeToSvg(container, ['p0-m1-n0'], 'green');
    expect(note('p0-m1-n0')?.getAttribute('fill')).toBe('#22c55e');

    rerender(<ScoreViewport xmlContent="<a/>" viewMode="page" zoom={1} />);
    await waitFor(() => expect(note('p0-m1-n0')?.getAttribute('fill')).toBe('#22c55e'));
  });

  it('puts tags, colours and highlight back after OSMD re-renders on its own (resize)', async () => {
    render(<ScoreViewport xmlContent="<a/>" viewMode="ribbon" zoom={1} />);
    await waitFor(() => expect(note('p0-m1-n0')).not.toBeNull());
    const container = document.getElementById('osmd-score-container')!;
    applyNoteGradeToSvg(container, ['p0-m1-n1'], 'green');

    act(() => latest().render());
    await waitFor(() => expect(note('p0-m1-n1')?.getAttribute('fill')).toBe('#22c55e'));
    expect(note('p0-m1-n0')?.classList.contains(CURRENT_NOTE_CLASS)).toBe(true);
  });

  it('starts a different score without the previous score\'s colours', async () => {
    const { rerender } = render(<ScoreViewport xmlContent="<a/>" viewMode="ribbon" zoom={1} />);
    await waitFor(() => expect(note('p0-m1-n0')).not.toBeNull());
    const container = document.getElementById('osmd-score-container')!;
    applyNoteGradeToSvg(container, ['p0-m1-n0'], 'green');

    rerender(<ScoreViewport xmlContent="<b/>" viewMode="ribbon" zoom={1} />);
    await waitFor(() => expect(latest().renders).toBeGreaterThan(1));
    await waitFor(() => expect(note('p0-m1-n0')).not.toBeNull());
    expect(note('p0-m1-n0')?.getAttribute('fill')).not.toBe('#22c55e');
  });

  it('switches OSMD auto-resize off when the viewport unmounts', async () => {
    const { unmount } = render(<ScoreViewport xmlContent="<a/>" viewMode="ribbon" zoom={1} />);
    await waitFor(() => expect(note('p0-m1-n0')).not.toBeNull());
    const instance = latest();
    unmount();
    expect(instance.AutoResizeEnabled).toBe(false);
  });

  it('disables OSMD built-in cursor follow so ScoreViewport is the single scroll controller', async () => {
    render(<ScoreViewport xmlContent="<a/>" viewMode="ribbon" zoom={1} />);
    await waitFor(() => expect(note('p0-m1-n0')).not.toBeNull());
    const instance = latest();
    expect(instance.options.cursorsOptions?.[0]?.follow).toBe(false);
    expect(instance.FollowCursor).toBe(false);
  });

  it('highlights activeNoteId and syncs OSMD cursor to the matching note step', async () => {
    const { rerender } = render(
      <ScoreViewport xmlContent="<a/>" viewMode="ribbon" cursorStepIndex={0} activeNoteId="p0-m1-n0" zoom={1} />,
    );
    await waitFor(() => expect(note('p0-m1-n0')).not.toBeNull());

    // Even if cursorStepIndex lags at 1 while activeNoteId is p0-m1-n2 (step 2), both highlight and cursor sync to step 2
    rerender(
      <ScoreViewport xmlContent="<a/>" viewMode="ribbon" cursorStepIndex={1} activeNoteId="p0-m1-n2" zoom={1} />,
    );
    await waitFor(() => expect(note('p0-m1-n2')?.classList.contains(CURRENT_NOTE_CLASS)).toBe(true));
    expect(note('p0-m1-n0')?.classList.contains(CURRENT_NOTE_CLASS)).toBe(false);
    expect(latest().step).toBe(2);
  });
});
