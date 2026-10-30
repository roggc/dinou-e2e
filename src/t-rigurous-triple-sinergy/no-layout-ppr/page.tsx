import React, { Suspense } from "react";
import { Link, getContext } from "dinou";
import { DinouCacheSlot } from "dinou/server";

async function NoLayoutPprHole() {
  await new Promise((r) => setTimeout(r, 10));
  const ctx = getContext();
  const mode = ctx?.req?.query?.mode || "standalone";
  return (
    <div id="ts-no-layout-ppr-hole">
      No-Layout PPR Hole Mode: <strong>{mode}</strong>
    </div>
  );
}

export default async function NoLayoutPprPage() {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <title>No-Layout PPR Page</title>
      </head>
      <body>
        <main id="ts-no-layout-ppr-page" style={{ padding: 24, background: "#0f172a", color: "#f8fafc" }}>
          <h1>Standalone no_layout + PPR + DinouCacheSlot Page</h1>
          <DinouCacheSlot id="ts-no-layout-slot" tag="ts-no-layout-slot-tag" revalidate={3600}>
            <div id="ts-no-layout-slot-box">Standalone Slot Ready</div>
          </DinouCacheSlot>
          <Suspense fallback={<div id="ts-no-layout-hole-fallback">Loading...</div>}>
            <NoLayoutPprHole />
          </Suspense>
          <div style={{ marginTop: 12 }}>
            <Link id="ts-no-layout-back-link" href="/t-rigurous-triple-sinergy">
              Back to Triple Synergy Section
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}

