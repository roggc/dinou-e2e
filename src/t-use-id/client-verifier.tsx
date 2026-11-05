// src/t-use-id/client-verifier.tsx
"use client";

import { useEffect, useId, useState } from "react";
import { refreshSlot, useRouter } from "dinou";

interface NodeReport {
  testId: string;
  generatedId: string;
  labelFor: string | null;
  inputId: string | null;
  matched: boolean;
}

export function ClientUseIdVerifier() {
  const clientHookId = useId();
  const router = useRouter();
  const [reports, setReports] = useState<NodeReport[]>([]);
  const [duplicateIds, setDuplicateIds] = useState<string[]>([]);
  const [refreshCount, setRefreshCount] = useState(0);

  const inspectDomIds = () => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>("[data-generated-id]")
    );
    const seen = new Map<string, number>();
    const nextReports: NodeReport[] = [];

    for (const el of nodes) {
      const testId = el.getAttribute("data-testid") || "unknown";
      const generatedId = el.getAttribute("data-generated-id") || "";
      const label = el.querySelector("label");
      const input = el.querySelector("input");
      const labelFor = label?.getAttribute("for") ?? null;
      const inputId = input?.getAttribute("id") ?? null;

      seen.set(generatedId, (seen.get(generatedId) || 0) + 1);

      nextReports.push({
        testId,
        generatedId,
        labelFor,
        inputId,
        matched:
          Boolean(generatedId) &&
          labelFor === generatedId &&
          inputId === generatedId,
      });
    }

    const dupes = Array.from(seen.entries())
      .filter(([, count]) => count > 1)
      .map(([id]) => id);

    setReports(nextReports);
    setDuplicateIds(dupes);
  };

  useEffect(() => {
    inspectDomIds();
    const timer = setTimeout(inspectDomIds, 400);
    return () => clearTimeout(timer);
  }, [refreshCount]);

  const allMatched =
    reports.length > 0 &&
    reports.every((r) => r.matched) &&
    duplicateIds.length === 0;

  return (
    <div
      data-testid="client-useid-verifier"
      className="p-4 rounded-xl border border-indigo-500/30 bg-indigo-950/10 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-bold text-sm">
            Client Hydration &amp; Collision Verifier
          </h3>
          <p className="text-xs text-muted-foreground">
            Scans all <code>[data-generated-id]</code> elements in the DOM and
            verifies <code>label[for] === input[id]</code> with zero ID
            collisions.
          </p>
        </div>

        <span
          data-testid="useid-status-badge"
          className={`px-2.5 py-1 rounded-full text-xs font-mono font-semibold ${
            allMatched
              ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40"
              : "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40"
          }`}
        >
          {allMatched
            ? `PASS: ${reports.length}/${reports.length} Unique IDs & 100% Label->Input Match`
            : `CHECKING (${reports.length} nodes, ${duplicateIds.length} collisions)`}
        </span>
      </div>

      {/* Client Component's own useId() probe */}
      <div
        data-testid="client-own-probe"
        data-generated-id={clientHookId}
        className="p-3 rounded-lg bg-background/80 border text-xs flex flex-wrap items-center gap-3"
      >
        <label htmlFor={clientHookId} className="font-mono font-medium">
          Client Component useId() ({clientHookId}):
        </label>
        <input
          id={clientHookId}
          defaultValue="Hydrated client input"
          className="px-2 py-1 rounded border bg-transparent font-mono text-xs"
        />
      </div>

      {/* Interactive Slot & Router Refresh Controls */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="btn-rescan-dom"
          onClick={() => {
            setRefreshCount((c) => c + 1);
            inspectDomIds();
          }}
          className="px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-accent cursor-pointer"
        >
          Re-scan DOM IDs
        </button>

        <button
          type="button"
          data-testid="btn-refresh-inner-slot"
          onClick={async () => {
            await refreshSlot("useid-inner-slot", { fresh: true });
            setTimeout(() => setRefreshCount((c) => c + 1), 150);
          }}
          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-500 cursor-pointer"
        >
          refreshSlot(&quot;useid-inner-slot&quot;, &#123; fresh: true &#125;)
        </button>

        <button
          type="button"
          data-testid="btn-refresh-outer-slot"
          onClick={async () => {
            await refreshSlot("useid-outer-slot", { fresh: true });
            setTimeout(() => setRefreshCount((c) => c + 1), 150);
          }}
          className="px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-medium hover:bg-purple-500 cursor-pointer"
        >
          refreshSlot(&quot;useid-outer-slot&quot;, &#123; fresh: true &#125;)
        </button>

        <button
          type="button"
          data-testid="btn-refresh-layout-slot"
          onClick={async () => {
            await refreshSlot("useid-layout-slot", { fresh: true });
            setTimeout(() => setRefreshCount((c) => c + 1), 150);
          }}
          className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-medium hover:bg-teal-500 cursor-pointer"
        >
          refreshSlot(&quot;useid-layout-slot&quot;, &#123; fresh: true &#125;)
        </button>

        <button
          type="button"
          data-testid="btn-refresh-suspense-slot"
          onClick={async () => {
            await refreshSlot("useid-suspense-slot", { fresh: true });
            setTimeout(() => setRefreshCount((c) => c + 1), 150);
          }}
          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500 cursor-pointer"
        >
          refreshSlot(&quot;useid-suspense-slot&quot;, &#123; fresh: true &#125;)
        </button>

        <button
          type="button"
          data-testid="btn-router-refresh"
          onClick={() => {
            router.refresh({ layout: true });
            setTimeout(() => setRefreshCount((c) => c + 1), 350);
          }}
          className="px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-accent cursor-pointer"
        >
          router.refresh(&#123; layout: true &#125;)
        </button>
      </div>

      {/* Live ID Inventory Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono border-collapse">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="py-1.5 pr-3">Component (data-testid)</th>
              <th className="py-1.5 pr-3">useId() Value</th>
              <th className="py-1.5 pr-3">label[for] === input[id]</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.testId} className="border-b border-border/40">
                <td className="py-1.5 pr-3 font-semibold">{r.testId}</td>
                <td className="py-1.5 pr-3 text-indigo-500">{r.generatedId}</td>
                <td className="py-1.5 pr-3">
                  {r.matched ? "✅ Match" : "❌ Mismatch"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

