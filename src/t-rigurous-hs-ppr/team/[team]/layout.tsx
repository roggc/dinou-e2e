import React from "react";

export default function HsPprTeamLayout({
  children,
  teamLabel = "Team Shell",
  teamLayoutShellSeq = 100,
}: {
  children: React.ReactNode;
  teamLabel?: string;
  teamLayoutShellSeq?: number;
}) {
  return (
    <div
      id="hsppr-team-layout"
      className="p-4 rounded-xl border border-teal-500/70 bg-slate-900/70 space-y-2"
    >
      <div className="flex justify-between text-xs font-mono">
        <span id="hsppr-team-layout-label" className="font-bold text-teal-300">
          {teamLabel}
        </span>
        <span>
          Team Layout Shell Seq:{" "}
          <strong id="hsppr-team-layout-seq">{teamLayoutShellSeq}</strong>
        </span>
      </div>
      <div id="hsppr-team-outlet">{children}</div>
    </div>
  );
}

