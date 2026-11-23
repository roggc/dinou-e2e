import { Suspense } from "react";
import { getContext } from "dinou";
import { readCubeState, cubeSleep } from "../../../shared/cube-state";
import { CubeControlBridge } from "../../../shared/cube-client";

async function PromoHole() {
  const tag = String(getContext()?.req?.query?.q || "base");
  await cubeSleep(10);
  const s = readCubeState();
  return (
    <span id="grp-promo-hole-seq">
      {`${tag}-${s.grpAlphaPromoHoleSeq}`}
    </span>
  );
}

export default function GroupAlphaPromoPage() {
  const s = readCubeState();
  return (
    <article id="grp-promo-page">
      <h3>Alpha Promo</h3>
      <span id="grp-promo-shell-seq">{s.grpAlphaPromoShellSeq}</span>
      <Suspense fallback={<span>loading-promo</span>}>
        <PromoHole />
      </Suspense>
      <CubeControlBridge />
    </article>
  );
}
