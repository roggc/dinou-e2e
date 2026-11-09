import { Suspense } from "react";
import { getContext, noDynamic } from "dinou";
import { incrementSlotPprCount } from "../slot-ppr-tracker";
import { SlotPprClientCounter } from "../slot-ppr-client";

async function SidebarStaticNoDynamic() {
  noDynamic();
  await new Promise((r) => setTimeout(r, 10));
  const count = incrementSlotPprCount("sidebar-nodynamic");
  return (
    <div
      data-testid="sidebar-slot-nodynamic-resolved"
      data-render-count={String(count)}
    >
      @sidebar Static &lt;Suspense&gt; via noDynamic()! Render #{count}
    </div>
  );
}

async function SidebarDynamicHole() {
  await new Promise((r) => setTimeout(r, 15));
  const count = incrementSlotPprCount("sidebar-dynamic-hole");
  const ctx = getContext();
  const role = ctx?.req?.cookies?.slot_role ?? "guest";
  const sfilter = ctx?.req?.query?.sfilter ?? "all";
  return (
    <div
      data-testid="sidebar-slot-dynamic-resolved"
      data-render-count={String(count)}
      data-role={String(role)}
      data-sfilter={String(sfilter)}
    >
      @sidebar Dynamic PPR Hole! Render #{count} | role={String(role)} | sfilter={String(sfilter)}
    </div>
  );
}

export default async function SlotPprSidebarPage() {
  await new Promise((r) => setTimeout(r, 5));
  const count = incrementSlotPprCount("sidebar-shell");
  return (
    <aside
      data-testid="sidebar-slot-shell"
      data-render-count={String(count)}
      className="p-3 rounded-lg border border-teal-500/50 space-y-2 text-xs font-mono"
    >
      <div>@sidebar Static Shell (Render #{count})</div>
      <SlotPprClientCounter />
      <Suspense
        fallback={
          <div data-testid="sidebar-slot-nodynamic-fallback">
            Loading @sidebar static noDynamic...
          </div>
        }
      >
        <SidebarStaticNoDynamic />
      </Suspense>
      <Suspense
        fallback={
          <div data-testid="sidebar-slot-dynamic-fallback">
            Loading @sidebar dynamic hole...
          </div>
        }
      >
        <SidebarDynamicHole />
      </Suspense>
    </aside>
  );
}

