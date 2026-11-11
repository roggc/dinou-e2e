"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { loadAsyncServerCompWithContext } from "./actions";

export default function SfServerCompContextPage() {
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [renderedCard, setRenderedCard] = useState<ReactNode>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  async function invoke(tag: string, delayMs: number) {
    setLoading(true);
    try {
      const card = await loadAsyncServerCompWithContext(tag, delayMs);
      setRenderedCard(card);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      id="sf-sc-page"
      data-ready={hydrated ? "true" : "false"}
      style={{ padding: "1rem" }}
    >
      <h1>Server Function Returning Async Server Component Calling getContext()</h1>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <button
          id="sf-sc-invoke-fast"
          type="button"
          onClick={() => invoke("single-check", 50)}
        >
          Invoke Fast
        </button>
        <button
          id="sf-sc-invoke-overlap"
          type="button"
          onClick={() => invoke("overlap-check", 160)}
        >
          Invoke Overlap
        </button>
      </div>
      {loading && <div id="sf-sc-loading">invoking...</div>}
      <Suspense fallback={<div id="sf-sc-suspense">streaming card...</div>}>
        {renderedCard}
      </Suspense>
    </main>
  );
}
