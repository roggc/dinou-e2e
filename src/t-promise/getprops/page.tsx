"use client";

import React, { Suspense } from "react";
import { ClientPromiseConsumer } from "../client-consumer";

export default function TestGetPropsPromisePage({
  docPromise,
}: {
  docPromise: Promise<{ label: string; value: number }>;
}) {
  return (
    <main data-testid="getprops-promise-page" className="p-6 space-y-4">
      <header data-testid="getprops-client-shell">
        <h1 className="text-2xl font-bold">Strategy 12: getProps Promise to Client use()</h1>
      </header>

      <nav className="flex gap-4 text-sm underline">
        <a href="/t-promise" data-testid="nav-to-rsc">
          Go to RSC Promise
        </a>
        <a href="/t-promise/ppr" data-testid="nav-to-ppr">
          Go to PPR Promise
        </a>
      </nav>

      <Suspense fallback={<div data-testid="getprops-fallback">Loading getProps Promise...</div>}>
        <ClientPromiseConsumer promise={docPromise} testId="getprops-resolved" />
      </Suspense>
    </main>
  );
}

