import { Suspense } from "react";
import { getContext } from "dinou/server";
import { InteractiveCounter } from "../InteractiveCounter";

async function DynamicPprHole() {
  const { req } = getContext();
  const tag = String(req.query.tag || "live");
  return (
    <div data-testid="importmap-ppr-hole">
      {`PPR Hole — ${tag} 🚀`}
    </div>
  );
}

export default function ImportmapHeadPprPage() {
  return (
    <main data-testid="importmap-head-ppr-page">
      <h1 data-testid="importmap-ppr-heading">PPR Shell — Dinou 🚀</h1>
      <InteractiveCounter label="ppr" />
      <Suspense fallback={<div data-testid="importmap-ppr-fallback">Loading hole...</div>}>
        <DynamicPprHole />
      </Suspense>
    </main>
  );
}
