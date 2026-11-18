"use client";

import { useState } from "react";
import { usePathname } from "dinou";
import { probeEjectStatusAction } from "./actions";

export function EjectClientCard() {
  const pathname = usePathname();
  const [status, setStatus] = useState("idle");

  return (
    <section data-testid="eject-client-card" data-pathname={pathname}>
      <p data-testid="eject-client-path">{pathname}</p>
      <button
        type="button"
        data-testid="eject-probe-btn"
        onClick={async () => {
          const res = await probeEjectStatusAction("sovereignty");
          setStatus(`${res.tag}|secret:${res.hasSecret}`);
        }}
      >
        Verify Ejected Sovereignty
      </button>
      <p data-testid="eject-probe-result">{status}</p>
    </section>
  );
}

