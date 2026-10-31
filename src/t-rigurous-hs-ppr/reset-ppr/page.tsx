import React, { Suspense } from "react";
import { getContext } from "dinou";
import { getHsPprState } from "../hsppr-state";

async function ResetPageDynamicHole() {
  await new Promise((r) => setTimeout(r, 10));
  const ctx = getContext();
  const rmode = ctx?.req?.query?.rmode || "default-rmode";
  const st = getHsPprState();

  return (
    <div
      id="hsppr-reset-page-hole-resolved"
      className="p-2.5 rounded bg-slate-900 border border-pink-500/60 text-xs font-mono flex gap-4"
    >
      <span>
        Reset Page Hole Seq:{" "}
        <strong id="hsppr-reset-page-hole-seq">{st.resetPageHoleSeq}</strong>
      </span>
      <span>
        Reset Page Hole Query:{" "}
        <strong id="hsppr-reset-page-hole-query">{rmode}</strong>
      </span>
    </div>
  );
}

export default function HsPprResetPage() {
  const st = getHsPprState();

  return (
    <div
      id="hsppr-reset-page"
      className="p-3.5 rounded-lg bg-slate-900/80 border border-pink-400/50 space-y-2"
    >
      <div className="flex justify-between text-xs font-mono">
        <span className="font-semibold text-pink-200">Reset-Layout PPR Page</span>
        <span>
          Reset Page Shell Seq:{" "}
          <strong id="hsppr-reset-page-shell-seq">{st.resetPageShellSeq}</strong>
        </span>
      </div>
      <Suspense
        fallback={
          <div id="hsppr-reset-page-hole-fallback" className="text-xs text-pink-400">
            Loading Reset Page Hole...
          </div>
        }
      >
        <ResetPageDynamicHole />
      </Suspense>
    </div>
  );
}

