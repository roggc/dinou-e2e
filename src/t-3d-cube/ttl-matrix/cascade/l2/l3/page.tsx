import { readCubeState } from "../../../../shared/cube-state";

export default function TtlCascadePage() {
  const s = readCubeState();
  return (
    <article id="ttl-cas-page">
      <span id="ttl-cas-page-seq">{s.ttlCasPageSeq}</span>
    </article>
  );
}
