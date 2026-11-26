import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";

export default function MultiSlotPage() {
  const s = readCubeState();
  return (
    <section id="er-multi-slot-page">
      <span id="er-multi-host-seq">{s.erMultiHostSeq}</span>
      <DinouCacheSlot id="er-slot-a" tag="er-shared-tag" revalidate={3600}>
        {async () => {
          const live = readCubeState();
          return <span id="er-slot-a-seq">{live.erSlotASeq}</span>;
        }}
      </DinouCacheSlot>
      <DinouCacheSlot id="er-slot-b" tag="er-shared-tag" revalidate={1}>
        {async () => {
          const live = readCubeState();
          return <span id="er-slot-b-seq">{live.erSlotBSeq}</span>;
        }}
      </DinouCacheSlot>
      <DinouCacheSlot id="er-perm-slot" tags={["er-perm-tag"]} revalidate={false}>
        {async () => {
          const live = readCubeState();
          return <span id="er-perm-slot-seq">{live.erPermSlotSeq}</span>;
        }}
      </DinouCacheSlot>
    </section>
  );
}
