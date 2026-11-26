import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";

export default function HttpHeadStaticPage() {
  const s = readCubeState();
  return (
    <section id="hh-static-page">
      <span id="hh-static-seq">{s.hhStaticSeq}</span>
      <DinouCacheSlot
        id="hh-static-slot"
        tags={["hh-static-slot-tag"]}
        revalidate={3600}
      >
        {async () => {
          const live = readCubeState();
          return <span id="hh-static-slot-seq">{live.hhStaticSlotSeq}</span>;
        }}
      </DinouCacheSlot>
    </section>
  );
}
