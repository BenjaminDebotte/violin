import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';

export type NoteGradeColor = 'green' | 'yellow' | 'red' | 'active' | 'reset' | 'pending';

export const NOTE_GRADE_COLORS: Record<NoteGradeColor, string> = {
  green: '#22c55e', // Emerald 500
  yellow: '#eab308', // Yellow 500
  red: '#ef4444', // Red 500
  active: '#3b82f6', // Blue 500
  pending: '#000000',
  reset: '#000000',
};

/**
 * Pure O(1) SVG DOM notehead colorer.
 * Mutates SVG fill and stroke directly without triggering OSMD re-renders.
 */
export function applyNoteGradeToSvg(
  target: Element,
  noteIdOrIdsOrGrade: string | readonly string[] | NoteGradeColor,
  maybeGrade?: NoteGradeColor | string,
): boolean {
  if (!target) return false;

  // Case 1: Direct SVG element coloring: applyNoteGradeToSvg(directElement, 'green')
  if (
    typeof noteIdOrIdsOrGrade === 'string' &&
    (noteIdOrIdsOrGrade in NOTE_GRADE_COLORS || noteIdOrIdsOrGrade.startsWith('#')) &&
    !maybeGrade
  ) {
    const color =
      NOTE_GRADE_COLORS[noteIdOrIdsOrGrade as NoteGradeColor] || noteIdOrIdsOrGrade;
    colorSingleSvgElement(target, color);
    return true;
  }

  // Case 2: Container + note ID(s) + grade: applyNoteGradeToSvg(container, 'p0-m1-n0', 'green')
  const gradeKey = (maybeGrade as NoteGradeColor) || 'reset';
  const color = NOTE_GRADE_COLORS[gradeKey] || gradeKey;
  const ids = Array.isArray(noteIdOrIdsOrGrade)
    ? noteIdOrIdsOrGrade
    : [noteIdOrIdsOrGrade as string];

  let anyModified = false;
  for (const id of ids) {
    if (!id) continue;
    recordPainted(target, id, color);

    // Check if target itself has this note ID
    if (target.getAttribute('data-note-id') === id) {
      colorSingleSvgElement(target, color);
      anyModified = true;
      continue;
    }

    // Query elements inside target container
    const matched = target.querySelectorAll(`[data-note-id="${id}"]`);
    if (matched.length > 0) {
      matched.forEach((el) => colorSingleSvgElement(el, color));
      anyModified = true;
    }
  }

  return anyModified;
}

/**
 * What was painted on each score container (note id -> colour). OSMD rebuilds the whole SVG
 * on every render (window resize, zoom, layout change), which drops the tags and the colours,
 * so they are recorded here and painted again after the next tagging.
 */
const paintedNotes = new WeakMap<Element, Map<string, string>>();

function recordPainted(container: Element, id: string, color: string): void {
  let map = paintedNotes.get(container);
  if (!map) {
    map = new Map();
    paintedNotes.set(container, map);
  }
  map.set(id, color);
}

/** Forgets what was painted (a different score was loaded, or practice was reset). */
export function clearRecordedNotes(container: Element): void {
  paintedNotes.delete(container);
}

/** Paints the recorded notes again onto a freshly rendered score. */
export function repaintRecordedNotes(container: Element): void {
  const map = paintedNotes.get(container);
  if (!map) return;
  for (const [id, color] of map) {
    container.querySelectorAll(`[data-note-id="${id}"]`).forEach((el) => colorSingleSvgElement(el, color));
  }
}

function colorSingleSvgElement(el: Element, color: string): void {
  // Store original fill/stroke if not already recorded
  if (!el.hasAttribute('data-original-fill')) {
    el.setAttribute('data-original-fill', el.getAttribute('fill') ?? '');
  }
  if (!el.hasAttribute('data-original-stroke')) {
    el.setAttribute('data-original-stroke', el.getAttribute('stroke') ?? '');
  }

  el.setAttribute('fill', color);
  el.setAttribute('stroke', color);
  if (el instanceof SVGElement || el instanceof HTMLElement) {
    el.style.fill = color;
    el.style.stroke = color;
  }

  // If element is a <g>, also color child path / ellipse noteheads
  const noteheadChildren = el.querySelectorAll('path, ellipse, circle');
  noteheadChildren.forEach((child) => {
    if (!child.hasAttribute('data-original-fill')) {
      child.setAttribute('data-original-fill', child.getAttribute('fill') ?? '');
    }
    if (!child.hasAttribute('data-original-stroke')) {
      child.setAttribute('data-original-stroke', child.getAttribute('stroke') ?? '');
    }
    child.setAttribute('fill', color);
    child.setAttribute('stroke', color);
    if (child instanceof SVGElement || child instanceof HTMLElement) {
      child.style.fill = color;
      child.style.stroke = color;
    }
  });
}

/**
 * Pure O(1) SVG DOM color resetter.
 * Restores original fill and stroke attributes without triggering OSMD re-renders.
 */
export function resetSvgNoteColors(
  root: Element,
  noteIdOrIds?: string | readonly string[],
): boolean {
  if (!root) return false;

  if (noteIdOrIds) {
    const ids = Array.isArray(noteIdOrIds) ? noteIdOrIds : [noteIdOrIds];
    let anyReset = false;
    for (const id of ids) {
      paintedNotes.get(root)?.delete(id);
      if (root.getAttribute('data-note-id') === id) {
        restoreSingleSvgElement(root);
        anyReset = true;
      }
      const matched = root.querySelectorAll(`[data-note-id="${id}"]`);
      matched.forEach((el) => {
        restoreSingleSvgElement(el);
        anyReset = true;
      });
    }
    return anyReset;
  }

  // Reset all elements with original fill/stroke recorded
  paintedNotes.delete(root);
  if (root.hasAttribute('data-original-fill')) {
    restoreSingleSvgElement(root);
  }
  const modifiedElements = root.querySelectorAll('[data-original-fill]');
  modifiedElements.forEach((el) => restoreSingleSvgElement(el));
  return true;
}

function restoreSingleSvgElement(el: Element): void {
  const origFill = el.getAttribute('data-original-fill');
  const origStroke = el.getAttribute('data-original-stroke');

  if (origFill !== null) {
    if (origFill.length > 0) {
      el.setAttribute('fill', origFill);
      if (el instanceof SVGElement || el instanceof HTMLElement) el.style.fill = origFill;
    } else {
      el.removeAttribute('fill');
      if (el instanceof SVGElement || el instanceof HTMLElement) el.style.fill = '';
    }
    el.removeAttribute('data-original-fill');
  }

  if (origStroke !== null) {
    if (origStroke.length > 0) {
      el.setAttribute('stroke', origStroke);
      if (el instanceof SVGElement || el instanceof HTMLElement) el.style.stroke = origStroke;
    } else {
      el.removeAttribute('stroke');
      if (el instanceof SVGElement || el instanceof HTMLElement) el.style.stroke = '';
    }
    el.removeAttribute('data-original-stroke');
  }

  const children = el.querySelectorAll('[data-original-fill]');
  children.forEach((child) => restoreSingleSvgElement(child));
}

/**
 * Associates rendered OSMD SVG notehead elements with deterministic data-note-id attributes
 * matching the timeline extractor format ('p0-m1-n0').
 */
export function tagOsmdSvgNotes(osmd: OpenSheetMusicDisplay): void {
  try {
    const graphic = osmd.GraphicSheet;
    if (!graphic?.MusicPages) return;

    const measureNoteCounters = new Map<string, number>();

    for (const page of graphic.MusicPages) {
      for (const system of page.MusicSystems ?? []) {
        for (const staffLine of system.StaffLines ?? []) {
          for (const measure of staffLine.Measures ?? []) {
            const measureNumber = measure.MeasureNumber;

            for (const staffEntry of measure.staffEntries ?? []) {
              for (const gve of staffEntry.graphicalVoiceEntries ?? []) {
                const parentEntry = gve.parentVoiceEntry as unknown as {
                  ParentVoice?: { Parent?: { Id?: number } };
                };
                const instruments = osmd.Sheet?.Instruments ?? [];
                const measureInst = (
                  measure as unknown as { ParentStaff?: { ParentInstrument?: unknown } }
                ).ParentStaff?.ParentInstrument;
                const parentInst = parentEntry?.ParentVoice?.Parent ?? measureInst;
                const instIdx = parentInst ? instruments.indexOf(parentInst as never) : -1;
                const rawPartId = parentEntry?.ParentVoice?.Parent?.Id;
                const partIdx =
                  instIdx >= 0
                    ? instIdx
                    : typeof rawPartId === 'number'
                      ? Math.max(0, rawPartId - 1)
                      : 0;

                for (const gNote of gve.notes ?? []) {
                  const key = `${partIdx}-${measureNumber}`;
                  const currentIdx = measureNoteCounters.get(key) ?? 0;
                  measureNoteCounters.set(key, currentIdx + 1);

                  const noteId = `p${partIdx}-m${measureNumber}-n${currentIdx}`;
                  const svgElem = (gNote as unknown as { getSVGGElement?: () => SVGElement | null }).getSVGGElement?.();
                  if (svgElem) {
                    svgElem.setAttribute('data-note-id', noteId);
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('Failed to tag OSMD SVG notes with data-note-id:', err);
  }
}

/** Marks the violin notes under the OSMD cursor so CSS can colour and glow them. */
export const CURRENT_NOTE_CLASS = 'score-note-current';

/** SVG <text> class for note names drawn under each tagged violin note. */
export const NOTE_NAME_CLASS = 'score-note-name';

export type BBoxLike = { x: number; y: number; width: number; height: number };

export function safeGetBBox(el: Element | null): BBoxLike | null {
  if (!el) return null;
  const fn = (el as unknown as { getBBox?: () => BBoxLike }).getBBox;
  if (typeof fn !== 'function') return null;
  try {
    const box = fn.call(el);
    if (
      box &&
      Number.isFinite(box.x) &&
      Number.isFinite(box.y) &&
      Number.isFinite(box.width) &&
      Number.isFinite(box.height)
    ) {
      return box;
    }
  } catch {
    /* jsdom or detached SVG element */
  }
  return null;
}

export const NOTE_LABEL_OFFSET_Y_PX = 9;

/**
 * Draws or refreshes `<text class="score-note-name">` children under each tagged note `<g>`
 * that has an entry in `noteLabels`. Removes any previous `.score-note-name` elements first
 * so re-renders, notation switches, or setting toggles never duplicate or leave stale labels.
 */
export function syncNoteLabels(
  container: Element,
  noteLabels?: Readonly<Record<string, string>>,
): void {
  container.querySelectorAll(`.${NOTE_NAME_CLASS}`).forEach((el) => el.remove());
  if (!noteLabels) return;

  const tagged = container.querySelectorAll('[data-note-id]');
  tagged.forEach((el) => {
    const id = el.getAttribute('data-note-id');
    if (!id) return;
    const label = noteLabels[id];
    if (!label) return;

    const bbox = safeGetBBox(el);
    const headBox = safeGetBBox(el.querySelector('.vf-notehead'));
    const cx =
      headBox && headBox.width > 0
        ? headBox.x + headBox.width / 2
        : bbox
          ? bbox.x + bbox.width / 2
          : 0;
    const y = bbox ? bbox.y + bbox.height + NOTE_LABEL_OFFSET_Y_PX : NOTE_LABEL_OFFSET_Y_PX;

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('class', NOTE_NAME_CLASS);
    text.setAttribute('x', `${Math.round(cx * 10) / 10}`);
    text.setAttribute('y', `${Math.round(y * 10) / 10}`);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '10');
    text.setAttribute('font-weight', '700');
    text.setAttribute('fill', '#221d19');
    text.setAttribute('stroke', '#ffffff');
    text.setAttribute('stroke-width', '3');
    text.setAttribute('stroke-linejoin', 'round');
    text.setAttribute('paint-order', 'stroke');
    text.setAttribute('pointer-events', 'none');
    text.textContent = label;
    el.appendChild(text);
  });
}

export function resolveSoloInstrumentIndex(
  osmd: OpenSheetMusicDisplay,
  activeNoteId?: string | null,
): number {
  const instruments = osmd.Sheet?.Instruments;
  if (!instruments || instruments.length === 0) return 0;
  const violinIdx = instruments.findIndex((inst) => {
    const rec = inst as unknown as {
      Name?: string;
      NameLabel?: { text?: string };
      idString?: string;
      SubInstruments?: Array<{ name?: string; idString?: string }>;
    };
    const subNames = (rec.SubInstruments ?? []).map((s) => `${s.name ?? ''} ${s.idString ?? ''}`).join(' ');
    const label = `${rec.Name ?? ''} ${rec.NameLabel?.text ?? ''} ${rec.idString ?? ''} ${subNames}`;
    return /violin|violon(?!cello)|\bvln\b|fiddle/i.test(label);
  });
  if (violinIdx >= 0) return violinIdx;
  if (activeNoteId) {
    const match = /^p(\d+)-/.exec(activeNoteId);
    if (match) {
      const idx = parseInt(match[1], 10);
      if (!isNaN(idx) && idx >= 0 && idx < instruments.length) {
        return idx;
      }
    }
  }
  return 0;
}

export function resolveInstrumentForNoteId(
  osmd: OpenSheetMusicDisplay,
  activeNoteId?: string | null,
): unknown {
  const instruments = osmd.Sheet?.Instruments;
  if (!instruments || instruments.length === 0) return undefined;
  return instruments[resolveSoloInstrumentIndex(osmd, activeNoteId)];
}

export function highlightCurrentNotes(
  osmd: OpenSheetMusicDisplay,
  previous: readonly Element[],
  container?: Element | null,
  activeNoteId?: string | null,
): Element[] {
  for (const el of previous) el.classList.remove(CURRENT_NOTE_CLASS);
  const next: Element[] = [];
  try {
    if (container && activeNoteId) {
      const directMatches = Array.from(
        container.querySelectorAll(`[data-note-id="${activeNoteId}"]`),
      );
      if (directMatches.length > 0) {
        for (const el of directMatches) {
          el.classList.add(CURRENT_NOTE_CLASS);
          next.push(el);
        }
        return next;
      }
    }

    const instrument = resolveInstrumentForNoteId(
      osmd,
      activeNoteId,
    ) as Parameters<NonNullable<OpenSheetMusicDisplay['cursor']>['GNotesUnderCursor']>[0];
    const gNotes = osmd.cursor?.GNotesUnderCursor(instrument) ?? [];
    for (const gNote of gNotes) {
      const el = (gNote as unknown as { getSVGGElement?: () => SVGElement | null }).getSVGGElement?.();
      if (el) {
        el.classList.add(CURRENT_NOTE_CLASS);
        next.push(el);
      }
    }
  } catch (err) {
    console.warn('Failed to highlight the current note:', err);
  }
  return next;
}

export function cursorContainsNoteId(
  osmd: OpenSheetMusicDisplay,
  noteId: string,
  instrument: unknown,
): boolean {
  const gNotes =
    osmd.cursor?.GNotesUnderCursor?.(
      instrument as Parameters<NonNullable<OpenSheetMusicDisplay['cursor']>['GNotesUnderCursor']>[0],
    ) ?? [];
  return gNotes.some((gNote) => {
    const el = (gNote as unknown as { getSVGGElement?: () => SVGElement | null }).getSVGGElement?.();
    return el?.getAttribute('data-note-id') === noteId;
  });
}
