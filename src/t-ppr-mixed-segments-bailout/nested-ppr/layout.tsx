import React, { Suspense } from "react";
import { getContext } from "dinou";

async function NestedPprLayoutDynamicBox() {
  await new Promise((r) => setTimeout(r, 10));
  const ctx = getContext();
  const nmode = ctx?.req?.query?.nmode || "default-nmode";
  return (
    <div id="mppr-bailout-nested-layout-box" className="text-xs font-mono">
      Nested Layout (ppr=true) Query:{" "}
      <strong id="mppr-bailout-nested-query">{String(nmode)}</strong>
    </div>
  );
}

export default function MpprBailoutNestedPprLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="mppr-bailout-nested-layout" className="p-3 rounded border border-amber-500/70 space-y-2">
      <Suspense fallback={<div id="mppr-bailout-nested-fallback">Loading Nested PPR...</div>}>
        <NestedPprLayoutDynamicBox />
      </Suspense>
      <div>{children}</div>
    </div>
  );
}

