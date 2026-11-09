import type { ReactNode } from "react";
import { incrementSlotPprCount } from "../slot-ppr-tracker";

// Intentionally has NO layout_functions.ts -> effectivePpr = false in Dinou 9.4.0.
// Its own parallel slot (@panel/page.tsx) therefore also runs with ppr = false.
export default async function SlotPprSubLayout({
  children,
  panel,
}: {
  children: ReactNode;
  panel?: ReactNode;
}) {
  await new Promise((r) => setTimeout(r, 5));
  const count = incrementSlotPprCount("sub-layout-shell");
  return (
    <div
      data-testid="slot-ppr-sub-layout"
      data-render-count={String(count)}
      className="p-3 rounded-lg border border-purple-500/40 space-y-2 text-xs font-mono"
    >
      <div>Unconfigured Nested Child Layout (ppr=false, Render #{count})</div>
      <div data-testid="slot-ppr-sub-panel-wrapper">{panel}</div>
      <div>{children}</div>
    </div>
  );
}

