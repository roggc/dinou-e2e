import { readCubeState } from "../../shared/cube-state";

export default function TripleStaticAPage() {
  const st = readCubeState();
  return (
    <article id="ts-static-a-page">
      <span id="ts-static-a-seq">{st.tsStaticASeq}</span>
    </article>
  );
}
