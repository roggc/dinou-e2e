import { DinouCacheSlot } from "dinou/server";
import SlotButtons from "./SlotButtons";

async function SlowComponentAlpha() {
  await new Promise((r) => setTimeout(r, 20));
  return (
    <div id="slot-alpha-wrapper">
      <h3>Slot Alpha</h3>
      <span id="slot-alpha-time">{Date.now()}</span>
    </div>
  );
}

async function SlowComponentBeta() {
  await new Promise((r) => setTimeout(r, 20));
  return (
    <div id="slot-beta-wrapper">
      <h3>Slot Beta</h3>
      <span id="slot-beta-time">{Date.now()}</span>
    </div>
  );
}

async function FastExpiringComponent() {
  await new Promise((r) => setTimeout(r, 20));
  return (
    <div id="slot-fast-wrapper">
      <h3>Slot Fast (5s TTL)</h3>
      <span id="slot-fast-time">{Date.now()}</span>
    </div>
  );
}

export default async function Page() {
  const pageTime = Date.now();

  return (
    <main style={{ padding: "2rem" }}>
      <h1>Vertical Segmentation Lab (DinouCacheSlot)</h1>
      <p>
        Page Render Time: <span id="page-time">{pageTime}</span>
      </p>

      <DinouCacheSlot id="slot-alpha" tag="tag-alpha" revalidate={60}>
        <SlowComponentAlpha />
      </DinouCacheSlot>

      <DinouCacheSlot id="slot-beta" tag="tag-beta" revalidate={60}>
        <SlowComponentBeta />
      </DinouCacheSlot>

      <DinouCacheSlot id="slot-fast" tag="tag-fast" revalidate={5}>
        <FastExpiringComponent />
      </DinouCacheSlot>

      <SlotButtons />
    </main>
  );
}
