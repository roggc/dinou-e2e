"use client";

export default function NestedErrorBoundary({
  error,
}: {
  error: Error;
}) {
  return (
    <div className="bg-amber-950/15 border border-amber-800/40 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-amber-400 text-lg">⚠️</span>
        <div>
          <h4 className="text-sm font-semibold text-amber-200">
            Nested Local Error Boundary Captured
          </h4>
          <p className="text-[10px] text-amber-400 font-mono">
            Captured inside: <code>src/error/nested/error.tsx</code>
          </p>
        </div>
      </div>

      <p className="text-xs font-mono text-amber-300 bg-black/40 p-3 rounded border border-amber-900/45">
        [{error.name}]: {error.message}
      </p>

      <div className="flex gap-2">
        <a
          href="/error/nested"
          className="px-3.5 py-1.5 rounded-lg bg-amber-800 hover:bg-amber-700 text-white font-medium text-[11px] transition cursor-pointer text-decoration-none"
        >
          🔄 Retry Nested Page
        </a>
        <a
          href="/error"
          className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-[11px] transition cursor-pointer border border-slate-700 text-decoration-none"
        >
          🏠 Main Lab Page
        </a>
      </div>
    </div>
  );
}
