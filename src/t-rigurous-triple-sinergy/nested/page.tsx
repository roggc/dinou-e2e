import React, { Suspense } from "react";
import { getContext } from "dinou";
import { readTsState } from "../ts-state";

async function NestedPprHole() {
  await new Promise((r) => setTimeout(r, 15));
  const ctx = getContext();
  const q = ctx?.req?.query?.mode || "nested-default";
  const st = readTsState();
  return (
    <div id="ts-nested-ppr-hole-resolved" className="p-2 rounded bg-slate-950 border border-amber-500/50 text-xs">
      Nested Hole Seq: <strong id="ts-nested-ppr-hole-seq">{st.nestedPprHoleSeq}</strong> | Query:{" "}
      <strong id="ts-nested-ppr-hole-query">{q}</strong>
    </div>
  );
}

export default async function TripleSynergyNestedPprPage() {
  const st = readTsState();
  return (
    <div id="ts-nested-ppr-page" className="p-3 rounded bg-slate-950/80 border border-indigo-400/40 space-y-2">
      <h3 className="text-sm font-bold text-indigo-200">
        Nested PPR Page — Shell Seq: <strong id="ts-nested-ppr-page-seq">{st.nestedPprPageSeq}</strong>
      </h3>
      <Suspense fallback={<div id="ts-nested-ppr-hole-fallback">Loading Nested PPR Hole...</div>}>
        <NestedPprHole />
      </Suspense>
    </div>
  );
}

