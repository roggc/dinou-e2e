import React, { Suspense } from "react";
import { getContext } from "dinou";
import { getHsPprState } from "../hsppr-state";

async function TtlPageDynamicHole() {
  await new Promise((r) => setTimeout(r, 10));
  const ctx = getContext();
  const ttlmode = ctx?.req?.query?.ttlmode || "default-ttlmode";
  const st = getHsPprState();

  return (
    <div
      id="hsppr-ttl-page-hole-resolved"
      className="p-2 rounded bg-slate-950 border border-orange-400/50 text-xs font-mono flex gap-4"
    >
      <span>
        TTL Page Hole Seq:{" "}
        <strong id="hsppr-ttl-page-hole-seq">{st.ttlPageHoleSeq}</strong>
      </span>
      <span>
        TTL Page Hole Query:{" "}
        <strong id="hsppr-ttl-page-hole-query">{ttlmode}</strong>
      </span>
    </div>
  );
}

export default function HsPprTtlPage({
  ttlPagePropsSeq = 100,
}: {
  ttlPagePropsSeq?: number;
}) {
  const st = getHsPprState();

  return (
    <div
      id="hsppr-ttl-page"
      className="p-3 rounded-lg bg-slate-950/90 border border-orange-400/40 space-y-2"
    >
      <div className="flex flex-wrap items-center justify-between text-xs font-mono">
        <span className="font-semibold text-orange-200">
          TTL Child PPR Page (revalidate = 3600s)
        </span>
        <div className="flex gap-4">
          <span>
            TTL Page Shell Seq:{" "}
            <strong id="hsppr-ttl-page-shell-seq">{st.ttlPageShellSeq}</strong>
          </span>
          <span>
            TTL Page Props Seq:{" "}
            <strong id="hsppr-ttl-page-props-seq">{ttlPagePropsSeq}</strong>
          </span>
        </div>
      </div>

      <Suspense
        fallback={
          <div id="hsppr-ttl-page-hole-fallback" className="text-xs text-orange-400">
            Loading TTL Page Hole...
          </div>
        }
      >
        <TtlPageDynamicHole />
      </Suspense>
    </div>
  );
}

