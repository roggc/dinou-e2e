import { Suspense } from "react";
import { incrementSlotPprCount } from "../../slot-ppr-tracker";

async function SubPanelAsyncStaticByDefault() {
  await new Promise((r) => setTimeout(r, 12));
  const count = incrementSlotPprCount("sub-panel-suspense");
  return (
    <div
      data-testid="sub-panel-suspense-resolved"
      data-render-count={String(count)}
    >
      Nested @panel Slot Under Unconfigured Child Layout (ppr=false) Resolved Statically Without noDynamic()! Render #{count}
    </div>
  );
}

export default async function SlotPprSubPanelPage() {
  await new Promise((r) => setTimeout(r, 5));
  const count = incrementSlotPprCount("sub-panel-shell");
  return (
    <div
      data-testid="sub-panel-slot-shell"
      data-render-count={String(count)}
      className="p-2 rounded border border-purple-400/40 space-y-1"
    >
      <div>Nested @panel Parallel Slot Shell (Render #{count})</div>
      <Suspense
        fallback={
          <div data-testid="sub-panel-suspense-fallback">
            Loading Nested @panel Suspense...
          </div>
        }
      >
        <SubPanelAsyncStaticByDefault />
      </Suspense>
    </div>
  );
}

