"use client";

import { useSearchParams } from "dinou";

export function LoginQueryProbe() {
  const sp = useSearchParams();
  return (
    <p data-testid="api-nav-login-from">
      from={sp.get("from") || "none"}|q={sp.get("q") || "empty"}
    </p>
  );
}
