/** Room kept above the top staff line (clef, bar numbers) and below the bottom one (stems, note names). */
export const RIBBON_TARGET_RATIO = 0.35;
export const PAGE_COMFORT_TOP_RATIO = 0.15;
export const PAGE_COMFORT_BOTTOM_RATIO = 0.78;
export const PAGE_SYSTEM_CENTER_RATIO = 0.38;
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
export function fitBand(
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
        targetLeft = Math.max(0, Math.round(noteOffsetLeft - viewport.clientWidth * RIBBON_TARGET_RATIO));
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
      const comfortTop = viewport.scrollTop + h * PAGE_COMFORT_TOP_RATIO;
      const comfortBottom = viewport.scrollTop + h * PAGE_COMFORT_BOTTOM_RATIO;
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
        targetTop = fitBand(staffBand, noteBand, h, centre - h * PAGE_SYSTEM_CENTER_RATIO);
      }
    } else if (cursorStepIndex === 0) {
      targetTop = 0;
    } else if (anchorEl && viewport.clientHeight > 0) {
      // Retained 0.2.1-era fallback: useCursorBand prevents untagged cursor rests from
      // jumping outside comfort bounds, and STAFF_MARGIN_PX = 48 preserves centering on synthetic fixtures.
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

      const comfortTop = viewportRect.top + viewport.clientHeight * PAGE_COMFORT_TOP_RATIO;
      const comfortBottom = viewportRect.top + viewport.clientHeight * PAGE_COMFORT_BOTTOM_RATIO;

      if (bandTop < comfortTop || bandBottom > comfortBottom) {
        const systemCenterClientY = (bandTop + bandBottom) / 2;
        const systemCenterScrollY =
          systemCenterClientY - viewportRect.top + viewport.scrollTop;
        targetTop = Math.max(
          0,
          Math.round(systemCenterScrollY - viewport.clientHeight * PAGE_SYSTEM_CENTER_RATIO),
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
      typeof window === 'undefined'
    ) {
      viewport.scrollLeft = targetLeft;
      viewport.scrollTop = targetTop;
    }
  }
}
