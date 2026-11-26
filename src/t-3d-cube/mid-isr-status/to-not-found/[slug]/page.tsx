import { Suspense } from "react";
import { getContext } from "dinou";
import { readCubeState } from "../../../shared/cube-state";

async function MisNotFoundHole() {
  void getContext()?.req?.headers?.["x-mis-hole"];
  await Promise.resolve();
  return <span id="mis-nf-hole-seq">{readCubeState().misNotFoundHoleSeq}</span>;
}

export default function MidIsrToNotFoundPage({
  params,
}: {
  params: { slug: string };
}) {
  const s = readCubeState();
  return (
    <article id="mis-nf-active" data-status="200">
      <span id="mis-nf-slug">{params.slug}</span>
      <span id="mis-nf-page-seq">{s.misNotFoundPageSeq}</span>
      <Suspense fallback={<span id="mis-nf-hole-fb">loading-nf-hole</span>}>
        <MisNotFoundHole />
      </Suspense>
    </article>
  );
}
