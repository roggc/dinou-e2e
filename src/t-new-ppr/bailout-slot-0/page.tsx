import { Suspense } from "react";
import { DinouCacheSlot } from "dinou/server";
import { incrementRenderCount } from "../ppr-tracker";

async function UnwrappedNoCachePayload() {
  const count = incrementRenderCount("bailout-slot-0:slot-payload");
  await new Promise((r) => setTimeout(r, 10));
  return (
    <div data-testid="bailout-slot-0-payload">
      slotPayloadRenderCount={count}
    </div>
  );
}

async function InnerSuspenseBox() {
  const count = incrementRenderCount("bailout-slot-0:inner-suspense");
  await new Promise((r) => setTimeout(r, 10));
  return (
    <div data-testid="bailout-slot-0-inner">
      Inner Suspense renderCount={count}
    </div>
  );
}

export default async function BailoutSlot0Page() {
  const rootCount = incrementRenderCount("bailout-slot-0:page-root");

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Bailout Slot 0</title>
      </head>
      <body>
        <div data-testid="bailout-slot-0-page">
          <h1>Full-Page Bailout via Unwrapped DinouCacheSlot revalidate=0 (ppr = true)</h1>
          <p data-testid="bailout-slot-0-root">rootRenderCount={rootCount}</p>
          <DinouCacheSlot id="test-ppr-unwrapped-slot-0" revalidate={0}>
            <UnwrappedNoCachePayload />
          </DinouCacheSlot>
          <Suspense fallback={<div>Loading inner...</div>}>
            <InnerSuspenseBox />
          </Suspense>
        </div>
      </body>
    </html>
  );
}
