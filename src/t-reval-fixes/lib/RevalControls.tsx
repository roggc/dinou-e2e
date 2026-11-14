"use client";

import { useState } from "react";
import {
  actionRevalidateByTag,
  actionRevalidateCurrentLayout,
  actionRevalidateParentLayout,
  actionRevalidateSiblingBillingLayout,
} from "./revalActions";

export interface RevalControlsProps {
  ws: string;
  ttlMode?: boolean;
}

export function RevalControls({ ws, ttlMode = false }: RevalControlsProps) {
  const [status, setStatus] = useState("idle");
  const [callSeq, setCallSeq] = useState(0);

  async function runAction(fn: () => Promise<string>) {
    setStatus("pending");
    const res = await fn();
    setCallSeq((prev) => {
      const next = prev + 1;
      setStatus(`done:${next}:${res}`);
      return next;
    });
  }

  if (ttlMode) {
    return (
      <div data-testid="reval-ttl-controls" data-seq={callSeq}>
        <button
          type="button"
          data-testid="btn-reval-ttl-slot"
          onClick={() =>
            runAction(() => actionRevalidateByTag(`reval-ttl-slot-${ws}`))
          }
        >
          Refresh TTL Slot Tag
        </button>
        <p data-testid="reval-action-status">{status}</p>
      </div>
    );
  }

  return (
    <div data-testid="reval-controls" data-seq={callSeq}>
      <button
        type="button"
        data-testid="btn-reval-current-layout"
        onClick={() => runAction(() => actionRevalidateCurrentLayout())}
      >
        Revalidate Current Layout (./)
      </button>
      <button
        type="button"
        data-testid="btn-reval-parent-layout"
        onClick={() => runAction(() => actionRevalidateParentLayout())}
      >
        Revalidate Parent Layout (..)
      </button>
      <button
        type="button"
        data-testid="btn-reval-billing-layout"
        onClick={() => runAction(() => actionRevalidateSiblingBillingLayout())}
      >
        Revalidate Billing Layout (../billing)
      </button>
      <button
        type="button"
        data-testid="btn-reval-quota-slot"
        onClick={() =>
          runAction(() => actionRevalidateByTag(`reval-quota-slot-${ws}`))
        }
      >
        Revalidate Quota Slot Tag
      </button>
      <button
        type="button"
        data-testid="btn-reval-dash-slot"
        onClick={() =>
          runAction(() => actionRevalidateByTag(`reval-dash-slot-${ws}`))
        }
      >
        Revalidate Dashboard Layout Slot Tag
      </button>
      <button
        type="button"
        data-testid="btn-reval-settings-page"
        onClick={() =>
          runAction(() => actionRevalidateByTag(`reval-settings-page-${ws}`))
        }
      >
        Revalidate Settings Page Tag
      </button>
      <p data-testid="reval-action-status">{status}</p>
    </div>
  );
}
