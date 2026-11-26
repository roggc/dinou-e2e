import { readCubeState } from "../../shared/cube-state";

export default function RouterCoherenceSubPage() {
  const st = readCubeState();
  return (
    <article id="rc-sub-page">
      <h4>Sub Layout Page</h4>
      <span id="rc-sub-page-seq">{st.rcSubPageSeq}</span>
    </article>
  );
}
