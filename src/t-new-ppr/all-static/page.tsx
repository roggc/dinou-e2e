// src/test-ppr/all-static/page.tsx
import { Suspense } from "react";
import { noDynamic } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { incrementRenderCount } from "../ppr-tracker";

async function AllStaticNoDynamicWidget() {
  noDynamic();
  await new Promise((r) => setTimeout(r, 15));
  const count = incrementRenderCount("all-static-nodynamic-widget");
  return (
    <div data-testid="all-static-nodynamic-resolved" data-render-count={String(count)}>
      All-Static noDynamic Widget Render #{count}
    </div>
  );
}

async function AllStaticSlotWidget() {
  await new Promise((r) => setTimeout(r, 15));
  const count = incrementRenderCount("all-static-slot-widget");
  return (
    <div data-testid="all-static-slot-resolved" data-render-count={String(count)}>
      All-Static Cached Slot Widget (Unwrapped) Render #{count}
    </div>
  );
}

async function AllStaticSlotNoDynamicWidget() {
  noDynamic();
  await new Promise((r) => setTimeout(r, 15));
  const count = incrementRenderCount("all-static-slot-nodynamic-widget");
  return (
    <div data-testid="all-static-slot-nodynamic-resolved" data-render-count={String(count)}>
      All-Static Cached Slot Widget (Suspense + noDynamic) Render #{count}
    </div>
  );
}

export default async function AllStaticPprPage() {
  await new Promise((r) => setTimeout(r, 10));
  const pageCount = incrementRenderCount("all-static-page-root");
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <title>All-Static PPR Route</title>
      </head>
      <body>
        <div data-testid="all-static-page-root" data-render-count={String(pageCount)}>
          <h1>All-Static PPR Page (Render #{pageCount})</h1>
          <Suspense fallback={<div data-testid="all-static-nodynamic-fallback">Loading noDynamic...</div>}>
            <AllStaticNoDynamicWidget />
          </Suspense>
          <DinouCacheSlot id="all-static-ppr-slot" revalidate={3600}>
            <AllStaticSlotWidget />
          </DinouCacheSlot>
          <Suspense fallback={<div data-testid="all-static-slot-nodynamic-fallback">Loading Slot noDynamic...</div>}>
            <DinouCacheSlot id="all-static-ppr-slot-nodynamic" revalidate={3600}>
              <AllStaticSlotNoDynamicWidget />
            </DinouCacheSlot>
          </Suspense>
        </div>
      </body>
    </html>
  );
}

