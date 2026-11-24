import type { ReactNode } from "react";
import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../shared/cube-state";
import { CubeClientProbe } from "../shared/cube-client";
import { sfImportedPing } from "./actions";
import { SfSlotActionsCard } from "./sf-client";

export default function SfInCubeLayout({ children }: { children: ReactNode }) {
  const s = readCubeState();
  const l1ScopeLabel = "l1-item";

  return (
    <section id="sf-l1-layout">
      <span id="sf-l1-shell-seq">{s.sfL1ShellSeq}</span>
      <CubeClientProbe id="sf-l1" />
      <DinouCacheSlot
        id="cube-sf-l1-slot"
        revalidate={3600}
        tags={["cube-sf-l1-slot-tag"]}
      >
        {async () => {
          const slotSeq = readCubeState().sfL1SlotSeq;
          const l1BoundLabel = `${l1ScopeLabel}:slot-${slotSeq}`;
          async function boundL1Action(clientArg: string) {
            "use server";
            return `l1-bound:${l1BoundLabel}:${clientArg}`;
          }
          return (
            <SfSlotActionsCard
              id="l1"
              slotSeq={slotSeq}
              importedAction={sfImportedPing}
              boundAction={boundL1Action}
            />
          );
        }}
      </DinouCacheSlot>
      <main id="sf-l1-main">{children}</main>
    </section>
  );
}
