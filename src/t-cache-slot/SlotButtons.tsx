"use client";

import { useTransition, useState, useEffect } from "react";
import { refreshSlot, useRouter } from "dinou";
import { revalidateTagAlpha, revalidateTagBeta, revalidateTagFast } from "./actions";

export default function SlotButtons() {
  const [isPendingAlpha, startTransitionAlpha] = useTransition();
  const [isPendingBeta, startTransitionBeta] = useTransition();
  const [isPendingFast, startTransitionFast] = useTransition();
  const [hydrated, setHydrated] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <div
      id="slot-buttons-container"
      data-hydrated={hydrated ? "true" : "false"}
      style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "20px" }}
    >
      <div style={{ display: "flex", gap: "10px" }}>
        <button
          id="btn-revalidate-alpha"
          data-hydrated={hydrated ? "true" : "false"}
          disabled={isPendingAlpha}
          onClick={() => startTransitionAlpha(() => revalidateTagAlpha())}
        >
          {isPendingAlpha ? "Revalidating Alpha..." : "Revalidate Tag Alpha"}
        </button>

        <button
          id="btn-revalidate-beta"
          data-hydrated={hydrated ? "true" : "false"}
          disabled={isPendingBeta}
          onClick={() => startTransitionBeta(() => revalidateTagBeta())}
        >
          {isPendingBeta ? "Revalidating Beta..." : "Revalidate Tag Beta"}
        </button>

        <button
          id="btn-revalidate-fast"
          data-hydrated={hydrated ? "true" : "false"}
          disabled={isPendingFast}
          onClick={() => startTransitionFast(() => revalidateTagFast())}
        >
          {isPendingFast ? "Revalidating Fast..." : "Revalidate Tag Fast"}
        </button>
      </div>

      <div style={{ display: "flex", gap: "10px" }}>
        <button
          id="btn-refresh-slot-alpha"
          data-hydrated={hydrated ? "true" : "false"}
          onClick={() => refreshSlot("slot-alpha")}
        >
          Refresh Slot Alpha (Live)
        </button>

        <button
          id="btn-refresh-slot-beta"
          data-hydrated={hydrated ? "true" : "false"}
          onClick={() => router.refreshSlot("slot-beta")}
        >
          Refresh Slot Beta (Live useRouter)
        </button>
      </div>
    </div>
  );
}
