import { readCubeState } from "../../shared/cube-state";

export default function HsPprStaticOptOutPage() {
  const st = readCubeState();
  return (
    <article id="hsppr-optout-page">
      <span id="hsppr-optout-shell">{st.hspprOptOutShellSeq}</span>
    </article>
  );
}
