import { describe, it, expect } from 'vitest';
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import {
  CURRENT_NOTE_CLASS,
  applyNoteGradeToSvg,
  highlightCurrentNotes,
  repaintRecordedNotes,
  resetSvgNoteColors,
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
