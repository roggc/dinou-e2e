"use client";

import { useState, useEffect } from "react";
import { refreshSlot, useRouter } from "dinou";
import { invalidateSynergyTag, echoFromPprSlotAction } from "./actions";

export function PprHoleOuterClientState() {
  const [hydrated, setHydrated] = useState(false);
  const [holeCounter, setHoleCounter] = useState(50);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <div
      id="syn-hole-outer-client"
      data-testid="syn-hole-outer-client"
      data-hydrated={hydrated ? "true" : "false"}
      style={{
        padding: "8px",
        border: "1px dashed #38bdf8",
        borderRadius: "6px",
        marginTop: "6px",
      }}
    >
      <span>Hole Client Counter (outside slot): </span>
      <strong id="syn-hole-outer-counter" data-testid="syn-hole-outer-counter">
        {holeCounter}
      </strong>{" "}
      <button
        id="btn-inc-hole-outer-counter"
        data-testid="btn-inc-hole-outer-counter"
        type="button"
        onClick={() => setHoleCounter((c) => c + 1)}
      >
        +1 Hole State
      </button>
    </div>
  );
}

export function PprSlotInnerClientWidget({
  slotGeneratedToken,
  onServerEcho,
}: {
  slotGeneratedToken: string;
  onServerEcho?: (msg: string) => Promise<{ ok: boolean; echo: string; at: number }>;
}) {
  const [hydrated, setHydrated] = useState(false);
  const [localClicks, setLocalClicks] = useState(0);
  const [directActionRes, setDirectActionRes] = useState("idle");
  const [propActionRes, setPropActionRes] = useState(
    typeof onServerEcho === "function" ? "fn-ready" : "fn-missing"
  );

  useEffect(() => {
    setHydrated(true);
    setPropActionRes((prev) =>
      prev.startsWith("ok:")
        ? prev
        : typeof onServerEcho === "function"
        ? "fn-ready"
        : "fn-missing"
    );
  }, [onServerEcho]);

  return (
    <div
      id="syn-slot-client-widget"
      data-testid="syn-slot-client-widget"
      data-hydrated={hydrated ? "true" : "false"}
      style={{
        padding: "10px",
        background: "#0f172a",
        border: "1px solid #a855f7",
        borderRadius: "8px",
        marginTop: "8px",
      }}
    >
      <div>
        Widget Slot Token:{" "}
        <span id="syn-slot-widget-token" data-testid="syn-slot-widget-token">
          {slotGeneratedToken}
        </span>
      </div>
      <div>
        Widget Local Clicks:{" "}
        <span id="syn-slot-widget-clicks" data-testid="syn-slot-widget-clicks">
          {localClicks}
        </span>{" "}
        <button
          id="btn-inc-slot-widget"
          data-testid="btn-inc-slot-widget"
          type="button"
          onClick={() => setLocalClicks((c) => c + 1)}
        >
          +1 Widget Click
        </button>
      </div>
      <div>
        Direct Server Action:{" "}
        <span id="syn-slot-direct-action-res" data-testid="syn-slot-direct-action-res">
          {directActionRes}
        </span>{" "}
        <button
          id="btn-syn-slot-direct-action"
          data-testid="btn-syn-slot-direct-action"
          type="button"
          onClick={async () => {
            const res = await echoFromPprSlotAction(`direct-${slotGeneratedToken}`);
            setDirectActionRes(res.echo);
          }}
        >
          Call Direct Action
        </button>
      </div>
      <div>
        Prop Server Action:{" "}
        <span id="syn-slot-prop-action-res" data-testid="syn-slot-prop-action-res">
          {propActionRes}
        </span>{" "}
        <button
          id="btn-syn-slot-prop-action"
          data-testid="btn-syn-slot-prop-action"
          type="button"
          onClick={async () => {
            if (typeof onServerEcho !== "function") {
              setPropActionRes("err:not-a-function");
              return;
            }
            const res = await onServerEcho(`prop-${slotGeneratedToken}`);
            setPropActionRes(`ok:${res.echo}`);
          }}
        >
          Call Prop Action
        </button>
      </div>
    </div>
  );
}

export default function SynergyControlPanel() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [shellClientCounter, setShellClientCounter] = useState(500);
  const [actionStatus, setActionStatus] = useState("ready");

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <section
      id="syn-controls"
      data-testid="syn-controls"
      data-hydrated={hydrated ? "true" : "false"}
      style={{
        padding: "16px",
        background: "#1e293b",
        border: "1px solid #334155",
        borderRadius: "10px",
        marginBottom: "16px",
      }}
    >
      <h3>PPR + DinouCacheSlot Synergy Control Panel</h3>
      <div>
        Shell Client Counter:{" "}
        <strong id="syn-shell-client-counter" data-testid="syn-shell-client-counter">
          {shellClientCounter}
        </strong>{" "}
        <button
          id="btn-inc-shell-counter"
          data-testid="btn-inc-shell-counter"
          type="button"
          onClick={() => setShellClientCounter((c) => c + 1)}
        >
          +1 Shell Counter
        </button>
      </div>
      <div>
        Last Action Status:{" "}
        <span id="syn-action-status" data-testid="syn-action-status">
          {actionStatus}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "10px" }}>
        {/* 1. Invalidate tags on server */}
        <button
          id="btn-inv-hole-slot-a"
          type="button"
          onClick={async () => {
            setActionStatus("pending");
            try { await invalidateSynergyTag("tag-syn-hole-slot-a"); setActionStatus("invalidated:tag-syn-hole-slot-a"); } catch (e: any) { setActionStatus("err:" + (e?.message || String(e))); }
            // handled above
          }}
        >
          Invalidate Hole Slot A Tag
        </button>

        <button
          id="btn-inv-nested-inner"
          type="button"
          onClick={async () => {
            setActionStatus("pending");
            await invalidateSynergyTag("tag-syn-nested-inner");
            setActionStatus("invalidated:tag-syn-nested-inner");
          }}
        >
          Invalidate Nested Inner Slot Tag
        </button>

        <button
          id="btn-inv-shell-slot"
          type="button"
          onClick={async () => {
            setActionStatus("pending");
            await invalidateSynergyTag("tag-syn-shell-slot");
            setActionStatus("invalidated:tag-syn-shell-slot");
          }}
        >
          Invalidate Shell Slot Tag
        </button>

        {/* 2. Live refreshSlot calls */}
        <button
          id="btn-refresh-hole-slot-a-fresh"
          type="button"
          onClick={() => {
            refreshSlot("ppr-syn-hole-slot-a", { fresh: true });
            setActionStatus("refreshed:ppr-syn-hole-slot-a");
          }}
        >
          Live Refresh Hole Slot A (By ID, Fresh)
        </button>

        <button
          id="btn-refresh-hole-slot-a-by-tag"
          type="button"
          onClick={() => {
            refreshSlot("tag-syn-hole-slot-a", { fresh: true });
            setActionStatus("refreshed-tag:tag-syn-hole-slot-a");
          }}
        >
          Live Refresh Hole Slot A (By Tag, Fresh)
        </button>

        <button
          id="btn-refresh-nested-inner-fresh"
          type="button"
          onClick={() => {
            router.refreshSlot("ppr-syn-nested-inner", { fresh: true });
            setActionStatus("refreshed:ppr-syn-nested-inner");
          }}
        >
          Live Refresh Nested Inner Slot (useRouter, Fresh)
        </button>

        <button
          id="btn-refresh-client-slot-by-tag"
          type="button"
          onClick={() => {
            refreshSlot("tag-syn-client", { fresh: true });
            setActionStatus("refreshed-tag:tag-syn-client");
          }}
        >
          Live Refresh Client Widget Slot (By Tag)
        </button>

        <button
          id="btn-refresh-shell-slot-fresh"
          type="button"
          onClick={() => {
            refreshSlot("ppr-syn-shell-slot", { fresh: true });
            setActionStatus("refreshed:ppr-syn-shell-slot");
          }}
        >
          Live Refresh Shell Slot (Fresh)
        </button>

        <button
          id="btn-refresh-layout-hole-slot-fresh"
          type="button"
          onClick={() => {
            refreshSlot("ppr-syn-layout-hole-slot", { fresh: true });
            setActionStatus("refreshed:ppr-syn-layout-hole-slot");
          }}
        >
          Live Refresh Layout Hole Slot (Fresh)
        </button>

        <button
          id="btn-refresh-layout-shell-slot-fresh"
          type="button"
          onClick={() => {
            refreshSlot("ppr-syn-layout-shell-slot", { fresh: true });
            setActionStatus("refreshed:ppr-syn-layout-shell-slot");
          }}
        >
          Live Refresh Layout Shell Slot (Fresh)
        </button>

        <button
          id="btn-refresh-all-wildcard"
          type="button"
          onClick={() => {
            refreshSlot("*", { fresh: true });
            setActionStatus("refreshed:wildcard");
          }}
        >
          Live Refresh All Slots (*)
        </button>
      </div>
    </section>
  );
}

