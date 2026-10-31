import React, { Suspense } from "react";
import { getContext } from "dinou";
import { getHsPprState } from "../../hsppr-state";

async function TeamDynamicHole({ team }: { team?: string }) {
  await new Promise((r) => setTimeout(r, 10));
  const ctx = getContext();
  const tmode = ctx?.req?.query?.tmode || "default-tmode";
  const st = getHsPprState();

  return (
    <div
      id="hsppr-team-hole-resolved"
      className="p-2 rounded bg-slate-950 border border-teal-500/60 text-xs font-mono flex gap-4"
    >
      <span>
        Team Hole Param: <strong id="hsppr-team-hole-param">{team}</strong>
      </span>
      <span>
        Team Hole Seq: <strong id="hsppr-team-hole-seq">{st.teamPageHoleSeq}</strong>
      </span>
      <span>
        Team Hole Query: <strong id="hsppr-team-hole-query">{tmode}</strong>
      </span>
    </div>
  );
}

export default function HsPprTeamPage({
  params,
}: {
  params?: { team?: string };
}) {
  const st = getHsPprState();

  return (
    <div
      id="hsppr-team-page"
      className="p-3 rounded-lg bg-slate-950/90 border border-teal-400/50 space-y-2"
    >
      <div className="flex justify-between text-xs font-mono">
        <span className="text-teal-200">
          Validated PPR Team Page: <strong id="hsppr-team-page-name">{params?.team}</strong>
        </span>
        <span>
          Team Page Shell Seq:{" "}
          <strong id="hsppr-team-page-shell-seq">{st.teamPageShellSeq}</strong>
        </span>
      </div>
      <Suspense fallback={<div id="hsppr-team-hole-fallback">Loading Team Hole...</div>}>
        <TeamDynamicHole team={params?.team} />
      </Suspense>
    </div>
  );
}

