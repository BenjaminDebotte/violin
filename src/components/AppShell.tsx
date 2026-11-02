import { Music, Library, AudioLines, Settings, type LucideIcon } from 'lucide-react';

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
  readonly Icon: LucideIcon;
}

const NAV_ITEMS: readonly NavItem[] = [
  { page: 'studio', label: 'Studio', ariaLabel: 'Practice Studio Tab', route: '#/practice', Icon: Music },
  { page: 'library', label: 'Library', ariaLabel: 'Repertoire Library Tab', route: '#/library', Icon: Library },
  { page: 'tuner', label: 'Tuner', ariaLabel: 'Violin Tuner Tab', route: '#/tuner', Icon: AudioLines },
  { page: 'settings', label: 'Settings', ariaLabel: 'Calibration Settings Tab', route: '#/settings', Icon: Settings },
];

/**
 * Phone-first AppShell. A single <nav> (Studio, Library, Tuner, Settings) is pinned to the
 * bottom of the screen as a tab bar on phones (safe-area aware) and sits in the masthead
 * from `sm` upwards. Includes a quick status badge showing A4 Hz and tolerance cents.
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
      className="min-h-dvh flex flex-col font-sans"
      style={{
        backgroundColor: 'var(--color-paper)',
        color: 'var(--color-ink)',
      }}
      data-testid="app-shell"
    >
      {/* Ruled Urtext Masthead Header */}
      <header
        className="border-b flex items-center justify-between gap-3 sm:gap-4 sticky top-0 z-40 select-none px-3 py-2 sm:px-6 sm:py-3 pt-[max(0.5rem,env(safe-area-inset-top))]"
        style={{
          borderColor: 'var(--color-rule)',
          backgroundColor: 'var(--color-paper)',
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
        <div className="flex items-center gap-3 sm:gap-6 ml-auto shrink-0">
          {/* 4 Quiet Navigation Tabs */}
          <nav
            className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t sm:static sm:z-auto sm:flex sm:items-center sm:gap-4 sm:border-t-0 pb-[env(safe-area-inset-bottom)] sm:pb-0"
            style={{ backgroundColor: 'var(--color-paper)', borderColor: 'var(--color-rule)' }}
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
                  className="flex flex-col items-center justify-center gap-0.5 h-14 sm:h-auto sm:flex-row px-2.5 sm:px-3 sm:py-2 text-[11px] sm:text-sm font-medium transition cursor-pointer shrink-0 sm:border-b-2 border-t-2 sm:border-t-0 -mt-px sm:mt-0"
                  style={{
                    color: isActive ? 'var(--color-accent)' : 'var(--color-ink-2)',
                    borderColor: isActive ? 'var(--color-accent)' : 'transparent',
                    fontWeight: isActive ? 600 : 500,
                  }}
                >
                  <item.Icon className="w-5 h-5 sm:hidden" aria-hidden="true" />
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
              className="px-2.5 py-1.5 text-[11px] sm:text-xs font-mono transition border cursor-pointer hover:opacity-90 whitespace-nowrap"
              style={{
                backgroundColor: 'var(--color-score-paper)',
                borderColor: 'var(--color-rule)',
                color: 'var(--color-ink)',
                borderRadius: '2px',
              }}
            >
              A4={referenceA4Hz}Hz<span className="hidden min-[400px]:inline"> · ±{toleranceCents}¢</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col pb-[var(--bottom-nav-h)] sm:pb-0">{children}</main>

      {/* Urtext Minimal Guild Mast Footer */}
      <footer
        className="hidden sm:flex border-t flex-wrap items-center justify-between gap-3 text-xs select-none"
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
