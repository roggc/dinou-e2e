import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";

export default function Sub1SlotsPage() {
  return (
    <section id="er-sub1-page">
      <DinouCacheSlot id="er-sub1-slot" revalidate={0.5}>
        {async () => {
          const live = readCubeState();
          return <span id="er-sub1-slot-seq">{live.erSub1SlotSeq}</span>;
        }}
      </DinouCacheSlot>
      <DinouCacheSlot id="er-neg1-slot" revalidate={-1}>
        {async () => {
          const live = readCubeState();
          return <span id="er-neg1-slot-seq">{live.erNeg1SlotSeq}</span>;
        }}
      </DinouCacheSlot>
    </section>
  );
}
