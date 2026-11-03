import { X } from 'lucide-react';
import { useNoteName } from '../../modules/notation/NotationContext';
import {
  OPEN_STRING_LABELS,
  REFERENCE_OFFSET,
  placementsForNotes,
  positionLabel,
  type FingerPlacement,
  type PositionFingering,
} from '../../modules/fingerboard/fingering';
import type { HintReason } from '../../modules/practice-coach/hintTracker';

export type FingeringHintReason = HintReason | 'request';

export interface FingeringHintProps {
  readonly fingerings: readonly PositionFingering[];
  readonly reason: FingeringHintReason;
  /** MIDI numbers of the notes in the current bar, drawn faintly behind the target. */
  readonly barMidis?: readonly number[];
  readonly onDismiss: () => void;
}

const HEADLINES: Record<FingeringHintReason, string> = {
  stuck: 'Here it is',
  'wrong-note': 'Not that one. Here it is',
  request: 'Where to put your finger',
};

// Fingerboard drawing: nut on the left, E string on top, G at the bottom.
const VB_W = 340;
const VB_H = 70;
const NUT_X = 18;
const SPAN = 643; // pixels per full string length so that offset 11 lands near the right edge
const stringY = (s: number) => 56 - 14 * s;
const offsetX = (n: number) => NUT_X + SPAN * (1 - Math.pow(2, -n / 12));

const POSITION_COLOR = { 1: 'var(--pos1)', 3: 'var(--pos3)' } as const;
const GHOST_OPACITY = 0.2;

/** One mark. 3rd position is the larger disc, so where both positions share a spot, 1st sits inside 3rd. */
function Mark({ p, opacity }: { readonly p: FingerPlacement; readonly opacity: number }) {
  const cx = offsetX(p.offset);
  const cy = stringY(p.string);
  const r = p.position === 3 ? 12 : 8.5;
  return (
    <g opacity={opacity}>
      <circle cx={cx} cy={cy} r={r} fill={POSITION_COLOR[p.position]} />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={r > 10 ? 12 : 11} fontWeight={800} fill="var(--ink)">
        {p.finger}
      </text>
    </g>
  );
}

function FingerboardDiagram({
  fingerings,
  barMidis,
}: {
  readonly fingerings: readonly PositionFingering[];
  readonly barMidis: readonly number[];
}) {
  const refX = offsetX(REFERENCE_OFFSET[3]);
  const alternates = fingerings.flatMap((f) => f.alternates);
  // Draw 3rd position under 1st so a shared spot reads as an amber dot inside a cyan ring.
  const primaries = [...fingerings].sort((a, b) => b.position - a.position).map((f) => f.primary);
  return (
    <svg
      className="fing-diagram w-full h-auto"
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      aria-hidden="true"
      style={{ maxHeight: 78 }}
    >
      <rect x={NUT_X - 4} y={4} width={5} height={58} rx={2} fill="var(--bone)" opacity={0.9} />
      {[0, 1, 2, 3].map((s) => (
        <line
          key={s}
          x1={NUT_X}
          x2={VB_W - 6}
          y1={stringY(s)}
          y2={stringY(s)}
          stroke="var(--bone)"
          strokeOpacity={0.45}
          strokeWidth={[2.6, 2, 1.6, 1.2][s]}
        />
      ))}
      {/* Reference for 3rd position: the line where the first finger lands, on every string */}
      <line
        data-testid="third-position-line"
        x1={refX}
        x2={refX}
        y1={4}
        y2={62}
        stroke="var(--pos3)"
        strokeWidth={2}
        strokeOpacity={0.7}
      />
      {/* The rest of this bar, barely there: spacing between dots is the real interval */}
      <g data-testid="bar-notes">
        {placementsForNotes(barMidis).map((p) => (
          <g key={`${p.position}-${p.string}-${p.offset}`} data-ghost={`${p.position}`}>
            <Mark p={p} opacity={GHOST_OPACITY} />
          </g>
        ))}
      </g>
      {alternates.map((a) => (
        <Mark key={`alt-${a.position}-${a.string}`} p={a} opacity={0.4} />
      ))}
      {primaries.map((p) => (
        <Mark key={`main-${p.position}`} p={p} opacity={1} />
      ))}
    </svg>
  );
}

/**
 * Shown inside the pitch panel in place of the cents meter, so the verdict colour and the
 * target note stay visible. Text first (readable from the music stand), diagram second.
 * Two positions can show at once, told apart by colour (1st amber, 3rd cyan) and size.
 */
export function FingeringHint({ fingerings, reason, barMidis = [], onDismiss }: FingeringHintProps) {
  const noteName = useNoteName();
  const stringName = (s: number) => `${noteName(OPEN_STRING_LABELS[s]).replace(/-?\d+$/, '')} string`;

  const describe = (p: FingerPlacement): string => {
    if (p.finger === 0) return `Open ${stringName(p.string)}`;
    const variant = p.variant === 'normal' ? '' : `, ${p.variant === 'extended' ? 'stretched' : p.variant}`;
    return `${stringName(p.string)}, finger ${p.finger}${variant}`;
  };

  return (
    <div
      role="region"
      aria-label="Fingering hint"
      className="panel-fingering relative rounded-[20px] px-3.5 pt-2 pb-2.5"
      style={{ backgroundColor: 'rgb(34 29 25 / 0.28)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[14px] font-semibold" style={{ opacity: 0.85 }}>
          {HEADLINES[reason]}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Hide finger hint"
          className="-mr-1.5 h-9 w-9 shrink-0 rounded-full inline-flex items-center justify-center cursor-pointer"
          style={{ backgroundColor: 'rgb(246 242 234 / 0.14)' }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {fingerings.length === 0 ? (
        <p className="mt-1 text-[18px] font-extrabold leading-tight" aria-live="polite">
          Outside 1st and 3rd position
        </p>
      ) : (
        <ul className="mt-0.5 space-y-1" aria-live="polite">
          {fingerings.map((f) => (
            <li key={f.position}>
              <p className="flex items-center gap-2 text-[20px] font-extrabold leading-tight">
                <span
                  className="shrink-0 w-[56px] text-center text-[13px] font-bold rounded-full py-0.5"
                  style={{
                    backgroundColor: POSITION_COLOR[f.position],
                    color: 'var(--ink)',
                  }}
                >
                  {positionLabel(f.position)}
                </span>
                <span>{describe(f.primary)}</span>
              </p>
              {f.alternates.map((a) => (
                <p key={a.string} className="ml-[64px] text-[13px]" style={{ opacity: 0.75 }}>
                  or {describe(a).replace(/^Open/, 'open')}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}

      {fingerings.length > 0 && (
        <div className="mt-1.5">
          <FingerboardDiagram fingerings={fingerings} barMidis={barMidis} />
        </div>
      )}
    </div>
  );
}
