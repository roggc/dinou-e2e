"use client";

import { useTransition } from "react";
import { triggerRevalidateCascade } from "./actions";

export default function CascadeButtons() {
  const [isPending, startTransition] = useTransition();

  return (
    <div style={{ margin: "10px 0" }}>
      <button
        data-testid="reval-cascade-btn"
        disabled={isPending}
        onClick={() => startTransition(() => triggerRevalidateCascade())}
      >
        {isPending ? "Revalidating Cascade..." : "Revalidate Cascade"}
      </button>
    </div>
  );
}
