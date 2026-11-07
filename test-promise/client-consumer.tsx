"use client";

import React, { use } from "react";

export function ClientPromiseConsumer({
  promise,
  testId,
}: {
  promise: Promise<{ label: string; value: number }>;
  testId: string;
}) {
  const data = use(promise);
  return (
    <div data-testid={testId} data-value={String(data.value)} className="p-3 border rounded">
      {data.label}: {data.value}
    </div>
  );
}

export function ClientPromiseArrayConsumer({
  promises,
  testId,
}: {
  promises: Promise<string>[];
  testId: string;
}) {
  const items = promises.map((p) => use(p));
  return (
    <ul data-testid={testId} className="list-disc pl-5">
      {items.map((item, idx) => (
        <li key={idx}>{item}</li>
      ))}
    </ul>
  );
}

