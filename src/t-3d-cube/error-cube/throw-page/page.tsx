import { readCubeState } from "../../shared/cube-state";

export default function ErrorCubeThrowPage() {
  const s = readCubeState();
  if (s.errThrowPage) {
    throw new Error("Transient ThrowPage Fault");
  }
  return (
    <article id="err-throw-page-ok">
      <h4>ThrowPage Healthy</h4>
      <span id="err-throw-page-seq">{s.errThrowPageSeq}</span>
    </article>
  );
}
