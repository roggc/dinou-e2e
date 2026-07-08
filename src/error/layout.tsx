import type { ReactNode } from "react";

export default function ErrorDemoLayout({
  children,
  error_slot,
}: {
  children: ReactNode;
  error_slot: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col antialiased">
      {/* Top Navbar */}
      <header className="border-b border-slate-900 bg-slate-950/70 backdrop-blur sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold bg-gradient-to-r from-rose-500 to-amber-500 bg-clip-text text-transparent">
            Dinou Error Testing Lab
          </span>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-950/50 text-rose-400 border border-rose-900/50">
            v5.0.3 Debug
          </span>
        </div>
        <nav className="flex items-center gap-4">
          <a
            href="/"
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            ← Back to Home
          </a>
          <a
            href="/demo"
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            Demo App
          </a>
        </nav>
      </header>

      {/* Main Layout Grid */}
      <div className="flex-grow max-w-7xl w-full mx-auto p-6 grid lg:grid-cols-3 gap-6">
        {/* Left Col: Triggers and Explanations */}
        <main className="lg:col-span-2 space-y-6">
          {children}
        </main>

        {/* Right Col: Isolated Slots & Diagnostics */}
        <aside className="space-y-6">
          <div className="bg-slate-900/30 border border-slate-900 rounded-xl p-5 backdrop-blur-sm space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
              Slot-Level Error Boundary
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Below is a parallel slot (<code>@error_slot</code>) nested inside this layout. You can trigger an error inside it independently of the main content.
            </p>
            <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950/40">
              {error_slot}
            </div>
          </div>

          <div className="bg-slate-900/30 border border-slate-900 rounded-xl p-5 backdrop-blur-sm space-y-3">
            <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
              Diagnostic Logs
            </h3>
            <p className="text-xs text-slate-400">
              Open the browser DevTools console to watch React's error boundary logs and hydration warnings in real-time.
            </p>
            <div className="bg-black/40 border border-slate-800 rounded-lg p-3 text-[10px] font-mono text-emerald-400">
              [System Status: Active]<br />
              [Router Version: ESM v5.0.3]<br />
              [Listening for triggers...]
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
