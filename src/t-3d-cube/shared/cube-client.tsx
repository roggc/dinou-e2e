"use client";

import { useState, useEffect } from "react";
import { useRouter, refreshSlot } from "dinou";
import {
  cubeResetState,
  cubeMutateState,
  cubeRevalidateTag,
  cubeRevalidatePage,
  cubeRevalidateLayout,
  cubeRevalidatePath,
  cubePingAction,
} from "./cube-actions";
import type { Cube3DState } from "./cube-state";

export function CubeClientProbe({ id }: { id: string }) {
  const [count, setCount] = useState(0);
  const [mountId, setMountId] = useState("ssr");

  useEffect(() => {
    setMountId(Math.random().toString(36).slice(2, 8));
  }, []);

  return (
    <div id={`probe-${id}`} data-testid={`probe-${id}`} style={{ display: "inline-flex", gap: 6, margin: 4 }}>
      <code id={`probe-mount-${id}`}>{mountId}</code>
      <strong id={`probe-count-${id}`}>{count}</strong>
      <button
        id={`probe-inc-${id}`}
        type="button"
        onClick={() => setCount((c) => c + 1)}
      >
        +1
      </button>
    </div>
  );
}

export function CubeSlotWidget({
  id,
  slotSeq,
  onPing,
}: {
  id: string;
  slotSeq: number;
  onPing?: (label: string) => Promise<{ ok: boolean; reply: string; at: number }>;
}) {
  const [count, setCount] = useState(0);
  const [pingRes, setPingRes] = useState("idle");

  return (
    <div id={`widget-${id}`} style={{ display: "inline-flex", gap: 6, margin: 4 }}>
      <span id={`widget-seq-${id}`}>{slotSeq}</span>
      <strong id={`widget-count-${id}`}>{count}</strong>
      <button
        id={`widget-inc-${id}`}
        type="button"
        onClick={() => setCount((c) => c + 1)}
      >
        +1
      </button>
      <code id={`widget-ping-res-${id}`}>{pingRes}</code>
      <button
        id={`widget-ping-btn-${id}`}
        type="button"
        onClick={async () => {
          const fn = typeof onPing === "function" ? onPing : cubePingAction;
          const r = await fn(`${id}-${slotSeq}`);
          setPingRes(r.reply);
        }}
      >
        Ping
      </button>
    </div>
  );
}

export function CubeControlBridge() {
  const router = useRouter();

  useEffect(() => {
    (window as any).__CUBE_3D__ = {
      reset: () => cubeResetState(),
      mutate: (patch: Partial<Cube3DState>) => cubeMutateState(patch),
      revalTag: (tag: string) => cubeRevalidateTag(tag),
      revalPage: (p: string) => cubeRevalidatePage(p),
      revalLayout: (p: string) => cubeRevalidateLayout(p),
      revalPath: (p: string) => cubeRevalidatePath(p),
      refreshPage: () => router.refresh(),
      refreshLayout: () => router.refresh({ layout: true }),
      refreshSlot: (idOrTag: string, fresh = true) =>
        refreshSlot(idOrTag, { fresh }),
      push: (href: string) => router.push(href),
    };
  }, [router]);

  return (
    <div id="cube-control-bridge" data-ready="true" style={{ display: "flex", gap: 6, margin: 4 }}>
      <button
        id="btn-refresh-all-slots"
        type="button"
        onClick={() => {
          void refreshSlot("*", { fresh: true });
        }}
      >
        Refresh All Slots (*)
      </button>
      <button
        id="btn-cube-refresh-page"
        type="button"
        onClick={() => router.refresh()}
      >
        Refresh Page
      </button>
      <button
        id="btn-cube-refresh-layout"
        type="button"
        onClick={() => router.refresh({ layout: true })}
      >
        Refresh Layout
      </button>
    </div>
  );
}
