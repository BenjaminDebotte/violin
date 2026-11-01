export type AppPage = 'studio' | 'library' | 'tuner' | 'settings';

export interface AppShellProps {
  readonly activePage: AppPage;
  readonly onNavigate: (page: AppPage) => void;
  readonly activeScoreTitle?: string;
  readonly referenceA4Hz: number;
  readonly toleranceCents: number;
  readonly onOpenCalibration?: () => void;
  readonly children: React.ReactNode;
}

interface NavItem {
  readonly page: AppPage;
  readonly label: string;
  readonly ariaLabel: string;
  readonly route: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  { page: 'studio', label: 'Studio', ariaLabel: 'Practice Studio Tab', route: '#/practice' },
  { page: 'library', label: 'Library', ariaLabel: 'Repertoire Library Tab', route: '#/library' },
  { page: 'tuner', label: 'Tuner', ariaLabel: 'Violin Tuner Tab', route: '#/tuner' },
  { page: 'settings', label: 'Settings', ariaLabel: 'Calibration Settings Tab', route: '#/settings' },
];

/**
 * Ruled Urtext Archive AppShell Masthead with 4 edge-aligned tabs:
 * Studio, Library, Tuner, Settings.
 * Has Henle Prussian Blue 2px bottom border on the active tab and
 * quick status badge showing A4 Hz and intonation tolerance cents.
 */
export function AppShell({
  activePage,
  onNavigate,
  activeScoreTitle,
  referenceA4Hz,
  toleranceCents,
  onOpenCalibration,
  children,
}: AppShellProps) {
  const handleTabClick = (page: AppPage, route: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (typeof window !== 'undefined' && window.location.hash !== route) {
      window.location.hash = route;
    }
    onNavigate(page);
  };

  const handleStatusBadgeClick = () => {
    if (onOpenCalibration) {
      onOpenCalibration();
    } else {
      if (typeof window !== 'undefined') {
        window.location.hash = '#/settings';
      }
      onNavigate('settings');
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col font-sans"
      style={{
        backgroundColor: 'var(--color-paper)',
        color: 'var(--color-ink)',
      }}
      data-testid="app-shell"
    >
      {/* Ruled Urtext Masthead Header */}
      <header
        className="border-b flex flex-wrap items-center justify-between gap-4 sticky top-0 z-40 select-none"
        style={{
          borderColor: 'var(--color-rule)',
          backgroundColor: 'var(--color-paper)',
          padding: '12px 24px',
        }}
      >
        {/* Brand Group */}
        <div className="flex items-baseline gap-3 min-w-0">
          <h1
            className="font-display text-xl sm:text-2xl font-bold tracking-tight truncate cursor-pointer"
            onClick={(e) => handleTabClick('studio', '#/practice', e)}
            title="Urtext Violin Coach"
          >
            Urtext Violin Coach
          </h1>
          {activeScoreTitle ? (
            <span
              className="text-xs sm:text-sm font-sans truncate hidden md:inline"
              style={{ color: 'var(--color-muted)' }}
              title={activeScoreTitle}
            >
              · {activeScoreTitle}
            </span>
          ) : (
            <span
              className="text-xs sm:text-sm font-sans truncate hidden sm:inline"
              style={{ color: 'var(--color-muted)' }}
            >
              G. Henle Verlag Urtext Archive Edition
            </span>
          )}
        </div>

        {/* Right-aligned navigation tabs and calibration badge */}
        <div className="flex items-center gap-4 sm:gap-6 ml-auto">
          {/* 4 Quiet Navigation Tabs */}
          <nav
            className="flex items-center gap-1 sm:gap-4 overflow-x-auto"
            aria-label="Main Navigation"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = activePage === item.page;
              return (
                <a
                  key={item.page}
                  href={item.route}
                  onClick={(e) => handleTabClick(item.page, item.route, e)}
                  aria-label={item.ariaLabel}
                  aria-current={isActive ? 'page' : undefined}
                  className="px-2.5 sm:px-3 py-1.5 sm:py-2 text-sm font-medium transition cursor-pointer shrink-0 border-b-2"
                  style={{
                    color: isActive ? 'var(--color-accent)' : 'var(--color-ink-2)',
                    borderColor: isActive ? 'var(--color-accent)' : 'transparent',
                    fontWeight: isActive ? 600 : 500,
                  }}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          {/* Quick Status Badge: A4 reference Hz & tolerance cents */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleStatusBadgeClick}
              aria-label="Calibration Settings Badge"
              title="Click to view calibration and audio settings"
              className="px-2.5 py-1 text-xs font-mono transition border cursor-pointer hover:opacity-90"
              style={{
                backgroundColor: 'var(--color-score-paper)',
                borderColor: 'var(--color-rule)',
                color: 'var(--color-ink)',
                borderRadius: '2px',
              }}
            >
              A4={referenceA4Hz}Hz · ±{toleranceCents}¢
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col">{children}</main>

      {/* Urtext Minimal Guild Mast Footer */}
      <footer
        className="border-t flex flex-wrap items-center justify-between gap-3 text-xs select-none"
        style={{
          borderColor: 'var(--color-rule)',
          backgroundColor: 'var(--color-paper)',
          padding: '12px 24px',
          color: 'var(--color-muted)',
        }}
      >
        <span>G. Henle Urtext Archive Aesthetic · Interactive Violin Practice Coach</span>
        <span className="font-mono text-[11px]">Cardo &amp; Hanken Grotesk &amp; JetBrains Mono · Web Audio Pitch Engine</span>
      </footer>
    </div>
  );
}
