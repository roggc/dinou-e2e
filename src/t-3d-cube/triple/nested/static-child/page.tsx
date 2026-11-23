import { readCubeState } from "../../../shared/cube-state";

export default function TripleNestedStaticChildPage() {
  const st = readCubeState();
  return (
    <article id="ts-nested-static-page">
      <span id="ts-nested-static-host-seq">{st.tsNestedStaticHostSeq}</span>
    </article>
  );
}
