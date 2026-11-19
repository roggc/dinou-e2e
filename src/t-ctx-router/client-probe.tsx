"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "./dinou";
import { inspectServerFunctionContextAction } from "./actions";

export function ContextualRouterStabilityProbe() {
  const router = useRouter();
  const [count, setCount] = useState(0);
  const effectRunsRef = useRef(0);
  const [effectRuns, setEffectRuns] = useState(0);
  const [sfResult, setSfResult] = useState("idle");

  const prevRouterRef = useRef(router);
  const refChangesRef = useRef(0);
  if (prevRouterRef.current !== router) {
    refChangesRef.current += 1;
    prevRouterRef.current = router;
  }

  useEffect(() => {
    effectRunsRef.current += 1;
    setEffectRuns(effectRunsRef.current);
  }, [router]);

  return (
    <section data-testid="ctx-router-probe">
      <div data-testid="local-count">{count}</div>
      <div data-testid="router-effect-runs">{effectRuns}</div>
      <div data-testid="router-ref-changes">{refChangesRef.current}</div>
      <button
        type="button"
        data-testid="bump-local-state"
        onClick={() => setCount((c) => c + 1)}
      >
        Bump State
      </button>
      <button
        type="button"
        data-testid="push-relative-child"
        onClick={() => router.push("child")}
      >
        Go To Relative Child
      </button>
      <button
        type="button"
        data-testid="invoke-sf-context-probe"
        onClick={async () => {
          const res = await inspectServerFunctionContextAction();
          setSfResult(
            `path=${res.path}|raw=${res.rawPath}|rsc=${String(res.isRscRequest)}|user=${res.pluginUser}`
          );
        }}
      >
        Probe SF Context
      </button>
      <div data-testid="sf-context-result">{sfResult}</div>
    </section>
  );
}
