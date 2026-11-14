import { DinouCacheSlot } from "dinou/server";
import type { LayoutProps } from "./dinou";
import { nextRevalStamp } from "../../lib/revalStore";

async function DashSlotBadge({ ws }: { ws: string }) {
  return (
    <span data-testid="dash-layout-slot-stamp">
      {nextRevalStamp("DashSlot", ws)}
    </span>
  );
}

export default function RevalDashboardLayout({
  children,
  params,
}: LayoutProps) {
  const ws = params.ws;
  return (
    <div data-testid="dash-layout-wrapper">
      <div data-testid="dash-layout-stamp">
        {nextRevalStamp("DashLayout", ws)}
      </div>
      <DinouCacheSlot
        id={`dash-layout-slot-${ws}`}
        tags={[`reval-dash-slot-${ws}`]}
      >
        <DashSlotBadge ws={ws} />
      </DinouCacheSlot>
      {children}
    </div>
  );
}
