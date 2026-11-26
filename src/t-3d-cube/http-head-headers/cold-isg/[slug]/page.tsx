import { readCubeState } from "../../../shared/cube-state";

export default function HttpHeadColdIsgPage({
  params,
}: {
  params?: { slug?: string };
}) {
  const s = readCubeState();
  return (
    <section id="hh-cold-isg-page">
      <span id="hh-cold-isg-slug">{params?.slug ?? ""}</span>
      <span id="hh-cold-isg-seq">{s.hhColdIsgSeq}</span>
    </section>
  );
}
