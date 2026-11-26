import { getContext } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";

export default function HttpHeadTombstonePage() {
  const s = readCubeState();
  const ctx = getContext();
  if (s.hhTombstoneMode === "404") {
    ctx?.res?.status(404);
    ctx?.res?.setHeader("X-Cube-NotFound", "nf-404");
    return (
      <section id="hh-tombstone-page" data-mode="404">
        <span id="hh-tombstone-seq">{s.hhTombstoneSeq}</span>
      </section>
    );
  }
  if (s.hhTombstoneMode === "410") {
    ctx?.res?.status(410);
    ctx?.res?.setHeader("X-Cube-Gone", "gone-410");
    return (
      <section id="hh-tombstone-page" data-mode="410">
        <span id="hh-tombstone-seq">{s.hhTombstoneSeq}</span>
      </section>
    );
  }
  if (s.hhTombstoneMode === "302") {
    ctx?.res?.redirect(302, "/t-3d-cube/http-head-headers/static-page");
    return null;
  }
  return (
    <section id="hh-tombstone-page" data-mode="none">
      <span id="hh-tombstone-seq">{s.hhTombstoneSeq}</span>
    </section>
  );
}
