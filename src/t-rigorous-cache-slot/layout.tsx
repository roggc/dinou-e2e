import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";

async function LayoutBannerSlotContent() {
  await new Promise((r) => setTimeout(r, 10));
  const now = Date.now();
  const id = `layout-banner-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div id="slot-layout-banner-box" data-testid="slot-layout-banner-box">
      <span>Layout Banner Slot ID: </span>
      <strong id="slot-layout-banner-id" data-testid="slot-layout-banner-id">
        {id}
      </strong>
      <span> | Time: </span>
      <span id="slot-layout-banner-time" data-testid="slot-layout-banner-time">
        {now}
      </span>
    </div>
  );
}

export default async function CacheSlotTestLayout({
  children,
}: {
  children: ReactNode;
}) {
  const layoutRenderTime = Date.now();
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Dinou Vertical Segmentation (DinouCacheSlot) Audit Lab</title>
      </head>
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "20px" }}>
        <header
          id="cache-slot-layout-header"
          style={{
            padding: "12px",
            marginBottom: "16px",
            background: "#1e293b",
            color: "#f8fafc",
            borderRadius: "8px",
          }}
        >
          <div>
            Layout Render Time:{" "}
            <span id="layout-render-time" data-testid="layout-render-time">
              {layoutRenderTime}
            </span>
          </div>
          <DinouCacheSlot
            id="rig-slot-layout-banner"
            tag="rig-tag-layout-banner"
            revalidate={3600}
          >
            <LayoutBannerSlotContent />
          </DinouCacheSlot>
        </header>
        {children}
      </body>
    </html>
  );
}

