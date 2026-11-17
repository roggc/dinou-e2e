"use client";

import { useSearchParams } from "dinou";

export function ClientLoginQuery() {
  const searchParams = useSearchParams();
  const fromParam = searchParams.get("from") || "";
  const viaParam = searchParams.get("via") || "";

  return (
    <p
      data-testid="t-plugins-login-query"
      data-from={fromParam}
      data-via={viaParam}
    >
      from={fromParam || "none"}|via={viaParam || "none"}
    </p>
  );
}

