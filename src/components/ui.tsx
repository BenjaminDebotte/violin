import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Bottom sheet dialog: slides up from the thumb zone on phones, centred card on desktop.
 * Escape and backdrop tap close it.
 */
export function Sheet({
  label,
  title,
  onClose,
  closeLabel = 'Close',
  children,
}: {
  readonly label: string;
  readonly title: ReactNode;
  readonly onClose: () => void;
  readonly closeLabel?: string;
  readonly children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgb(34 29 25 / 0.45)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="sheet-up relative w-full sm:max-w-md max-h-[88dvh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] px-5 pt-3 pb-[calc(1.25rem+var(--safe-bottom))] outline-none"
        style={{ backgroundColor: 'var(--plate)', color: 'var(--ink)' }}
      >
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full sm:hidden" style={{ backgroundColor: 'var(--rule)' }} />
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-xl font-extrabold leading-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="h-11 w-11 shrink-0 rounded-full flex items-center justify-center cursor-pointer"
            style={{ backgroundColor: 'var(--plate-2)', color: 'var(--ink-2)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Segmented control built as an accessible radiogroup with 44 px targets. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  tone = 'light',
}: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string; readonly ariaLabel?: string }[];
  readonly onChange: (value: T) => void;
  readonly tone?: 'light' | 'dark';
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid p-1 rounded-full"
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        backgroundColor: tone === 'dark' ? 'var(--ebony-2)' : '#e8e9e2',
      }}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={opt.ariaLabel}
            onClick={() => onChange(opt.value)}
            className="min-h-11 px-3 rounded-full text-[15px] cursor-pointer transition-colors"
            style={{
              backgroundColor: selected ? (tone === 'dark' ? 'var(--bone)' : 'var(--plate)') : 'transparent',
              color: selected ? 'var(--ink)' : tone === 'dark' ? 'var(--bone)' : 'var(--ink-2)',
              fontWeight: selected ? 800 : 600,
              boxShadow: selected ? '0 1px 2px rgb(34 29 25 / 0.12)' : 'none',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
