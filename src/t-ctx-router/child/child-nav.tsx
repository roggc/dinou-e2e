"use client";

import { useRouter } from "./dinou";

export function ChildContextualNav() {
  const router = useRouter();
  return (
    <button
      type="button"
      data-testid="replace-relative-parent"
      onClick={() => router.replace("..")}
    >
      Replace Back To Parent
    </button>
  );
}
