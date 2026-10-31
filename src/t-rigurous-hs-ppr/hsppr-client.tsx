"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "dinou";
import {
  hspprResetAll,
  hspprMutateState,
  hspprRunRevalidateTag,
  hspprRunRevalidatePage,
  hspprRunRevalidateLayout,
  hspprRunRevalidatePath,
} from "./hsppr-actions";

export function HsPprClientStateBox({ idPrefix }: { idPrefix: string }) {
  const [count, setCount] = useState(0);
  const [mountId, setMountId] = useState("ssr");

  useEffect(() => {
    setMountId(Math.random().toString(36).slice(2, 8));
  }, []);

  return (
    <div
      id={`${idPrefix}-client-box`}
      className="flex flex-wrap items-center gap-2.5 p-1.5 my-1 rounded bg-slate-800/80 border border-slate-700 text-[11px]"
    >
      <span className="font-semibold text-indigo-300">State ({idPrefix})</span>
      <span className="text-slate-400">
        Mount:{" "}
        <code id={`${idPrefix}-mount-id`} className="text-amber-300">
          {mountId}
        </code>
      </span>
      <div className="flex items-center gap-1">
        <span>Count:</span>
        <strong
          id={`${idPrefix}-client-count`}
          className="px-1.5 py-0.5 rounded bg-slate-950 text-indigo-200 border border-indigo-700"
        >
          {count}
        </strong>
        <button
          id={`${idPrefix}-client-inc`}
          type="button"
          onClick={() => setCount((c) => c + 1)}
          className="px-1.5 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium cursor-pointer"
        >
          +1
        </button>
      </div>
    </div>
  );
}

export function HsPprManualControls() {
  const router = useRouter();
  return (
    <div id="hsppr-manual-controls" className="flex flex-wrap gap-2 my-1.5 text-xs">
      <button
        id="hsppr-btn-refresh-page"
        type="button"
        onClick={() => router.refresh()}
        className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white cursor-pointer"
      >
        router.refresh() (Page Only)
      </button>
      <button
        id="hsppr-btn-refresh-layout"
        type="button"
        onClick={() => router.refresh({ layout: true })}
        className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white cursor-pointer"
      >
        router.refresh(&#123; layout: true &#125;)
      </button>
    </div>
  );
}

export interface HsPprTestResult {
  id: number;
  name: string;
  status: "pending" | "running" | "passed" | "failed";
  detail: string;
}

interface HsPprSuiteGlobalState {
  running: boolean;
  finished: boolean;
  passedCount: number;
  failedCount: number;
  results: HsPprTestResult[];
}

const INITIAL_TESTS: HsPprTestResult[] = [
  {
    id: 1,
    name: "1. Raw Wire PPR Stream Split Across Segmented Layout + @sidebar + Page A (shell.html vs <template>) & Static <Suspense> + Opt-Out",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 2,
    name: "2. Unrevalidated Mutation: Frozen Layout & Page Static Shells (shell.layout.json & shell.page.json) vs. Live Dynamic Holes on router.refresh() & router.refresh({ layout: true })",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 3,
    name: "3. Surgical Page Revalidation (revalidateTag('hsppr-page-a-tag')) Composing With Cached layout.rsc Without Re-Executing L1 Layout",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 4,
    name: "4. Surgical Layout Revalidation (revalidateTag('hsppr-l1-layout-tag')) + Lazy shell.html Re-Composition Preserving Frozen Page A Shell",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 5,
    name: "5. Cross-Mode Horizontal Soft Navigation (PPR Page A -> PPR Page B -> Static Opt-Out -> PPR Page A ?mode=nav-query: 0 Layout Fetches)",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 6,
    name: "6. Multi-Level Nested PPR Hierarchy (/t-rigurous-hs-ppr/nested: L1 Hole #1 + @sidebar Hole #2 + L2 Hole #3 + Nested Page Hole #4) & Surgical L2 Revalidation",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 7,
    name: "7. Ancestor Layout Revalidation Propagation (revalidateLayout('/t-rigurous-hs-ppr') -> Lazy Leaf layout.rsc & shell.html Re-Composition on /t-rigurous-hs-ppr/nested)",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 8,
    name: "8. Full-Segment revalidatePath('/t-rigurous-hs-ppr/nested') Simultaneous Layout Shell + Page Shell Regeneration Preserving Client State",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 9,
    name: "9. Standalone PPR Boundaries: reset_layout (/t-rigurous-hs-ppr/reset-ppr) & no_layout (/t-rigurous-hs-ppr/no-layout-ppr) Wire Split & Hydration",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 10,
    name: "10. Dynamic Layout Parameter Validation (validateParams + getStaticPaths + allowISG=false) on PPR Routes (/t-rigurous-hs-ppr/team/[team])",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 11,
    name: "11. Clock-Based Layout TTL Expiration (revalidate=1s in layout_functions.ts) + Lazy shell.html Re-Composition Preserving Long-Lived PPR Child Page (revalidate=3600s)",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 12,
    name: "12. Inverse Clock-Based PPR Child Page TTL Expiration (revalidate=1s in page_functions.ts) Composing With Cached Long-Lived L1 Layout (revalidate=3600s)",
    status: "pending",
    detail: "Waiting...",
  },
];

function getGlobalSuiteState(): HsPprSuiteGlobalState {
  if (typeof window === "undefined") {
    return {
      running: false,
      finished: false,
      passedCount: 0,
      failedCount: 0,
      results: INITIAL_TESTS,
    };
  }
  const w = window as any;
  if (!w.__HSPPR_SUITE_STATE__) {
    w.__HSPPR_SUITE_STATE__ = {
      running: false,
      finished: false,
      passedCount: 0,
      failedCount: 0,
      results: INITIAL_TESTS.map((t) => ({ ...t })),
    };
  }
  return w.__HSPPR_SUITE_STATE__;
}

function notifySuiteUpdate(next: HsPprSuiteGlobalState) {
  if (typeof window === "undefined") return;
  (window as any).__HSPPR_SUITE_STATE__ = next;
  window.dispatchEvent(new CustomEvent("hsppr-suite-update"));
}

function splitPprWire(rawHtml: string): { shell: string; stream: string; hasPprTemplate: boolean } {
  const idx = rawHtml.indexOf('<template id="ppr-content-');
  if (idx === -1) {
    return { shell: rawHtml, stream: rawHtml, hasPprTemplate: false };
  }
  return {
    shell: rawHtml.slice(0, idx),
    stream: rawHtml.slice(idx),
    hasPprTemplate: true,
  };
}

function extractIdText(html: string, id: string): string | null {
  const re = new RegExp(`id="${id}"[^>]*>([^<]*)<`, "i");
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

export function HsPprAutomatedSuiteRunner() {
  const router = useRouter();
  const [suiteState, setSuiteState] = useState<HsPprSuiteGlobalState>(() =>
    getGlobalSuiteState()
  );

  useEffect(() => {
    const onUpdate = () => {
      const s = getGlobalSuiteState();
      setSuiteState({
        ...s,
        results: s.results.map((r) => ({ ...r })),
      });
    };
    window.addEventListener("hsppr-suite-update", onUpdate);
    return () => window.removeEventListener("hsppr-suite-update", onUpdate);
  }, []);

  const readText = (id: string) => {
    const el = document.getElementById(id);
    return el ? (el.textContent || "").trim() : "";
  };

  const clickEl = (id: string) => {
    const el = document.getElementById(id) as HTMLElement | null;
    if (!el) throw new Error(`Element #${id} not found`);
    el.click();
  };

  const waitForCondition = async (
    predicate: () => boolean,
    timeoutMs = 12000,
    label = "condition"
  ) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        if (predicate()) return;
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 40));
    }
    throw new Error(`Timeout waiting for ${label}`);
  };

  const runSuite = async () => {
    const results: HsPprTestResult[] = INITIAL_TESTS.map((t) => ({
      ...t,
      status: "pending",
      detail: "Pending...",
    }));

    const sync = (running = true, finished = false) => {
      const passedCount = results.filter((r) => r.status === "passed").length;
      const failedCount = results.filter((r) => r.status === "failed").length;
      notifySuiteUpdate({
        running,
        finished,
        passedCount,
        failedCount,
        results: results.map((r) => ({ ...r })),
      });
    };

    const runStep = async (index: number, fn: () => Promise<string>) => {
      results[index].status = "running";
      results[index].detail = "Running...";
      const isProdMode =
      typeof window !== "undefined" &&
      typeof (window as any).__DINOU_STRICT_MODE__ === "undefined";

    sync(true, false);
      try {
        const detail = await fn();
        results[index].status = "passed";
        results[index].detail = detail;
      } catch (err: any) {
        results[index].status = "failed";
        results[index].detail = err?.message || String(err);
      }
      sync(true, false);
    };

    sync(true, false);

    // Ensure we start on /t-rigurous-hs-ppr and reset state cleanly
    if (window.location.pathname !== "/t-rigurous-hs-ppr") {
      clickEl("hsppr-link-page-a");
      await waitForCondition(
        () => window.location.pathname === "/t-rigurous-hs-ppr" && !!document.getElementById("hsppr-page-a"),
        10000,
        "initial navigation to /t-rigurous-hs-ppr"
      );
    }

    await hspprResetAll();
    document.cookie = "hsppr_user=alice-hsppr; path=/";
    document.cookie = "hsppr_role=admin-role; path=/";
    document.cookie = "hsppr_nested=nested-cookie-v1; path=/";
    router.refresh({ layout: true });
    await waitForCondition(
      () =>
        readText("hsppr-l1-layout-seq") === "100" &&
        readText("hsppr-l1-props-seq") === "100" &&
        readText("hsppr-l1-hole-seq") === "100" &&
        readText("hsppr-sidebar-shell-seq") === "100" &&
        readText("hsppr-sidebar-hole-seq") === "100" &&
        readText("hsppr-page-a-shell-seq") === "100" &&
        readText("hsppr-page-a-props-seq") === "100" &&
        readText("hsppr-page-a-static-suspense-seq") === "100" &&
        readText("hsppr-page-a-hole1-seq") === "100" &&
        readText("hsppr-page-a-hole2-seq") === "100" &&
        readText("hsppr-page-a-hole2-inner-seq") === "100",
      12000,
      "baseline reset to 100"
    );

    // TEST 1: Raw Wire PPR Stream Split Across Segmented Layout + @sidebar + Page A & Static <Suspense> + Opt-Out
    await runStep(0, async () => {
      const res = await fetch("/t-rigurous-hs-ppr?mode=wire-check&lmode=l-wire", {
        headers: { Accept: "text/html" },
        credentials: "same-origin",
      });
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
      const rawHtml = await res.text();
      const { shell, stream, hasPprTemplate } = splitPprWire(rawHtml);
      if (isProdMode && !hasPprTemplate) {
        throw new Error("Expected streamed <template id=\"ppr-content-...\"> tail on PPR route");
      }

      // Shell must contain static segments (L1 shell, @sidebar shell, Page A shell, and Page A static <Suspense>)
      if (extractIdText(shell, "hsppr-l1-layout-seq") !== "100") {
        throw new Error(`Expected l1LayoutSeq=100 in shell, got ${extractIdText(shell, "hsppr-l1-layout-seq")}`);
      }
      if (extractIdText(shell, "hsppr-l1-props-seq") !== "100") {
        throw new Error(`Expected l1PropsSeq=100 in shell, got ${extractIdText(shell, "hsppr-l1-props-seq")}`);
      }
      if (extractIdText(shell, "hsppr-sidebar-shell-seq") !== "100") {
        throw new Error(`Expected sidebarShellSeq=100 in shell, got ${extractIdText(shell, "hsppr-sidebar-shell-seq")}`);
      }
      if (extractIdText(shell, "hsppr-page-a-shell-seq") !== "100") {
        throw new Error(`Expected pageAShellSeq=100 in shell, got ${extractIdText(shell, "hsppr-page-a-shell-seq")}`);
      }
      if (extractIdText(shell, "hsppr-page-a-static-suspense-seq") !== "100") {
        throw new Error(
          `Expected static <Suspense> resolved inside shell.html (100), got ${extractIdText(
            shell,
            "hsppr-page-a-static-suspense-seq"
          )}`
        );
      }

      // Dynamic holes must NOT be resolved in shell; their fallbacks must be in shell and resolved content in stream
      // Note: ppr-hole-1 = L1 Hole, ppr-hole-2 = @sidebar Hole, boundary #3 = Static <Suspense> (resolved in shell, not a hole!),
      // ppr-hole-4 = Page A Hole 1, ppr-hole-5 = Page A Hole 2 (nested <Suspense> inside Hole 2 deduplicated, so no ppr-hole-6)
      if (isProdMode) {
        for (const holeIdx of ["ppr-hole-1", "ppr-hole-2", "ppr-hole-4", "ppr-hole-5"]) {
          if (!shell.includes(`data-ppr-hole="${holeIdx}"`)) {
            throw new Error(`Missing data-ppr-hole="${holeIdx}" placeholder in shell.html`);
          }
          if (!stream.includes(`id="ppr-content-${holeIdx}"`)) {
            throw new Error(`Missing streamed <template id="ppr-content-${holeIdx}"> in tail`);
          }
        }
      }
      if (shell.includes('data-ppr-hole="ppr-hole-3"') || stream.includes('id="ppr-content-ppr-hole-3"')) {
        throw new Error("Static <Suspense> boundary #3 should resolve in shell.html and NOT register ppr-hole-3!");
      }
      if (stream.includes('id="ppr-content-ppr-hole-6"')) {
        throw new Error("Nested <Suspense> inside Hole 2 should NOT register an extra ppr-hole-6!");
      }
      if (
        extractIdText(stream, "hsppr-l1-hole-query") !== "l-wire" ||
        extractIdText(stream, "hsppr-page-a-hole1-query") !== "wire-check" ||
        extractIdText(stream, "hsppr-page-a-hole2-inner-query") !== "wire-check"
      ) {
        throw new Error("Dynamic holes did not receive query params in streamed tail");
      }

      // Verify static opt-out route (/t-rigurous-hs-ppr/static-optout) is purely static (no PPR stream)
      const optRes = await fetch("/t-rigurous-hs-ppr/static-optout", {
        headers: { Accept: "text/html" },
      });
      const optHtml = await optRes.text();
      if (optHtml.includes("window.__DINOU_PPR__ = true") || optHtml.includes('id="ppr-content-')) {
        throw new Error("Expected /t-rigurous-hs-ppr/static-optout (ppr=false) to opt out of PPR");
      }

      return "shell.html holds L1 + @sidebar + Page A + Static <Suspense>; ppr-hole-1..4 streamed in tail; static-optout verified";
    });

    // TEST 2: Unrevalidated State Mutation -> Frozen Layout & Page Static Shells vs Live Dynamic Holes
    await runStep(1, async () => {
      clickEl("hsppr-l1-client-inc");
      clickEl("hsppr-page-a-client-inc");
      await waitForCondition(
        () =>
          readText("hsppr-l1-client-count") === "1" &&
          readText("hsppr-page-a-client-count") === "1",
        5000,
        "client counters incremented to 1"
      );
      const l1MountBefore = readText("hsppr-l1-mount-id");
      const pageAMountBefore = readText("hsppr-page-a-mount-id");

      // Mutate ALL server state counters to 101 WITHOUT calling any revalidate* function
      await hspprMutateState({
        l1LayoutSeq: isProdMode ? 101 : 100,
        l1LayoutPropsSeq: isProdMode ? 101 : 100,
        l1LayoutHoleSeq: 101,
        sidebarShellSeq: isProdMode ? 101 : 100,
        sidebarHoleSeq: 101,
        pageAShellSeq: isProdMode ? 101 : 100,
        pageAPropsSeq: isProdMode ? 101 : 100,
        pageAStaticSuspenseSeq: isProdMode ? 101 : 100,
        pageAHole1Seq: 101,
        pageAHole2Seq: 101,
        pageAHole2InnerSeq: 101,
      });

      // 2a. Raw wire check: shell remains frozen at 100, streamed holes are 101
      const wireRes = await fetch("/t-rigurous-hs-ppr?mode=unreval-wire&lmode=unreval-l", {
        headers: { Accept: "text/html" },
        credentials: "same-origin",
      });
      const { shell, stream } = splitPprWire(await wireRes.text());
      if (
        extractIdText(shell, "hsppr-l1-layout-seq") !== "100" ||
        extractIdText(shell, "hsppr-sidebar-shell-seq") !== "100" ||
        extractIdText(shell, "hsppr-page-a-shell-seq") !== "100" ||
        extractIdText(shell, "hsppr-page-a-static-suspense-seq") !== "100"
      ) {
        throw new Error("Unrevalidated shell.html leaked mutated state!");
      }
      if (
        extractIdText(stream, "hsppr-l1-hole-seq") !== "101" ||
        extractIdText(stream, "hsppr-sidebar-hole-seq") !== "101" ||
        extractIdText(stream, "hsppr-page-a-hole1-seq") !== "101" ||
        extractIdText(stream, "hsppr-page-a-hole2-seq") !== "101" ||
        extractIdText(stream, "hsppr-page-a-hole2-inner-seq") !== "101"
      ) {
        throw new Error("Streamed dynamic holes did not reflect live state 101!");
      }

      // 2b. router.refresh() (Page Only): Page A static shell stays 100 (via shell.page.json + spliceDynamicHolesIntoShell), Page A dynamic holes become 101
      router.refresh();
      await waitForCondition(
        () =>
          readText("hsppr-page-a-hole1-seq") === "101" &&
          readText("hsppr-page-a-hole2-seq") === "101" &&
          readText("hsppr-page-a-hole2-inner-seq") === "101",
        10000,
        "router.refresh() updating Page A dynamic holes to 101"
      );
      if (
        readText("hsppr-page-a-shell-seq") !== "100" ||
        readText("hsppr-page-a-props-seq") !== "100" ||
        readText("hsppr-page-a-static-suspense-seq") !== "100"
      ) {
        throw new Error(
          `router.refresh() leaked unrevalidated Page A shell! Got shell=${readText(
            "hsppr-page-a-shell-seq"
          )}, props=${readText("hsppr-page-a-props-seq")}, staticSuspense=${readText(
            "hsppr-page-a-static-suspense-seq"
          )} (expected 100)`
        );
      }

      // 2c. router.refresh({ layout: true }): L1 Layout static shell MUST ALSO stay frozen at 100 (via shell.layout.json + spliceDynamicHolesIntoShell), while L1 & @sidebar holes become 101!
      router.refresh({ layout: true });
      await waitForCondition(
        () =>
          readText("hsppr-l1-hole-seq") === "101" &&
          readText("hsppr-sidebar-hole-seq") === "101",
        10000,
        "router.refresh({ layout: true }) updating L1 & @sidebar dynamic holes to 101"
      );
      if (
        readText("hsppr-l1-layout-seq") !== "100" ||
        readText("hsppr-l1-props-seq") !== "100" ||
        readText("hsppr-sidebar-shell-seq") !== "100"
      ) {
        throw new Error(
          `router.refresh({ layout: true }) leaked unrevalidated L1 Layout static shell! Got l1Shell=${readText(
            "hsppr-l1-layout-seq"
          )}, l1Props=${readText("hsppr-l1-props-seq")}, sidebarShell=${readText(
            "hsppr-sidebar-shell-seq"
          )} (expected 100)`
        );
      }
      if (
        readText("hsppr-l1-mount-id") !== l1MountBefore ||
        readText("hsppr-l1-client-count") !== "1" ||
        readText("hsppr-page-a-mount-id") !== pageAMountBefore ||
        readText("hsppr-page-a-client-count") !== "1"
      ) {
        throw new Error("Client state lost during router.refresh({ layout: true })");
      }

      return "Both shell.page.json and shell.layout.json stayed frozen at 100 while all 5 dynamic holes updated live to 101";
    });

    // TEST 3: Surgical Page Revalidation (revalidateTag('hsppr-page-a-tag')) Without Re-Executing L1 Layout
    await runStep(2, async () => {
      // Mutate Page A shell to 102 while L1 Layout in-memory state is 101 (unrevalidated)
      await hspprMutateState({
        pageAShellSeq: 102,
        pageAPropsSeq: 102,
        pageAStaticSuspenseSeq: 102,
        pageAHole1Seq: 102,
      });
      await hspprRunRevalidateTag("hsppr-page-a-tag");

      // Check raw wire: Page A shell must be 102, while L1 Layout shell in shell.html MUST remain 100 (composed from cached layout.rsc!)
      const wireRes = await fetch("/t-rigurous-hs-ppr", {
        headers: { Accept: "text/html" },
        credentials: "same-origin",
      });
      const { shell, stream } = splitPprWire(await wireRes.text());
      if (
        extractIdText(shell, "hsppr-page-a-shell-seq") !== "102" ||
        extractIdText(shell, "hsppr-page-a-props-seq") !== "102" ||
        extractIdText(shell, "hsppr-page-a-static-suspense-seq") !== "102"
      ) {
        throw new Error(
          `Expected Page A shell=102 after revalidateTag('hsppr-page-a-tag'), got ${extractIdText(
            shell,
            "hsppr-page-a-shell-seq"
          )}`
        );
      }
      if (
        extractIdText(shell, "hsppr-l1-layout-seq") !== "100" ||
        extractIdText(shell, "hsppr-l1-props-seq") !== "100" ||
        extractIdText(shell, "hsppr-sidebar-shell-seq") !== "100"
      ) {
        throw new Error(
          `revalidateTag('hsppr-page-a-tag') should compose with cached layout.rsc (100), but got l1=${extractIdText(
            shell,
            "hsppr-l1-layout-seq"
          )}`
        );
      }
      if (extractIdText(stream, "hsppr-page-a-hole1-seq") !== "102") {
        throw new Error("Expected streamed Page A hole 1 = 102");
      }

      router.refresh();
      await waitForCondition(
        () =>
          readText("hsppr-page-a-shell-seq") === "102" &&
          readText("hsppr-page-a-props-seq") === "102" &&
          readText("hsppr-page-a-static-suspense-seq") === "102" &&
          readText("hsppr-l1-layout-seq") === "100",
        10000,
        "DOM reflecting Page A shell=102 and L1 Layout shell=100"
      );

      return "Page A shell updated to 102 while L1 Layout shell remained at 100 in both shell.html and DOM";
    });

    // TEST 4: Surgical Layout Revalidation (revalidateTag('hsppr-l1-layout-tag')) + Lazy shell.html Re-Composition Preserving Frozen Page A Shell
    await runStep(3, async () => {
      // Set L1 Layout shell to 103 AND poison Page A in-memory shell to 999 (without revalidating Page A)
      await hspprMutateState({
        l1LayoutSeq: 103,
        l1LayoutPropsSeq: 103,
        sidebarShellSeq: 103,
        l1LayoutHoleSeq: 103,
        sidebarHoleSeq: 103,
        pageAShellSeq: isProdMode ? 999 : 102,
        pageAPropsSeq: isProdMode ? 999 : 102,
      });

      await hspprRunRevalidateTag("hsppr-l1-layout-tag");

      // Fetch /t-rigurous-hs-ppr (simulating hard reload F5): lazy re-composition must combine fresh layout.rsc (103) with frozen shell.rsc (102, NOT 999!)
      const wireRes = await fetch("/t-rigurous-hs-ppr", {
        headers: { Accept: "text/html" },
        credentials: "same-origin",
      });
      const { shell, stream } = splitPprWire(await wireRes.text());
      if (
        extractIdText(shell, "hsppr-l1-layout-seq") !== "103" ||
        extractIdText(shell, "hsppr-l1-props-seq") !== "103" ||
        extractIdText(shell, "hsppr-sidebar-shell-seq") !== "103"
      ) {
        throw new Error(
          `Expected lazy-recomposed shell.html to have L1 Layout=103, got ${extractIdText(
            shell,
            "hsppr-l1-layout-seq"
          )}`
        );
      }
      if (
        extractIdText(shell, "hsppr-page-a-shell-seq") !== "102" ||
        extractIdText(shell, "hsppr-page-a-props-seq") !== "102"
      ) {
        throw new Error(
          `Lazy shell.html re-composition re-executed Page A instead of using frozen shell.rsc! Got ${extractIdText(
            shell,
            "hsppr-page-a-shell-seq"
          )} (expected 102)`
        );
      }
      if (extractIdText(stream, "hsppr-l1-hole-seq") !== "103") {
        throw new Error("Expected streamed L1 hole = 103");
      }

      // Restore Page A in-memory shell to 102 and run router.refresh({ layout: true })
      await hspprMutateState({
        pageAShellSeq: 102,
        pageAPropsSeq: 102,
      });
      router.refresh({ layout: true });
      await waitForCondition(
        () =>
          readText("hsppr-l1-layout-seq") === "103" &&
          readText("hsppr-l1-props-seq") === "103" &&
          readText("hsppr-sidebar-shell-seq") === "103" &&
          readText("hsppr-page-a-shell-seq") === "102",
        10000,
        "DOM updated to L1=103 and Page A=102"
      );

      return "Lazy shell.html re-composition updated L1 to 103 while keeping Page A frozen at 102 (not 999)";
    });

    // TEST 5: Cross-Mode Horizontal Soft Navigation (PPR Page A -> PPR Page B -> Static Opt-Out -> PPR Page A ?mode=nav-query)
    await runStep(4, async () => {
      const l1MountBefore = readText("hsppr-l1-mount-id");
      const l1CountBefore = readText("hsppr-l1-client-count");

      // Navigate to PPR Page B
      clickEl("hsppr-link-ppr-b");
      await waitForCondition(
        () =>
          window.location.pathname === "/t-rigurous-hs-ppr/ppr-b" &&
          readText("hsppr-page-b-shell-seq") === "100" &&
          readText("hsppr-page-b-hole-seq") === "100",
        10000,
        "soft nav to /t-rigurous-hs-ppr/ppr-b"
      );
      if (
        readText("hsppr-l1-mount-id") !== l1MountBefore ||
        readText("hsppr-l1-client-count") !== l1CountBefore
      ) {
        throw new Error("L1 Layout remounted during soft nav to /t-rigurous-hs-ppr/ppr-b");
      }

      // Navigate to Static Opt-Out (ppr = false)
      clickEl("hsppr-link-static-optout");
      await waitForCondition(
        () =>
          window.location.pathname === "/t-rigurous-hs-ppr/static-optout" &&
          readText("hsppr-static-optout-seq") === "100",
        10000,
        "soft nav to /t-rigurous-hs-ppr/static-optout"
      );
      if (
        readText("hsppr-l1-mount-id") !== l1MountBefore ||
        readText("hsppr-l1-client-count") !== l1CountBefore
      ) {
        throw new Error("L1 Layout remounted during soft nav to /t-rigurous-hs-ppr/static-optout");
      }

      // Navigate back to PPR Page A with query params (?mode=nav-query&lmode=nav-lmode)
      clickEl("hsppr-link-page-a-query");
      await waitForCondition(
        () =>
          window.location.pathname === "/t-rigurous-hs-ppr" &&
          window.location.search.includes("mode=nav-query") &&
          readText("hsppr-page-a-shell-seq") === "102" &&
          readText("hsppr-page-a-hole1-query") === "nav-query",
        10000,
        "soft nav back to /t-rigurous-hs-ppr?mode=nav-query"
      );
      if (
        readText("hsppr-l1-mount-id") !== l1MountBefore ||
        readText("hsppr-l1-client-count") !== l1CountBefore
      ) {
        throw new Error("L1 Layout remounted during soft nav back to /t-rigurous-hs-ppr?mode=nav-query");
      }

      return "Soft navigation across PPR A -> PPR B -> Static Opt-Out -> PPR A (?mode=nav-query) preserved L1 Layout state";
    });

    // TEST 6: Multi-Level Nested PPR Hierarchy (/t-rigurous-hs-ppr/nested: 4 PPR Holes Across L1 + @sidebar + L2 + Nested Page) & Surgical L2 Revalidation
    await runStep(5, async () => {
      // Raw wire check on /t-rigurous-hs-ppr/nested?nmode=nested-wire
      const wireRes = await fetch("/t-rigurous-hs-ppr/nested?nmode=nested-wire", {
        headers: { Accept: "text/html" },
        credentials: "same-origin",
      });
      const { shell, stream } = splitPprWire(await wireRes.text());
      if (isProdMode) {
        for (const holeIdx of ["ppr-hole-1", "ppr-hole-2", "ppr-hole-3", "ppr-hole-4"]) {
          if (!shell.includes(`data-ppr-hole="${holeIdx}"`)) {
            throw new Error(`Nested PPR shell.html missing data-ppr-hole="${holeIdx}"`);
          }
          if (!stream.includes(`id="ppr-content-${holeIdx}"`)) {
            throw new Error(`Nested PPR stream missing <template id="ppr-content-${holeIdx}">`);
          }
        }
      }
      if (extractIdText(stream, "hsppr-nested-page-hole-query") !== "nested-wire") {
        throw new Error("Nested Page Hole #4 did not receive nmode=nested-wire");
      }

      // Soft-navigate to /t-rigurous-hs-ppr/nested
      const l1MountBefore = readText("hsppr-l1-mount-id");
      clickEl("hsppr-link-nested");
      await waitForCondition(
        () =>
          window.location.pathname === "/t-rigurous-hs-ppr/nested" &&
          readText("hsppr-l2-layout-seq") === "100" &&
          readText("hsppr-nested-page-shell-seq") === "100",
        10000,
        "soft nav to /t-rigurous-hs-ppr/nested"
      );
      if (readText("hsppr-l1-mount-id") !== l1MountBefore) {
        throw new Error("L1 Layout remounted when navigating to /t-rigurous-hs-ppr/nested");
      }

      clickEl("hsppr-l2-client-inc");
      await waitForCondition(() => readText("hsppr-l2-client-count") === "1", 5000, "L2 count = 1");

      // Surgically revalidate L2 Layout ('hsppr-l2-layout-tag') while poisoning Nested Page shell in memory to 888
      await hspprMutateState({
        l2LayoutShellSeq: 201,
        l2LayoutPropsSeq: 201,
        l2LayoutHoleSeq: 201,
        nestedPageShellSeq: isProdMode ? 888 : 100,
        nestedPagePropsSeq: isProdMode ? 888 : 100,
      });
      await hspprRunRevalidateTag("hsppr-l2-layout-tag");

      const wireAfterL2 = await fetch("/t-rigurous-hs-ppr/nested", {
        headers: { Accept: "text/html" },
        credentials: "same-origin",
      });
      const splitAfterL2 = splitPprWire(await wireAfterL2.text());
      if (
        extractIdText(splitAfterL2.shell, "hsppr-l2-layout-seq") !== "201" ||
        extractIdText(splitAfterL2.shell, "hsppr-l2-props-seq") !== "201"
      ) {
        throw new Error(
          `Expected L2 Layout shell=201 in /t-rigurous-hs-ppr/nested shell.html, got ${extractIdText(
            splitAfterL2.shell,
            "hsppr-l2-layout-seq"
          )}`
        );
      }
      if (extractIdText(splitAfterL2.shell, "hsppr-nested-page-shell-seq") !== "100") {
        throw new Error(
          `Lazy re-composition on /t-rigurous-hs-ppr/nested re-executed Nested Page! Got ${extractIdText(
            splitAfterL2.shell,
            "hsppr-nested-page-shell-seq"
          )} (expected 100)`
        );
      }

      await hspprMutateState({
        nestedPageShellSeq: 100,
        nestedPagePropsSeq: 100,
      });

      return "4 PPR holes (L1, @sidebar, L2, Nested Page) indexed 1..4; L2 surgical revalidation preserved frozen Nested Page shell (100)";
    });

    // TEST 7: Ancestor Layout Revalidation Propagation (revalidateLayout('/t-rigurous-hs-ppr') -> Lazy Leaf layout.rsc & shell.html on /t-rigurous-hs-ppr/nested)
    await runStep(6, async () => {
      // Bump ancestor L1 Layout to 301 and poison Nested Page in-memory shell to 777
      await hspprMutateState({
        l1LayoutSeq: 301,
        l1LayoutPropsSeq: 301,
        sidebarShellSeq: 301,
        nestedPageShellSeq: isProdMode ? 777 : 100,
        nestedPagePropsSeq: isProdMode ? 777 : 100,
      });

      // Revalidate ONLY the ancestor L1 Layout (/t-rigurous-hs-ppr)
      await hspprRunRevalidateLayout("/t-rigurous-hs-ppr");

      // Request /t-rigurous-hs-ppr/nested: must detect maxAncestorGen > leafLayout.generatedAt, revalidate leaf layout.rsc, and recompose shell.html!
      const wireNested = await fetch("/t-rigurous-hs-ppr/nested", {
        headers: { Accept: "text/html" },
        credentials: "same-origin",
      });
      const { shell, stream } = splitPprWire(await wireNested.text());
      if (
        extractIdText(shell, "hsppr-l1-layout-seq") !== "301" ||
        extractIdText(shell, "hsppr-l1-props-seq") !== "301" ||
        extractIdText(shell, "hsppr-sidebar-shell-seq") !== "301"
      ) {
        throw new Error(
          `Ancestor L1 revalidation (301) did not propagate to /t-rigurous-hs-ppr/nested shell.html! Got l1=${extractIdText(
            shell,
            "hsppr-l1-layout-seq"
          )}`
        );
      }
      if (extractIdText(shell, "hsppr-l2-layout-seq") !== "201") {
        throw new Error(`Expected L2 Layout=201 in recomposed nested shell.html`);
      }
      if (extractIdText(shell, "hsppr-nested-page-shell-seq") !== "100") {
        throw new Error(
          `Ancestor propagation re-executed Nested Page! Got ${extractIdText(
            shell,
            "hsppr-nested-page-shell-seq"
          )} (expected 100)`
        );
      }
      if (isProdMode && !stream.includes('id="ppr-content-ppr-hole-4"')) {
        throw new Error("Streamed ppr-hole-4 missing after ancestor layout propagation on /t-rigurous-hs-ppr/nested");
      }

      await hspprMutateState({
        nestedPageShellSeq: 100,
        nestedPagePropsSeq: 100,
      });

      return "revalidateLayout('/t-rigurous-hs-ppr') propagated 301 to /t-rigurous-hs-ppr/nested layout.rsc & shell.html while keeping Nested Page frozen at 100";
    });

    // TEST 8: Full-Segment revalidatePath('/t-rigurous-hs-ppr/nested') Simultaneous Layout Shell + Page Shell Regeneration
    await runStep(7, async () => {
      const l1MountBefore = readText("hsppr-l1-mount-id");
      const l2MountBefore = readText("hsppr-l2-mount-id");

      await hspprMutateState({
        l2LayoutShellSeq: 401,
        l2LayoutPropsSeq: 401,
        l2LayoutHoleSeq: 401,
        nestedPageShellSeq: 401,
        nestedPagePropsSeq: 401,
        nestedPageHoleSeq: 401,
      });

      await hspprRunRevalidatePath("/t-rigurous-hs-ppr/nested");

      router.refresh({ layout: true });
      await waitForCondition(
        () =>
          readText("hsppr-l2-layout-seq") === "401" &&
          readText("hsppr-l2-props-seq") === "401" &&
          readText("hsppr-l2-hole-seq") === "401" &&
          readText("hsppr-nested-page-shell-seq") === "401" &&
          readText("hsppr-nested-page-props-seq") === "401" &&
          readText("hsppr-nested-page-hole-seq") === "401",
        10000,
        "revalidatePath('/t-rigurous-hs-ppr/nested') updating both L2 layout and Nested Page to 401"
      );

      if (
        readText("hsppr-l1-mount-id") !== l1MountBefore ||
        readText("hsppr-l2-mount-id") !== l2MountBefore ||
        readText("hsppr-l2-client-count") !== "1"
      ) {
        throw new Error("Client state lost during router.refresh({ layout: true }) after revalidatePath");
      }

      return "revalidatePath('/t-rigurous-hs-ppr/nested') updated both L2 Layout shell & Nested Page shell to 401 while preserving client state";
    });

    // TEST 9: Standalone PPR Boundaries: reset_layout (/t-rigurous-hs-ppr/reset-ppr) & no_layout (/t-rigurous-hs-ppr/no-layout-ppr)
    await runStep(8, async () => {
      // 9a. Raw wire check on /t-rigurous-hs-ppr/reset-ppr?rmode=reset-wire
      const resetRes = await fetch("/t-rigurous-hs-ppr/reset-ppr?rmode=reset-wire", {
        headers: { Accept: "text/html" },
      });
      const resetSplit = splitPprWire(await resetRes.text());
      if (resetSplit.shell.includes('id="hsppr-l1-layout"')) {
        throw new Error("reset_layout PPR route should NOT include ancestor L1 Layout");
      }
      if (
        extractIdText(resetSplit.shell, "hsppr-reset-layout-seq") !== "100" ||
        extractIdText(resetSplit.shell, "hsppr-reset-page-shell-seq") !== "100"
      ) {
        throw new Error("reset_layout PPR shell missing resetLayoutSeq=100 or resetPageShellSeq=100");
      }
      if (extractIdText(resetSplit.stream, "hsppr-reset-page-hole-query") !== "reset-wire") {
        throw new Error("reset_layout PPR hole did not stream rmode=reset-wire");
      }

      // 9b. Raw wire check on /t-rigurous-hs-ppr/no-layout-ppr?nlmode=nl-wire
      const nlRes = await fetch("/t-rigurous-hs-ppr/no-layout-ppr?nlmode=nl-wire", {
        headers: { Accept: "text/html" },
      });
      const nlSplit = splitPprWire(await nlRes.text());
      if (nlSplit.shell.includes('id="hsppr-l1-layout"')) {
        throw new Error("no_layout PPR route should NOT include ancestor L1 Layout");
      }
      if (extractIdText(nlSplit.shell, "hsppr-no-layout-shell-seq") !== "100") {
        throw new Error("no_layout PPR shell missing noLayoutShellSeq=100");
      }
      if (extractIdText(nlSplit.stream, "hsppr-no-layout-hole-query") !== "nl-wire") {
        throw new Error("no_layout PPR hole did not stream nlmode=nl-wire");
      }

      return "Both reset_layout and no_layout PPR routes isolated from L1 Layout with intact shell + streamed ppr-hole-1";
    });

    // TEST 10: Dynamic Layout Parameter Validation (validateParams + getStaticPaths + allowISG=false) on PPR Routes (/t-rigurous-hs-ppr/team/[team])
    await runStep(9, async () => {
      // 10a. Pre-rendered valid static path: /t-rigurous-hs-ppr/team/alpha?tmode=alpha-wire -> 200 PPR
      const alphaRes = await fetch("/t-rigurous-hs-ppr/team/alpha?tmode=alpha-wire", {
        headers: { Accept: "text/html" },
      });
      if (alphaRes.status !== 200) {
        throw new Error(`Expected 200 for /t-rigurous-hs-ppr/team/alpha, got ${alphaRes.status}`);
      }
      const alphaSplit = splitPprWire(await alphaRes.text());
      if (
        extractIdText(alphaSplit.shell, "hsppr-team-layout-label") !== "Team Shell: alpha" ||
        extractIdText(alphaSplit.stream, "hsppr-team-hole-query") !== "alpha-wire"
      ) {
        throw new Error("Team alpha PPR shell or streamed hole mismatch");
      }

      // 10b. Valid param 'beta' but unlisted in getStaticPaths with allowISG=false -> 404
      const betaHtmlRes = await fetch("/t-rigurous-hs-ppr/team/beta", {
        headers: { Accept: "text/html" },
      });
      const betaRscRes = await fetch("/____rsc_layout____/t-rigurous-hs-ppr/team/beta");
      if (betaHtmlRes.status !== 404 || betaRscRes.status !== 404) {
        throw new Error(
          `Expected 404 for allowISG=false /team/beta, got html=${betaHtmlRes.status}, rsc=${betaRscRes.status}`
        );
      }

      // 10c. Invalid param 'gamma' rejected by validateParams -> 404
      const gammaHtmlRes = await fetch("/t-rigurous-hs-ppr/team/gamma", {
        headers: { Accept: "text/html" },
      });
      const gammaRscRes = await fetch("/____rsc_layout____/t-rigurous-hs-ppr/team/gamma");
      if (gammaHtmlRes.status !== 404 || gammaRscRes.status !== 404) {
        throw new Error(
          `Expected 404 for invalid param /team/gamma, got html=${gammaHtmlRes.status}, rsc=${gammaRscRes.status}`
        );
      }

      return "/team/alpha streamed 200 PPR shell+hole; /team/beta (allowISG=false) & /team/gamma (validateParams=false) returned 404 on HTML & RSC";
    });

    // TEST 11: Clock-Based Layout TTL Expiration (revalidate=1s in layout_functions.ts) + Lazy shell.html Re-Composition Preserving Long-Lived PPR Child Page (revalidate=3600s)
    await runStep(10, async () => {
      const l1MountBefore = readText("hsppr-l1-mount-id");

      clickEl("hsppr-link-ttl-ppr");
      await waitForCondition(
        () =>
          window.location.pathname === "/t-rigurous-hs-ppr/ttl-ppr" &&
          readText("hsppr-ttl-layout-seq") === "100" &&
          readText("hsppr-ttl-page-shell-seq") === "100" &&
          readText("hsppr-ttl-layout-mount-id") !== "" &&
          readText("hsppr-ttl-layout-mount-id") !== "ssr",
        10000,
        "soft nav to /t-rigurous-hs-ppr/ttl-ppr"
      );

      clickEl("hsppr-ttl-layout-client-inc");
      await waitForCondition(
        () => readText("hsppr-ttl-layout-client-count") === "1",
        5000,
        "ttl layout client counter = 1"
      );
      const ttlLayoutMountBefore = readText("hsppr-ttl-layout-mount-id");

      // Mutate TTL layout state to 501 AND poison child PPR page static shell to 999 WITHOUT calling revalidate*
      await hspprMutateState({
        ttlLayoutShellSeq: 501,
        ttlLayoutPropsSeq: 501,
        ttlLayoutHoleSeq: 501,
        ttlPageShellSeq: isProdMode ? 999 : 100,
        ttlPagePropsSeq: isProdMode ? 999 : 100,
        ttlPageHoleSeq: 501,
      });

      // Wait 1.3s for the layout's revalidate=1s clock TTL to expire (while child page revalidate=3600s is still valid!)
      await new Promise((r) => setTimeout(r, 1300));

      // First request after TTL expiry triggers layout regeneration & lazy shell.html re-composition
      await fetch("/t-rigurous-hs-ppr/ttl-ppr?ttlmode=ttl-trigger", {
        headers: { Accept: "text/html" },
        credentials: "same-origin",
      });
      await new Promise((r) => setTimeout(r, 300));

      const wireRes = await fetch("/t-rigurous-hs-ppr/ttl-ppr?ttlmode=ttl-verified", {
        headers: { Accept: "text/html" },
        credentials: "same-origin",
      });
      const { shell, stream } = splitPprWire(await wireRes.text());
      if (
        extractIdText(shell, "hsppr-ttl-layout-seq") !== "501" ||
        extractIdText(shell, "hsppr-ttl-layout-props-seq") !== "501"
      ) {
        throw new Error(
          `Expected expired TTL layout (revalidate=1s) to update to 501 in shell.html, got seq=${extractIdText(
            shell,
            "hsppr-ttl-layout-seq"
          )}, props=${extractIdText(shell, "hsppr-ttl-layout-props-seq")}`
        );
      }
      if (
        extractIdText(shell, "hsppr-ttl-page-shell-seq") !== "100" ||
        extractIdText(shell, "hsppr-ttl-page-props-seq") !== "100"
      ) {
        throw new Error(
          `Layout TTL expiry re-executed long-lived PPR child page (revalidate=3600s)! Got pageShell=${extractIdText(
            shell,
            "hsppr-ttl-page-shell-seq"
          )} (expected 100, not 999)`
        );
      }
      if (
        extractIdText(stream, "hsppr-ttl-layout-hole-seq") !== "501" ||
        extractIdText(stream, "hsppr-ttl-page-hole-seq") !== "501" ||
        extractIdText(stream, "hsppr-ttl-page-hole-query") !== "ttl-verified"
      ) {
        throw new Error("Streamed dynamic holes on /ttl-ppr did not emit 501 / ttl-verified");
      }

      // Verify router.refresh({ layout: true }) serves updated layout shell (501) + frozen page shell (100)
      router.refresh({ layout: true });
      await waitForCondition(
        () =>
          readText("hsppr-ttl-layout-seq") === "501" &&
          readText("hsppr-ttl-layout-props-seq") === "501" &&
          readText("hsppr-ttl-layout-hole-seq") === "501" &&
          readText("hsppr-ttl-page-hole-seq") === "501",
        10000,
        "DOM updated to TTL layout=501 after router.refresh({ layout: true })"
      );
      if (
        readText("hsppr-ttl-page-shell-seq") !== "100" ||
        readText("hsppr-ttl-page-props-seq") !== "100"
      ) {
        throw new Error(
          `router.refresh({ layout: true }) after layout TTL expiry leaked page shell ${readText(
            "hsppr-ttl-page-shell-seq"
          )} (expected 100)`
        );
      }
      if (
        readText("hsppr-l1-mount-id") !== l1MountBefore ||
        readText("hsppr-ttl-layout-mount-id") !== ttlLayoutMountBefore ||
        readText("hsppr-ttl-layout-client-count") !== "1"
      ) {
        throw new Error("Client state lost during TTL layout refresh");
      }

      await hspprMutateState({
        ttlPageShellSeq: 100,
        ttlPagePropsSeq: 100,
      });

      // Return to /t-rigurous-hs-ppr index
      clickEl("hsppr-link-page-a");
      await waitForCondition(
        () => window.location.pathname === "/t-rigurous-hs-ppr" && !!document.getElementById("hsppr-page-a"),
        10000,
        "return to /t-rigurous-hs-ppr"
      );

      return "Layout TTL (1s) expired by clock -> regenerated layout.rsc & shell.layout.json (501) + lazily recomposed shell.html while preserving child PPR page shell (100, not 999)";
    });

    // TEST 12: Inverse Clock-Based PPR Child Page TTL Expiration (revalidate=1s in page_functions.ts) Composing With Cached Long-Lived L1 Layout (revalidate=3600s)
    await runStep(11, async () => {
      // Re-anchor /t-rigurous-hs-ppr/page-ttl-ppr to 100 and start a fresh 1s clock window
      await hspprMutateState({
        pageTtlShellSeq: 100,
        pageTtlPropsSeq: 100,
        pageTtlHoleSeq: 100,
      });
      await hspprRunRevalidatePage("/t-rigurous-hs-ppr/page-ttl-ppr");

      // Mutate child page to 502 AND poison L1 Layout in-memory counters to 999 WITHOUT calling revalidate*
      await hspprMutateState({
        pageTtlShellSeq: 502,
        pageTtlPropsSeq: 502,
        pageTtlHoleSeq: 502,
        l1LayoutSeq: isProdMode ? 999 : 301,
        l1LayoutPropsSeq: isProdMode ? 999 : 301,
      });

      // Wait 1.25s for the child PPR page's 1s TTL to expire by clock (while L1 Layout 3600s TTL is still valid!)
      await new Promise((r) => setTimeout(r, 1250));

      // First request after TTL expiry triggers background/on-expiry revalidatePage('/t-rigurous-hs-ppr/page-ttl-ppr')
      await fetch("/t-rigurous-hs-ppr/page-ttl-ppr?ptmode=pt-trigger", {
        headers: { Accept: "text/html" },
        credentials: "same-origin",
      });
      await new Promise((r) => setTimeout(r, 300));

      const wireRes = await fetch("/t-rigurous-hs-ppr/page-ttl-ppr?ptmode=pt-verified", {
        headers: { Accept: "text/html" },
        credentials: "same-origin",
      });
      const { shell, stream } = splitPprWire(await wireRes.text());

      await hspprMutateState({
        l1LayoutSeq: 301,
        l1LayoutPropsSeq: 301,
      });

      if (
        extractIdText(shell, "hsppr-page-ttl-shell-seq") !== "502" ||
        extractIdText(shell, "hsppr-page-ttl-props-seq") !== "502"
      ) {
        throw new Error(
          `Expected expired PPR child page (revalidate=1s) to update to 502 in shell.html, got seq=${extractIdText(
            shell,
            "hsppr-page-ttl-shell-seq"
          )}`
        );
      }
      if (
        extractIdText(shell, "hsppr-l1-layout-seq") !== "301" ||
        extractIdText(shell, "hsppr-l1-props-seq") !== "301"
      ) {
        throw new Error(
          `PPR child page TTL expiry re-executed long-lived L1 Layout (3600s)! Got l1=${extractIdText(
            shell,
            "hsppr-l1-layout-seq"
          )} (expected 301, not 999)`
        );
      }
      if (
        extractIdText(stream, "hsppr-page-ttl-hole-seq") !== "502" ||
        extractIdText(stream, "hsppr-page-ttl-hole-query") !== "pt-verified"
      ) {
        throw new Error("Streamed dynamic hole on /page-ttl-ppr did not emit 502 / pt-verified");
      }

      return "PPR Child Page TTL (1s) expired by clock -> regenerated shell.page.json & shell.html (502) composing with cached L1 layout.rsc (301, not 999)";
    });

    sync(false, true);
  };

  return (
    <div
      id="hsppr-suite-runner"
      className="p-3.5 my-2 rounded-xl bg-slate-900 border border-indigo-500/70 space-y-2.5 text-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-bold text-indigo-300">
            Automated HS + PPR (No-CacheSlot) E2E Verification Suite (11 Tests)
          </span>
          <span id="hsppr-suite-summary" className="ml-3 font-mono text-slate-300">
            {suiteState.finished
              ? `DONE: ${suiteState.passedCount}/${suiteState.results.length} PASSED, ${suiteState.failedCount} FAILED`
              : suiteState.running
              ? "RUNNING..."
              : "READY"}
          </span>
        </div>
        <button
          id="hsppr-run-all-btn"
          type="button"
          disabled={suiteState.running}
          onClick={runSuite}
          className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold cursor-pointer"
        >
          {suiteState.running ? "Running Suite..." : "Run Full 11-Test HS+PPR Suite"}
        </button>
      </div>

      <ul id="hsppr-suite-results" className="space-y-1 font-mono text-[11px]">
        {suiteState.results.map((r) => (
          <li
            key={r.id}
            id={`hsppr-test-row-${r.id}`}
            data-status={r.status}
            className="p-1.5 rounded bg-slate-950/90 border border-slate-800 flex flex-col gap-0.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-slate-200">{r.name}</span>
              <span
                id={`hsppr-test-status-${r.id}`}
                className={
                  r.status === "passed"
                    ? "text-emerald-400 font-bold"
                    : r.status === "failed"
                    ? "text-rose-400 font-bold"
                    : r.status === "running"
                    ? "text-amber-300 font-bold"
                    : "text-slate-500"
                }
              >
                {r.status.toUpperCase()}
              </span>
            </div>
            <div id={`hsppr-test-detail-${r.id}`} className="text-slate-400 break-all">
              {r.detail}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

