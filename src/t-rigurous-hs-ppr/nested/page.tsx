import React, { Suspense } from "react";
import { getContext } from "dinou";
import { getHsPprState } from "../hsppr-state";
import { HsPprClientStateBox } from "../hsppr-client";

async function NestedPageDynamicHole() {
  await new Promise((r) => setTimeout(r, 10));
  const ctx = getContext();
  const nmode = ctx?.req?.query?.nmode || "default-nmode";
  const st = getHsPprState();

  return (
    <div
      id="hsppr-nested-page-hole-resolved"
      className="p-2.5 rounded bg-slate-950 border border-indigo-400/60 text-xs font-mono flex gap-4"
    >
      <span>
        Nested Page Hole Seq:{" "}
        <strong id="hsppr-nested-page-hole-seq">{st.nestedPageHoleSeq}</strong>
      </span>
      <span>
        Nested Page Hole Query:{" "}
        <strong id="hsppr-nested-page-hole-query">{nmode}</strong>
      </span>
    </div>
  );
}

export default function HsPprNestedPage({
  nestedPagePropsSeq,
}: {
  nestedPagePropsSeq?: number;
}) {
  const st = getHsPprState();
  const effectivePropsSeq = nestedPagePropsSeq ?? st.nestedPagePropsSeq;

  return (
    <div
      id="hsppr-nested-page"
      className="p-3.5 rounded-lg bg-slate-950/90 border border-indigo-400/50 space-y-2.5"
    >
      <div className="flex flex-wrap items-center justify-between text-xs font-mono">
        <span className="font-bold text-indigo-200">
          Nested PPR Page (/t-rigurous-hs-ppr/nested)
        </span>
        <div className="flex gap-4">
          <span>
            Nested Page Shell Seq:{" "}
            <strong id="hsppr-nested-page-shell-seq">
              {st.nestedPageShellSeq}
            </strong>
          </span>
          <span>
            Nested Page Props Seq:{" "}
            <strong id="hsppr-nested-page-props-seq">{effectivePropsSeq}</strong>
          </span>
        </div>
      </div>

      <HsPprClientStateBox idPrefix="hsppr-nested-page" />

      {/* Dynamic PPR Hole #4 (after L1 #1, @sidebar #2, L2 #3) */}
      <Suspense
        fallback={
          <div id="hsppr-nested-page-hole-fallback" className="text-xs text-indigo-300">
            Loading Nested Page Hole...
          </div>
        }
      >
        <NestedPageDynamicHole />
      </Suspense>
    </div>
  );
}

