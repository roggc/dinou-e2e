import { DinouCacheSlot } from "dinou/server";
import StaticHostSlotClient from "./static-host-client";

async function StaticHostSlotBody() {
  await new Promise((r) => setTimeout(r, 15));
  const now = Date.now();
  const token = `static-slot-${now}-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <div id="slot-static-host-box" data-testid="slot-static-host-box">
      <h3>Slot Inside Pre-Rendered Static Page</h3>
      <div>
        Slot Token:{" "}
        <span id="slot-static-host-token" data-testid="slot-static-host-token">
          {token}
        </span>
      </div>
      <div>
        Slot Time:{" "}
        <span id="slot-static-host-time" data-testid="slot-static-host-time">
          {now}
        </span>
      </div>
    </div>
  );
}

async function StaticFastSlotBody() {
  await new Promise((r) => setTimeout(r, 10));
  const now = Date.now();
  const token = `static-fast-${now}-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <div id="slot-static-fast-box" data-testid="slot-static-fast-box">
      <h3>Fast TTL Slot Inside Pre-Rendered Static Page (revalidate=1s)</h3>
      <div>
        Fast Slot Token:{" "}
        <span id="slot-static-fast-token" data-testid="slot-static-fast-token">
          {token}
        </span>
      </div>
    </div>
  );
}

export default async function StaticHostPage() {
  const staticPageBuildTime = Date.now();
  return (
    <section id="static-host-page">
      <h2>Static Host Page with DinouCacheSlot</h2>
      <p>
        Static Page Build/Render Time:{" "}
        <span id="static-page-time" data-testid="static-page-time">
          {staticPageBuildTime}
        </span>
      </p>
      <DinouCacheSlot
        id="rig-slot-static-host"
        tag="rig-tag-static-host-slot"
        revalidate={3600}
      >
        <StaticHostSlotBody />
      </DinouCacheSlot>
      <DinouCacheSlot
        id="rig-slot-static-fast"
        tag="rig-tag-static-fast-slot"
        revalidate={1}
      >
        <StaticFastSlotBody />
      </DinouCacheSlot>
      <StaticHostSlotClient />
    </section>
  );
}
