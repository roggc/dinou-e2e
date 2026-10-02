"use client";

import { useTransition } from "react";
import { refreshSlot, useRouter } from "dinou";
import { revalidateTagAlpha, revalidateTagBeta } from "./actions";

export default function SlotButtons() {
  const [isPendingAlpha, startTransitionAlpha] = useTransition();
  const [isPendingBeta, startTransitionBeta] = useTransition();
  const router = useRouter();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "20px" }}>
      <div style={{ display: "flex", gap: "10px" }}>
        <button
          id="btn-revalidate-alpha"
          disabled={isPendingAlpha}
          onClick={() => startTransitionAlpha(() => revalidateTagAlpha())}
        >
          {isPendingAlpha ? "Revalidating Alpha..." : "Revalidate Tag Alpha"}
        </button>

        <button
          id="btn-revalidate-beta"
          disabled={isPendingBeta}
          onClick={() => startTransitionBeta(() => revalidateTagBeta())}
        >
          {isPendingBeta ? "Revalidating Beta..." : "Revalidate Tag Beta"}
        </button>
      </div>

      <div style={{ display: "flex", gap: "10px" }}>
        <button
          id="btn-refresh-slot-alpha"
          onClick={() => refreshSlot("slot-alpha")}
        >
          Refresh Slot Alpha (Live)
        </button>

        <button
          id="btn-refresh-slot-beta"
          onClick={() => router.refreshSlot("slot-beta")}
        >
          Refresh Slot Beta (Live useRouter)
        </button>
      </div>
    </div>
  );
}
