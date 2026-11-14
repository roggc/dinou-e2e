"use client";

import { useState } from "react";
import { echoCompiledAction } from "./actions";
import { echoInlineCompiledAction } from "./inline-actions";
import { LegacyNoMemoProbe, OrderSummary } from "./order-summary";

export function CompilerHarness() {
  const [parentClicks, setParentClicks] = useState(0);
  const [parentLabel, setParentLabel] = useState("draft");
  const [modReply, setModReply] = useState("idle");
  const [inlineReply, setInlineReply] = useState("idle");

  return (
    <div data-testid="react-compiler-harness">
      <button
        type="button"
        data-testid="bump-parent-unrelated"
        onClick={() => setParentClicks((c) => c + 1)}
      >
        {`Parent Unrelated: ${parentClicks}`}
      </button>

      <button
        type="button"
        data-testid="change-parent-label"
        onClick={() => setParentLabel("confirmed")}
      >
        Confirm Parent Label
      </button>

      <button
        type="button"
        data-testid="call-mod-action"
        onClick={async () => {
          const out = await echoCompiledAction(parentLabel, parentClicks);
          setModReply(out);
        }}
      >
        Call Module Server Action
      </button>
      <p data-testid="mod-action-reply">{modReply}</p>

      <button
        type="button"
        data-testid="call-inline-action"
        onClick={async () => {
          const out = await echoInlineCompiledAction(parentLabel);
          setInlineReply(out);
        }}
      >
        Call Inline Server Action
      </button>
      <p data-testid="inline-action-reply">{inlineReply}</p>

      <OrderSummary parentLabel={parentLabel} />
      <LegacyNoMemoProbe tick={parentClicks} />
    </div>
  );
}

