import React, { Suspense } from "react";
import { getContext } from "dinou";
import { getHsPprState } from "../hsppr-state";
import { HsPprClientStateBox } from "../hsppr-client";

async function TtlLayoutDynamicHole() {
  await new Promise((r) => setTimeout(r, 10));
  const ctx = getContext();
  const ttlmode = ctx?.req?.query?.ttlmode || "default-ttlmode";
  const st = getHsPprState();

  return (
    <div
      id="hsppr-ttl-layout-hole-resolved"
      className="p-2 rounded bg-slate-900 border border-orange-500/60 text-xs font-mono flex gap-4"
    >
      <span>
        TTL Layout Hole Seq:{" "}
        <strong id="hsppr-ttl-layout-hole-seq">{st.ttlLayoutHoleSeq}</strong>
      </span>
      <span>
        TTL Layout Hole Query:{" "}
        <strong id="hsppr-ttl-layout-hole-query">{ttlmode}</strong>
      </span>
    </div>
  );
}

export default function HsPprTtlLayout({
  children,
  ttlLayoutPropsSeq = 100,
}: {
  children: React.ReactNode;
  ttlLayoutPropsSeq?: number;
}) {
  const st = getHsPprState();

  return (
    <div
      key="hsppr-ttl-layout-root"
      id="hsppr-ttl-layout"
      className="p-3.5 rounded-xl border-2 border-orange-500 bg-slate-900/60 space-y-2.5"
    >
      <div className="flex flex-wrap items-center justify-between text-xs font-mono">
        <span className="font-bold text-orange-300">
          TTL-Revalidated Layout (revalidate = 1s)
        </span>
        <div className="flex gap-4">
          <span>
            TTL Layout Shell Seq:{" "}
            <strong id="hsppr-ttl-layout-seq">{st.ttlLayoutShellSeq}</strong>
          </span>
          <span>
            TTL Layout Props Seq:{" "}
            <strong id="hsppr-ttl-layout-props-seq">{ttlLayoutPropsSeq}</strong>
          </span>
        </div>
      </div>

      <HsPprClientStateBox key="hsppr-ttl-layout" idPrefix="hsppr-ttl-layout" />

      <Suspense
        fallback={
          <div id="hsppr-ttl-layout-hole-fallback" className="text-xs text-orange-400">
            Loading TTL Layout Hole...
          </div>
        }
      >
        <TtlLayoutDynamicHole />
      </Suspense>

      <div id="hsppr-ttl-outlet">{children}</div>
    </div>
  );
}

