import React, { useCallback, useEffect, useRef, useState } from 'react';
import { OpenSheetMusicDisplay, CursorType } from 'opensheetmusicdisplay';

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

type BBoxLike = { x: number; y: number; width: number; height: number };

function safeGetBBox(el: Element | null): BBoxLike | null {
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
    const y = bbox ? bbox.y + bbox.height + 9 : 9;

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

function resolveSoloInstrumentIndex(
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

function resolveInstrumentForNoteId(
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

function cursorContainsNoteId(
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

function syncOsmdCursor(
  osmd: OpenSheetMusicDisplay,
  targetStep: number,
  currentStep: number,
  container?: Element | null,
  activeNoteId?: string | null,
): number {
  if (!osmd.cursor) return targetStep;

  // When activeNoteId is known and present in the DOM, step forward from currentStep first (O(1) on normal playback)
  if (activeNoteId && container?.querySelector(`[data-note-id="${activeNoteId}"]`)) {
    const instrument = resolveInstrumentForNoteId(osmd, activeNoteId);
    if (cursorContainsNoteId(osmd, activeNoteId, instrument)) {
      osmd.cursor.update?.();
      return currentStep;
    }
    if (targetStep >= currentStep) {
      let step = currentStep;
      for (let i = 0; i < 64; i++) {
        if (osmd.cursor.iterator?.EndReached) break;
        const gNotes = osmd.cursor.GNotesUnderCursor?.() ?? [];
        if (
          i > 0 &&
          gNotes.length > 0 &&
          gNotes.every(
            (n) => !(n as unknown as { getSVGGElement?: () => SVGElement | null }).getSVGGElement?.(),
          )
        ) {
          break;
        }
        osmd.cursor.next();
        step++;
        if (cursorContainsNoteId(osmd, activeNoteId, instrument)) {
          osmd.cursor.update?.();
          return step;
        }
      }
    }
    osmd.cursor.reset();
    for (let s = 0; s < 2000; s++) {
      if (cursorContainsNoteId(osmd, activeNoteId, instrument)) {
        osmd.cursor.update?.();
        return s;
      }
      if (osmd.cursor.iterator?.EndReached) break;
      const gNotes = osmd.cursor.GNotesUnderCursor?.() ?? [];
      if (
        s > 0 &&
        gNotes.length > 0 &&
        gNotes.every(
          (n) => !(n as unknown as { getSVGGElement?: () => SVGElement | null }).getSVGGElement?.(),
        )
      ) {
        break;
      }
      osmd.cursor.next();
    }
    osmd.cursor.reset();
    for (let s = 0; s < targetStep; s++) {
      osmd.cursor.next();
      if (osmd.cursor.iterator?.EndReached) break;
    }
    osmd.cursor.update?.();
    return targetStep;
  }

  if (targetStep > currentStep) {
    for (let s = currentStep; s < targetStep; s++) {
      osmd.cursor.next();
      if (osmd.cursor.iterator?.EndReached) break;
    }
  } else if (targetStep < currentStep) {
    osmd.cursor.reset();
    for (let s = 0; s < targetStep; s++) {
      osmd.cursor.next();
      if (osmd.cursor.iterator?.EndReached) break;
    }
  }

  osmd.cursor.update?.();
  return targetStep;
}

/** Puts the OSMD cursor on a step after a fresh render (which resets it). */
function restoreCursor(
  osmd: OpenSheetMusicDisplay,
  step: number,
  container?: Element | null,
  activeNoteId?: string | null,
): number {
  if (!osmd.cursor) return step;
  osmd.cursor.show();
  osmd.cursor.reset();
  return syncOsmdCursor(osmd, step, 0, container, activeNoteId);
}

/** Room kept above the top staff line (clef, bar numbers) and below the bottom one (stems, note names). */
export const STAFF_BAND_ABOVE_PX = 18;
export const STAFF_BAND_BELOW_PX = 34;

/**
 * Vertical band of the system (OSMD `.staffline`) holding `anchor`, in viewport scroll coordinates:
 * the five staff lines (thin horizontal paths drawn in `.vf-measure` / `.vf-stave`) plus label room.
 * Returns null when no staff line is found (e.g. jsdom), so callers keep their fallback.
 */
export function staffBandOf(
  container: Element,
  anchor: Element | null,
  toScrollY: (clientY: number) => number,
  viewMode: 'ribbon' | 'page' = 'ribbon',
  cursorStepIndex = 0,
): { top: number; bottom: number } | null {
  const inside = anchor?.closest('.staffline');
  const staffline =
    inside ?? (viewMode === 'page' && cursorStepIndex !== 0 ? null : container.querySelector('.staffline'));
  if (!staffline) return null;
  const measure = anchor?.closest('.vf-measure') ?? staffline.querySelector('.vf-measure') ?? staffline;
  let top = Infinity;
  let bottom = -Infinity;
  measure
    .querySelectorAll('path, line, rect')
    .forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.height > 3.5 || r.width < 10) return;
      top = Math.min(top, r.top);
      bottom = Math.max(bottom, r.bottom);
    });
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return null;
  return { top: toScrollY(top) - STAFF_BAND_ABOVE_PX, bottom: toScrollY(bottom) + STAFF_BAND_BELOW_PX };
}

/**
 * Scroll position that shows `band` (centred when it fits, keeping `preferTop` if given and valid),
 * then nudged only as much as needed so the active note (with its name) is never hidden.
 */
function fitBand(
  band: { top: number; bottom: number },
  note: { top: number; bottom: number } | null,
  height: number,
  preferTop?: number,
): number {
  let top: number;
  if (band.bottom - band.top <= height) {
    const centred = preferTop ?? (band.top + band.bottom) / 2 - height / 2;
    top = Math.min(Math.max(centred, band.bottom - height), band.top);
  } else {
    // Taller than the viewport: favour the lower staff lines and the names under them
    top = band.bottom - height;
  }
  if (note) {
    if (note.bottom > top + height) top = note.bottom - height;
    if (note.top < top) top = note.top;
  }
  return Math.max(0, Math.round(top));
}

/**
 * Deterministic, jitter-free score auto-scroll controller.
 * - In `'ribbon'` (Single-line) mode: places the active note at ~35% of viewport width (65% lookahead)
 *   and never vertically centers on individual note pitches (eliminating vertical staff bounce).
 * - In `'page'` (Full-page) mode: computes the vertical bounds of the active staff system and scrolls
 *   only when the active system lies outside the comfortable middle band of the viewport.
 */
export function scrollScoreViewport(
  viewport: HTMLElement,
  container: HTMLElement,
  targetNoteEl: Element | null,
  cursorEl: HTMLElement | null,
  viewMode: 'ribbon' | 'page',
  behavior: ScrollBehavior = 'smooth',
  cursorStepIndex = 0,
): void {
  if (!viewport || !container) return;

  const viewportRect = viewport.getBoundingClientRect();
  const anchorEl = targetNoteEl ?? cursorEl;

  let targetLeft = viewport.scrollLeft;
  let targetTop = viewport.scrollTop;
  const toScrollY = (clientY: number) => clientY - viewportRect.top + viewport.scrollTop;
  const anchorBox = anchorEl?.getBoundingClientRect();
  const noteBand =
    anchorBox && anchorBox.height > 0
      ? { top: toScrollY(anchorBox.top), bottom: toScrollY(anchorBox.bottom) }
      : null;
  const staffBand =
    viewport.clientHeight > 0
      ? staffBandOf(container, anchorEl, toScrollY, viewMode, cursorStepIndex)
      : null;

  if (viewMode === 'ribbon') {
    if (anchorEl && viewport.clientWidth > 0) {
      const noteRect = anchorEl.getBoundingClientRect();
      const noteOffsetLeft = noteRect.left - viewportRect.left + viewport.scrollLeft;
      if (cursorStepIndex === 0 && noteOffsetLeft < viewport.clientWidth * 0.5) {
        targetLeft = 0;
      } else {
        targetLeft = Math.max(0, Math.round(noteOffsetLeft - viewport.clientWidth * 0.35));
      }
    } else if (cursorStepIndex === 0) {
      targetLeft = 0;
    }

    const svgEl = container.querySelector('svg') ?? container;
    const svgRect = svgEl.getBoundingClientRect();
    if (staffBand) {
      // Constant per system: depends on the staff lines, not on the pitch of the note
      targetTop = fitBand(staffBand, noteBand, viewport.clientHeight);
    } else if (viewport.clientHeight > 0 && svgRect.height > viewport.clientHeight) {
      const svgCenterY = svgRect.top - viewportRect.top + viewport.scrollTop + svgRect.height / 2;
      targetTop = Math.max(0, Math.round(svgCenterY - viewport.clientHeight / 2));
    } else {
      targetTop = 0;
    }
  } else {
    targetLeft = 0;
    const h = viewport.clientHeight;
    if (staffBand && h > 0) {
      const comfortTop = viewport.scrollTop + h * 0.15;
      const comfortBottom = viewport.scrollTop + h * 0.78;
      const fitsAtTop = staffBand.bottom <= h && (!noteBand || noteBand.bottom <= h);
      if (cursorStepIndex === 0 && fitsAtTop) {
        targetTop = 0;
      } else if (
        cursorStepIndex === 0 ||
        staffBand.top < comfortTop ||
        staffBand.bottom > comfortBottom ||
        (noteBand != null && (noteBand.top < viewport.scrollTop || noteBand.bottom > viewport.scrollTop + h))
      ) {
        const centre = (staffBand.top + staffBand.bottom) / 2;
        targetTop = fitBand(staffBand, noteBand, h, centre - h * 0.38);
      }
    } else if (cursorStepIndex === 0) {
      targetTop = 0;
    } else if (anchorEl && viewport.clientHeight > 0) {
      const noteRect = anchorEl.getBoundingClientRect();
      const cursorRect = cursorEl?.getBoundingClientRect();
      const useCursorBand =
        cursorRect != null &&
        cursorRect.height > 8 &&
        Math.abs(cursorRect.top - noteRect.top) < 120;

      const STAFF_MARGIN_PX = 48;
      const bandTop = useCursorBand
        ? Math.min(cursorRect.top, noteRect.top - 16)
        : noteRect.top - STAFF_MARGIN_PX;
      const bandBottom = useCursorBand
        ? Math.max(cursorRect.bottom, noteRect.bottom + 16)
        : noteRect.bottom + STAFF_MARGIN_PX;

      const comfortTop = viewportRect.top + viewport.clientHeight * 0.15;
      const comfortBottom = viewportRect.bottom - viewport.clientHeight * 0.22;

      if (bandTop < comfortTop || bandBottom > comfortBottom) {
        const systemCenterClientY = (bandTop + bandBottom) / 2;
        const systemCenterScrollY =
          systemCenterClientY - viewportRect.top + viewport.scrollTop;
        targetTop = Math.max(
          0,
          Math.round(systemCenterScrollY - viewport.clientHeight * 0.38),
        );
      }
    }
  }

  const shouldScroll =
    Math.abs(targetLeft - viewport.scrollLeft) > 0.5 ||
    Math.abs(targetTop - viewport.scrollTop) > 0.5;

  if (shouldScroll) {
    if (typeof viewport.scrollTo === 'function') {
      try {
        viewport.scrollTo({ left: targetLeft, top: targetTop, behavior });
      } catch {
        // Ignore if scrollTo options are unsupported in test environment
      }
    }
    if (
      typeof viewport.scrollTo !== 'function' ||
      behavior === 'auto' ||
      (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent))
    ) {
      viewport.scrollLeft = targetLeft;
      viewport.scrollTop = targetTop;
    }
  }
}

export interface ScoreViewportProps {
  readonly xmlContent?: string;
  readonly viewMode?: 'page' | 'ribbon';
  readonly cursorStepIndex?: number;
  readonly activeNoteId?: string | null;
  readonly zoom?: number;
  readonly noteLabels?: Readonly<Record<string, string>>;
  readonly onCursorStepChange?: (stepIndex: number) => void;
  readonly className?: string;
}

export const ScoreViewport: React.FC<ScoreViewportProps> = ({
  xmlContent,
  viewMode = 'page',
  cursorStepIndex = 0,
  activeNoteId = null,
  zoom = 1.0,
  noteLabels,
  onCursorStepChange,
  className = '',
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const currentStepRef = useRef<number>(0);
  const cursorStepIndexRef = useRef<number>(cursorStepIndex);
  const activeNoteIdRef = useRef<string | null>(activeNoteId);
  const viewModeRef = useRef<'page' | 'ribbon'>(viewMode);
  const noteLabelsRef = useRef<Readonly<Record<string, string>> | undefined>(noteLabels);
  const highlightedRef = useRef<Element[]>([]);
  const renderedSvgRef = useRef<Element | null>(null);
  const loadedXmlRef = useRef<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  cursorStepIndexRef.current = cursorStepIndex;
  activeNoteIdRef.current = activeNoteId;
  viewModeRef.current = viewMode;
  noteLabelsRef.current = noteLabels;

  // Initialize OSMD instance
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = '';

    try {
      const osmd = new OpenSheetMusicDisplay(container, {
        autoResize: true,
        backend: 'svg',
        drawTitle: false,
        drawSubtitle: false,
        drawComposer: false,
        drawCredits: false,
        drawPartNames: false,
        renderSingleHorizontalStaffline: viewMode === 'ribbon',
        // Rosin-amber playhead: follow is disabled so ScoreViewport is the single scroll controller
        cursorsOptions: [{ type: CursorType.Standard, color: '#f0a630', alpha: 0.45, follow: false }],
      });
      osmd.FollowCursor = false;
      osmdRef.current = osmd;
    } catch (err) {
      console.error('Failed to initialize OSMD:', err);
    }

    return () => {
      // OSMD's window resize listener outlives the instance unless it is switched off
      try {
        if (osmdRef.current) osmdRef.current.AutoResizeEnabled = false;
      } catch {
        /* instance already torn down */
      }
      osmdRef.current = null;
      if (container) {
        container.innerHTML = '';
      }
    };
  }, []);

  /**
   * After any OSMD render the SVG is brand new: tag the notes, put the cursor back, paint the
   * played colours again and re-mark the current note.
   */
  const restoreAfterRender = useCallback((osmd: OpenSheetMusicDisplay) => {
    const container = containerRef.current;
    if (!container) return;
    tagOsmdSvgNotes(osmd);
    syncNoteLabels(container, noteLabelsRef.current);
    currentStepRef.current = restoreCursor(
      osmd,
      currentStepRef.current,
      container,
      activeNoteIdRef.current,
    );
    repaintRecordedNotes(container);
    highlightedRef.current = highlightCurrentNotes(
      osmd,
      highlightedRef.current,
      container,
      activeNoteIdRef.current,
    );
    renderedSvgRef.current = container.querySelector('svg');
    if (viewportRef.current) {
      scrollScoreViewport(
        viewportRef.current,
        container,
        highlightedRef.current[0] ?? null,
        osmd.cursor?.cursorElement ?? null,
        viewModeRef.current,
        'auto',
        currentStepRef.current,
      );
    }
  }, []);

  // Update EngravingRules when viewMode changes
  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd) return;

    const isRibbon = viewMode === 'ribbon';
    if (osmd.EngravingRules.RenderSingleHorizontalStaffline !== isRibbon) {
      osmd.EngravingRules.RenderSingleHorizontalStaffline = isRibbon;
      if (xmlContent) {
        try {
          osmd.render();
          restoreAfterRender(osmd);
        } catch (err) {
          console.warn('Failed to re-render OSMD on viewMode toggle:', err);
        }
      }
    }
  }, [viewMode]);

  // Load and render score when xmlContent changes
  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd || !xmlContent) return;

    let isMounted = true;
    setIsLoading(true);
    setErrorMessage(null);

    osmd
      .load(xmlContent)
      .then(() => {
        if (!isMounted) return;
        osmd.EngravingRules.RenderSingleHorizontalStaffline = viewMode === 'ribbon';
        osmd.zoom = zoom;
        // Show only the solo violin instrument (and its primary staff) so accompaniment/ensemble staves do not crowd the stand
        const instruments = osmd.Sheet?.Instruments ?? [];
        if (instruments.length > 0) {
          const soloIdx = resolveSoloInstrumentIndex(osmd, activeNoteIdRef.current);
          instruments.forEach((inst, idx) => {
            const isSolo = idx === soloIdx;
            const instRec = inst as unknown as {
              Visible?: boolean;
              Staves?: Array<{ Visible?: boolean }>;
            };
            instRec.Visible = isSolo;
            if (Array.isArray(instRec.Staves)) {
              instRec.Staves.forEach((staff, sIdx) => {
                staff.Visible = isSolo && sIdx === 0;
              });
            }
          });
        }
        // A different score starts clean; a zoom or layout change of the same score keeps its colours
        if (loadedXmlRef.current !== xmlContent) {
          if (containerRef.current) clearRecordedNotes(containerRef.current);
          currentStepRef.current = Math.max(0, cursorStepIndexRef.current);
          loadedXmlRef.current = xmlContent;
        }
        osmd.render();
        restoreAfterRender(osmd);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setIsLoading(false);
        setErrorMessage(`Failed to render score: ${(err as Error).message}`);
      });

    return () => {
      isMounted = false;
    };
  }, [xmlContent, zoom]);

  // OSMD also re-renders on its own (window resize, phone rotation). That rebuilds the SVG, so the
  // note tags, the played colours, the cursor and the current-note highlight are put back.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => {
      // Observer callbacks run before the next paint, so the restore is never seen half done
      const osmd = osmdRef.current;
      const svg = container.querySelector('svg');
      if (!osmd || !svg || svg === renderedSvgRef.current) return;
      try {
        restoreAfterRender(osmd);
      } catch (err) {
        console.warn('Failed to restore the score after a re-render:', err);
      }
    });
    observer.observe(container, { childList: true });
    return () => observer.disconnect();
  }, [restoreAfterRender]);

  // Update note-name labels when noteLabels prop changes (toggle or notation switch)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || isLoading) return;
    syncNoteLabels(container, noteLabels);
  }, [noteLabels, isLoading]);

  // Re-align the vertical band when the viewport height changes (e.g. fingering hint toggled)
  useEffect(() => {
    const viewport = viewportRef.current;
    const container = containerRef.current;
    if (!viewport || !container || typeof ResizeObserver === 'undefined') return;
    let lastHeight = viewport.clientHeight;
    const observer = new ResizeObserver(() => {
      const h = viewport.clientHeight;
      if (h === lastHeight) return;
      lastHeight = h;
      scrollScoreViewport(
        viewport,
        container,
        highlightedRef.current[0] ?? null,
        osmdRef.current?.cursor?.cursorElement ?? null,
        viewModeRef.current,
        'auto',
        currentStepRef.current,
      );
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  // Cursor synchronization & deterministic auto-scroll
  useEffect(() => {
    const osmd = osmdRef.current;
    const container = containerRef.current;
    if (!osmd || !osmd.cursor || !container || isLoading) return;

    const targetStep = Math.max(0, cursorStepIndex);
    const currentStep = currentStepRef.current;
    const stepChanged = targetStep !== currentStep;

    const resolvedStep = syncOsmdCursor(
      osmd,
      targetStep,
      currentStep,
      container,
      activeNoteId,
    );
    currentStepRef.current = resolvedStep;

    highlightedRef.current = highlightCurrentNotes(
      osmd,
      highlightedRef.current,
      container,
      activeNoteId,
    );

    if (stepChanged || resolvedStep !== currentStep) {
      onCursorStepChange?.(resolvedStep);
    }

    if (viewportRef.current) {
      const reduceMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const behavior: ScrollBehavior =
        reduceMotion || targetStep === 0 ? 'auto' : 'smooth';
      scrollScoreViewport(
        viewportRef.current,
        container,
        highlightedRef.current[0] ?? null,
        osmd.cursor.cursorElement ?? null,
        viewMode,
        behavior,
        targetStep,
      );
    }
  }, [cursorStepIndex, activeNoteId, viewMode, isLoading, onCursorStepChange]);

  return (
    <div
      ref={viewportRef}
      data-testid="score-scroll-viewport"
      data-note-labels={noteLabels ? 'on' : undefined}
      className={`relative flex-1 min-h-0 w-full h-full select-none ${
        viewMode === 'ribbon'
          ? 'overflow-x-auto overflow-y-hidden whitespace-nowrap'
          : 'overflow-y-auto overflow-x-hidden flex flex-col items-center'
      } ${className}`}
    >
      {isLoading && (
        <div
          className="absolute inset-0 flex items-center justify-center z-10"
          style={{ backgroundColor: 'var(--color-score-paper)' }}
        >
          <p
            className="text-sm font-medium animate-pulse"
            style={{ color: 'var(--color-accent)' }}
          >
            Loading the score…
          </p>
        </div>
      )}
      {errorMessage && (
        <div
          className="absolute inset-0 flex items-center justify-center p-4 z-10 text-center"
          style={{ backgroundColor: 'var(--color-score-paper)' }}
        >
          <p className="text-sm font-medium" style={{ color: 'var(--color-intonation-miss)' }}>
            {errorMessage}
          </p>
        </div>
      )}
      <div
        ref={containerRef}
        id="osmd-score-container"
        className={`relative isolate w-full min-h-[200px] pb-8 ${
          viewMode === 'ribbon' ? 'inline-block min-w-max' : 'max-w-4xl mx-auto'
        }`}
      />
    </div>
  );
};
