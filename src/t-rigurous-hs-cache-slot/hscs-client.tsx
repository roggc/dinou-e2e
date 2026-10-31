"use client";

import React, { useState, useEffect } from "react";
import { useRouter, refreshSlot } from "dinou";
import {
  hscsResetAll,
  hscsMutateState,
  hscsRunRevalidateTag,
  hscsRunRevalidatePage,
  hscsRunRevalidateLayout,
} from "./hscs-actions";

export function HsCsClientStateBox({ idPrefix }: { idPrefix: string }) {
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
      <span className="font-semibold text-teal-300">State ({idPrefix})</span>
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
          className="px-1.5 py-0.5 rounded bg-slate-950 text-teal-200 border border-teal-700"
        >
          {count}
        </strong>
        <button
          id={`${idPrefix}-client-inc`}
          type="button"
          onClick={() => setCount((c) => c + 1)}
          className="px-1.5 py-0.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-medium cursor-pointer"
        >
          +1
        </button>
      </div>
    </div>
  );
}

export function HsCsSlotActionButton({
  actionFn,
}: {
  actionFn: (label: string) => Promise<{ ok: boolean; label: string; calls: number }>;
}) {
  const [result, setResult] = useState("idle");

  return (
    <div className="flex items-center gap-2">
      <button
        id="hscs-slot-action-btn"
        type="button"
        onClick={async () => {
          const res = await actionFn("from-page-a-slot");
          setResult(`${res.label}:#${res.calls}`);
        }}
        className="px-2 py-0.5 rounded bg-purple-700 hover:bg-purple-600 text-white text-[11px] cursor-pointer"
      >
        Call Slot Action
      </button>
      <code id="hscs-slot-action-result" className="text-purple-200 text-[11px]">
        {result}
      </code>
    </div>
  );
}

export interface HsCsTestResult {
  id: number;
  name: string;
  status: "pending" | "running" | "passed" | "failed";
  detail: string;
}

interface HsCsSuiteGlobalState {
  running: boolean;
  finished: boolean;
  passedCount: number;
  failedCount: number;
  results: HsCsTestResult[];
}

const INITIAL_TESTS: HsCsTestResult[] = [
  {
    id: 1,
    name: "1. Baseline Segmented Render (L1 Layout + @sidebar + Page A) & Multi-Level Client State Init",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 2,
    name: "2. Surgical Page A Slot Revalidation (revalidateTag + refreshSlot) & Server Action Prop in Slot",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 3,
    name: "3. Surgical L1 Layout Slot & @sidebar Parallel Slot Revalidation (Preserving Host Layout & Page)",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 4,
    name: "4. Cross-Axis Shared Tag (hscs-shared-tag) Simultaneous Layout Slot + Page Slot Update",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 5,
    name: "5. Nested <DinouCacheSlot> (Outer + Inner) Surgical Inner vs. Outer Refresh in Layout & Page",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 6,
    name: "6. Dynamic <DinouCacheSlot revalidate={0}> Storage Bypass Inside Static Non-PPR Page",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 7,
    name: "7. Round-Trip Soft Navigation (Page A -> Page B -> Page A): 0 Network Hits + Refreshed Slot Persistence",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 8,
    name: "8. Unmounted Slot Refresh on Sibling Route (Refresh Page A Slot While on Page B -> Return to Page A)",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 9,
    name: "9. Multi-Level Nested Layout (/nested) Slot Refresh & Round-Trip (/nested -> /page-b -> /nested)",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 10,
    name: "10. Host Segment Revalidation (revalidatePage & revalidateLayout) Coexistence with Cached Slots",
    status: "pending",
    detail: "Waiting...",
  },
];

function getGlobalSuiteState(): HsCsSuiteGlobalState {
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
  if (!w.__HSCS_SUITE_STATE__) {
    w.__HSCS_SUITE_STATE__ = {
      running: false,
      finished: false,
      passedCount: 0,
      failedCount: 0,
      results: INITIAL_TESTS.map((t) => ({ ...t })),
    };
  }
  return w.__HSCS_SUITE_STATE__;
}

function notifySuiteUpdate(next: HsCsSuiteGlobalState) {
  if (typeof window === "undefined") return;
  (window as any).__HSCS_SUITE_STATE__ = next;
  window.dispatchEvent(new CustomEvent("hscs-suite-update"));
}

export function HsCsAutomatedSuiteRunner() {
  const router = useRouter();
  const [suiteState, setSuiteState] = useState<HsCsSuiteGlobalState>(() =>
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
    window.addEventListener("hscs-suite-update", onUpdate);
    return () => window.removeEventListener("hscs-suite-update", onUpdate);
  }, []);

  const startAutomatedSuite = async () => {
    const state = getGlobalSuiteState();
    if (state.running) return;

    state.running = true;
    state.finished = false;
    state.passedCount = 0;
    state.failedCount = 0;
    state.results = INITIAL_TESTS.map((t) => ({
      ...t,
      status: "pending",
      detail: "Waiting...",
    }));
    notifySuiteUpdate(state);

    const getText = (id: string) =>
      document.getElementById(id)?.textContent?.trim() ?? "";

    const clickEl = (id: string) => {
      const el = document.getElementById(id);
      if (!el) throw new Error(`Element #${id} not found`);
      el.click();
    };

    const waitForEl = async (id: string, timeoutMs = 8000): Promise<HTMLElement> => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const el = document.getElementById(id);
        if (el) return el;
        await new Promise((r) => setTimeout(r, 35));
      }
      throw new Error(`Timeout waiting for #${id}`);
    };

    const waitForText = async (
      id: string,
      expected: string,
      timeoutMs = 8000
    ): Promise<string> => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const cur = getText(id);
        if (cur === expected) return cur;
        await new Promise((r) => setTimeout(r, 35));
      }
      throw new Error(
        `Timeout waiting for #${id} === "${expected}" (current="${getText(id)}")`
      );
    };

    const origFetch = window.fetch.bind(window);
    const fetchedUrls: string[] = [];
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : input.url;
      fetchedUrls.push(urlStr);
      return origFetch(input, init);
    };

    const runStep = async (id: number, fn: () => Promise<string>) => {
      const idx = state.results.findIndex((r) => r.id === id);
      state.results[idx] = {
        ...state.results[idx],
        status: "running",
        detail: "Running...",
      };
      notifySuiteUpdate({ ...state });
      try {
        const detail = await fn();
        state.results[idx] = {
          ...state.results[idx],
          status: "passed",
          detail,
        };
      } catch (err: any) {
        state.results[idx] = {
          ...state.results[idx],
          status: "failed",
          detail: err?.message || String(err),
        };
      }
      notifySuiteUpdate({ ...state });
    };

    try {
      // Ensure we start cleanly on Page A (/t-rigurous-hs-cache-slot) with reset state
      if (window.location.pathname !== "/t-rigurous-hs-cache-slot") {
        router.push("/t-rigurous-hs-cache-slot");
        await waitForEl("hscs-page-a");
      }
      await hscsResetAll();
      if ((window as any).__DINOU_SLOT_OVERRIDE_CACHE__) {
        (window as any).__DINOU_SLOT_OVERRIDE_CACHE__.clear();
      }
      if (
        getText("hscs-l1-layout-seq") !== "100" ||
        getText("hscs-page-a-seq") !== "100" ||
        getText("hscs-page-a-slot-seq") !== "100"
      ) {
        router.refresh({ layout: true });
        await waitForText("hscs-l1-layout-seq", "100");
        await waitForText("hscs-page-a-seq", "100");
        await waitForText("hscs-page-a-slot-seq", "100");
      }

      // SCENARIO 1: Baseline Segmented Render & Multi-Level Client State Init
      await runStep(1, async () => {
        const baselineIds: [string, string][] = [
          ["hscs-l1-layout-seq", "100"],
          ["hscs-l1-props-seq", "100"],
          ["hscs-l1-slot-seq", "100"],
          ["hscs-l1-shared-slot-seq", "100"],
          ["hscs-l1-outer-slot-seq", "100"],
          ["hscs-l1-inner-slot-seq", "100"],
          ["hscs-sidebar-outer-seq", "100"],
          ["hscs-sidebar-slot-seq", "100"],
          ["hscs-page-a-seq", "100"],
          ["hscs-page-a-props-seq", "100"],
          ["hscs-page-a-slot-seq", "100"],
          ["hscs-page-a-shared-slot-seq", "100"],
          ["hscs-page-a-outer-slot-seq", "100"],
          ["hscs-page-a-inner-slot-seq", "100"],
          ["hscs-page-a-nocache-slot-seq", "100"],
        ];
        for (const [id, expected] of baselineIds) {
          const actual = getText(id);
          if (actual !== expected) {
            throw new Error(`Expected #${id} === "${expected}", got "${actual}"`);
          }
        }

        // Increment client useState counters in L1 Layout, L1 Slot, @sidebar Slot, Page A, and Page A Slot
        for (const prefix of [
          "hscs-l1",
          "hscs-l1-slot",
          "hscs-sidebar-slot",
          "hscs-page-a",
          "hscs-page-a-slot",
        ]) {
          if (getText(`${prefix}-client-count`) === "0") {
            clickEl(`${prefix}-client-inc`);
          }
          await waitForText(`${prefix}-client-count`, "1");
        }

        return "All 15 L1/Sidebar/PageA sequences at 100; 5 client state boxes incremented to 1";
      });

      // SCENARIO 2: Surgical Page A Slot Revalidation + Server Action Prop Inside Slot
      await runStep(2, async () => {
        clickEl("hscs-slot-action-btn");
        await waitForText("hscs-slot-action-result", "from-page-a-slot:#1");

        // Poison outer Page A & L1 Layout counters to 999 during revalidateTag to prove they do NOT re-render
        await hscsMutateState({
          pageASlotSeq: 101,
          pageASeq: 999,
          pageAPropsSeq: 999,
          l1LayoutSeq: 999,
          l1LayoutPropsSeq: 999,
        });
        await hscsRunRevalidateTag("hscs-page-a-slot-tag");
        await hscsMutateState({
          pageASeq: 100,
          pageAPropsSeq: 100,
          l1LayoutSeq: 100,
          l1LayoutPropsSeq: 100,
        });

        refreshSlot("hscs-page-a-slot-tag");
        await waitForText("hscs-page-a-slot-seq", "101");

        if (getText("hscs-page-a-seq") !== "100" || getText("hscs-page-a-props-seq") !== "100") {
          throw new Error("Page A outer/props re-rendered during surgical slot refresh!");
        }
        if (getText("hscs-l1-layout-seq") !== "100") {
          throw new Error("L1 Layout re-rendered during Page A surgical slot refresh!");
        }
        if (getText("hscs-page-a-slot-client-count") !== "1") {
          throw new Error(
            `Client state inside hscs-page-a-slot lost during refreshSlot (got ${getText(
              "hscs-page-a-slot-client-count"
            )})`
          );
        }

        // Verify background HTML & page.rsc surgical sync
        const [htmlRes, rscRes] = await Promise.all([
          origFetch("/t-rigurous-hs-cache-slot", { headers: { Accept: "text/html" } }),
          origFetch("/____rsc_page____/t-rigurous-hs-cache-slot"),
        ]);
        const [htmlText, rscText] = await Promise.all([htmlRes.text(), rscRes.text()]);
        if (!htmlText.includes('id="hscs-page-a-slot-seq"') || !htmlText.includes(">101<")) {
          throw new Error("SSR HTML on disk did not update hscs-page-a-slot-seq to 101");
        }
        if (!htmlText.includes('id="hscs-page-a-seq">100<')) {
          throw new Error("SSR HTML on disk did not preserve outer hscs-page-a-seq at 100");
        }
        if (!rscText.includes('"hscs-page-a-slot-seq"') || !rscText.includes("101")) {
          throw new Error("page.rsc on disk did not update hscs-page-a-slot-seq to 101");
        }

        return "Server Action prop (#1) & hscs-page-a-slot-tag (100->101) updated in-place + HTML/page.rsc synced; Page A & L1 Layout stayed at 100";
      });

      // SCENARIO 3: Surgical L1 Layout Slot & @sidebar Parallel Slot Revalidation
      await runStep(3, async () => {
        await hscsMutateState({
          l1SlotSeq: 101,
          sidebarSlotSeq: 101,
          l1LayoutSeq: 999,
          sidebarOuterSeq: 999,
          pageASeq: 999,
        });
        await hscsRunRevalidateTag("hscs-l1-slot-tag");
        await hscsRunRevalidateTag("hscs-sidebar-slot-tag");
        await hscsMutateState({
          l1LayoutSeq: 100,
          sidebarOuterSeq: 100,
          pageASeq: 100,
        });

        refreshSlot("hscs-l1-slot-tag");
        refreshSlot("hscs-sidebar-slot-tag");
        await waitForText("hscs-l1-slot-seq", "101");
        await waitForText("hscs-sidebar-slot-seq", "101");

        if (
          getText("hscs-l1-layout-seq") !== "100" ||
          getText("hscs-sidebar-outer-seq") !== "100" ||
          getText("hscs-page-a-seq") !== "100"
        ) {
          throw new Error("Outer L1 Layout, @sidebar, or Page A re-executed!");
        }
        if (
          getText("hscs-l1-slot-client-count") !== "1" ||
          getText("hscs-sidebar-slot-client-count") !== "1"
        ) {
          throw new Error("Client state inside L1 Slot or @sidebar Slot was lost!");
        }

        const layoutRscRes = await origFetch("/____rsc_layout____/t-rigurous-hs-cache-slot");
        const layoutRscText = await layoutRscRes.text();
        if (!layoutRscText.includes("101")) {
          throw new Error("layout.rsc was not surgically updated to 101");
        }

        return "L1 Slot (100->101) & @sidebar Slot (100->101) updated in-place + layout.rsc synced; L1/Sidebar/PageA stayed 100 & client states=1";
      });

      // SCENARIO 4: Cross-Axis Shared Tag (hscs-shared-tag) Across Layout Slot & Page Slot
      await runStep(4, async () => {
        await hscsMutateState({
          l1SharedSlotSeq: 101,
          pageASharedSlotSeq: 101,
          l1LayoutSeq: 999,
          pageASeq: 999,
        });
        await hscsRunRevalidateTag("hscs-shared-tag");
        await hscsMutateState({
          l1LayoutSeq: 100,
          pageASeq: 100,
        });

        refreshSlot("hscs-shared-tag");
        await waitForText("hscs-l1-shared-slot-seq", "101");
        await waitForText("hscs-page-a-shared-slot-seq", "101");

        if (getText("hscs-l1-layout-seq") !== "100" || getText("hscs-page-a-seq") !== "100") {
          throw new Error("Shared slot tag revalidation unexpectedly re-ran L1 Layout or Page A!");
        }

        return "Single hscs-shared-tag updated BOTH L1 Layout slot (101) & Page A slot (101) while L1 Layout & Page A stayed at 100";
      });

      // SCENARIO 5: Nested <DinouCacheSlot> (Outer + Inner) Surgical Inner vs. Outer Refresh in Layout & Page
      await runStep(5, async () => {
        // 5a. Refresh ONLY inner slots in L1 Layout and Page A
        await hscsMutateState({
          l1InnerSlotSeq: 101,
          pageAInnerSlotSeq: 101,
          l1OuterSlotSeq: 999,
          pageAOuterSlotSeq: 999,
        });
        await hscsRunRevalidateTag("hscs-l1-inner-tag");
        await hscsRunRevalidateTag("hscs-page-a-inner-tag");
        await hscsMutateState({
          l1OuterSlotSeq: 100,
          pageAOuterSlotSeq: 100,
        });

        refreshSlot("hscs-l1-inner-tag");
        refreshSlot("hscs-page-a-inner-tag");
        await waitForText("hscs-l1-inner-slot-seq", "101");
        await waitForText("hscs-page-a-inner-slot-seq", "101");

        if (
          getText("hscs-l1-outer-slot-seq") !== "100" ||
          getText("hscs-page-a-outer-slot-seq") !== "100"
        ) {
          throw new Error(
            `Refreshing inner slots should NOT re-render outer slots (got L1=${getText(
              "hscs-l1-outer-slot-seq"
            )}, PageA=${getText("hscs-page-a-outer-slot-seq")})`
          );
        }

        // 5b. Refresh outer slots while inner slots stay cached at 101
        await hscsMutateState({
          l1OuterSlotSeq: 101,
          pageAOuterSlotSeq: 101,
          l1InnerSlotSeq: 999,
          pageAInnerSlotSeq: 999,
        });
        await hscsRunRevalidateTag("hscs-l1-outer-tag");
        await hscsRunRevalidateTag("hscs-page-a-outer-tag");
        await hscsMutateState({
          l1InnerSlotSeq: 101,
          pageAInnerSlotSeq: 101,
        });

        refreshSlot("hscs-l1-outer-tag");
        refreshSlot("hscs-page-a-outer-tag");
        await waitForText("hscs-l1-outer-slot-seq", "101");
        await waitForText("hscs-page-a-outer-slot-seq", "101");

        if (
          getText("hscs-l1-inner-slot-seq") !== "101" ||
          getText("hscs-page-a-inner-slot-seq") !== "101"
        ) {
          throw new Error("Refreshing outer slots failed to reuse cached inner slots (101)!");
        }

        return "Inner slots updated (100->101) without touching outer (100); Outer slots updated (100->101) reusing cached inner (101)";
      });

      // SCENARIO 6: Dynamic <DinouCacheSlot revalidate={0}> Storage Bypass Inside Static Page
      await runStep(6, async () => {
        await hscsMutateState({ pageANoCacheSlotSeq: 101 });
        // Note: NO revalidateTag and NO { fresh: true } needed because revalidate={0} bypasses slot storage!
        refreshSlot("hscs-page-a-nocache-slot");
        await waitForText("hscs-page-a-nocache-slot-seq", "101");

        if (getText("hscs-page-a-seq") !== "100") {
          throw new Error("Page A outer seq changed during revalidate={0} slot refresh!");
        }
        return "revalidate={0} slot bypassed storage cache (100->101) without revalidateTag or fresh:true while Page A stayed at 100";
      });

      // SCENARIO 7: Round-Trip Soft Navigation (Page A -> Page B -> Page A)
      await runStep(7, async () => {
        const l1Mount0 = getText("hscs-l1-mount-id");
        fetchedUrls.length = 0;

        // Navigate Page A -> Page B
        clickEl("hscs-link-page-b");
        await waitForEl("hscs-page-b");
        await waitForText("hscs-page-b-seq", "100");
        await waitForText("hscs-page-b-slot-seq", "100");

        const layoutReqsToB = fetchedUrls.filter((u) => u.includes("/____rsc_layout____"));
        if (layoutReqsToB.length !== 0) {
          throw new Error(
            `Expected 0 /____rsc_layout____ requests on Page A -> Page B, got ${layoutReqsToB.length}`
          );
        }
        if (
          getText("hscs-l1-mount-id") !== l1Mount0 ||
          getText("hscs-l1-client-count") !== "1" ||
          getText("hscs-l1-slot-client-count") !== "1" ||
          getText("hscs-sidebar-slot-client-count") !== "1"
        ) {
          throw new Error("L1 Layout or its slot client state was lost on Page A -> Page B!");
        }

        // Navigate back Page B -> Page A
        fetchedUrls.length = 0;
        clickEl("hscs-link-page-a");
        await waitForEl("hscs-page-a");

        const rscReqsToA = fetchedUrls.filter(
          (u) => u.includes("/____rsc_page____") || u.includes("/____rsc_layout____")
        );
        if (rscReqsToA.length !== 0) {
          throw new Error(
            `Expected 0 RSC network requests on Page B -> Page A (pageCache hit), got ${rscReqsToA.length}`
          );
        }

        // CRITICAL ASSERTION: All refreshed Page A slots MUST remain at 101 and NOT revert to 100!
        const expectedPageASlots: [string, string][] = [
          ["hscs-page-a-seq", "100"],
          ["hscs-page-a-slot-seq", "101"],
          ["hscs-page-a-shared-slot-seq", "101"],
          ["hscs-page-a-outer-slot-seq", "101"],
          ["hscs-page-a-inner-slot-seq", "101"],
          ["hscs-page-a-nocache-slot-seq", "101"],
        ];
        for (const [id, expected] of expectedPageASlots) {
          const actual = getText(id);
          if (actual !== expected) {
            throw new Error(
              `After Page A -> Page B -> Page A round-trip, expected #${id} === "${expected}", got "${actual}"`
            );
          }
        }

        return "Page A -> Page B -> Page A: 0 layout/page network hits on return, L1 states preserved, and all 5 Page A slots kept 101!";
      });

      // SCENARIO 8: Unmounted Slot Refresh While on Sibling Page (Refresh Page A Slot While on Page B)
      await runStep(8, async () => {
        clickEl("hscs-link-page-b");
        await waitForEl("hscs-page-b");

        // While Page A is unmounted (we are on Page B), revalidate & refresh Page A's slot to 102!
        await hscsMutateState({ pageASlotSeq: 102 });
        await hscsRunRevalidateTag("hscs-page-a-slot-tag");
        refreshSlot("hscs-page-a-slot-tag");

        // Return to Page A via soft navigation
        clickEl("hscs-link-page-a");
        await waitForEl("hscs-page-a");
        await waitForText("hscs-page-a-slot-seq", "102");

        if (getText("hscs-page-a-seq") !== "100") {
          throw new Error(`Expected Page A outer seq 100, got ${getText("hscs-page-a-seq")}`);
        }

        return "Refreshed unmounted Page A slot while on Page B (101->102); soft-nav return to Page A rendered 102 with Page A seq=100";
      });

      // SCENARIO 9: Multi-Level Nested Layout (/nested) Slot Refresh & Round-Trip (/nested -> /page-b -> /nested)
      await runStep(9, async () => {
        clickEl("hscs-link-nested");
        await waitForEl("hscs-l2-layout");
        await waitForEl("hscs-nested-page");

        await waitForText("hscs-l2-layout-seq", "100");
        await waitForText("hscs-l2-slot-seq", "100");
        await waitForText("hscs-nested-page-seq", "100");
        await waitForText("hscs-nested-page-slot-seq", "100");

        // Increment L2 Layout & L2 Slot client state
        clickEl("hscs-l2-client-inc");
        clickEl("hscs-l2-slot-client-inc");
        await waitForText("hscs-l2-client-count", "1");
        await waitForText("hscs-l2-slot-client-count", "1");

        // Surgically refresh L2 Layout Slot & Nested Page Slot
        await hscsMutateState({
          l2SlotSeq: 101,
          nestedPageSlotSeq: 101,
          l2LayoutSeq: 999,
          nestedPageSeq: 999,
        });
        await hscsRunRevalidateTag("hscs-l2-slot-tag");
        await hscsRunRevalidateTag("hscs-nested-page-slot-tag");
        await hscsMutateState({
          l2LayoutSeq: 100,
          nestedPageSeq: 100,
        });

        refreshSlot("hscs-l2-slot-tag");
        refreshSlot("hscs-nested-page-slot-tag");
        await waitForText("hscs-l2-slot-seq", "101");
        await waitForText("hscs-nested-page-slot-seq", "101");

        if (
          getText("hscs-l2-layout-seq") !== "100" ||
          getText("hscs-nested-page-seq") !== "100" ||
          getText("hscs-l2-client-count") !== "1" ||
          getText("hscs-l2-slot-client-count") !== "1"
        ) {
          throw new Error(
            `L2/Nested mismatch: l2Seq=${getText("hscs-l2-layout-seq")}, nestedSeq=${getText(
              "hscs-nested-page-seq"
            )}, l2Count=${getText("hscs-l2-client-count")}, l2SlotCount=${getText(
              "hscs-l2-slot-client-count"
            )}`
          );
        }

        // Navigate /nested -> /page-b (unmounts L2 layout & nested page) -> /nested
        clickEl("hscs-link-page-b");
        await waitForEl("hscs-page-b");

        fetchedUrls.length = 0;
        clickEl("hscs-link-nested");
        await waitForEl("hscs-l2-layout");
        await waitForEl("hscs-nested-page");

        const rscReqsToNested = fetchedUrls.filter(
          (u) => u.includes("/____rsc_page____") || u.includes("/____rsc_layout____")
        );
        if (rscReqsToNested.length !== 0) {
          throw new Error(
            `Expected 0 RSC network requests on /page-b -> /nested (layoutCache+pageCache hit), got ${rscReqsToNested.length}`
          );
        }

        if (
          getText("hscs-l2-slot-seq") !== "101" ||
          getText("hscs-nested-page-slot-seq") !== "101"
        ) {
          throw new Error(
            `L2 Slot (${getText("hscs-l2-slot-seq")}) or Nested Page Slot (${getText(
              "hscs-nested-page-slot-seq"
            )}) reverted to 100 after /nested -> /page-b -> /nested!`
          );
        }

        return "L2 Layout slot (101) & Nested Page slot (101) updated surgically and persisted across /nested -> /page-b -> /nested with 0 network hits";
      });

      // SCENARIO 10: Host Segment Revalidation (revalidatePage & revalidateLayout) Coexistence with Cached Slots
      await runStep(10, async () => {
        clickEl("hscs-link-page-a");
        await waitForEl("hscs-page-a");

        // 10a. Full revalidatePage("/t-rigurous-hs-cache-slot") re-runs Page A outer (100->101) while reusing cached Page A slots (102 & 101)
        await hscsMutateState({
          pageASeq: 101,
          pageAPropsSeq: 101,
          pageASlotSeq: 999,
        });
        await hscsRunRevalidatePage("/t-rigurous-hs-cache-slot");
        await hscsMutateState({
          pageASlotSeq: 102,
        });

        router.refresh();
        await waitForText("hscs-page-a-seq", "101");
        await waitForText("hscs-page-a-props-seq", "101");

        if (getText("hscs-page-a-slot-seq") !== "102") {
          throw new Error(
            `revalidatePage should reuse cached hscs-page-a-slot (expected 102, got ${getText(
              "hscs-page-a-slot-seq"
            )})`
          );
        }
        if (getText("hscs-l1-layout-seq") !== "100") {
          throw new Error("revalidatePage + router.refresh() should NOT re-render L1 Layout!");
        }

        // 10b. Full revalidateLayout("/t-rigurous-hs-cache-slot") re-runs L1 Layout outer (100->101) while reusing cached L1 slots (101)
        await hscsMutateState({
          l1LayoutSeq: 101,
          l1LayoutPropsSeq: 101,
          l1SlotSeq: 999,
        });
        await hscsRunRevalidateLayout("/t-rigurous-hs-cache-slot");
        await hscsMutateState({
          l1SlotSeq: 101,
        });

        router.refresh({ layout: true });
        await waitForText("hscs-l1-layout-seq", "101");
        await waitForText("hscs-l1-props-seq", "101");

        if (getText("hscs-l1-slot-seq") !== "101") {
          throw new Error(
            `revalidateLayout should reuse cached hscs-l1-slot (expected 101, got ${getText(
              "hscs-l1-slot-seq"
            )})`
          );
        }
        if (getText("hscs-l1-client-count") !== "1") {
          throw new Error(
            `L1 Layout client useState lost (got "${getText("hscs-l1-client-count")}")!`
          );
        }

        return "revalidatePage updated Page A (100->101) reusing slot (102); revalidateLayout updated L1 (100->101) reusing slot (101) & keeping state=1";
      });
    } finally {
      window.fetch = origFetch;
      state.running = false;
      state.finished = true;
      state.passedCount = state.results.filter((r) => r.status === "passed").length;
      state.failedCount = state.results.filter((r) => r.status === "failed").length;
      notifySuiteUpdate({ ...state, results: [...state.results] });
    }
  };

  return (
    <div
      id="hscs-automated-suite-panel"
      className="p-4 my-2 rounded-xl bg-slate-900/95 border border-teal-500/40 space-y-3 text-xs shadow-lg"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-teal-300">
            Automated HS + &lt;DinouCacheSlot&gt; E2E Stress Runner (10 Scenarios, No-PPR)
          </h2>
          <p className="text-slate-400">
            Tests 2x2 surgical invalidation, shared cross-axis tags, nested slots,{" "}
            <code>revalidate=&#123;0&#125;</code>, round-trip soft-nav slot persistence, unmounted slot refresh, and host revalidation coexistence.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {suiteState.finished && (
            <span
              id="hscs-suite-summary-badge"
              className={`px-2.5 py-1 rounded font-bold ${
                suiteState.failedCount === 0
                  ? "bg-emerald-950 text-emerald-300 border border-emerald-700"
                  : "bg-rose-950 text-rose-300 border border-rose-700"
              }`}
            >
              {suiteState.passedCount}/{suiteState.results.length} PASSED
            </span>
          )}
          <button
            id="hscs-run-automated-suite"
            type="button"
            disabled={suiteState.running}
            onClick={startAutomatedSuite}
            className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-semibold cursor-pointer shadow"
          >
            {suiteState.running
              ? "Running HS+CacheSlot Suite..."
              : "▶ Run All 10 HS + CacheSlot Tests"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
        {suiteState.results.map((item) => (
          <div
            key={item.id}
            id={`hscs-test-row-${item.id}`}
            data-status={item.status}
            className={`p-2 rounded border flex flex-col gap-0.5 ${
              item.status === "passed"
                ? "bg-emerald-950/30 border-emerald-800/70 text-emerald-200"
                : item.status === "failed"
                ? "bg-rose-950/40 border-rose-700 text-rose-200"
                : item.status === "running"
                ? "bg-amber-950/40 border-amber-600 text-amber-200"
                : "bg-slate-800/40 border-slate-800 text-slate-400"
            }`}
          >
            <div className="flex items-center justify-between gap-2 font-semibold">
              <span>{item.name}</span>
              <span
                id={`hscs-test-status-${item.id}`}
                className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-black/30 font-mono"
              >
                {item.status}
              </span>
            </div>
            <div
              id={`hscs-test-detail-${item.id}`}
              className="text-[11px] opacity-85 font-mono break-all"
            >
              {item.detail}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

