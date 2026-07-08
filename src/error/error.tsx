"use client";

export default function ErrorBoundaryPage({
  error,
  reset,
}: {
  error: Error;
  reset?: () => void;
}) {
  if (typeof window !== "undefined" && window.location.search.includes("double_crash=true")) {
    throw new Error("💥 Double Crash! The custom error boundary component itself has crashed!");
  }

  return (
    <div className="bg-rose-950/20 border border-rose-800/60 rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-rose-900/50 flex items-center justify-center text-rose-400 text-xl font-bold border border-rose-800/40">
          ⚠️
        </div>
        <div>
          <h2 className="text-lg font-semibold text-rose-200">
            Dinou Page Boundary Captured an Error
          </h2>
          <p className="text-xs text-rose-400 font-mono">
            Captured inside: <code>src/error/error.tsx</code>
          </p>
        </div>
      </div>

      <div className="bg-black/40 border border-rose-950 rounded-lg p-4 font-mono text-xs text-rose-300 overflow-x-auto max-w-full space-y-2">
        <p className="font-semibold text-rose-200">[{error.name || "Error"}]: {error.message}</p>
        {error.stack && (
          <pre className="text-[10px] text-rose-400 leading-relaxed max-h-48 overflow-y-auto">
            {error.stack}
          </pre>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        {reset && (
          <button
            onClick={reset}
            className="px-4 py-2 rounded-lg bg-rose-700 hover:bg-rose-600 text-white font-medium text-xs transition cursor-pointer"
          >
            🔄 Try Again
          </button>
        )}
        <a
          href="/error"
          className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs transition cursor-pointer text-decoration-none"
        >
          🏠 Reset Demo Page
        </a>
      </div>
    </div>
  );
}
