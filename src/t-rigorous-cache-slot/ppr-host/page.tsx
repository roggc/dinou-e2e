import { Suspense } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";

async function PprDynamicHoleWithSlot() {
  const ctx = getContext();
  const userCookie = ctx?.req?.cookies?.slot_user || "anon";
  const holeRenderTime = Date.now();
  return (
    <div id="ppr-hole-with-slot" data-testid="ppr-hole-with-slot">
      <div>
        PPR Dynamic Hole User:{" "}
        <span id="ppr-hole-user" data-testid="ppr-hole-user">
          {userCookie}
        </span>{" "}
        | Hole Time:{" "}
        <span id="ppr-hole-time" data-testid="ppr-hole-time">
          {holeRenderTime}
        </span>
      </div>
      <DinouCacheSlot
        id="rig-slot-inside-ppr-hole"
        tag="rig-tag-slot-inside-ppr-hole"
        revalidate={3600}
      >
        {async () => {
          const slotTime = Date.now();
          const token = `ppr-inner-slot-${slotTime}-${Math.random().toString(36).slice(2, 6)}`;
          return (
            <div id="slot-inside-ppr-hole-box">
              Cached Slot Inside Dynamic PPR Hole:{" "}
              <span
                id="slot-inside-ppr-hole-token"
                data-testid="slot-inside-ppr-hole-token"
              >
                {token}
              </span>
            </div>
          );
        }}
      </DinouCacheSlot>
    </div>
  );
}

export default async function PprHostWithSlotsPage() {
  const shellBuildTime = Date.now();
  return (
    <section id="ppr-host-with-slots">
      <h2>Hybrid PPR + DinouCacheSlot Page</h2>
      <div>
        PPR Static Shell Time:{" "}
        <span id="ppr-shell-time" data-testid="ppr-shell-time">
          {shellBuildTime}
        </span>
      </div>

      {/* 1. DinouCacheSlot in the static shell */}
      <DinouCacheSlot
        id="rig-slot-in-ppr-shell"
        tag="rig-tag-slot-in-ppr-shell"
        revalidate={3600}
      >
        {async () => {
          const slotTime = Date.now();
          const token = `ppr-shell-slot-${slotTime}-${Math.random().toString(36).slice(2, 6)}`;
          return (
            <div id="slot-in-ppr-shell-box">
              Slot In PPR Static Shell:{" "}
              <span
                id="slot-in-ppr-shell-token"
                data-testid="slot-in-ppr-shell-token"
              >
                {token}
              </span>
            </div>
          );
        }}
      </DinouCacheSlot>

      {/* 2. Dynamic PPR <Suspense> hole that itself uses a cached DinouCacheSlot */}
      <Suspense fallback={<div id="ppr-hole-fallback">Loading PPR hole...</div>}>
        <PprDynamicHoleWithSlot />
      </Suspense>
    </section>
  );
}

