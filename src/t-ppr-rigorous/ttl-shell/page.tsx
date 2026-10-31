import React, { Suspense } from "react";
import { getContext } from "dinou";

async function DynamicTtlHole() {
  await new Promise((r) => setTimeout(r, 10));
  const ctx = getContext();
  const q = ctx?.req?.query?.q || "default-q";
  return (
    <div data-testid="ppr-ttl-hole-resolved">
      Hole Query: <strong data-testid="ppr-ttl-hole-q">{q}</strong>
    </div>
  );
}

export default function PprTtlShellPage({
  ttlShellToken = "dev-ttl-shell",
}: {
  ttlShellToken?: string;
}) {
  return (
    <main className="p-6 bg-slate-950 text-slate-100">
      <h1>PPR Clock-Based Shell TTL Test (/t-ppr-rigorous/ttl-shell)</h1>
      <div>
        Shell Token: <strong data-testid="ppr-ttl-shell-token">{ttlShellToken}</strong>
      </div>
      <Suspense fallback={<div data-testid="ppr-ttl-hole-fallback">Loading hole...</div>}>
        <DynamicTtlHole />
      </Suspense>
    </main>
  );
}

