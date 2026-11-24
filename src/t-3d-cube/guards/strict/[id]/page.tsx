import { Suspense } from "react";
import { getContext } from "dinou";
import { readCubeState } from "../../../shared/cube-state";

async function GuardsStrictHole({ id }: { id: string }) {
  void getContext()?.req?.headers?.["x-guards-hole"];
  await Promise.resolve();
  return <span id="guards-strict-hole-seq">{`${id}:${readCubeState().guardsStrictHoleSeq}`}</span>;
}

export default function GuardsStrictPage({ params }: { params?: { id?: string } }) {
  const id = params?.id || "";
  return (
    <article id="guards-strict-page" data-strict-id={id}>
      <span id="guards-strict-shell-seq">{readCubeState().guardsStrictShellSeq}</span>
      <Suspense fallback={<span id="guards-strict-hole-fb">loading-strict</span>}>
        <GuardsStrictHole id={id} />
      </Suspense>
    </article>
  );
}
