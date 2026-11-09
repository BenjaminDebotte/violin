import React, { useCallback, useEffect, useRef, useState } from 'react';
import { OpenSheetMusicDisplay, CursorType } from 'opensheetmusicdisplay';
import {
  tagOsmdSvgNotes,
  syncNoteLabels,
  clearRecordedNotes,
  repaintRecordedNotes,
  highlightCurrentNotes,
  resolveSoloInstrumentIndex,
  resolveInstrumentForNoteId,
  cursorContainsNoteId,
} from './score/scoreSvg';
import { scrollScoreViewport } from './score/scoreScroll';

export * from './score/scoreSvg';
export * from './score/scoreScroll';

function hasNoSvgElements(cursor: NonNullable<OpenSheetMusicDisplay['cursor']>): boolean {
  const gNotes = cursor.GNotesUnderCursor?.() ?? [];
  return (
    gNotes.length > 0 &&
    gNotes.every(
      (n) => !(n as unknown as { getSVGGElement?: () => SVGElement | null }).getSVGGElement?.(),
    )
  );
}

function scanCursorForNote(
  osmd: OpenSheetMusicDisplay,
  activeNoteId: string,
  instrument: unknown,
  startStep: number,
  maxSteps: number,
): number | null {
  const cursor = osmd.cursor;
  if (!cursor) return null;

  if (cursorContainsNoteId(osmd, activeNoteId, instrument)) {
    cursor.update?.();
    return startStep;
  }

  for (let i = 0; i < maxSteps; i++) {
    if (cursor.iterator?.EndReached) break;
    if (i > 0 && hasNoSvgElements(cursor)) break;
    cursor.next();
    const current = startStep + i + 1;
    if (cursorContainsNoteId(osmd, activeNoteId, instrument)) {
      cursor.update?.();
      return current;
    }
  }
  return null;
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
    if (targetStep >= currentStep) {
      const found = scanCursorForNote(osmd, activeNoteId, instrument, currentStep, 64);
      if (found !== null) return found;
    }
    osmd.cursor.reset();
    const found = scanCursorForNote(osmd, activeNoteId, instrument, 0, 2000);
    if (found !== null) return found;

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

  const triggerScroll = useCallback(
    (behavior: ScrollBehavior = 'auto', step = currentStepRef.current) => {
      const viewport = viewportRef.current;
      const container = containerRef.current;
      if (!viewport || !container) return;
      scrollScoreViewport(
        viewport,
        container,
        highlightedRef.current[0] ?? null,
        osmdRef.current?.cursor?.cursorElement ?? null,
        viewModeRef.current,
        behavior,
        step,
      );
    },
    [],
  );

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
    triggerScroll('auto', currentStepRef.current);
  }, [triggerScroll]);

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
      triggerScroll('auto');
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
      triggerScroll(behavior, targetStep);
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

export default ScoreViewport;
