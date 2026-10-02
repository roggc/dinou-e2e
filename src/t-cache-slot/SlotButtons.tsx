"use client";

import { useTransition } from "react";
import { revalidateTagAlpha, revalidateTagBeta } from "./actions";

export default function SlotButtons() {
  const [isPendingAlpha, startTransitionAlpha] = useTransition();
  const [isPendingBeta, startTransitionBeta] = useTransition();

  return (
    <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
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
  );
}
