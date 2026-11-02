import { useEffect, useRef } from 'react';
import { X, Repeat, RotateCcw } from 'lucide-react';
import type { SessionResult } from '../../modules/practice-coach/sessionResult';

export interface ResultSheetProps {
  readonly result: SessionResult;
  readonly title: string;
  readonly subtitle: string;
  readonly barsInPlay: readonly number[];
  readonly onLoopHardBars: () => void;
  readonly onPlayAgain: () => void;
  readonly onDismiss: () => void;
}

function headlineFor(result: SessionResult): string {
  if (result.mode === 'wait-for-me') return result.hardBars.length > 0 ? 'You got through it' : 'Beautifully done';
  const a = result.summary.accuracyPercent;
  if (a >= 95) return 'Beautifully done';
  if (a >= 80) return 'Nearly there';
  if (a >= 50) return 'You got through it';
  return 'Keep at it';
}

function barsLabel(bars: readonly number[]): string {
  const min = Math.min(...bars);
  const max = Math.max(...bars);
  return min === max ? `bar ${min}` : `bars ${min} to ${max}`;
}

/**
 * Post-pass sheet: the number that matters for the mode, the bars you struggled with
 * marked on a strip of tapes, and the next step as a single thumb tap.
 */
export function ResultSheet({
  result,
  title,
  subtitle,
  barsInPlay,
  onLoopHardBars,
  onPlayAgain,
  onDismiss,
}: ResultSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { summary, hardBars, mode } = result;
  const hardSet = new Set(hardBars);
  const primary: 'loop' | 'again' = hardBars.length > 0 ? 'loop' : 'again';

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  const primaryClass =
    'w-full min-h-14 rounded-full inline-flex items-center justify-center gap-2 text-[18px] font-extrabold cursor-pointer';
  const primaryStyle = { backgroundColor: 'var(--rosin)', color: 'var(--ink)', boxShadow: 'inset 0 -4px 0 rgb(34 29 25 / 0.18)' };
  const secondaryClass =
    'flex-1 min-h-12 rounded-full inline-flex items-center justify-center gap-1.5 text-[16px] font-bold cursor-pointer';
  const secondaryStyle = { backgroundColor: 'var(--plate-2)', border: '1px solid var(--rule)', color: 'var(--ink)' };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0" style={{ backgroundColor: 'rgb(34 29 25 / 0.5)' }} aria-hidden="true" onClick={onDismiss} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Session result"
        tabIndex={-1}
        data-testid="session-summary-card"
        className="sheet-up relative w-full sm:max-w-md max-h-[92dvh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] px-5 pt-4 pb-[calc(1.25rem+var(--safe-bottom))] outline-none"
        style={{ backgroundColor: 'var(--plate)', color: 'var(--ink)' }}
      >
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close results"
          className="absolute right-3 top-3 h-11 w-11 rounded-full flex items-center justify-center cursor-pointer"
          style={{ backgroundColor: 'var(--plate-2)', color: 'var(--ink-2)' }}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="pt-6" />

        <div className="text-center mt-2">
          <h2 className="text-[28px] font-extrabold leading-tight">{headlineFor(result)}</h2>
          <p className="text-[15px] mt-0.5" style={{ color: 'var(--ink-2)' }}>
            {title}
            <br />
            {subtitle}
          </p>
        </div>

        {/* The number that matters for this mode */}
        <div className="mt-4 flex items-baseline justify-center gap-2">
          {mode === 'play-along' ? (
            <>
              <span className="text-[44px] font-extrabold tabular leading-none">{summary.accuracyPercent.toFixed(1)}%</span>
              <span className="text-[16px]" style={{ color: 'var(--ink-2)' }}>
                in tune, {summary.greenCount} of {summary.totalNotes} notes
              </span>
            </>
          ) : (
            <>
              <span className="text-[44px] font-extrabold tabular leading-none">
                {summary.totalNotes}/{summary.totalNotes}
              </span>
              <span className="text-[16px]" style={{ color: 'var(--ink-2)' }}>
                notes found
                {summary.averageAbsCentsDelta !== null ? `, ${summary.averageAbsCentsDelta.toFixed(1)} cents off centre on average` : ''}
              </span>
            </>
          )}
        </div>

        {/* Bar tapes: struggles marked */}
        <div className="mt-5">
          <div className="flex gap-[3px]" role="img" aria-label={hardBars.length ? `Hard bars: ${hardBars.join(', ')}` : 'No hard bars'}>
            {barsInPlay.map((bar) => (
              <div key={bar} className="flex-1 flex flex-col items-center gap-1">
                <span className="h-2.5 w-full rounded-full" style={{ backgroundColor: hardSet.has(bar) ? 'var(--sharp)' : 'var(--tune)' }} />
                {barsInPlay.length <= 12 && (
                  <span className="text-[12px] tabular" style={{ color: hardSet.has(bar) ? 'var(--sharp)' : 'var(--muted)', fontWeight: hardSet.has(bar) ? 800 : 500 }}>
                    {bar}
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[15px]" style={{ color: 'var(--ink-2)' }}>
            {hardBars.length > 0
              ? mode === 'play-along'
                ? `Some notes in ${barsLabel(hardBars)} were out of tune.`
                : `You spent the longest finding ${barsLabel(hardBars)}.`
              : 'No bar stood out as hard. Every bar went well.'}
          </p>
        </div>

        <div className="mt-5 space-y-2.5">
          {primary === 'loop' && (
            <button type="button" onClick={onLoopHardBars} className={primaryClass} style={primaryStyle}>
              <Repeat className="w-5 h-5" />
              Loop {barsLabel(hardBars)}
            </button>
          )}
          {primary === 'again' && (
            <button type="button" onClick={onPlayAgain} className={primaryClass} style={primaryStyle}>
              <RotateCcw className="w-5 h-5" />
              Play again
            </button>
          )}
          <div className="flex gap-2.5">
            {primary !== 'again' && (
              <button type="button" onClick={onPlayAgain} className={secondaryClass} style={secondaryStyle}>
                <RotateCcw className="w-4 h-4" />
                Play again
              </button>
            )}
            <button type="button" onClick={onDismiss} className={secondaryClass} style={secondaryStyle}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
