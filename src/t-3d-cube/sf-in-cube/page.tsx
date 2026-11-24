import { Suspense } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState, cubeSleep } from "../shared/cube-state";
import { CubeControlBridge } from "../shared/cube-client";
import {
  sfImportedPing,
  sfFormActionState,
  sfHoleMutateAndRedirect,
} from "./actions";
import {
  SfSlotActionsCard,
  SfActionStateForm,
  SfHoleRedirectForm,
} from "./sf-client";

async function SfDynamicHole() {
  const q = String(getContext()?.req?.query?.q || "base");
  await cubeSleep(10);
  const s = readCubeState();
  return (
    <div id="sf-hole-box">
      <span id="sf-hole-seq">{`${q}-${s.sfHoleSeq}`}</span>
      <span id="sf-hole-note">{s.sfActionNote}</span>
      <SfHoleRedirectForm action={sfHoleMutateAndRedirect} />
    </div>
  );
}

export default function SfInCubePage() {
  const s = readCubeState();
  const pageScopeLabel = "page-item";

  return (
    <article id="sf-page">
      <span id="sf-page-shell-seq">{s.sfPageShellSeq}</span>
      <SfActionStateForm action={sfFormActionState} />
      <DinouCacheSlot
        id="cube-sf-page-slot"
        revalidate={3600}
        tags={["cube-sf-page-slot-tag"]}
      >
        {async () => {
          const slotSeq = readCubeState().sfPageSlotSeq;
          const boundLabel = `${pageScopeLabel}:slot-${slotSeq}`;
          async function boundPageAction(clientArg: string) {
            "use server";
            return `page-bound:${boundLabel}:${clientArg}`;
          }
          async function boundPageFormAction(formData: FormData) {
            "use server";
            const extra = String(formData.get("extra") || "");
            return `page-form-bound:${boundLabel}:${extra}`;
          }
          return (
            <SfSlotActionsCard
              id="page"
              slotSeq={slotSeq}
              importedAction={sfImportedPing}
              boundAction={boundPageAction}
              boundFormAction={boundPageFormAction}
            />
          );
        }}
      </DinouCacheSlot>
      <Suspense fallback={<span id="sf-hole-fb">loading-sf-hole</span>}>
        <SfDynamicHole />
      </Suspense>
      <CubeControlBridge />
    </article>
  );
}
