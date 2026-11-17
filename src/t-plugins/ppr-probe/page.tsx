import { Suspense } from "react";
import { getContext } from "./dinou";

async function DynamicPluginPprHole() {
  const ctx = getContext() as Record<string, unknown>;
  const reqObj = ctx?.req as { cookies?: Record<string, string> } | undefined;
  const viewer = reqObj?.cookies?.t_plugins_viewer || "anon-viewer";
  const pluginTag = String(ctx?.pprPluginTag ?? "missing");
  await new Promise((r) => setTimeout(r, 25));

  return (
    <div
      data-testid="t-plugins-ppr-dynamic-hole"
      data-viewer={viewer}
      data-plugin-tag={pluginTag}
    >
      PPR Hole: {viewer} | {pluginTag}
    </div>
  );
}

export default function TPluginsPprProbePage() {
  return (
    <main data-testid="t-plugins-ppr-page">
      <h1 id="t-plugins-ppr-static-shell">PPR Plugin Shell Ready</h1>
      <Suspense fallback={<div id="t-plugins-ppr-fallback">Streaming PPR hole...</div>}>
        <DynamicPluginPprHole />
      </Suspense>
    </main>
  );
}

