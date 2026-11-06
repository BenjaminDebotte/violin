import { describe, it, expect } from 'vitest';
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import {
  CURRENT_NOTE_CLASS,
  applyNoteGradeToSvg,
  highlightCurrentNotes,
  repaintRecordedNotes,
  resetSvgNoteColors,
  scrollScoreViewport,
} from '../../src/components/ScoreViewport';

const SVG_NS = 'http://www.w3.org/2000/svg';

function noteGroup(id?: string): SVGGElement {
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'vf-stavenote');
  if (id) g.setAttribute('data-note-id', id);
  g.appendChild(document.createElementNS(SVG_NS, 'path'));
  return g;
}

function fakeOsmd(groups: Array<SVGGElement | null>, instrumentSeen?: { value: unknown }): OpenSheetMusicDisplay {
  const violin = { name: 'violin' };
  return {
    Sheet: { Instruments: [violin, { name: 'piano' }] },
    cursor: {
      GNotesUnderCursor: (instrument?: unknown) => {
        if (instrumentSeen) instrumentSeen.value = instrument === violin;
        return groups.map((g) => ({ getSVGGElement: () => g }));
      },
    },
  } as unknown as OpenSheetMusicDisplay;
}

describe('highlightCurrentNotes', () => {
  it('marks only the notes under the cursor and clears the previous ones', () => {
    const a = noteGroup();
    const b = noteGroup();
    const first = highlightCurrentNotes(fakeOsmd([a]), []);
    expect(first).toEqual([a]);
    expect(a.classList.contains(CURRENT_NOTE_CLASS)).toBe(true);

    const second = highlightCurrentNotes(fakeOsmd([b]), first);
    expect(a.classList.contains(CURRENT_NOTE_CLASS)).toBe(false);
    expect(b.classList.contains(CURRENT_NOTE_CLASS)).toBe(true);
    expect(second).toEqual([b]);
  });

  it('asks for the violin part only, not the piano accompaniment', () => {
    const seen = { value: undefined as unknown };
    highlightCurrentNotes(fakeOsmd([noteGroup()], seen), []);
    expect(seen.value).toBe(true);
  });

  it('survives notes without an SVG element and a missing cursor', () => {
    expect(highlightCurrentNotes(fakeOsmd([null]), [])).toEqual([]);
    expect(highlightCurrentNotes({} as OpenSheetMusicDisplay, [])).toEqual([]);
  });

  it('highlights the element matching activeNoteId directly when container and activeNoteId are provided', () => {
    const container = document.createElement('div');
    const svg = document.createElementNS(SVG_NS, 'svg');
    const wrongNote = noteGroup('p0-m1-n0');
    const targetNote = noteGroup('p3-m2-n1');
    svg.append(wrongNote, targetNote);
    container.appendChild(svg);

    const highlighted = highlightCurrentNotes(
      fakeOsmd([wrongNote]),
      [wrongNote],
      container,
      'p3-m2-n1',
    );
    expect(highlighted).toEqual([targetNote]);
    expect(targetNote.classList.contains(CURRENT_NOTE_CLASS)).toBe(true);
    expect(wrongNote.classList.contains(CURRENT_NOTE_CLASS)).toBe(false);
  });

  it('queries GNotesUnderCursor with the instrument matching activeNoteId part index on fallback', () => {
    const part0 = { name: 'piano' };
    const part3 = { name: 'violin-1' };
    const g = noteGroup('p3-m1-n0');
    let passedInstrument: unknown = null;
    const osmd = {
      Sheet: { Instruments: [part0, {}, {}, part3] },
      cursor: {
        GNotesUnderCursor: (inst?: unknown) => {
          passedInstrument = inst;
          return [{ getSVGGElement: () => g }];
        },
      },
    } as unknown as OpenSheetMusicDisplay;

    const highlighted = highlightCurrentNotes(osmd, [], undefined, 'p3-m1-n0');
    expect(passedInstrument).toBe(part3);
    expect(highlighted).toEqual([g]);
  });
});

describe('scrollScoreViewport', () => {
  function mockRect(el: Element, rect: Partial<DOMRect>): void {
    el.getBoundingClientRect = () =>
      ({
        x: rect.left ?? 0,
        y: rect.top ?? 0,
        left: rect.left ?? 0,
        top: rect.top ?? 0,
        right: (rect.left ?? 0) + (rect.width ?? 0),
        bottom: (rect.top ?? 0) + (rect.height ?? 0),
        width: rect.width ?? 0,
        height: rect.height ?? 0,
        toJSON: () => ({}),
      }) as DOMRect;
  }

  function createViewportFixture(width = 800, height = 300) {
    const viewport = document.createElement('div');
    const container = document.createElement('div');
    const svg = document.createElementNS(SVG_NS, 'svg');
    container.appendChild(svg);
    viewport.appendChild(container);

    Object.defineProperty(viewport, 'clientWidth', { value: width, configurable: true });
    Object.defineProperty(viewport, 'clientHeight', { value: height, configurable: true });
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
    mockRect(viewport, { left: 0, top: 0, width, height });
    mockRect(svg, { left: 0, top: 20, width: 2400, height: 180 });

    return { viewport, container, svg };
  }

  it('scrolls horizontally with 35% lookahead in ribbon mode and never bounces scrollTop between low and high notes', () => {
    const { viewport, container, svg } = createViewportFixture(800, 260);
    const note0 = noteGroup('p0-m1-n0');
    const lowNote = noteGroup('p0-m2-n0');
    const highNote = noteGroup('p0-m2-n1');
    svg.append(note0, lowNote, highNote);

    // Step 0 near the start of the staff -> stays at scrollLeft = 0 so clef/key sig remain visible
    mockRect(note0, { left: 120, top: 110, width: 16, height: 32 });
    scrollScoreViewport(viewport, container, note0, null, 'ribbon', 'auto', 0);
    expect(viewport.scrollLeft).toBe(0);
    expect(viewport.scrollTop).toBe(0);

    // Low G3 note at x = 680, y = 165
    mockRect(lowNote, { left: 680, top: 165, width: 16, height: 35 });
    scrollScoreViewport(viewport, container, lowNote, null, 'ribbon', 'auto', 4);
    // 680 - 800 * 0.35 = 680 - 280 = 400
    expect(viewport.scrollLeft).toBe(400);
    expect(viewport.scrollTop).toBe(0);

    // High E5 note at client x = 350 (scroll offset 400 + 350 = 750), y = 55
    mockRect(highNote, { left: 350, top: 55, width: 16, height: 35 });
    scrollScoreViewport(viewport, container, highNote, null, 'ribbon', 'auto', 5);
    // 750 - 280 = 470, and scrollTop must stay 0 (zero vertical bounce!)
    expect(viewport.scrollLeft).toBe(470);
    expect(viewport.scrollTop).toBe(0);

    // Resetting to step 0 scrolls back to 0
    mockRect(note0, { left: 120 - viewport.scrollLeft, top: 110, width: 16, height: 32 });
    scrollScoreViewport(viewport, container, note0, null, 'ribbon', 'auto', 0);
    expect(viewport.scrollLeft).toBe(0);
  });

  it('keeps scrollTop steady across notes in the same system in page mode and scrolls when advancing to a lower system', () => {
    const { viewport, container, svg } = createViewportFixture(800, 400);
    const sys1NoteA = noteGroup('p0-m1-n0');
    const sys1NoteB = noteGroup('p0-m1-n1');
    const sys3Note = noteGroup('p0-m9-n0');
    svg.append(sys1NoteA, sys1NoteB, sys3Note);

    // System 1 notes are comfortably inside the viewport (y = 120..165 in a 400px viewport)
    mockRect(sys1NoteA, { left: 140, top: 120, width: 16, height: 30 });
    scrollScoreViewport(viewport, container, sys1NoteA, null, 'page', 'auto', 1);
    expect(viewport.scrollTop).toBe(0);

    // Next note in the same bar is slightly lower (y = 135) -> must NOT cause a 15px micro-scroll
    mockRect(sys1NoteB, { left: 210, top: 135, width: 16, height: 30 });
    scrollScoreViewport(viewport, container, sys1NoteB, null, 'page', 'auto', 2);
    expect(viewport.scrollTop).toBe(0);

    // Advancing to System 3 below the fold (y = 520..550 in a 400px viewport) scrolls system into view
    mockRect(sys3Note, { left: 140, top: 520, width: 16, height: 30 });
    scrollScoreViewport(viewport, container, sys3Note, null, 'page', 'auto', 16);
    // System center is 535; 535 - 400 * 0.38 = 535 - 152 = 383
    expect(viewport.scrollTop).toBe(383);

    // Resetting to cursorStepIndex = 0 returns scrollTop to 0
    scrollScoreViewport(viewport, container, sys1NoteA, null, 'page', 'auto', 0);
    expect(viewport.scrollTop).toBe(0);
  });
});

describe('played colours survive a re-render', () => {
  const build = () => {
    const container = document.createElement('div');
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.append(noteGroup('p0-m1-n0'), noteGroup('p0-m1-n1'));
    container.appendChild(svg);
    return container;
  };
  const fillOf = (c: Element, id: string) => c.querySelector(`[data-note-id="${id}"]`)?.getAttribute('fill');

  it('paints the recorded notes again onto a fresh SVG', () => {
    const container = build();
    applyNoteGradeToSvg(container, ['p0-m1-n0'], 'green');
    expect(fillOf(container, 'p0-m1-n0')).toBe('#22c55e');

    // OSMD rebuilds everything: the new notes carry no colour
    container.innerHTML = '';
    const fresh = document.createElementNS(SVG_NS, 'svg');
    fresh.append(noteGroup('p0-m1-n0'), noteGroup('p0-m1-n1'));
    container.appendChild(fresh);
    expect(fillOf(container, 'p0-m1-n0')).toBeNull();

    repaintRecordedNotes(container);
    expect(fillOf(container, 'p0-m1-n0')).toBe('#22c55e');
    expect(fillOf(container, 'p0-m1-n1')).toBeNull();
  });

  it('forgets colours that were reset', () => {
    const container = build();
    applyNoteGradeToSvg(container, ['p0-m1-n0', 'p0-m1-n1'], 'green');
    resetSvgNoteColors(container, ['p0-m1-n0']);
    repaintRecordedNotes(container);
    expect(fillOf(container, 'p0-m1-n0')).toBeNull();
    expect(fillOf(container, 'p0-m1-n1')).toBe('#22c55e');

    resetSvgNoteColors(container);
    container.querySelectorAll('[data-note-id]').forEach((el) => el.removeAttribute('fill'));
    repaintRecordedNotes(container);
    expect(fillOf(container, 'p0-m1-n1')).toBeNull();
  });
});
