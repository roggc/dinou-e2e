"use server";

import { Suspense } from "react";
import { ServerUidBadge, sleep } from "../lib/streamStore";

async function buildRpcPromisePayload(label: string) {
  await sleep(180);
  return (
    <div data-testid="rpc-stream-resolved">
      <ServerUidBadge
        testId="rpc-stream-uid"
        label={`RpcStreamResolved:${label}`}
      />
    </div>
  );
}

export async function fetchRpcStreamedWidget(label: string) {
  return (
    <section data-testid="rpc-stream-shell">
      <h3 data-testid="rpc-stream-heading">{`RpcShell:${label}`}</h3>
      <Suspense
        fallback={<span data-testid="rpc-stream-fallback">RPC Loading...</span>}
      >
        {buildRpcPromisePayload(label)}
      </Suspense>
    </section>
  );
}

