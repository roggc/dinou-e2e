import { Suspense, type ReactNode } from "react";
import { getContext } from "dinou";

async function LayoutDynamicBanner() {
  await new Promise((r) => setTimeout(r, 10));
  const ctx = getContext();
  const layoutCookie = ctx?.req?.cookies?.ppr_layout_banner || "default-layout-banner";
  return (
    <div
      data-testid="inherited-layout-hole-resolved"
      className="px-3 py-1.5 rounded bg-violet-900/50 border border-violet-500/40 text-xs font-mono text-violet-200"
    >
      Layout Dynamic Hole → cookie.ppr_layout_banner:{" "}
      <strong data-testid="inherited-layout-cookie">{layoutCookie}</strong>
    </div>
  );
}

export default function InheritedPprLayout({ children }: { children: ReactNode }) {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div
        data-testid="inherited-layout-shell"
        className="p-4 rounded-xl bg-slate-800/80 border border-violet-500/30 space-y-2"
      >
        <h2 className="text-sm font-bold text-violet-300">
          Inherited PPR Layout (<code>layout_functions.ts: export const ppr = true</code>)
        </h2>
        <Suspense
          fallback={
            <div data-testid="inherited-layout-hole-fallback" className="text-xs text-violet-400">
              Loading layout dynamic banner...
            </div>
          }
        >
          <LayoutDynamicBanner />
        </Suspense>
      </div>
      {children}
    </div>
  );
}

