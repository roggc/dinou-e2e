import React from "react";
import { getHsPprState } from "../hsppr-state";
import { HsPprClientStateBox } from "../hsppr-client";

export default function HsPprStaticOptOutPage() {
  const st = getHsPprState();

  return (
    <div
      id="hsppr-static-optout-page"
      className="p-4 rounded-xl bg-slate-900/80 border border-emerald-500/50 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
        <h2 className="text-sm font-bold text-emerald-200">
          Static Opt-Out Sibling Route (export const ppr = false)
        </h2>
        <span>
          Static Opt-Out Seq:{" "}
          <strong id="hsppr-static-optout-seq">{st.staticOptOutSeq}</strong>
        </span>
      </div>

      <HsPprClientStateBox idPrefix="hsppr-static-optout" />
    </div>
  );
}

