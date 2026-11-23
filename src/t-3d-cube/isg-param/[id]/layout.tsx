import { Suspense, type ReactNode } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../../shared/cube-state";
import { CubeClientProbe } from "../../shared/cube-client";

async function IsgL2Hole({ id }: { id: string }) {
  const ctx = getContext();
  const v = String(ctx?.req?.query?.v || "base");
  await cubeSleep(15);
  const st = readCubeState();
  const isBeta = id.startsWith("beta");
  const seq = isBeta ? st.isgBetaL2HoleSeq : st.isgAlphaL2HoleSeq;
  return (
    <div id="isg-l2-hole">
      <span id="isg-l2-hole-id">{id}</span>
      <span id="isg-l2-hole-val">{v}</span>
      <span id="isg-l2-hole-seq">{seq}</span>
    </div>
  );
}

export default function IsgParamL2Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: { id: string };
}) {
  const id = String(params?.id || "unknown");
  const isBeta = id.startsWith("beta");
  const st = readCubeState();
  const shellSeq = isBeta ? st.isgBetaL2ShellSeq : st.isgAlphaL2ShellSeq;
  return (
    <section id="isg-param-l2" data-param-id={id}>
      <span id="isg-l2-id">{id}</span>
      <span id="isg-l2-shell-seq">{shellSeq}</span>
      <CubeClientProbe id={`isg-l2-${id}`} />
      <DinouCacheSlot
        id={`cube-isg-l2-slot-${id}`}
        tag={`cube-isg-l2-slot-tag-${id}`}
        revalidate={3600}
      >
        {async () => {
          const s = readCubeState();
          const slotSeq = isBeta ? s.isgBetaL2SlotSeq : s.isgAlphaL2SlotSeq;
          return (
            <span id="isg-l2-slot-seq" data-slot-param={id}>
              {slotSeq}
            </span>
          );
        }}
      </DinouCacheSlot>
      <Suspense fallback={<span>isg-l2-fb</span>}>
        <IsgL2Hole id={id} />
      </Suspense>
      {children}
    </section>
  );
}
