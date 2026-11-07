import React, { Suspense } from "react";
import { ClientPromiseConsumer } from "../client-consumer";

export default function TestPprPromisePage() {
  const pprPromise = new Promise<{ label: string; value: number }>((resolve) =>
    setTimeout(() => resolve({ label: "PPR-Promise-OK", value: 77 }), 150)
  );

  return (
    <main data-testid="ppr-promise-page" className="p-6 space-y-4">
      <header data-testid="ppr-static-shell">
        <h1 className="text-2xl font-bold">Strategy 9 with PPR Static Shell</h1>
      </header>

      <Suspense fallback={<div data-testid="ppr-promise-fallback">PPR Fallback Skeleton</div>}>
        <ClientPromiseConsumer promise={pprPromise} testId="ppr-promise-resolved" />
      </Suspense>
    </main>
  );
}

