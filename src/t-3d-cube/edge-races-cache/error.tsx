import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../shared/cube-state";

export default function EdgeRacesError({
  error,
}: {
  error?: { message?: string };
}) {
  return (
    <section id="er-error-page">
      <span id="er-error-msg">{error?.message || "Unknown Error"}</span>
      <DinouCacheSlot
        id="er-err-slot"
        tags={["er-err-slot-tag"]}
        revalidate={3600}
      >
        {async () => {
          const s = readCubeState();
          return <span id="er-err-slot-seq">{s.erErrSlotSeq}</span>;
        }}
      </DinouCacheSlot>
    </section>
  );
}
