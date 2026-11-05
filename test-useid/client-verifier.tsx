"use client";

import React, { useId, useState, useEffect } from "react";
import { refreshSlot, useRouter } from "dinou";

interface VerificationReport {
  checked: boolean;
  totalIds: number;
  uniqueIds: number;
  allLabelsMatchedInputs: boolean;
  details: { testId: string; id: string; inputMatched: boolean }[];
}

export function ClientUseIdVerifier({ serverPassedId }: { serverPassedId: string }) {
  const clientOwnId = useId();
  const router = useRouter();
  const [refreshCount, setRefreshCount] = useState(0);
  const [report, setReport] = useState<VerificationReport>({
    checked: false,
    totalIds: 0,
    uniqueIds: 0,
    allLabelsMatchedInputs: false,
    details: [],
  });

  const runDomVerification = () => {
    const nodes = Array.from(document.querySelectorAll("[data-generated-id]"));
    const details = nodes.map((el) => {
      const testId = el.getAttribute("data-testid") || "unknown";
      const id = el.getAttribute("data-generated-id") || "";
      const inputEl = id ? document.getElementById(id) : null;
      const labelEl = el.querySelector(`label[for="${id}"]`);
      return {
        testId,
        id,
        inputMatched: Boolean(inputEl && labelEl),
      };
    });
    const uniqueSet = new Set(details.map((d) => d.id).filter(Boolean));
    const allLabelsMatchedInputs =
      details.length > 0 && details.every((d) => d.inputMatched);

    setReport({
      checked: true,
      totalIds: details.length,
      uniqueIds: uniqueSet.size,
      allLabelsMatchedInputs,
      details,
    });
  };

  useEffect(() => {
    runDomVerification();
  }, [refreshCount]);

  const allPassed =
    report.checked &&
    report.totalIds >= 19 &&
    report.totalIds === report.uniqueIds &&
    report.allLabelsMatchedInputs;

  return (
    <section className="p-4 rounded-lg border border-border bg-card space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          data-testid="client-own-probe"
          data-generated-id={clientOwnId}
          className="space-y-1"
        >
          <div className="font-semibold text-sm text-foreground">
            Client Component Hydration &amp; DOM ID Collision Verifier
          </div>
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <span>
              Server Prop ID: <code className="text-foreground">{serverPassedId}</code>
            </span>
            <span>|</span>
            <label htmlFor={clientOwnId} className="font-mono">
              Client useId() (<code className="text-foreground">{clientOwnId}</code>):
            </label>
            <input
              id={clientOwnId}
              defaultValue={`client:${clientOwnId}`}
              readOnly
              className="px-2 py-0.5 rounded border bg-background font-mono text-xs"
            />
          </div>
        </div>

        <div
          data-testid="verification-badge"
          className={`px-3 py-1.5 rounded-md font-semibold ${
            allPassed
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
              : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
          }`}
        >
          {allPassed
            ? `PASS: ${report.uniqueIds}/${report.totalIds} Unique IDs & 100% Label->Input Match`
            : `Checking (${report.uniqueIds}/${report.totalIds})...`}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="btn-refresh-inner-slot"
          onClick={() => {
            refreshSlot("useid-inner-slot", { fresh: true });
            setTimeout(() => setRefreshCount((c) => c + 1), 300);
          }}
          className="px-3 py-1.5 rounded bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-colors"
        >
          Refresh Inner Slot (fresh: true)
        </button>

        <button
          type="button"
          data-testid="btn-refresh-outer-slot"
          onClick={() => {
            refreshSlot("useid-outer-slot", { fresh: true });
            setTimeout(() => setRefreshCount((c) => c + 1), 300);
          }}
          className="px-3 py-1.5 rounded bg-teal-600 text-white font-medium hover:bg-teal-500 transition-colors"
        >
          Refresh Outer Slot (fresh: true)
        </button>

        <button
          type="button"
          data-testid="btn-refresh-layout-slot"
          onClick={() => {
            refreshSlot("useid-layout-slot", { fresh: true });
            setTimeout(() => setRefreshCount((c) => c + 1), 300);
          }}
          className="px-3 py-1.5 rounded bg-blue-600 text-white font-medium hover:bg-blue-500 transition-colors"
        >
          Refresh Layout Slot (fresh: true)
        </button>

        <button
          type="button"
          data-testid="btn-refresh-suspense-slot"
          onClick={() => {
            refreshSlot("useid-suspense-slot", { fresh: true });
            setTimeout(() => setRefreshCount((c) => c + 1), 300);
          }}
          className="px-3 py-1.5 rounded bg-cyan-600 text-white font-medium hover:bg-cyan-500 transition-colors"
        >
          Refresh Suspense Slot (fresh: true)
        </button>

        <button
          type="button"
          data-testid="btn-router-refresh"
          onClick={() => {
            router.refresh({ layout: true });
            setTimeout(() => setRefreshCount((c) => c + 1), 400);
          }}
          className="px-3 py-1.5 rounded bg-purple-600 text-white font-medium hover:bg-purple-500 transition-colors"
        >
          router.refresh(&#123; layout: true &#125;)
        </button>

        <button
          type="button"
          data-testid="btn-recheck-dom"
          onClick={runDomVerification}
          className="px-3 py-1.5 rounded border border-border bg-muted/50 hover:bg-muted transition-colors"
        >
          Re-Verify DOM IDs
        </button>
      </div>

      {report.checked && (
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="py-1.5 px-2.5">Component Scope (data-testid)</th>
                <th className="py-1.5 px-2.5">Generated useId()</th>
                <th className="py-1.5 px-2.5">Label &lt;-&gt; Input Match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono">
              {report.details.map((item) => (
                <tr key={item.testId}>
                  <td className="py-1.5 px-2.5">{item.testId}</td>
                  <td className="py-1.5 px-2.5 text-emerald-600 dark:text-emerald-400">
                    {item.id}
                  </td>
                  <td className="py-1.5 px-2.5">
                    {item.inputMatched ? "MATCHED" : "MISMATCH"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

