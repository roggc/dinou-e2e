"use client";
import { useState } from "react";
import { useSearchParams, useRouter } from "dinou";

export function ClientShellSearchWidget() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [clicks, setClicks] = useState(0);

  const q = searchParams.get("q") || "none";
  const tab = searchParams.get("tab") || "none";

  return (
    <div data-testid="sp-client-shell-widget">
      <span data-testid="sp-client-shell-q">{q}</span>
      <span data-testid="sp-client-shell-tab">{tab}</span>
      <span data-testid="sp-client-shell-clicks">{clicks}</span>
      <button
        type="button"
        data-testid="sp-client-shell-inc"
        onClick={() => setClicks((c) => c + 1)}
      >
        +1
      </button>
      <button
        type="button"
        data-testid="sp-client-shell-nav"
        onClick={() => router.push("/t-new-ppr/search-params?q=updated&tab=settings")}
      >
        Navigate Query
      </button>
    </div>
  );
}

export function ClientHoleSearchWidget() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") || "none";
  const tab = searchParams.get("tab") || "none";

  return (
    <div data-testid="sp-client-hole-widget">
      <span data-testid="sp-client-hole-q">{q}</span>
      <span data-testid="sp-client-hole-tab">{tab}</span>
    </div>
  );
}

