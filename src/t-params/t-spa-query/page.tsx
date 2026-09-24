"use client";
import { useSearchParams, useRouter } from "dinou";
import { useState } from "react";

export default function SpaQueryPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [counter, setCounter] = useState(0);

  return (
    <div data-testid="spa-query-container">
      <h1>SPA Query Params Test</h1>
      <div data-testid="current-tab">{searchParams.get("tab") || "none"}</div>
      <div data-testid="current-q">{searchParams.get("q") || "none"}</div>
      <div data-testid="counter">{counter}</div>
      <button data-testid="increment" onClick={() => setCounter((c) => c + 1)}>
        Increment
      </button>
      <button
        data-testid="btn-tab-settings"
        onClick={() => router.push("/t-params/t-spa-query?tab=settings&q=react")}
      >
        Go to Settings
      </button>
      <button
        data-testid="btn-tab-profile"
        onClick={() => router.push("/t-params/t-spa-query?tab=profile&q=dinou")}
      >
        Go to Profile
      </button>
    </div>
  );
}
