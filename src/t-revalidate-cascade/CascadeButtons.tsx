"use client";

import { useTransition } from "react";
import {
  triggerRevalidateCascade,
  triggerRevalidateTagPage,
  triggerRevalidateTagLayoutDefault,
  triggerRevalidateTagLayoutCascade,
} from "./actions";

export default function CascadeButtons() {
  const [isPending, startTransition] = useTransition();

  return (
    <div style={{ margin: "10px 0", display: "flex", gap: "8px", flexWrap: "wrap" }}>
      <button
        data-testid="reval-cascade-btn"
        disabled={isPending}
        onClick={() => startTransition(() => triggerRevalidateCascade())}
      >
        {isPending ? "Revalidating Cascade..." : "Revalidate Cascade"}
      </button>

      <button
        data-testid="reval-tag-page-btn"
        disabled={isPending}
        onClick={() => startTransition(() => triggerRevalidateTagPage())}
      >
        {isPending ? "Revalidating Page Tag..." : "Revalidate Page Tag"}
      </button>

      <button
        data-testid="reval-tag-layout-default-btn"
        disabled={isPending}
        onClick={() => startTransition(() => triggerRevalidateTagLayoutDefault())}
      >
        {isPending ? "Revalidating Layout Tag (Default)..." : "Revalidate Layout Tag (Default)"}
      </button>

      <button
        data-testid="reval-tag-layout-cascade-btn"
        disabled={isPending}
        onClick={() => startTransition(() => triggerRevalidateTagLayoutCascade())}
      >
        {isPending ? "Revalidating Layout Tag (Cascade)..." : "Revalidate Layout Tag (Cascade)"}
      </button>
    </div>
  );
}

