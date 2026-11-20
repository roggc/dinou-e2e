"use client";

import { useState } from "react";
import {
  bumpIdOnlySlotAndRevalidate,
  bumpComboSlotAndRevalidateTagProp,
  bumpScopedIdOnlySlotAndRevalidate,
  bumpScopedComboSlotAndRevalidateTagProp,
} from "./actions";

export function SlotComboControls({ scope }: { scope?: string }) {
  const [status, setStatus] = useState("idle");
  const [nextIdVal, setNextIdVal] = useState("id-v2");
  const [nextComboVal, setNextComboVal] = useState("combo-v2");

  return (
    <div data-testid="slot-combo-controls">
      <span data-testid="slot-action-status">{status}</span>
      <input
        type="text"
        data-testid="next-id-input"
        aria-label="Next ID slot value"
        value={nextIdVal}
        onChange={(e) => setNextIdVal(e.target.value)}
      />
      <button
        type="button"
        data-testid="reval-id-only"
        onClick={async () => {
          setStatus("pending-id");
          if (scope) {
            await bumpScopedIdOnlySlotAndRevalidate(scope, nextIdVal);
          } else {
            await bumpIdOnlySlotAndRevalidate(nextIdVal);
          }
          setStatus(`done-id:${nextIdVal}`);
        }}
      >
        Revalidate ID-Only Slot (Cold)
      </button>
      <input
        type="text"
        data-testid="next-combo-input"
        aria-label="Next combo slot value"
        value={nextComboVal}
        onChange={(e) => setNextComboVal(e.target.value)}
      />
      <button
        type="button"
        data-testid="reval-combo-primary"
        onClick={async () => {
          setStatus("pending-combo");
          if (scope) {
            await bumpScopedComboSlotAndRevalidateTagProp(scope, nextComboVal);
          } else {
            await bumpComboSlotAndRevalidateTagProp(nextComboVal);
          }
          setStatus(`done-combo:${nextComboVal}`);
        }}
      >
        Revalidate Combo Slot via tag Prop
      </button>
    </div>
  );
}
