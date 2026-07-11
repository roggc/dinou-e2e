"use client";

import { useTransition } from "react";
import { triggerRevalidatePath, triggerRevalidateTag, triggerRevalidatePathRelative } from "./actions";

export default function RevalidateTestButtons() {
  const [isPendingPath, startTransitionPath] = useTransition();
  const [isPendingTag, startTransitionTag] = useTransition();
  const [isPendingRel, startTransitionRel] = useTransition();

  return (
    <div className="flex gap-2 my-4">
      <button
        data-testid="reval-path-btn"
        disabled={isPendingPath || isPendingTag || isPendingRel}
        onClick={() => startTransitionPath(() => triggerRevalidatePath())}
      >
        {isPendingPath ? "Revalidating Path..." : "Revalidate Path"}
      </button>
      <button
        data-testid="reval-tag-btn"
        disabled={isPendingPath || isPendingTag || isPendingRel}
        onClick={() => startTransitionTag(() => triggerRevalidateTag())}
      >
        {isPendingTag ? "Revalidating Tag..." : "Revalidate Tag"}
      </button>
      <button
        data-testid="reval-rel-btn"
        disabled={isPendingPath || isPendingTag || isPendingRel}
        onClick={() => startTransitionRel(() => triggerRevalidatePathRelative())}
      >
        {isPendingRel ? "Revalidating Relative..." : "Revalidate Relative"}
      </button>
    </div>
  );
}
