"use client";

export default function SlotTrigger() {
  return (
    <a
      href="/error?slot_crash=true"
      className="inline-block text-center w-full px-3 py-2 rounded-lg bg-amber-950/50 hover:bg-amber-900/50 text-amber-200 border border-amber-900/50 hover:border-amber-700/60 transition-all font-medium text-[11px] cursor-pointer text-decoration-none"
    >
      🔥 Trigger Slot Rendering Crash
    </a>
  );
}
