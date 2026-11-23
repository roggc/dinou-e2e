import { Suspense } from "react";
import { getContext } from "dinou";
import { readCubeState, cubeSleep } from "../shared/cube-state";

async function PprNfHoleA() {
  const ctx = getContext();
  const ok = String(ctx?.req?.query?.ok || "base-ok");
  await cubeSleep(15);
  return (
    <div id="ppr-nf-hole-a">
      <span id="ppr-nf-hole-a-val">{ok}</span>
      <span id="ppr-nf-hole-a-seq">{readCubeState().pprNfHoleASeq}</span>
    </div>
  );
}

async function PprNfHoleB() {
  const ctx = getContext();
  const missing = String(ctx?.req?.query?.missing || "");
  const setCk = String(ctx?.req?.query?.setCookie || "");
  await cubeSleep(15);
  if (setCk === "1") {
    ctx?.res?.cookie?.("ppr_nf_seen", "yes", { path: "/" });
  }
  if (missing === "1") {
    ctx?.res?.status?.(404);
    return (
      <div id="ppr-nf-hole-missing" data-status="404">
        Item Not Found in PPR Hole
      </div>
    );
  }
  return (
    <div id="ppr-nf-hole-b-ok">
      <span id="ppr-nf-hole-b-seq">{readCubeState().pprNfHoleBSeq}</span>
    </div>
  );
}

export default function PprNotFoundPage() {
  const st = readCubeState();
  return (
    <article id="ppr-nf-page">
      <span id="ppr-nf-page-shell-seq">{st.pprNfPageShellSeq}</span>
      <Suspense fallback={<span>nf-a-fb</span>}>
        <PprNfHoleA />
      </Suspense>
      <Suspense fallback={<span>nf-b-fb</span>}>
        <PprNfHoleB />
      </Suspense>
    </article>
  );
}
