"use client";

import { useSearchParams } from "dinou";

export function PprSearchClient() {
  const sp = useSearchParams();
  return (
    <p data-testid="api-nav-ppr-search-value">
      ppr-zero-hole|q={sp.get("q") || "empty"}|page={sp.get("page") || "0"}
    </p>
  );
}
