import { readCubeState } from "../../../shared/cube-state";

export default function TtlDynFnPage({ params }: { params?: { id?: string } }) {
  const s = readCubeState();
  const id = params?.id || "unknown";
  const seq =
    id === "fast"
      ? s.ttlDynFnFastPSeq
      : id === "slow"
      ? s.ttlDynFnSlowPSeq
      : s.ttlDynFnLivePSeq;
  return (
    <article id="ttl-dynfn-p" data-id={id}>
      <span id="ttl-dynfn-p-seq">{seq}</span>
    </article>
  );
}
