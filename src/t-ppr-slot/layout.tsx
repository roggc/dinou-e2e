import type { ReactNode } from "react";
import { Link } from "dinou";
import { incrementSlotPprCount } from "./slot-ppr-tracker";
import { SlotPprRefreshControls } from "./slot-ppr-client";

export default async function SlotPprOuterLayout({
  children,
  sidebar,
}: {
  children: ReactNode;
  sidebar?: ReactNode;
}) {
  await new Promise((r) => setTimeout(r, 5));
  const count = incrementSlotPprCount("outer-layout-shell");

  return (
    <div
      data-testid="slot-ppr-layout-shell"
      data-render-count={String(count)}
      className="max-w-5xl mx-auto p-6 space-y-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-indigo-500/40">
        <h1 className="text-base font-bold font-mono">
          Layout PPR -&gt; Parallel @sidebar Slot Suite (Render #{count})
        </h1>
        <div className="flex items-center gap-3 text-xs font-mono">
          <Link data-testid="slot-ppr-link-root" href="/t-ppr-slot">
            Root (/t-ppr-slot)
          </Link>
          <Link data-testid="slot-ppr-link-sub" href="/t-ppr-slot/sub">
            Nested (/t-ppr-slot/sub)
          </Link>
          <SlotPprRefreshControls />
        </div>
      </header>

      <div data-testid="slot-ppr-sidebar-wrapper">{sidebar}</div>
      <main data-testid="slot-ppr-main-wrapper">{children}</main>
    </div>
  );
}

