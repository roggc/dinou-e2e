import { Suspense } from "react";
import { getContext } from "dinou";

async function InheritedPageDynamicContent() {
  await new Promise((r) => setTimeout(r, 10));
  const ctx = getContext();
  const user = ctx?.req?.cookies?.ppr_user || "inherited-guest";
  const q = String(ctx?.req?.query?.from || "inherited-default");
  return (
    <div
      data-testid="inherited-page-hole-resolved"
      className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-500/40 text-xs font-mono text-emerald-200"
    >
      Inherited Page Hole → user: <strong data-testid="inherited-page-user">{user}</strong> | from:{" "}
      <strong data-testid="inherited-page-from">{q}</strong>
    </div>
  );
}

export default function InheritedPprPage() {
  const staticShellId = `inherited-shell-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div
      data-testid="inherited-page-shell"
      className="p-4 rounded-xl bg-slate-900 border border-slate-700 space-y-3"
    >
      <h1 className="text-lg font-bold text-white">
        /t-ppr-rigorous/inherited (Inherits PPR from Parent Layout)
      </h1>
      <p className="text-xs text-slate-400 font-mono">
        staticShellId: <span data-testid="inherited-shell-id">{staticShellId}</span>
      </p>
      <Suspense
        fallback={
          <div data-testid="inherited-page-hole-fallback" className="text-xs text-emerald-400">
            Loading inherited page hole...
          </div>
        }
      >
        <InheritedPageDynamicContent />
      </Suspense>
    </div>
  );
}

