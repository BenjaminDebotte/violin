import { TunerHUD } from './components/TunerHUD';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight text-emerald-400">
          Violin Coach PWA
        </h1>
        <p className="text-sm text-slate-400">
          Interactive Solo Violin Practice
        </p>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center p-6 gap-6 max-w-2xl mx-auto w-full">
        <div className="text-center max-w-md space-y-2">
          <h2 className="text-2xl font-semibold">Live Violin Tuner</h2>
          <p className="text-slate-400 text-sm">
            High-precision acoustic violin pitch detection with 3-frame median filtering,
            live cents meter, and microphone selection.
          </p>
        </div>
        <div className="w-full">
          <TunerHUD />
        </div>
      </main>
    </div>
  );
}
