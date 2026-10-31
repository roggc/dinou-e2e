import React, { Suspense } from "react";
import { getContext } from "dinou";
import { getHsPprState } from "../hsppr-state";
import { HsPprClientStateBox } from "../hsppr-client";

async function L2NestedLayoutDynamicHole() {
  await new Promise((r) => setTimeout(r, 10));
  const ctx = getContext();
  const nestedCookie = ctx?.req?.cookies?.hsppr_nested || "default-nested-cookie";
  const st = getHsPprState();

  return (
    <div
      id="hsppr-l2-hole-resolved"
      className="p-2 rounded bg-slate-950 border border-purple-500/60 text-xs font-mono flex gap-4"
    >
      <span>
        L2 Hole Seq: <strong id="hsppr-l2-hole-seq">{st.l2LayoutHoleSeq}</strong>
      </span>
      <span>
        L2 Hole Cookie:{" "}
        <strong id="hsppr-l2-hole-cookie">{nestedCookie}</strong>
      </span>
    </div>
  );
}

export default function HsPprL2NestedLayout({
  children,
  l2LayoutPropsSeq = 100,
}: {
  children: React.ReactNode;
  l2LayoutPropsSeq?: number;
}) {
  const st = getHsPprState();

  return (
    <div
      id="hsppr-l2-layout"
      className="p-4 rounded-xl border border-purple-500/70 bg-slate-900/60 space-y-2.5"
    >
      <div className="flex flex-wrap items-center justify-between text-xs font-mono">
        <span className="font-bold text-purple-300">
          L2 Nested PPR Layout (/t-rigurous-hs-ppr/nested)
        </span>
        <div className="flex gap-4">
          <span>
            L2 Shell Seq:{" "}
            <strong id="hsppr-l2-layout-seq">{st.l2LayoutShellSeq}</strong>
          </span>
          <span>
            L2 Props Seq:{" "}
            <strong id="hsppr-l2-props-seq">{l2LayoutPropsSeq}</strong>
          </span>
        </div>
      </div>

      <HsPprClientStateBox idPrefix="hsppr-l2" />

      {/* Dynamic PPR Hole #3 (after L1 Hole #1 and @sidebar Hole #2) */}
      <Suspense
        fallback={
          <div id="hsppr-l2-hole-fallback" className="text-xs text-purple-400">
            Loading L2 Nested Layout Hole...
          </div>
        }
      >
        <L2NestedLayoutDynamicHole />
      </Suspense>

      <div id="hsppr-l2-outlet">{children}</div>
    </div>
  );
}

