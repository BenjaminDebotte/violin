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
                const rawPartId = parentEntry?.ParentVoice?.Parent?.Id;
                const partIdx = typeof rawPartId === 'number' ? Math.max(0, rawPartId - 1) : 0;

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

export function highlightCurrentNotes(osmd: OpenSheetMusicDisplay, previous: readonly Element[]): Element[] {
  for (const el of previous) el.classList.remove(CURRENT_NOTE_CLASS);
  const next: Element[] = [];
  try {
    const instrument = osmd.Sheet?.Instruments?.[0];
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

/** Puts the OSMD cursor on a step after a fresh render (which resets it). */
function restoreCursor(osmd: OpenSheetMusicDisplay, step: number): void {
  if (!osmd.cursor) return;
  osmd.cursor.show();
  osmd.cursor.reset();
  for (let s = 0; s < step; s++) {
    osmd.cursor.next();
    if (osmd.cursor.iterator.EndReached) break;
  }
  osmd.cursor.update();
}

export interface ScoreViewportProps {
  readonly xmlContent?: string;
  readonly viewMode?: 'page' | 'ribbon';
  readonly cursorStepIndex?: number;
  readonly zoom?: number;
  readonly onCursorStepChange?: (stepIndex: number) => void;
  readonly className?: string;
}

export const ScoreViewport: React.FC<ScoreViewportProps> = ({
  xmlContent,
  viewMode = 'page',
  cursorStepIndex = 0,
  zoom = 1.0,
  onCursorStepChange,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const currentStepRef = useRef<number>(0);
  const highlightedRef = useRef<Element[]>([]);
  const renderedSvgRef = useRef<Element | null>(null);
  const loadedXmlRef = useRef<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
        // Rosin-amber playhead: reads as "you are here" without competing with note colours
        cursorsOptions: [{ type: CursorType.Standard, color: '#f0a630', alpha: 0.45, follow: true }],
      });
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
    restoreCursor(osmd, currentStepRef.current);
    repaintRecordedNotes(container);
    highlightedRef.current = highlightCurrentNotes(osmd, highlightedRef.current);
    renderedSvgRef.current = container.querySelector('svg');
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
        // A different score starts clean; a zoom or layout change of the same score keeps its colours
        if (loadedXmlRef.current !== xmlContent) {
          if (containerRef.current) clearRecordedNotes(containerRef.current);
          currentStepRef.current = 0;
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

  // Cursor synchronization
  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd || !osmd.cursor || isLoading) return;

    const targetStep = Math.max(0, cursorStepIndex);
    const currentStep = currentStepRef.current;

    if (targetStep === currentStep) {
      highlightedRef.current = highlightCurrentNotes(osmd, highlightedRef.current);
      return;
    }

    if (targetStep > currentStep) {
      for (let s = currentStep; s < targetStep; s++) {
        osmd.cursor.next();
        if (osmd.cursor.iterator.EndReached) break;
      }
    } else {
      osmd.cursor.reset();
      for (let s = 0; s < targetStep; s++) {
        osmd.cursor.next();
        if (osmd.cursor.iterator.EndReached) break;
      }
    }

    currentStepRef.current = targetStep;
    highlightedRef.current = highlightCurrentNotes(osmd, highlightedRef.current);
    onCursorStepChange?.(targetStep);

    // Keep the note to play in view. The OSMD cursor image is 1 px tall and sits behind the
    // score, so the highlighted note itself is the better scroll target.
    const follow = highlightedRef.current[0] ?? osmd.cursor.cursorElement;
    if (containerRef.current && follow && typeof follow.scrollIntoView === 'function') {
      const reduceMotion =
        typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const behavior = reduceMotion ? 'auto' : 'smooth';
      follow.scrollIntoView(
        viewMode === 'ribbon'
          ? { behavior, block: 'center', inline: 'center' }
          : { behavior, block: 'nearest', inline: 'nearest' },
      );
    }
  }, [cursorStepIndex, viewMode, isLoading, onCursorStepChange]);

  return (
    <div
      className={`relative w-full h-full select-none ${
        viewMode === 'ribbon'
          ? 'overflow-x-auto overflow-y-hidden whitespace-nowrap'
          : 'overflow-auto flex flex-col items-center'
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
        className={`relative isolate w-full min-h-[200px] ${
          viewMode === 'ribbon' ? 'inline-block min-w-max' : 'max-w-4xl mx-auto'
        }`}
      />
    </div>
  );
};
