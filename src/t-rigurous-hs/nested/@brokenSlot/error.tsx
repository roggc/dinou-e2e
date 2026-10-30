import React from "react";

export default function HsBrokenSlotError({ error }: { error?: { message?: string } }) {
  return (
    <span id="hs-broken-slot-fallback" className="text-amber-300 text-xs">
      Slot Contained Error: {error?.message || "Slot Error"}
    </span>
  );
}

