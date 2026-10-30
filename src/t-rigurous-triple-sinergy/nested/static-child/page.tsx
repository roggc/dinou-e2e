import React from "react";
import { readTsState } from "../../ts-state";

export default async function TripleSynergyNestedStaticPage({
  nestedStaticPageSeq,
}: {
  nestedStaticPageSeq?: number;
}) {
  const effectiveSeq = nestedStaticPageSeq ?? readTsState().nestedStaticPageSeq;
  return (
    <div id="ts-nested-static-page" className="p-3 rounded bg-slate-950/80 border border-emerald-400/40">
      <h3 className="text-sm font-bold text-emerald-300">
        Nested Static Child Page (ppr=false) — Seq:{" "}
        <strong id="ts-nested-static-page-seq">{effectiveSeq}</strong>
      </h3>
    </div>
  );
}

