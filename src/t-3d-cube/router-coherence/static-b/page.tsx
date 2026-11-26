import { readCubeState } from "../../shared/cube-state";

export default function RouterCoherenceStaticBPage() {
  const st = readCubeState();
  return (
    <article id="rc-static-b-page">
      <h2>Static Route B</h2>
      <span id="rc-static-b-seq">{st.rcStaticBSeq}</span>
    </article>
  );
}
