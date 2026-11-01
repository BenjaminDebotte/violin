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
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-md space-y-4">
          <h2 className="text-2xl font-semibold">Welcome to Violin Coach</h2>
          <p className="text-slate-400 text-sm">
            Interactive practice companion featuring Wait-for-Me and Play-Along
            modes with real-time intonation feedback.
          </p>
        </div>
      </main>
    </div>
  );
}
