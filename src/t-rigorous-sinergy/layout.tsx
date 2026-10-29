import React, { Suspense } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";

async function LayoutShellSlotBody() {
  await new Promise((r) => setTimeout(r, 5));
  const token = `layout-shell-slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <div id="syn-layout-shell-slot-box" data-testid="syn-layout-shell-slot-box">
      Layout Static Shell Slot:{" "}
      <strong id="syn-layout-shell-slot-token" data-testid="syn-layout-shell-slot-token">
        {token}
      </strong>
    </div>
  );
}

async function LayoutDynamicHoleWithSlot() {
  await new Promise((r) => setTimeout(r, 10));
  const ctx = getContext();
  const layoutTheme = ctx?.req?.cookies?.syn_layout_theme || "default-layout-theme";
  const layoutHoleTime = Date.now();

  return (
    <div id="syn-layout-hole-resolved" data-testid="syn-layout-hole-resolved">
      <div>
        Layout Dynamic Hole Theme:{" "}
        <strong id="syn-layout-hole-theme" data-testid="syn-layout-hole-theme">
          {layoutTheme}
        </strong>{" "}
        | Hole Time:{" "}
        <span id="syn-layout-hole-time" data-testid="syn-layout-hole-time">
          {layoutHoleTime}
        </span>
      </div>
      <DinouCacheSlot
        id="ppr-syn-layout-hole-slot"
        tag="tag-syn-layout-hole"
        revalidate={3600}
      >
        {async () => {
          await new Promise((r) => setTimeout(r, 5));
          const token = `layout-hole-slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          return (
            <div id="syn-layout-hole-slot-box" data-testid="syn-layout-hole-slot-box">
              Cached Slot Inside Layout PPR Hole:{" "}
              <strong
                id="syn-layout-hole-slot-token"
                data-testid="syn-layout-hole-slot-token"
              >
                {token}
              </strong>
            </div>
          );
        }}
      </DinouCacheSlot>
    </div>
  );
}

export default async function PprCacheSlotSynergyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      id="ppr-cache-slot-synergy-layout"
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "#f8fafc",
        padding: "20px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <header
        id="syn-layout-header"
        style={{
          padding: "12px",
          background: "#0f172a",
          border: "1px solid #1e293b",
          borderRadius: "8px",
          marginBottom: "16px",
        }}
      >
        <h2>PPR + DinouCacheSlot Synergy Layout</h2>
        <DinouCacheSlot
          id="ppr-syn-layout-shell-slot"
          tag="tag-syn-layout-shell"
          revalidate={3600}
        >
          <LayoutShellSlotBody />
        </DinouCacheSlot>

        <Suspense
          fallback={
            <div id="syn-layout-hole-fallback" data-testid="syn-layout-hole-fallback">
              [Layout PPR Fallback] Loading Layout Dynamic Hole...
            </div>
          }
        >
          <LayoutDynamicHoleWithSlot />
        </Suspense>
      </header>

      <main>{children}</main>
    </div>
  );
}

