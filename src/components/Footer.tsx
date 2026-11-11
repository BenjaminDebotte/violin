import { Music, Github, ShieldCheck, WifiOff } from 'lucide-react';
import { APP_VERSION } from '../version';

export function Footer() {
  return (
    <footer
      data-testid="app-footer"
      className="w-full max-w-xl mx-auto px-4 py-8 mt-auto text-center border-t space-y-3"
      style={{ borderColor: 'var(--rule)', color: 'var(--ink-2)' }}
    >
      <div
        className="flex items-center justify-center gap-2 text-[14px] font-extrabold"
        style={{ color: 'var(--ink)' }}
      >
        <Music className="w-4 h-4 text-amber-500" aria-hidden="true" />
        <span>Violin Coach</span>
        <span
          className="text-[12px] font-bold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: 'var(--plate)', border: '1px solid var(--rule)' }}
        >
          v{APP_VERSION}
        </span>
      </div>

      <p className="text-[13px] leading-relaxed max-w-md mx-auto">
        Tuning: <strong>G3</strong> (196 Hz) · <strong>D4</strong> (294 Hz) · <strong>A4</strong> (440 Hz) · <strong>E5</strong> (659 Hz)
      </p>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[12px]">
        <span className="inline-flex items-center gap-1">
          <WifiOff className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
          Offline-first PWA
        </span>
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
          On-device audio
        </span>
        <a
          href="https://github.com/BenjaminDebotte/violin"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:underline font-bold"
          style={{ color: 'var(--ink)' }}
        >
          <Github className="w-3.5 h-3.5" aria-hidden="true" />
          Source code
        </a>
      </div>

      <p className="text-[11px] leading-tight" style={{ opacity: 0.7 }}>
        Place device 0.5–1.5m away on the music stand with microphone facing you.
      </p>
    </footer>
  );
}
