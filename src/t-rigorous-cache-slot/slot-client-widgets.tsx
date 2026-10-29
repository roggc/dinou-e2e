"use client";

import React, { useState, useEffect, useTransition } from "react";
import { refreshSlot, useRouter } from "dinou";
import {
  invalidateSlotTag,
  pingFromInsideSlot,
  resetStampedeCounter,
} from "./actions";

export function SlotInteractiveCounter({
  slotGeneratedAt,
  slotRenderId,
  onPingProp,
}: {
  slotGeneratedAt: number;
  slotRenderId: string;
  onPingProp?: (label: string) => Promise<{ ok: boolean; echo: string; serverTime: number }>;
}) {
  const [count, setCount] = useState(10);
  const [hydrated, setHydrated] = useState(false);
  const [pingResult, setPingResult] = useState<string>("idle");
  const [propPingResult, setPropPingResult] = useState<string>(
    typeof onPingProp === "function" ? "fn-present" : "fn-missing"
  );

  useEffect(() => {
    setHydrated(true);
    setPropPingResult(typeof onPingProp === "function" ? "fn-present" : "fn-missing");
  }, [onPingProp]);

  return (
    <div
      id="slot-client-widget"
      data-testid="slot-client-widget"
      data-hydrated={hydrated ? "true" : "false"}
      style={{
        border: "1px dashed #38bdf8",
        padding: "10px",
        borderRadius: "6px",
        marginTop: "8px",
      }}
    >
      <div>
        Slot Client Widget Render ID:{" "}
        <span id="slot-client-render-id" data-testid="slot-client-render-id">
          {slotRenderId}
        </span>
      </div>
      <div>
        Slot Client Widget Time:{" "}
        <span id="slot-client-time" data-testid="slot-client-time">
          {slotGeneratedAt}
        </span>
      </div>
      <div>
        Local State Counter:{" "}
        <span id="slot-client-count" data-testid="slot-client-count">
          {count}
        </span>
      </div>
      <div>
        Direct Imported Action Result:{" "}
        <span id="slot-client-ping-result" data-testid="slot-client-ping-result">
          {pingResult}
        </span>
      </div>
      <div>
        Prop Server Action Status:{" "}
        <span id="slot-client-prop-action-status" data-testid="slot-client-prop-action-status">
          {propPingResult}
        </span>
      </div>
      <div style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
        <button
          id="btn-slot-client-inc"
          data-testid="btn-slot-client-inc"
          onClick={() => setCount((c) => c + 1)}
        >
          Increment Inside Slot (+1)
        </button>
        <button
          id="btn-slot-client-ping"
          data-testid="btn-slot-client-ping"
          onClick={async () => {
            const res = await pingFromInsideSlot(slotRenderId);
            setPingResult(res.echo);
          }}
        >
          Call Imported Server Action Inside Slot
        </button>
        <button
          id="btn-slot-client-prop-ping"
          data-testid="btn-slot-client-prop-ping"
          onClick={async () => {
            if (typeof onPingProp !== "function") {
              setPropPingResult("ERROR:onPingProp-not-a-function");
              return;
            }
            try {
              const res = await onPingProp(slotRenderId);
              setPropPingResult(`ok:${res.echo}`);
            } catch (err: any) {
              setPropPingResult(`err:${err?.message || String(err)}`);
            }
          }}
        >
          Call Prop Server Action Inside Slot
        </button>
      </div>
    </div>
  );
}

export function CacheSlotControlPanel() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [pageClientCounter, setPageClientCounter] = useState(100);
  const [lastActionStatus, setLastActionStatus] = useState("ready");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setHydrated(true);
  }, []);

  const runInvalidate = (tag: string) => {
    startTransition(async () => {
      const res = await invalidateSlotTag(tag);
      setLastActionStatus(`invalidated:${res.invalidatedTag}:${res.at}`);
    });
  };

  return (
    <section
      id="cache-slot-controls"
      data-testid="cache-slot-controls"
      data-hydrated={hydrated ? "true" : "false"}
      style={{
        marginTop: "20px",
        padding: "16px",
        border: "1px solid #334155",
        borderRadius: "8px",
        background: "#0f172a",
        color: "#f8fafc",
      }}
    >
      <h3>Client Controls & Live Slot Refresh</h3>
      <p>
        Page Client State (must survive live slot refreshes):{" "}
        <strong id="page-client-counter" data-testid="page-client-counter">
          {pageClientCounter}
        </strong>{" "}
        <button
          id="btn-inc-page-counter"
          data-testid="btn-inc-page-counter"
          onClick={() => setPageClientCounter((c) => c + 1)}
        >
          +1 Page Counter
        </button>
      </p>
      <p>
        Last Action:{" "}
        <span id="last-action-status" data-testid="last-action-status">
          {isPending ? "pending..." : lastActionStatus}
        </span>
      </p>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
        <button id="btn-inv-alpha" onClick={() => runInvalidate("rig-tag-alpha")}>
          1. Invalidate rig-tag-alpha
        </button>
        <button id="btn-inv-beta" onClick={() => runInvalidate("rig-tag-beta")}>
          2. Invalidate rig-tag-beta
        </button>
        <button id="btn-inv-shared" onClick={() => runInvalidate("rig-tag-shared")}>
          3. Invalidate rig-tag-shared (beta + gamma)
        </button>
        <button id="btn-inv-fast" onClick={() => runInvalidate("rig-tag-fast")}>
          4. Invalidate rig-tag-fast
        </button>
        <button id="btn-inv-inner" onClick={() => runInvalidate("rig-tag-inner")}>
          5. Invalidate rig-tag-inner (nested)
        </button>
        <button id="btn-inv-outer" onClick={() => runInvalidate("rig-tag-outer")}>
          6. Invalidate rig-tag-outer (nested)
        </button>
        <button id="btn-inv-layout-banner" onClick={() => runInvalidate("rig-tag-layout-banner")}>
          7. Invalidate rig-tag-layout-banner
        </button>
        <button
          id="btn-reset-stampede"
          onClick={async () => {
            await resetStampedeCounter();
            setLastActionStatus("stampede-reset");
          }}
        >
          8. Reset Stampede Slot
        </button>
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button id="btn-refresh-alpha" onClick={() => refreshSlot("rig-slot-alpha")}>
          Refresh rig-slot-alpha
        </button>
        <button
          id="btn-refresh-alpha-fresh"
          onClick={() => refreshSlot("rig-slot-alpha", { fresh: true })}
        >
          Refresh rig-slot-alpha (fresh: true)
        </button>
        <button id="btn-refresh-beta-router" onClick={() => router.refreshSlot("rig-slot-beta")}>
          router.refreshSlot(rig-slot-beta)
        </button>
        <button
          id="btn-refresh-beta-fresh"
          onClick={() => router.refreshSlot("rig-slot-beta", { fresh: true })}
        >
          router.refreshSlot(rig-slot-beta, fresh: true)
        </button>
        <button
          id="btn-refresh-gamma-fresh"
          onClick={() => refreshSlot("rig-slot-gamma", { fresh: true })}
        >
          Refresh rig-slot-gamma (fresh: true)
        </button>
        <button
          id="btn-refresh-nocache"
          onClick={() => refreshSlot("rig-slot-nocache")}
        >
          Refresh rig-slot-nocache
        </button>
        <button
          id="btn-refresh-client-inside-fresh"
          onClick={() => refreshSlot("rig-slot-client-inside", { fresh: true })}
        >
          Refresh rig-slot-client-inside (fresh: true)
        </button>
        <button
          id="btn-refresh-nested-inner-fresh"
          onClick={() => refreshSlot("rig-slot-nested-inner", { fresh: true })}
        >
          Refresh rig-slot-nested-inner (fresh: true)
        </button>
        <button
          id="btn-refresh-nested-outer-fresh"
          onClick={() => refreshSlot("rig-slot-nested-outer", { fresh: true })}
        >
          Refresh rig-slot-nested-outer (fresh: true)
        </button>
        <button
          id="btn-refresh-layout-banner-fresh"
          onClick={() => refreshSlot("rig-slot-layout-banner", { fresh: true })}
        >
          Refresh rig-slot-layout-banner (fresh: true)
        </button>
        <button
          id="btn-refresh-by-tag-alpha"
          onClick={() => refreshSlot("rig-tag-alpha", { fresh: true })}
        >
          Refresh by tag ("rig-tag-alpha", fresh: true)
        </button>
        <button
          id="btn-refresh-wildcard-fresh"
          onClick={() => refreshSlot("*", { fresh: true })}
        >
          Refresh ALL Slots ("*", fresh: true)
        </button>
      </div>
    </section>
  );
}

