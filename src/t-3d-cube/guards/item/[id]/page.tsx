import { Suspense } from "react";
import { getContext } from "dinou";
import { readCubeState } from "../../../shared/cube-state";

async function GuardsItemHole({ itemId }: { itemId: string }) {
  void getContext()?.req?.headers?.["x-guards-hole"];
  await Promise.resolve();
  return <span id="guards-item-hole-seq">{`${itemId}:${readCubeState().guardsItemHoleSeq}`}</span>;
}

export default function GuardsItemPage({
  params,
  itemId,
}: {
  params?: { id?: string };
  itemId?: string;
}) {
  const effectiveId = itemId || params?.id || "";
  return (
    <article id="guards-item-page" data-item-id={effectiveId}>
      <span id="guards-item-shell-seq">{readCubeState().guardsItemPageShellSeq}</span>
      <Suspense fallback={<span id="guards-item-hole-fb">loading-item</span>}>
        <GuardsItemHole itemId={effectiveId} />
      </Suspense>
    </article>
  );
}
