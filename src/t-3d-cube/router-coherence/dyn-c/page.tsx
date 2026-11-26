import { getContext } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";

export default function RouterCoherenceDynCPage() {
  const reqTag = String(getContext()?.req?.headers?.["x-rc-dyn"] || "live");
  const st = readCubeState();
  return (
    <article id="rc-dyn-c-page" data-req-tag={reqTag}>
      <h2>Dynamic Route C</h2>
      <span id="rc-dyn-c-seq">{st.rcDynCSeq}</span>
    </article>
  );
}
