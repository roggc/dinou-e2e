import React, { Suspense } from "react";
import { getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";
import SynergyControlPanel, {
  PprHoleOuterClientState,
  PprSlotInnerClientWidget,
} from "./synergy-client";
import { echoFromPprSlotAction } from "./actions";

// Scenario 1 helper: Cached Slot in PPR Static Shell
async function ShellSlotContent() {
  await new Promise((r) => setTimeout(r, 10));
  const token = `shell-slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <div id="syn-shell-slot-box" data-testid="syn-shell-slot-box">
      Shell Slot Token:{" "}
      <strong id="syn-shell-slot-token" data-testid="syn-shell-slot-token">
        {token}
      </strong>
    </div>
  );
}

// Scenario 2A helper: Static Suspense (no dynamic reads) wrapping a DinouCacheSlot
async function StaticSuspenseWithSlotContent() {
  await new Promise((r) => setTimeout(r, 10));
  return (
    <div id="syn-static-suspense-resolved" data-testid="syn-static-suspense-resolved">
      <DinouCacheSlot
        id="ppr-syn-static-suspense-slot"
        tag="tag-syn-static-suspense"
        revalidate={3600}
      >
        {async () => {
          await new Promise((r) => setTimeout(r, 5));
          const token = `static-susp-slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          return (
            <div id="syn-static-susp-slot-box" data-testid="syn-static-susp-slot-box">
              Static Suspense Slot Token:{" "}
              <strong
                id="syn-static-susp-slot-token"
                data-testid="syn-static-susp-slot-token"
              >
                {token}
              </strong>
            </div>
          );
        }}
      </DinouCacheSlot>
    </div>
  );
}

// Scenario 2B helper: DinouCacheSlot wrapping an internal Static Suspense boundary
async function InnerStaticSuspenseChild() {
  await new Promise((r) => setTimeout(r, 5));
  const token = `slot-wrapping-susp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <div id="syn-slot-wrapping-susp-resolved" data-testid="syn-slot-wrapping-susp-resolved">
      Slot Wrapping Static Suspense Token:{" "}
      <strong
        id="syn-slot-wrapping-susp-token"
        data-testid="syn-slot-wrapping-susp-token"
      >
        {token}
      </strong>
    </div>
  );
}

// Scenario 3: Dynamic PPR Hole #1 containing:
// - Request-time dynamic reads (cookies, query, headers)
// - Sibling client component outside slot (PprHoleOuterClientState)
// - Cached DinouCacheSlot (revalidate=3600)
// - Uncached DinouCacheSlot (revalidate=0)
async function DynamicHole1MicroIsrInsidePpr({
  searchParams,
}: {
  searchParams?: Record<string, string>;
}) {
  await new Promise((r) => setTimeout(r, 20));
  const ctx = getContext();
  const synUser = ctx?.req?.cookies?.syn_user || "anon-syn-user";
  const synProbe = ctx?.req?.headers?.["x-syn-probe"] || "no-probe";
  const synMode = ctx?.req?.query?.mode || searchParams?.mode || "std-mode";
  const hole1RenderTime = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  return (
    <div id="syn-hole-1-resolved" data-testid="syn-hole-1-resolved">
      <div>
        Hole 1 Dynamic User:{" "}
        <strong id="syn-hole-1-user" data-testid="syn-hole-1-user">
          {synUser}
        </strong>{" "}
        | Probe:{" "}
        <strong id="syn-hole-1-probe" data-testid="syn-hole-1-probe">
          {String(synProbe)}
        </strong>{" "}
        | Mode:{" "}
        <strong id="syn-hole-1-mode" data-testid="syn-hole-1-mode">
          {synMode}
        </strong>{" "}
        | Hole Render Time:{" "}
        <span id="syn-hole-1-render-time" data-testid="syn-hole-1-render-time">
          {hole1RenderTime}
        </span>
      </div>

      {/* Client component inside PPR hole, sibling to the slots */}
      <PprHoleOuterClientState />

      {/* Cached slot inside the dynamic PPR hole */}
      <DinouCacheSlot
        id="ppr-syn-hole-slot-a"
        tag="tag-syn-hole-slot-a"
        revalidate={3600}
      >
        {async () => {
          await new Promise((r) => setTimeout(r, 10));
          const slotAToken = `hole1-slotA-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          return (
            <div id="syn-hole-slot-a-box" data-testid="syn-hole-slot-a-box">
              Hole 1 Cached Slot A Token:{" "}
              <strong id="syn-hole-slot-a-token" data-testid="syn-hole-slot-a-token">
                {slotAToken}
              </strong>
            </div>
          );
        }}
      </DinouCacheSlot>

      {/* Uncached slot (revalidate=0) inside the dynamic PPR hole */}
      <DinouCacheSlot id="ppr-syn-hole-slot-nocache" revalidate={0}>
        {async () => {
          await new Promise((r) => setTimeout(r, 5));
          const noCacheToken = `hole1-nocache-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          return (
            <div id="syn-hole-slot-nocache-box" data-testid="syn-hole-slot-nocache-box">
              Hole 1 No-Cache Slot Token:{" "}
              <strong
                id="syn-hole-slot-nocache-token"
                data-testid="syn-hole-slot-nocache-token"
              >
                {noCacheToken}
              </strong>
            </div>
          );
        }}
      </DinouCacheSlot>
    </div>
  );
}

// Scenario 4: Dynamic PPR Hole #2 containing Nested DinouCacheSlots (Outer -> Inner)
async function DynamicHole2NestedSlots() {
  await new Promise((r) => setTimeout(r, 25));
  const ctx = getContext();
  const synTier = ctx?.req?.cookies?.syn_tier || "free-tier";
  const hole2RenderTime = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  return (
    <div id="syn-hole-2-resolved" data-testid="syn-hole-2-resolved">
      <div>
        Hole 2 Dynamic Tier:{" "}
        <strong id="syn-hole-2-tier" data-testid="syn-hole-2-tier">
          {synTier}
        </strong>{" "}
        | Hole 2 Time:{" "}
        <span id="syn-hole-2-render-time" data-testid="syn-hole-2-render-time">
          {hole2RenderTime}
        </span>
      </div>

      <DinouCacheSlot
        id="ppr-syn-nested-outer"
        tag="tag-syn-nested-outer"
        revalidate={3600}
      >
        {async () => {
          await new Promise((r) => setTimeout(r, 8));
          const outerToken = `nested-outer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          return (
            <div id="syn-nested-outer-box" data-testid="syn-nested-outer-box">
              <div>
                Outer Slot Token:{" "}
                <strong id="syn-nested-outer-token" data-testid="syn-nested-outer-token">
                  {outerToken}
                </strong>
              </div>
              <DinouCacheSlot
                id="ppr-syn-nested-inner"
                tag="tag-syn-nested-inner"
                revalidate={3600}
              >
                {async () => {
                  await new Promise((r) => setTimeout(r, 8));
                  const innerToken = `nested-inner-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                  return (
                    <div id="syn-nested-inner-box" data-testid="syn-nested-inner-box">
                      Inner Slot Token:{" "}
                      <strong
                        id="syn-nested-inner-token"
                        data-testid="syn-nested-inner-token"
                      >
                        {innerToken}
                      </strong>
                    </div>
                  );
                }}
              </DinouCacheSlot>
            </div>
          );
        }}
      </DinouCacheSlot>
    </div>
  );
}

// Scenario 5: Dynamic PPR Hole #3 where DinouCacheSlot is rendered BEFORE the sibling dynamic reader
// AND contains a "use client" widget with both direct and prop-passed "use server" actions
async function DynamicSiblingBailoutReader() {
  await new Promise((r) => setTimeout(r, 15));
  const ctx = getContext();
  const bailoutCookie = ctx?.req?.cookies?.syn_bailout || "default-bailout";
  return (
    <div id="syn-hole-3-sibling-dynamic" data-testid="syn-hole-3-sibling-dynamic">
      Hole 3 Late Bailout Cookie:{" "}
      <strong id="syn-hole-3-cookie" data-testid="syn-hole-3-cookie">
        {bailoutCookie}
      </strong>
    </div>
  );
}

async function DynamicHole3ClientAndServerActionSlot() {
  return (
    <div id="syn-hole-3-resolved" data-testid="syn-hole-3-resolved">
      {/* Slot executes BEFORE DynamicSiblingBailoutReader triggers PPR postpone! */}
      <DinouCacheSlot
        id="ppr-syn-client-slot"
        tags={["tag-syn-client", "tag-syn-shared"]}
        revalidate={3600}
      >
        {async () => {
          await new Promise((r) => setTimeout(r, 10));
          const widgetSlotToken = `client-slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          return (
            <div id="syn-client-slot-box" data-testid="syn-client-slot-box">
              <PprSlotInnerClientWidget
                slotGeneratedToken={widgetSlotToken}
                onServerEcho={echoFromPprSlotAction}
              />
            </div>
          );
        }}
      </DinouCacheSlot>

      <DynamicSiblingBailoutReader />
    </div>
  );
}

// Scenario 6: Dynamic PPR Hole #4 where dynamic cookie read happens DIRECTLY INSIDE DinouCacheSlot
async function DynamicHole4DirectCookieInSlot() {
  return (
    <div id="syn-hole-4-resolved" data-testid="syn-hole-4-resolved">
      <DinouCacheSlot
        id="ppr-syn-direct-dynamic-slot"
        tag="tag-syn-direct-dynamic"
        revalidate={3600}
      >
        {async () => {
          await new Promise((r) => setTimeout(r, 15));
          const ctx = getContext();
          const directCookie =
            ctx?.req?.cookies?.syn_direct_cookie || "default-direct-cookie";
          const directSlotToken = `direct-dyn-${directCookie}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          return (
            <div id="syn-direct-dynamic-slot-box" data-testid="syn-direct-dynamic-slot-box">
              Direct Dynamic Cookie in Slot:{" "}
              <strong
                id="syn-direct-dynamic-cookie"
                data-testid="syn-direct-dynamic-cookie"
              >
                {directCookie}
              </strong>{" "}
              | Token:{" "}
              <strong
                id="syn-direct-dynamic-token"
                data-testid="syn-direct-dynamic-token"
              >
                {directSlotToken}
              </strong>
            </div>
          );
        }}
      </DinouCacheSlot>
    </div>
  );
}

export default async function PprCacheSlotSynergyPage({
  query,
  shellBuildTime,
  shellBuildId,
}: {
  query?: Record<string, string>;
  shellBuildTime?: number;
  shellBuildId?: string;
}) {
  const staticShellRenderTime = Date.now();

  return (
    <div id="ppr-cache-slot-synergy-page" data-testid="ppr-cache-slot-synergy-page">
      <h1>PPR + DinouCacheSlot Synergy Torture Suite</h1>

      {/* Static Shell Metadata */}
      <section
        id="syn-shell-meta"
        style={{
          padding: "12px",
          background: "#0f172a",
          border: "1px solid #334155",
          borderRadius: "8px",
          marginBottom: "16px",
        }}
      >
        <div>
          Shell Build ID:{" "}
          <strong id="syn-shell-build-id" data-testid="syn-shell-build-id">
            {shellBuildId ?? "no-build-id"}
          </strong>
        </div>
        <div>
          Shell Build Time:{" "}
          <strong id="syn-shell-build-time" data-testid="syn-shell-build-time">
            {shellBuildTime ?? 0}
          </strong>
        </div>
        <div>
          Shell Render Time:{" "}
          <strong id="syn-shell-render-time" data-testid="syn-shell-render-time">
            {staticShellRenderTime}
          </strong>
        </div>
      </section>

      {/* Interactive Control Panel in Static Shell */}
      <SynergyControlPanel />

      {/* Scenario 1: DinouCacheSlot in the PPR Static Shell */}
      <section
        id="syn-sec-1-shell-slot"
        style={{
          padding: "12px",
          border: "1px solid #10b981",
          borderRadius: "8px",
          marginBottom: "16px",
        }}
      >
        <h3>1. DinouCacheSlot in PPR Static Shell</h3>
        <DinouCacheSlot
          id="ppr-syn-shell-slot"
          tag="tag-syn-shell-slot"
          revalidate={3600}
        >
          <ShellSlotContent />
        </DinouCacheSlot>
      </section>

      {/* Scenario 2A & 2B: Static Suspense + DinouCacheSlot combinations BEFORE dynamic PPR holes */}
      <section
        id="syn-sec-2-static-suspense"
        style={{
          padding: "12px",
          border: "1px solid #6366f1",
          borderRadius: "8px",
          marginBottom: "16px",
        }}
      >
        <h3>2A. Static Suspense Wrapping DinouCacheSlot (Before Dynamic Holes)</h3>
        <Suspense
          fallback={
            <div id="syn-static-suspense-fallback">Loading Static Suspense...</div>
          }
        >
          <StaticSuspenseWithSlotContent />
        </Suspense>

        <h3 style={{ marginTop: "12px" }}>
          2B. DinouCacheSlot Wrapping Static Suspense (Before Dynamic Holes)
        </h3>
        <DinouCacheSlot
          id="ppr-syn-slot-with-static-suspense"
          tag="tag-syn-slot-static-susp"
          revalidate={3600}
        >
          <Suspense
            fallback={
              <div id="syn-slot-wrapping-susp-fallback">
                Loading Inner Static Suspense...
              </div>
            }
          >
            <InnerStaticSuspenseChild />
          </Suspense>
        </DinouCacheSlot>
      </section>

      {/* Scenario 3: Dynamic PPR Hole #1 with Cached Slot + No-Cache Slot + Sibling Client State */}
      <section
        id="syn-sec-3-hole-1"
        style={{
          padding: "12px",
          border: "1px solid #f59e0b",
          borderRadius: "8px",
          marginBottom: "16px",
        }}
      >
        <h3>3. Dynamic PPR Hole #1: Micro-ISR Cached Slot + No-Cache Slot + Hole Client State</h3>
        <Suspense
          fallback={
            <div id="syn-hole-1-fallback" data-testid="syn-hole-1-fallback">
              [PPR Hole 1 Fallback] Streaming Dynamic Hole 1...
            </div>
          }
        >
          <DynamicHole1MicroIsrInsidePpr searchParams={query} />
        </Suspense>
      </section>

      {/* Scenario 4: Dynamic PPR Hole #2 with Nested DinouCacheSlots */}
      <section
        id="syn-sec-4-hole-2"
        style={{
          padding: "12px",
          border: "1px solid #ec4899",
          borderRadius: "8px",
          marginBottom: "16px",
        }}
      >
        <h3>4. Dynamic PPR Hole #2: Nested DinouCacheSlots (Outer & Inner) Inside Streamed Hole</h3>
        <Suspense
          fallback={
            <div id="syn-hole-2-fallback" data-testid="syn-hole-2-fallback">
              [PPR Hole 2 Fallback] Streaming Dynamic Hole 2...
            </div>
          }
        >
          <DynamicHole2NestedSlots />
        </Suspense>
      </section>

      {/* Scenario 5: Dynamic PPR Hole #3 with Pre-Bailout Slot + Client Widget + Server Actions */}
      <section
        id="syn-sec-5-hole-3"
        style={{
          padding: "12px",
          border: "1px solid #a855f7",
          borderRadius: "8px",
          marginBottom: "16px",
        }}
      >
        <h3>5. Dynamic PPR Hole #3: Pre-Bailout Slot with Client Widget & Server Actions</h3>
        <Suspense
          fallback={
            <div id="syn-hole-3-fallback" data-testid="syn-hole-3-fallback">
              [PPR Hole 3 Fallback] Streaming Dynamic Hole 3...
            </div>
          }
        >
          <DynamicHole3ClientAndServerActionSlot />
        </Suspense>
      </section>

      {/* Scenario 6: Dynamic PPR Hole #4 where dynamic cookie read is directly inside DinouCacheSlot */}
      <section
        id="syn-sec-6-hole-4"
        style={{
          padding: "12px",
          border: "1px solid #14b8a6",
          borderRadius: "8px",
          marginBottom: "16px",
        }}
      >
        <h3>6. Dynamic PPR Hole #4: Direct Request Cookie Read Inside DinouCacheSlot</h3>
        <Suspense
          fallback={
            <div id="syn-hole-4-fallback" data-testid="syn-hole-4-fallback">
              [PPR Hole 4 Fallback] Streaming Dynamic Hole 4...
            </div>
          }
        >
          <DynamicHole4DirectCookieInSlot />
        </Suspense>
      </section>
    </div>
  );
}

