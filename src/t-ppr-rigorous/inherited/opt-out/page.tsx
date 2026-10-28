import { Suspense } from "react";
import { getContext } from "dinou";

async function OptOutDynamicContent() {
  await new Promise((r) => setTimeout(r, 10));
  const ctx = getContext();
  const user = ctx?.req?.cookies?.ppr_user || "opt-out-guest";
  return (
    <div data-testid="opt-out-dynamic" className="text-xs font-mono text-amber-300">
      Opt-Out Dynamic User: <strong data-testid="opt-out-user">{user}</strong>
    </div>
  );
}

export default function OptOutPprPage() {
  return (
    <div
      data-testid="opt-out-page"
      className="p-4 rounded-xl bg-slate-900 border border-amber-500/40 space-y-2"
    >
      <h1 className="text-lg font-bold text-amber-300">
        /t-ppr-rigorous/inherited/opt-out (Explicitly Opts Out: <code>ppr = false</code>)
      </h1>
      <Suspense fallback={<div>Loading opt-out...</div>}>
        <OptOutDynamicContent />
      </Suspense>
    </div>
  );
}

