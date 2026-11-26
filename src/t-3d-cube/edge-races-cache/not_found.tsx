import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../shared/cube-state";

export default function EdgeRacesNotFound() {
  return (
    <section id="er-not-found-page">
      <h2>Edge Races Custom 404</h2>
      <DinouCacheSlot
        id="er-nf-slot"
        tags={["er-nf-slot-tag"]}
        revalidate={3600}
      >
        {async () => {
          const s = readCubeState();
          return <span id="er-nf-slot-seq">{s.erNfSlotSeq}</span>;
        }}
      </DinouCacheSlot>
    </section>
  );
}
