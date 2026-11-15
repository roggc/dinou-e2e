"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "dinou";

export function PublicExportLayoutShell({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const router = useRouter();

  return (
    <div data-testid="public-export-layout-shell">
      <div data-testid="public-export-layout-controls">
        <span data-testid="public-export-layout-counter">
          LayoutCount:{count}
        </span>
        <button
          type="button"
          data-testid="public-export-layout-inc"
          onClick={() => setCount((c) => c + 1)}
        >
          Increment Layout Counter
        </button>
        <button
          type="button"
          data-testid="public-export-fallback-btn"
          onClick={() =>
            (router.push as (href: string) => void)("/pure-static-fallback")
          }
        >
          Navigate Non-RSC Static Page
        </button>
      </div>
      {children}
    </div>
  );
}

