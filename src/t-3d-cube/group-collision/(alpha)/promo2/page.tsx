import { Suspense } from "react";
import { getContext } from "dinou";
import { readCubeState, cubeSleep } from "../../../shared/cube-state";
import { CubeControlBridge } from "../../../shared/cube-client";

async function Promo2Hole() {
  const tag = String(getContext()?.req?.query?.q || "base");
  await cubeSleep(10);
  const s = readCubeState();
  return (
    <span id="grp-promo2-hole-seq">
      {`${tag}-${s.grpAlphaPromo2HoleSeq}`}
    </span>
  );
}

export default function GroupAlphaPromo2Page() {
  const s = readCubeState();
  return (
    <article id="grp-promo2-page">
      <h3>Alpha Promo 2</h3>
      <span id="grp-promo2-shell-seq">{s.grpAlphaPromo2ShellSeq}</span>
      <Suspense fallback={<span>loading-promo2</span>}>
        <Promo2Hole />
      </Suspense>
      <CubeControlBridge />
    </article>
  );
}
