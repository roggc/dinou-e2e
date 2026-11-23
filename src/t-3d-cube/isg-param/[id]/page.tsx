import { Suspense } from "react";
import { getContext, Link } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../../shared/cube-client";

async function IsgPageHole({ id }: { id: string }) {
  const ctx = getContext();
  const pVal = String(ctx?.req?.query?.p || "base");
  await cubeSleep(15);
  const st = readCubeState();
  const isBeta = id.startsWith("beta");
  const seq = isBeta ? st.isgBetaPageHoleSeq : st.isgAlphaPageHoleSeq;
  return (
    <div id="isg-page-hole">
      <span id="isg-page-hole-id">{id}</span>
      <span id="isg-page-hole-val">{pVal}</span>
      <span id="isg-page-hole-seq">{seq}</span>
    </div>
  );
}

export default function IsgParamPage({ params }: { params: { id: string } }) {
  const id = String(params?.id || "unknown");
  const isBeta = id.startsWith("beta");
  const suffix = id.includes("-") ? id.slice(id.indexOf("-")) : "";
  const siblingId = `${isBeta ? "alpha" : "beta"}${suffix}`;
  const st = readCubeState();
  const shellSeq = isBeta ? st.isgBetaPageShellSeq : st.isgAlphaPageShellSeq;

  return (
    <main id="isg-param-page" data-param-id={id}>
      <CubeControlBridge />
      <Link
        id="link-isg-sibling"
        href={`/t-3d-cube/isg-param/${siblingId}?v=nav-${siblingId}&p=navp-${siblingId}`}
      >
        Switch to {siblingId}
      </Link>
      <span id="isg-page-id">{id}</span>
      <span id="isg-page-shell-seq">{shellSeq}</span>
      <CubeClientProbe id={`isg-page-${id}`} />
      <DinouCacheSlot
        id={`cube-isg-page-slot-${id}`}
        tag={`cube-isg-page-slot-tag-${id}`}
        revalidate={3600}
      >
        {async () => {
          const s = readCubeState();
          const slotSeq = isBeta ? s.isgBetaPageSlotSeq : s.isgAlphaPageSlotSeq;
          return (
            <span id="isg-page-slot-seq" data-slot-param={id}>
              {slotSeq}
            </span>
          );
        }}
      </DinouCacheSlot>
      <Suspense fallback={<span>isg-page-fb</span>}>
        <IsgPageHole id={id} />
      </Suspense>
    </main>
  );
}
