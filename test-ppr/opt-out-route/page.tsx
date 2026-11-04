// src/test-ppr/opt-out-route/page.tsx
import { Suspense } from "react";
import { incrementRenderCount } from "../ppr-tracker";

async function OptOutUnwrappedAsyncChild() {
  await new Promise((r) => setTimeout(r, 10));
  const count = incrementRenderCount("opt-out-route-unwrapped-child");
  return (
    <div data-testid="opt-out-unwrapped-child-resolved" data-render-count={String(count)}>
      Opt-Out Route (ppr=false) Unwrapped Async Child Resolved at Build! Render #{count}
    </div>
  );
}

async function AsyncComponentInOptOutRoute() {
  await new Promise((r) => setTimeout(r, 15));
  const count = incrementRenderCount("opt-out-route-async-child");
  return (
    <div data-testid="opt-out-async-resolved" data-render-count={String(count)}>
      Opt-Out Route (ppr=false) Async Child in &lt;Suspense&gt; Resolved Without noDynamic()! Render #{count}
    </div>
  );
}

export default async function OptOutPprRoutePage() {
  await new Promise((r) => setTimeout(r, 10));
  const count = incrementRenderCount("opt-out-route-page");
  return (
    <div data-testid="opt-out-route-page" data-render-count={String(count)}>
      <h1 data-testid="opt-out-page-await-resolved">Opt-Out Route (ppr = false) Page Await Resolved! Render #{count}</h1>
      <OptOutUnwrappedAsyncChild />
      <Suspense fallback={<div data-testid="opt-out-async-fallback">Loading Opt-Out Async...</div>}>
        <AsyncComponentInOptOutRoute />
      </Suspense>
    </div>
  );
}
