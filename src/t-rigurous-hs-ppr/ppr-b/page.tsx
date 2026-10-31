import React, { Suspense } from "react";
import { getContext } from "dinou";
import { getHsPprState } from "../hsppr-state";
import { HsPprClientStateBox } from "../hsppr-client";

async function PageBDynamicHole() {
  await new Promise((r) => setTimeout(r, 10));
  const ctx = getContext();
  const userCookie = ctx?.req?.cookies?.hsppr_user || "anon-hsppr";
  const bmode = ctx?.req?.query?.bmode || "default-bmode";
  const st = getHsPprState();

  return (
    <div
      id="hsppr-page-b-hole-resolved"
      className="p-2.5 rounded bg-slate-950 border border-cyan-500/60 text-xs font-mono flex gap-4"
    >
      <span>
        Page B Hole Seq: <strong id="hsppr-page-b-hole-seq">{st.pageBHoleSeq}</strong>
      </span>
      <span>
        Page B Hole User: <strong id="hsppr-page-b-hole-user">{userCookie}</strong>
      </span>
      <span>
        Page B Hole Query: <strong id="hsppr-page-b-hole-query">{bmode}</strong>
      </span>
    </div>
  );
}

export default function HsPprPageB() {
  const st = getHsPprState();

  return (
    <div
      id="hsppr-page-b"
      className="p-4 rounded-xl bg-slate-900/80 border border-cyan-500/50 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
        <h2 className="text-sm font-bold text-cyan-200">
          PPR Page B (Sibling PPR Route Sharing L1 Layout)
        </h2>
        <span>
          Page B Shell Seq:{" "}
          <strong id="hsppr-page-b-shell-seq">{st.pageBShellSeq}</strong>
        </span>
      </div>

      <HsPprClientStateBox idPrefix="hsppr-page-b" />

      <Suspense
        fallback={
          <div id="hsppr-page-b-hole-fallback" className="text-xs text-cyan-400">
            Loading Page B Dynamic Hole...
          </div>
        }
      >
        <PageBDynamicHole />
      </Suspense>
    </div>
  );
}

