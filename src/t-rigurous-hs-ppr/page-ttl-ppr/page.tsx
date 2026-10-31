import React, { Suspense } from "react";
import { getContext } from "dinou";
import { getHsPprState } from "../hsppr-state";

async function PageTtlDynamicHole() {
  await new Promise((r) => setTimeout(r, 10));
  const ctx = getContext();
  const ptmode = ctx?.req?.query?.ptmode || "default-ptmode";
  const st = getHsPprState();
  return (
    <div
      id="hsppr-page-ttl-hole-resolved"
      className="p-2 rounded bg-slate-900 border border-amber-500/60 text-xs font-mono flex gap-4"
    >
      <span>
        Page-TTL Hole Seq:{" "}
        <strong id="hsppr-page-ttl-hole-seq">{st.pageTtlHoleSeq}</strong>
      </span>
      <span>
        Page-TTL Hole Query:{" "}
        <strong id="hsppr-page-ttl-hole-query">{ptmode}</strong>
      </span>
    </div>
  );
}

export default function HsPprPageTtlOnlyPage({
  pageTtlPropsSeq = 100,
}: {
  pageTtlPropsSeq?: number;
}) {
  const st = getHsPprState();
  return (
    <div
      id="hsppr-page-ttl-page"
      className="p-3.5 rounded-xl bg-slate-950 border border-amber-500/50 space-y-2.5 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between font-mono">
        <span className="font-bold text-amber-300">
          Short-Lived PPR Child Page (revalidate = 1s) Under Long-Lived L1 Layout (3600s)
        </span>
        <div className="flex gap-4">
          <span>
            Page-TTL Shell Seq:{" "}
            <strong id="hsppr-page-ttl-shell-seq">{st.pageTtlShellSeq}</strong>
          </span>
          <span>
            Page-TTL Props Seq:{" "}
            <strong id="hsppr-page-ttl-props-seq">{pageTtlPropsSeq}</strong>
          </span>
        </div>
      </div>

      <Suspense
        fallback={
          <div id="hsppr-page-ttl-hole-fallback" className="text-amber-400">
            Loading Page-TTL Hole...
          </div>
        }
      >
        <PageTtlDynamicHole />
      </Suspense>
    </div>
  );
}

