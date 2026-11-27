"use client";

import { useEffect, useRef } from "react";
import { Link, useRouter, refreshSlot } from "dinou";

declare global {
  interface Window {
    __Z1_SOAK__?: {
      push: (url: string) => void;
      back: () => void;
      refreshSlot: (id: string) => Promise<void>;
    };
  }
}

export default function SoakSpaControls({ id }: { id: string }) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    window.__Z1_SOAK__ = {
      push: (url: string) => routerRef.current.push(url),
      back: () => routerRef.current.back(),
      refreshSlot: (slotId: string) => refreshSlot(slotId, { fresh: true }),
    };
  }, []);

  const numId = Number(id) || 0;
  const nextId = numId + 1;

  return (
    <div data-testid="z1-spa-controls">
      <Link href={`/t-z-soak/${nextId}`} data-testid="z1-next-link">
        {`Next (${nextId})`}
      </Link>
      <button
        type="button"
        data-testid="z1-refresh-slot-btn"
        onClick={() => {
          refreshSlot(`z1-spa-slot-${id}`, { fresh: true });
        }}
      >
        Refresh Slot
      </button>
    </div>
  );
}
