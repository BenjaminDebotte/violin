import { ListMusic, AudioLines, Settings, type LucideIcon } from 'lucide-react';

export type AppPage = 'songs' | 'play' | 'tune' | 'settings';

export const PAGE_ROUTES: Readonly<Record<AppPage, string>> = {
  songs: '#/songs',
  play: '#/play',
  tune: '#/tune',
  settings: '#/settings',
};

/** Hash → page, including the routes of the previous four-page layout. */
export function pageFromHash(hash: string): AppPage {
  const h = hash.toLowerCase();
  if (h.startsWith('#/play') || h.startsWith('#/practice')) return 'play';
  if (h.startsWith('#/songs') || h.startsWith('#/library')) return 'songs';
  if (h.startsWith('#/tune')) return 'tune'; // also matches legacy #/tuner
  if (h.startsWith('#/settings') || h.startsWith('#/me')) return 'settings';
  return 'songs';
}

export interface AppShellProps {
  readonly activePage: AppPage;
  readonly onNavigate: (page: AppPage) => void;
  readonly children: React.ReactNode;
}

interface NavItem {
  readonly page: Exclude<AppPage, 'play'>;
  readonly label: string;
  readonly Icon: LucideIcon;
}

const NAV_ITEMS: readonly NavItem[] = [
  { page: 'songs', label: 'Songs', Icon: ListMusic },
  { page: 'tune', label: 'Tune', Icon: AudioLines },
  { page: 'settings', label: 'Settings', Icon: Settings },
];

/**
 * Phone-first shell. Three tabs in the thumb zone (bottom bar, safe-area aware); a left
 * rail from 1024 px. The play screen is full-bleed: the tab bar steps aside so the score
 * and the pitch feedback own the whole screen.
 */
export function AppShell({ activePage, onNavigate, children }: AppShellProps) {
  const isPlay = activePage === 'play';

  const handleTabClick = (page: AppPage, e: React.MouseEvent) => {
    e.preventDefault();
    const route = PAGE_ROUTES[page];
    if (typeof window !== 'undefined' && window.location.hash !== route) {
      window.location.hash = route;
    }
    onNavigate(page);
  };

  return (
    <div className="min-h-dvh flex flex-col" data-testid="app-shell">
      <main
        className={`flex-1 flex flex-col ${
          isPlay ? '' : 'pb-[var(--tabbar-h)] lg:pb-0 lg:pl-24'
        }`}
      >
        {children}
      </main>

      {!isPlay && (
        <nav
          aria-label="Main navigation"
          className="fixed z-40 inset-x-0 bottom-0 grid grid-cols-3 border-t pb-[var(--safe-bottom)]
                     lg:inset-x-auto lg:left-0 lg:top-0 lg:bottom-0 lg:w-24 lg:grid-cols-1 lg:auto-rows-min lg:gap-2 lg:border-t-0 lg:border-r lg:pt-8"
          style={{ backgroundColor: 'var(--ground)', borderColor: 'var(--rule)' }}
        >
          <span
            className="hidden lg:block text-center text-[13px] font-extrabold leading-tight pb-6"
            style={{ color: 'var(--ink)' }}
          >
            Violin
            <br />
            Coach
          </span>
          {NAV_ITEMS.map(({ page, label, Icon }) => {
            const isActive = activePage === page;
            return (
              <a
                key={page}
                href={PAGE_ROUTES[page]}
                onClick={(e) => handleTabClick(page, e)}
                aria-current={isActive ? 'page' : undefined}
                className="relative flex flex-col items-center justify-center gap-1 h-16 text-[13px] cursor-pointer select-none"
                style={{
                  color: isActive ? 'var(--ink)' : 'var(--muted)',
                  fontWeight: isActive ? 800 : 600,
                }}
              >
                {/* Active tab wears a strip of rosin "fingerboard tape" */}
                <span
                  aria-hidden="true"
                  className="absolute top-0 h-[5px] w-10 rounded-b-full lg:top-1/2 lg:left-0 lg:h-10 lg:w-[5px] lg:-translate-y-1/2 lg:rounded-b-none lg:rounded-r-full transition-opacity"
                  style={{ backgroundColor: 'var(--rosin)', opacity: isActive ? 1 : 0 }}
                />
                <Icon className="w-6 h-6" strokeWidth={isActive ? 2.4 : 1.8} aria-hidden="true" />
                {label}
              </a>
            );
          })}
        </nav>
      )}
    </div>
  );
}
