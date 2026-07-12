"use client";

import { useTransition } from "react";
import {
  triggerRevalidatePath,
  triggerRevalidateTag,
  triggerRevalidatePathRelative,
  triggerRevalidatePathNonExistent,
  triggerRevalidateTagNonExistent,
} from "./actions";

export default function RevalidateTestButtons() {
  const [isPendingPath, startTransitionPath] = useTransition();
  const [isPendingTag, startTransitionTag] = useTransition();
  const [isPendingRel, startTransitionRel] = useTransition();
  const [isPendingNonExistentPath, startTransitionNonExistentPath] = useTransition();
  const [isPendingNonExistentTag, startTransitionNonExistentTag] = useTransition();

  const isAnyPending =
    isPendingPath ||
    isPendingTag ||
    isPendingRel ||
    isPendingNonExistentPath ||
    isPendingNonExistentTag;

  return (
    <div className="flex flex-col gap-2 my-4">
      <div className="flex gap-2">
        <button
          data-testid="reval-path-btn"
          disabled={isAnyPending}
          onClick={() => startTransitionPath(() => triggerRevalidatePath())}
        >
          {isPendingPath ? "Revalidating Path..." : "Revalidate Path"}
        </button>
        <button
          data-testid="reval-tag-btn"
          disabled={isAnyPending}
          onClick={() => startTransitionTag(() => triggerRevalidateTag())}
        >
          {isPendingTag ? "Revalidating Tag..." : "Revalidate Tag"}
        </button>
        <button
          data-testid="reval-rel-btn"
          disabled={isAnyPending}
          onClick={() => startTransitionRel(() => triggerRevalidatePathRelative())}
        >
          {isPendingRel ? "Revalidating Relative..." : "Revalidate Relative"}
        </button>
      </div>
      <div className="flex gap-2">
        <button
          data-testid="reval-nonexistent-path-btn"
          disabled={isAnyPending}
          onClick={() =>
            startTransitionNonExistentPath(() => triggerRevalidatePathNonExistent())
          }
        >
          {isPendingNonExistentPath
            ? "Revalidating Non-existent Path..."
            : "Revalidate Non-existent Path"}
        </button>
        <button
          data-testid="reval-nonexistent-tag-btn"
          disabled={isAnyPending}
          onClick={() =>
            startTransitionNonExistentTag(() => triggerRevalidateTagNonExistent())
          }
        >
          {isPendingNonExistentTag
            ? "Revalidating Non-existent Tag..."
            : "Revalidate Non-existent Tag"}
        </button>
      </div>
    </div>
  );
}
