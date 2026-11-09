import { Suspense } from "react";
import { incrementSlotPprCount } from "./slot-ppr-tracker";

async function UnconfiguredMainPageAsync() {
  await new Promise((r) => setTimeout(r, 12));
  const count = incrementSlotPprCount("main-page-suspense");
  return (
    <div
      data-testid="main-page-suspense-resolved"
      data-render-count={String(count)}
    >
      Unconfigured Main Page (ppr=false) &lt;Suspense&gt; Resolved Statically Without noDynamic()! Render #{count}
    </div>
  );
}

export default async function SlotPprMainPage() {
  await new Promise((r) => setTimeout(r, 5));
  const count = incrementSlotPprCount("main-page-shell");
  return (
    <section
      data-testid="slot-ppr-main-page"
      data-render-count={String(count)}
      className="p-4 rounded-lg border border-slate-500/40 space-y-2 text-xs font-mono"
    >
      <h2 data-testid="main-page-heading">
        Unconfigured Main Page Under PPR Layout (Render #{count})
      </h2>
      <Suspense
        fallback={
          <div data-testid="main-page-suspense-fallback">
            Loading Main Page Suspense...
          </div>
        }
      >
        <UnconfiguredMainPageAsync />
      </Suspense>
    </section>
  );
}

