// Intentionally NO "use client" directive!
// Verifies child components without "use client" are compiled by babel-plugin-react-compiler
// across Esbuild, Rollup & Webpack while "use no memo" components opt out cleanly.

import { useEffect, useRef, useState } from "react";
import { useCatalogFilter } from "./use-catalog-filter";

export function OrderSummary({ parentLabel }: { parentLabel: string }) {
  const [childClicks, setChildClicks] = useState(0);
  const [prefix, setPrefix] = useState("pro-");
  const [reportedReallocs, setReportedReallocs] = useState(0);

  const filterResult = useCatalogFilter(prefix);
  const summaryBadgeSpec = {
    heading: `${parentLabel}:${filterResult.normalizedPrefix}`,
    count: filterResult.matchingItems.length,
  };

  const prevRefs = useRef<{ filter: object; badge: object } | null>(null);
  const reallocCountRef = useRef(0);

  useEffect(() => {
    if (prevRefs.current === null) {
      prevRefs.current = { filter: filterResult, badge: summaryBadgeSpec };
      return;
    }
    if (
      prevRefs.current.filter !== filterResult ||
      prevRefs.current.badge !== summaryBadgeSpec
    ) {
      prevRefs.current = { filter: filterResult, badge: summaryBadgeSpec };
      reallocCountRef.current += 1;
    }
  });

  return (
    <section data-testid="order-summary-card">
      <p data-testid="summary-heading">{summaryBadgeSpec.heading}</p>
      <p data-testid="summary-items">
        {filterResult.matchingItems.join(",")}
      </p>
      <p data-testid="summary-import-meta">
        {filterResult.hasImportMeta ? "meta:ok" : "meta:missing"}
      </p>
      <button
        type="button"
        data-testid="bump-child-unrelated"
        onClick={() => setChildClicks((c) => c + 1)}
      >
        {`Child Unrelated: ${childClicks}`}
      </button>
      <button
        type="button"
        data-testid="switch-prefix-btn"
        onClick={() => setPrefix("vip-")}
      >
        Switch Prefix to VIP
      </button>
      <button
        type="button"
        data-testid="read-compiler-stats"
        onClick={() => setReportedReallocs(reallocCountRef.current)}
      >
        Read Compiler Stats
      </button>
      <span data-testid="child-memo-reallocs">{reportedReallocs}</span>
    </section>
  );
}

export function LegacyNoMemoProbe({ tick }: { tick: number }) {
  "use no memo";

  const [reportedNoMemoReallocs, setReportedNoMemoReallocs] = useState(0);
  const rawObj = { mode: "legacy" };
  const prevRawRef = useRef<object | null>(null);
  const noMemoReallocsRef = useRef(0);

  useEffect(() => {
    if (prevRawRef.current === null) {
      prevRawRef.current = rawObj;
      return;
    }
    if (prevRawRef.current !== rawObj) {
      prevRawRef.current = rawObj;
      noMemoReallocsRef.current += 1;
    }
  });

  return (
    <section data-testid="legacy-no-memo-card">
      <span data-testid="no-memo-tick">{`Tick:${tick}:${rawObj.mode}`}</span>
      <button
        type="button"
        data-testid="read-no-memo-stats"
        onClick={() => setReportedNoMemoReallocs(noMemoReallocsRef.current)}
      >
        Read No-Memo Stats
      </button>
      <span data-testid="no-memo-reallocs">{reportedNoMemoReallocs}</span>
    </section>
  );
}

