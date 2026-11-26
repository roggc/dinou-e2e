import { Suspense } from "react";
import { getContext } from "dinou/server";
import { readCubeState, incrementHhPprHoleExecs } from "../../shared/cube-state";

async function PurePprDynamicHole() {
  const ctx = getContext();
  const ua = ctx?.req?.headers?.["user-agent"] || "none";
  const execs = incrementHhPprHoleExecs();
  const s = readCubeState();
  return (
    <div id="hh-ppr-hole" data-ua-present={ua ? "1" : "0"}>
      <span id="hh-ppr-hole-seq">{s.hhPprHoleSeq}</span>
      <span id="hh-ppr-hole-execs">{execs}</span>
    </div>
  );
}

export default function HttpHeadPurePprPage() {
  const s = readCubeState();
  return (
    <section id="hh-pure-ppr-page">
      <span id="hh-ppr-shell-seq">{s.hhPprShellSeq}</span>
      <Suspense fallback={<div id="hh-ppr-fallback">Loading PPR hole...</div>}>
        <PurePprDynamicHole />
      </Suspense>
    </section>
  );
}
