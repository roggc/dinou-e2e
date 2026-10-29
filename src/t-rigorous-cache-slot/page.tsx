import { DinouCacheSlot } from "dinou/server";
import {
  SlotInteractiveCounter,
  CacheSlotControlPanel,
} from "./slot-client-widgets";
import { pingFromInsideSlot } from "./actions";

const STAMPEDE_KEY = Symbol.for("dinou.e2e.rigorous.slot.stampede.counter");

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function SlotAlphaContent() {
  await new Promise((r) => setTimeout(r, 15));
  const now = Date.now();
  const id = makeId("alpha");
  return (
    <div id="slot-alpha-box" data-testid="slot-alpha-box">
      <h4>1. Slot Alpha (id="rig-slot-alpha", tag="rig-tag-alpha", revalidate=60)</h4>
      <div>
        Token:{" "}
        <span id="slot-alpha-token" data-testid="slot-alpha-token">
          {id}
        </span>
      </div>
      <div>
        Time:{" "}
        <span id="slot-alpha-time" data-testid="slot-alpha-time">
          {now}
        </span>
      </div>
    </div>
  );
}

async function SlotBetaContent() {
  await new Promise((r) => setTimeout(r, 15));
  const now = Date.now();
  const id = makeId("beta");
  return (
    <div id="slot-beta-box" data-testid="slot-beta-box">
      <h4>2. Slot Beta (id="rig-slot-beta", tags=["rig-tag-beta","rig-tag-shared"], revalidate=60)</h4>
      <div>
        Token:{" "}
        <span id="slot-beta-token" data-testid="slot-beta-token">
          {id}
        </span>
      </div>
      <div>
        Time:{" "}
        <span id="slot-beta-time" data-testid="slot-beta-time">
          {now}
        </span>
      </div>
    </div>
  );
}

async function SlotFastContent() {
  await new Promise((r) => setTimeout(r, 15));
  const now = Date.now();
  const id = makeId("fast");
  return (
    <div id="slot-fast-box" data-testid="slot-fast-box">
      <h4>4. Slot Fast TTL (id="rig-slot-fast", tag="rig-tag-fast", revalidate=2)</h4>
      <div>
        Token:{" "}
        <span id="slot-fast-token" data-testid="slot-fast-token">
          {id}
        </span>
      </div>
      <div>
        Time:{" "}
        <span id="slot-fast-time" data-testid="slot-fast-time">
          {now}
        </span>
      </div>
    </div>
  );
}

async function SlotNoCacheContent() {
  await new Promise((r) => setTimeout(r, 10));
  const now = Date.now();
  const id = makeId("nocache");
  return (
    <div id="slot-nocache-box" data-testid="slot-nocache-box">
      <h4>5. Slot No-Cache (id="rig-slot-nocache", tag="rig-tag-nocache", revalidate=0)</h4>
      <div>
        Token:{" "}
        <span id="slot-nocache-token" data-testid="slot-nocache-token">
          {id}
        </span>
      </div>
      <div>
        Time:{" "}
        <span id="slot-nocache-time" data-testid="slot-nocache-time">
          {now}
        </span>
      </div>
    </div>
  );
}

async function SlotWithClientWidgetContent() {
  await new Promise((r) => setTimeout(r, 15));
  const now = Date.now();
  const id = makeId("client-slot");
  return (
    <div id="slot-client-inside-box" data-testid="slot-client-inside-box">
      <h4>6. Slot With Embedded Client Component & Server Action Prop</h4>
      <SlotInteractiveCounter
        slotGeneratedAt={now}
        slotRenderId={id}
        onPingProp={pingFromInsideSlot}
      />
    </div>
  );
}

async function NestedInnerSlotContent() {
  await new Promise((r) => setTimeout(r, 10));
  const now = Date.now();
  const id = makeId("inner");
  return (
    <div id="slot-nested-inner-box" data-testid="slot-nested-inner-box">
      <h5>7b. Nested Inner Slot (id="rig-slot-nested-inner", tag="rig-tag-inner")</h5>
      <div>
        Inner Token:{" "}
        <span id="slot-nested-inner-token" data-testid="slot-nested-inner-token">
          {id}
        </span>
      </div>
      <div>
        Inner Time:{" "}
        <span id="slot-nested-inner-time" data-testid="slot-nested-inner-time">
          {now}
        </span>
      </div>
    </div>
  );
}

async function NestedOuterSlotContent() {
  await new Promise((r) => setTimeout(r, 10));
  const now = Date.now();
  const id = makeId("outer");
  return (
    <div id="slot-nested-outer-box" data-testid="slot-nested-outer-box">
      <h4>7a. Nested Outer Slot (id="rig-slot-nested-outer", tag="rig-tag-outer")</h4>
      <div>
        Outer Token:{" "}
        <span id="slot-nested-outer-token" data-testid="slot-nested-outer-token">
          {id}
        </span>
      </div>
      <div>
        Outer Time:{" "}
        <span id="slot-nested-outer-time" data-testid="slot-nested-outer-time">
          {now}
        </span>
      </div>
      <DinouCacheSlot
        id="rig-slot-nested-inner"
        tag="rig-tag-inner"
        revalidate={3600}
      >
        <NestedInnerSlotContent />
      </DinouCacheSlot>
    </div>
  );
}

async function StampedeSlowSlotContent() {
  (globalThis as any)[STAMPEDE_KEY] = ((globalThis as any)[STAMPEDE_KEY] || 0) + 1;
  const execNum = (globalThis as any)[STAMPEDE_KEY];
  await new Promise((r) => setTimeout(r, 120));
  const now = Date.now();
  const id = makeId(`stampede-exec${execNum}`);
  return (
    <div id="slot-stampede-box" data-testid="slot-stampede-box">
      <h4>8. Concurrency Stampede Slot (id="rig-slot-stampede", 120ms render)</h4>
      <div>
        Execution Count:{" "}
        <span id="slot-stampede-exec-count" data-testid="slot-stampede-exec-count">
          {execNum}
        </span>
      </div>
      <div>
        Token:{" "}
        <span id="slot-stampede-token" data-testid="slot-stampede-token">
          {id}
        </span>
      </div>
      <div>
        Time:{" "}
        <span id="slot-stampede-time" data-testid="slot-stampede-time">
          {now}
        </span>
      </div>
    </div>
  );
}

export default async function CacheSlotTestPage() {
  const pageTime = Date.now();
  const pageToken = makeId("page");

  return (
    <main id="cache-slot-test-main">
      <h1>Vertical Segmentation Rigorous Test Suite (DinouCacheSlot)</h1>
      <p>
        Host Page Render Time:{" "}
        <span id="page-time" data-testid="page-time">
          {pageTime}
        </span>{" "}
        | Token:{" "}
        <span id="page-token" data-testid="page-token">
          {pageToken}
        </span>
      </p>

      <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "1fr 1fr" }}>
        {/* 1. Slot Alpha: standard JSX child */}
        <DinouCacheSlot id="rig-slot-alpha" tag="rig-tag-alpha" revalidate={3600}>
          <SlotAlphaContent />
        </DinouCacheSlot>

        {/* 2. Slot Beta: multi-tag JSX child */}
        <DinouCacheSlot
          id="rig-slot-beta"
          tags={["rig-tag-beta", "rig-tag-shared"]}
          revalidate={3600}
        >
          <SlotBetaContent />
        </DinouCacheSlot>

        {/* 3. Slot Gamma: function child + shared tag */}
        <DinouCacheSlot
          id="rig-slot-gamma"
          tags={["rig-tag-gamma", "rig-tag-shared"]}
          revalidate={3600}
        >
          {async () => {
            await new Promise((r) => setTimeout(r, 15));
            const now = Date.now();
            const id = makeId("gamma-fn");
            return (
              <div id="slot-gamma-box" data-testid="slot-gamma-box">
                <h4>
                  3. Slot Gamma (Function Child, tags=["rig-tag-gamma","rig-tag-shared"])
                </h4>
                <div>
                  Token:{" "}
                  <span id="slot-gamma-token" data-testid="slot-gamma-token">
                    {id}
                  </span>
                </div>
                <div>
                  Time:{" "}
                  <span id="slot-gamma-time" data-testid="slot-gamma-time">
                    {now}
                  </span>
                </div>
              </div>
            );
          }}
        </DinouCacheSlot>

        {/* 4. Slot Fast: 2-second TTL for SWR */}
        <DinouCacheSlot id="rig-slot-fast" tag="rig-tag-fast" revalidate={2}>
          <SlotFastContent />
        </DinouCacheSlot>

        {/* 5. Slot NoCache: revalidate={0} (0 = no-cache per JSDoc) */}
        <DinouCacheSlot id="rig-slot-nocache" tag="rig-tag-nocache" revalidate={0}>
          <SlotNoCacheContent />
        </DinouCacheSlot>

        {/* 6. Slot containing a Client Component + Server Action prop */}
        <DinouCacheSlot
          id="rig-slot-client-inside"
          tag="rig-tag-client-inside"
          revalidate={3600}
        >
          <SlotWithClientWidgetContent />
        </DinouCacheSlot>

        {/* 7. Nested DinouCacheSlot */}
        <DinouCacheSlot
          id="rig-slot-nested-outer"
          tag="rig-tag-outer"
          revalidate={3600}
        >
          <NestedOuterSlotContent />
        </DinouCacheSlot>

        {/* 8. Stampede Concurrency Slot */}
        <DinouCacheSlot
          id="rig-slot-stampede"
          tag="rig-tag-stampede"
          revalidate={3600}
        >
          <StampedeSlowSlotContent />
        </DinouCacheSlot>

        {/* 9. Tag-only slot (no id prop, uses tag as slotId) */}
        <DinouCacheSlot tag="rig-slot-tag-only" revalidate={3600}>
          {async () => {
            const now = Date.now();
            const id = makeId("tagonly");
            return (
              <div id="slot-tag-only-box" data-testid="slot-tag-only-box">
                <h4>9. Tag-Only Slot (tag="rig-slot-tag-only", no id prop)</h4>
                <div>
                  Token:{" "}
                  <span id="slot-tag-only-token" data-testid="slot-tag-only-token">
                    {id}
                  </span>
                </div>
                <div>
                  Time:{" "}
                  <span id="slot-tag-only-time" data-testid="slot-tag-only-time">
                    {now}
                  </span>
                </div>
              </div>
            );
          }}
        </DinouCacheSlot>
      </div>

      <CacheSlotControlPanel />
    </main>
  );
}

