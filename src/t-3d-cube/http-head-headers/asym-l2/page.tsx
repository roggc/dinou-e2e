import { Suspense } from "react";
import { getContext } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";

async function AsymDynamicHole() {
  const ctx = getContext();
  const _hdr = ctx?.req?.headers?.["accept-language"] || "en";
  const s = readCubeState();
  ctx?.res?.setHeader("X-Cube-Asym-Hole", `asym-hole-v${s.hhAsymHoleSeq}`);
  return (
    <div id="hh-asym-hole" data-lang={_hdr}>
      <span id="hh-asym-hole-seq">{s.hhAsymHoleSeq}</span>
    </div>
  );
}

export default function HttpHeadAsymPage() {
  const s = readCubeState();
  return (
    <section id="hh-asym-page">
      <span id="hh-asym-shell-seq">{s.hhAsymShellSeq}</span>
      <Suspense fallback={<div id="hh-asym-fallback">Loading asym hole...</div>}>
        <AsymDynamicHole />
      </Suspense>
    </section>
  );
}
