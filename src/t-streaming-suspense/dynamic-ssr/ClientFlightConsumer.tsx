"use client";

import { use, useState, type ReactNode } from "react";
import { fetchRpcStreamedWidget } from "./rpcStreamActions";

export function ClientFlightInner({
  flightPromise,
  testId,
}: {
  flightPromise: Promise<{ plan: string; seats: number }>;
  testId: string;
}) {
  const data = use(flightPromise);
  return (
    <div
      data-testid={testId}
      data-seats={String(data.seats)}
    >{`ClientFlightPlan:${data.plan}:${data.seats}`}</div>
  );
}

export function ClientFlightInteractiveShell({
  children,
}: {
  children: ReactNode;
}) {
  const [rpcWidget, setRpcWidget] = useState<ReactNode>(null);

  return (
    <section data-testid="client-flight-interactive-shell">
      <div data-testid="client-prop-children-slot">{children}</div>
      <button
        type="button"
        data-testid="btn-rpc-stream"
        onClick={async () => {
          const ui = await fetchRpcStreamedWidget("OK");
          setRpcWidget(ui);
        }}
      >
        Load RPC Streamed Widget
      </button>
      <div data-testid="rpc-stream-container">{rpcWidget}</div>
    </section>
  );
}

