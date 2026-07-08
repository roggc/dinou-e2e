import { getContext } from "dinou";
import DemoCard from "@/demo/components/demo-card";

export default function ErrorTriggerPage() {
  const ctx = getContext();
  const query = ctx?.req.query || {};
  const shouldCrash = query.crash === "true";

  if (shouldCrash) {
    throw new Error("💥 Boom! Simulated server component rendering crash in Slot!");
  }

  return (
    <div className="space-y-8">
      <section>
        <span className="text-xs font-mono text-rose-400 bg-rose-950/50 border border-rose-900/60 px-2 py-1 rounded">
          ⚠️ Localized Slot Error Boundaries
        </span>
        <h1 className="text-4xl font-bold text-white mt-3 mb-2">Error Boundaries</h1>
        <p className="text-slate-400">
          This route showcases how Dinou isolates rendering failures. Instead of crashing the entire page,
          Dinou allows you to place an <code>error.tsx</code> file in any slot directory to capture and present errors locally.
        </p>
      </section>

      <div className="grid md:grid-cols-2 gap-6">
        <DemoCard title="Trigger Error States">
          <div className="p-6 bg-slate-900/40 rounded-xl border border-slate-800 space-y-4 text-center">
            <p className="text-sm text-slate-300">
              Click the button below to append <code>?crash=true</code> to the URL and force the server component to throw during rendering.
            </p>
            <a
              href="/demo/error-trigger?crash=true"
              className="inline-block px-5 py-3 rounded-lg bg-rose-700 hover:bg-rose-600 active:scale-95 transition text-white font-medium text-sm cursor-pointer"
            >
              🔥 Trigger Simulated Crash
            </a>
          </div>
        </DemoCard>

        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-6 space-y-4 text-sm text-slate-300">
          <h3 className="font-semibold text-white">How it works:</h3>
          <p className="text-xs text-slate-400 font-mono">
            When Dinou's layout slot compiler encounters an error during the render pass:
          </p>
          <ul className="list-disc list-inside space-y-2 text-xs text-slate-400 font-mono">
            <li>It looks for an <code>error.tsx</code> file inside the slot's directory.</li>
            <li>If found, it catches the error and mounts the custom error component.</li>
            <li>This keeps other slots (like the header nav, sidebar, or footer) fully interactive and intact!</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
