import { getContext } from "dinou";
import SlotTrigger from "./slot-trigger";

export default function SlotPage() {
  const ctx = getContext();
  const query = ctx?.req?.query || {};
  const isSlotCrash = query.slot_crash === "true";

  if (isSlotCrash) {
    throw new Error("💥 Parallel Slot component crashed during layout render pass!");
  }

  return (
    <div className="p-4 space-y-3">
      <p className="text-xs text-slate-300">
        This is the normal parallel slot component view.
      </p>
      <SlotTrigger />
    </div>
  );
}
