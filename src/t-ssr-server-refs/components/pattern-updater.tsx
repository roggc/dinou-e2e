"use client";

import { useEffect, useRef } from "react";
import { triggerScopeRefresh } from "../store/native-task-store";

// Intentionally exported as `export default` to exercise Rollup's `${fileUrl}#default`
// client manifest registration when streamed inside an RSC Server Function response.
export default function PatternTaskUpdater({
  scope,
  id,
}: {
  scope: string;
  id: string;
}) {
  const didTrigger = useRef(false);

  useEffect(() => {
    if (didTrigger.current) return;
    didTrigger.current = true;
    triggerScopeRefresh(scope);
  }, [scope, id]);

  return (
    <span hidden data-testid="last-streamed-task-id" data-task-id={id}>
      {id}
    </span>
  );
}

