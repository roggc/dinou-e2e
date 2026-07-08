"use client";

export default function SlotError({
  error,
}: {
  error: Error;
}) {
  return (
    <div className="p-4 bg-rose-950/20 border border-rose-800/40 space-y-3 rounded-lg">
      <div className="flex items-center gap-2">
        <span className="text-rose-400 font-bold">⚠️</span>
        <h4 className="text-xs font-semibold text-rose-200">
          Slot Error Caught
        </h4>
      </div>
      <p className="text-[10px] text-rose-300 font-mono leading-relaxed bg-black/35 p-2 rounded border border-rose-950">
        {error.message || "Unknown error inside slot"}
      </p>
      <a
        href="/error"
        className="inline-block text-center w-full px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-855 text-slate-300 font-medium text-[10px] transition cursor-pointer border border-slate-800 text-decoration-none"
      >
        🔄 Reset Slot
      </a>
    </div>
  );
}
