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

const HEADLINES: Record<FingeringHintReason, string | null> = {
  stuck: 'Here it is',
  'wrong-note': 'Not that one. Here it is',
  request: null,
};

// Fingerboard drawing: nut on the left, E string on top, G at the bottom.
const VB_W = 340;
const VB_H = 76;
const NUT_X = 24;
const SPAN = 643; // pixels per full string length so that offset 11 lands near the right edge
const stringY = (s: number) => 58 - 15 * s;
const offsetX = (n: number) => NUT_X + SPAN * (1 - Math.pow(2, -n / 12));

const POSITION_COLOR = { 1: 'var(--pos1)', 3: 'var(--pos3)' } as const;
const GHOST_OPACITY = 0.2;

const STRING_NAMES = ['G', 'D', 'A', 'E'] as const;

/** One mark. 3rd position is the larger disc, so where both positions share a spot, 1st sits inside 3rd. */
function Mark({ p, opacity }: { readonly p: FingerPlacement; readonly opacity: number }) {
  const cx = offsetX(p.offset);
  const cy = stringY(p.string);
  const r = p.position === 3 ? 12 : 10;
  return (
    <g opacity={opacity}>
      <circle cx={cx} cy={cy} r={r} fill={POSITION_COLOR[p.position]} />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={800} fill="var(--ink)">
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
      style={{ maxHeight: 72 }}
    >
      {/* String letter labels on the far left */}
      {[0, 1, 2, 3].map((s) => (
        <text
          key={s}
          x={10}
          y={stringY(s) + 3.5}
          textAnchor="middle"
          fontSize={10}
          fontWeight={800}
          fill="var(--bone)"
          opacity={0.65}
        >
          {STRING_NAMES[s]}
        </text>
      ))}

      {/* Nut */}
      <rect x={NUT_X - 4} y={5} width={5} height={60} rx={2} fill="var(--bone)" opacity={0.9} />

      {/* Strings */}
      {[0, 1, 2, 3].map((s) => (
        <line
          key={s}
          x1={NUT_X}
          x2={VB_W - 6}
          y1={stringY(s)}
          y2={stringY(s)}
          stroke="var(--bone)"
          strokeOpacity={0.45}
          strokeWidth={[3, 2.4, 1.8, 1.3][s]}
        />
      ))}
      {/* Reference for 3rd position: the line where the first finger lands, on every string */}
      <line
        data-testid="third-position-line"
        x1={refX}
        x2={refX}
        y1={5}
        y2={65}
        stroke="var(--pos3)"
        strokeWidth={2}
        strokeOpacity={0.75}
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

  const headline = HEADLINES[reason];

  return (
    <div
      role="region"
      aria-label="Fingering hint"
      className="panel-fingering relative rounded-[22px] px-4 pt-3 pb-3"
      style={{ backgroundColor: 'rgb(34 29 25 / 0.35)' }}
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Hide finger hint"
        className="absolute top-2 right-2 h-8 w-8 shrink-0 rounded-full inline-flex items-center justify-center cursor-pointer z-10 hover:opacity-100"
        style={{ backgroundColor: 'rgb(246 242 234 / 0.18)' }}
      >
        <X className="w-4 h-4" />
      </button>

      {headline && (
        <p className="text-[14px] font-bold pr-9 mb-1 text-amber-300">
          {headline}
        </p>
      )}

      {fingerings.length === 0 ? (
        <p className="text-[16px] font-extrabold leading-tight pr-8" aria-live="polite">
          Outside 1st and 3rd position
        </p>
      ) : (
        <ul className={`space-y-1.5 ${headline ? '' : 'pr-9'}`} aria-live="polite">
          {fingerings.map((f) => (
            <li key={f.position} className="flex items-center gap-2.5 text-[16px] font-extrabold leading-tight flex-wrap">
              <span
                className="shrink-0 px-2.5 py-0.5 text-center text-[12px] font-black rounded-full"
                style={{
                  backgroundColor: POSITION_COLOR[f.position],
                  color: 'var(--ink)',
                }}
              >
                {positionLabel(f.position)}
              </span>
              <span>{describe(f.primary)}</span>
              {f.alternates.map((a) => (
                <span key={a.string} className="text-[14px] font-normal opacity-80">
                  (or {describe(a).replace(/^Open/, 'open')})
                </span>
              ))}
            </li>
          ))}
        </ul>
      )}

      {fingerings.length > 0 && (
        <div className="mt-2">
          <FingerboardDiagram fingerings={fingerings} barMidis={barMidis} />
        </div>
      )}
    </div>
  );
}
