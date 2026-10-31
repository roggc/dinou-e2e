import React, { Suspense } from "react";
import { getContext } from "dinou";
import { getHsPprState } from "../hsppr-state";
import { HsPprClientStateBox } from "../hsppr-client";

async function SidebarDynamicHole() {
  await new Promise((r) => setTimeout(r, 10));
  const ctx = getContext();
  const roleCookie = ctx?.req?.cookies?.hsppr_role || "viewer-role";
  const st = getHsPprState();

  return (
    <div id="hsppr-sidebar-hole-resolved" className="text-xs font-mono flex gap-4">
      <span>
        Sidebar Hole Seq: <strong id="hsppr-sidebar-hole-seq">{st.sidebarHoleSeq}</strong>
      </span>
      <span>
        Sidebar Role: <strong id="hsppr-sidebar-hole-role">{roleCookie}</strong>
      </span>
    </div>
  );
}

export default function HsPprSidebarPage() {
  const st = getHsPprState();

  return (
    <aside
      id="hsppr-sidebar-slot"
      className="p-2.5 rounded-lg bg-slate-900/90 border border-teal-500/60 space-y-1.5 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between font-mono">
        <span className="font-semibold text-teal-300">@sidebar Parallel Segment</span>
        <span>
          Sidebar Shell Seq:{" "}
          <strong id="hsppr-sidebar-shell-seq">{st.sidebarShellSeq}</strong>
        </span>
      </div>
      <HsPprClientStateBox idPrefix="hsppr-sidebar" />
      <Suspense
        fallback={
          <div id="hsppr-sidebar-hole-fallback" className="text-xs text-teal-400">
            Loading @sidebar Hole...
          </div>
        }
      >
        <SidebarDynamicHole />
      </Suspense>
    </aside>
  );
}

