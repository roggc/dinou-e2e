import React, { Suspense } from "react";
import {
  ClientPromiseConsumer,
  ClientPromiseArrayConsumer,
} from "./client-consumer";

export default function TestRscPromisePage() {
  // Strategy 9: Start promises on the server WITHOUT awaiting
  const itemPromise = new Promise<{ label: string; value: number }>((resolve) =>
    setTimeout(() => resolve({ label: "RSC-Promise-OK", value: 42 }), 150)
  );

  const listPromises = [
    new Promise<string>((resolve) => setTimeout(() => resolve("Alpha"), 150)),
    new Promise<string>((resolve) => setTimeout(() => resolve("Beta"), 170)),
  ];

  return (
    <main data-testid="rsc-promise-page" className="p-6 space-y-4">
      <h1 data-testid="rsc-static-header" className="text-2xl font-bold">
        Strategy 9: RSC Promise to Client use()
      </h1>

      <Suspense fallback={<div data-testid="rsc-fallback">Loading RSC Promise...</div>}>
        <ClientPromiseConsumer promise={itemPromise} testId="rsc-resolved" />
      </Suspense>

      <Suspense fallback={<div data-testid="rsc-array-fallback">Loading Array Promises...</div>}>
        <ClientPromiseArrayConsumer promises={listPromises} testId="rsc-array-resolved" />
      </Suspense>
    </main>
  );
}

