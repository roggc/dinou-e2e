"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "dinou";
import {
  hsResetAllState,
  hsMutateSiblingAOnly,
  hsMutateAndRevalidatePage,
  hsMutateAndRevalidateLayout,
  hsMutateAndRevalidatePath,
  hsMutateAndRevalidatePageTag,
  hsMutateAndRevalidateLayoutTagSurgical,
  hsMutateRawState,
  hsRevalidateTtlRoutes,
} from "./hs-actions";

export function HsLayoutClientState({ idPrefix }: { idPrefix: string }) {
  const [count, setCount] = useState(0);
  const [text, setText] = useState("");
  const [mountId, setMountId] = useState("ssr");

  useEffect(() => {
    setMountId(Math.random().toString(36).slice(2, 8));
  }, []);

  return (
    <div
      id={`${idPrefix}-client-box`}
      className="flex flex-wrap items-center gap-3 p-2.5 my-2 rounded-lg bg-slate-800/90 border border-slate-700 text-xs"
    >
      <span className="font-semibold text-indigo-300">Client State ({idPrefix})</span>
      <span className="text-slate-400">
        Mount ID:{" "}
        <code id={`${idPrefix}-mount-id`} className="text-amber-300">
          {mountId}
        </code>
      </span>
      <div className="flex items-center gap-1.5">
        <span>Count:</span>
        <strong
          id={`${idPrefix}-client-count`}
          className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-200 border border-indigo-700"
        >
          {count}
        </strong>
        <button
          id={`${idPrefix}-client-inc`}
          type="button"
          onClick={() => setCount((c) => c + 1)}
          className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium cursor-pointer"
        >
          +1
        </button>
      </div>
      <input
        id={`${idPrefix}-client-input`}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Input (${idPrefix})...`}
        className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-100"
      />
    </div>
  );
}

export function HsRefreshControls() {
  const router = useRouter();
  const [refreshCount, setRefreshCount] = useState(0);

  return (
    <div
      id="hs-refresh-controls"
      className="flex flex-wrap items-center gap-2 p-2.5 my-2 rounded-lg bg-slate-800/60 border border-slate-700 text-xs"
    >
      <span className="font-semibold text-emerald-300">Router Refresh Controls:</span>
      <button
        id="hs-btn-refresh-page-only"
        type="button"
        onClick={() => {
          setRefreshCount((c) => c + 1);
          router.refresh();
        }}
        className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-medium cursor-pointer"
      >
        router.refresh() (Page Only)
      </button>
      <button
        id="hs-btn-refresh-with-layout"
        type="button"
        onClick={() => {
          setRefreshCount((c) => c + 1);
          router.refresh({ layout: true });
        }}
        className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium cursor-pointer"
      >
        router.refresh(&#123; layout: true &#125;) (Layout + Page)
      </button>
      <span className="text-slate-400">
        Triggered: <strong id="hs-refresh-triggered-count">{refreshCount}</strong>
      </span>
    </div>
  );
}

export function HsRevalidationLabControls() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastActionResult, setLastActionResult] = useState<string>("idle");

  const runAction = (name: string, fn: () => Promise<any>, refreshLayout = false) => {
    startTransition(async () => {
      const res = await fn();
      setLastActionResult(
        `${name}:L#${res.sectionLayoutSeq}/P#${res.indexPageSeq}/A#${res.siblingASeq}`
      );
      if (refreshLayout) {
        router.refresh({ layout: true });
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div
      id="hs-revalidation-controls"
      className="p-3 mt-3 rounded-lg bg-slate-800/70 border border-slate-700 space-y-2 text-xs"
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-cyan-300">
          On-Demand Surgical Revalidation (Server Actions)
        </span>
        <span id="hs-reval-status" className="text-amber-300 font-mono">
          {isPending ? "running..." : lastActionResult}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          id="hs-btn-reset-state"
          type="button"
          onClick={() => runAction("reset", () => hsResetAllState(), true)}
          className="px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white cursor-pointer"
        >
          0. Reset State
        </button>

        <button
          id="hs-btn-mutate-sibling-a"
          type="button"
          onClick={() => {
            startTransition(async () => {
              const res = await hsMutateSiblingAOnly("sibling-a-mutated");
              setLastActionResult(`mutateSiblingA:A#${res.siblingASeq}`);
            });
          }}
          className="px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white cursor-pointer"
        >
          1. Mutate Sibling A Only (No Refresh)
        </button>

        <button
          id="hs-btn-reval-page-only"
          type="button"
          onClick={() =>
            runAction(
              "revalidatePage",
              () => hsMutateAndRevalidatePage("index-reval-page"),
              false
            )
          }
          className="px-2.5 py-1 rounded bg-cyan-700 hover:bg-cyan-600 text-white cursor-pointer"
        >
          2. revalidatePage(&quot;/t-rigurous-hs&quot;)
        </button>

        <button
          id="hs-btn-reval-layout-only"
          type="button"
          onClick={() =>
            runAction(
              "revalidateLayout",
              () => hsMutateAndRevalidateLayout("layout-reval-only"),
              true
            )
          }
          className="px-2.5 py-1 rounded bg-purple-700 hover:bg-purple-600 text-white cursor-pointer"
        >
          3. revalidateLayout(&quot;/t-rigurous-hs&quot;)
        </button>

        <button
          id="hs-btn-reval-path"
          type="button"
          onClick={() =>
            runAction(
              "revalidatePath",
              () =>
                hsMutateAndRevalidatePath(
                  "layout-reval-path",
                  "index-reval-path"
                ),
              true
            )
          }
          className="px-2.5 py-1 rounded bg-rose-700 hover:bg-rose-600 text-white cursor-pointer"
        >
          4. revalidatePath(&quot;/t-rigurous-hs&quot;)
        </button>

        <button
          id="hs-btn-reval-tag-page"
          type="button"
          onClick={() =>
            runAction(
              "revalidateTagPage",
              () => hsMutateAndRevalidatePageTag("index-tag-surgical"),
              false
            )
          }
          className="px-2.5 py-1 rounded bg-teal-700 hover:bg-teal-600 text-white cursor-pointer"
        >
          5. revalidateTag(&quot;hs-index-page-tag&quot;)
        </button>

        <button
          id="hs-btn-reval-tag-layout-surgical"
          type="button"
          onClick={() =>
            runAction(
              "revalidateTagLayoutSurgical",
              () => hsMutateAndRevalidateLayoutTagSurgical("layout-tag-surgical"),
              true
            )
          }
          className="px-2.5 py-1 rounded bg-indigo-700 hover:bg-indigo-600 text-white cursor-pointer"
        >
          6. revalidateTag(&quot;hs-section-layout-tag&quot;)
        </button>
      </div>
    </div>
  );
}

export interface HsTestItemResult {
  id: number;
  name: string;
  status: "pending" | "running" | "passed" | "failed";
  detail: string;
}

interface HsSuiteGlobalState {
  running: boolean;
  finished: boolean;
  passedCount: number;
  failedCount: number;
  results: HsTestItemResult[];
}

const INITIAL_TESTS: HsTestItemResult[] = [
  {
    id: 1,
    name: "1. Layout Manifest (__DINOU_LAYOUTS__) & Independent layout_functions / page_functions Props",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 2,
    name: "2. Sibling Soft Navigation (page.rsc only, 0 /____rsc_layout____ requests, layout state preserved)",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 3,
    name: "3. Client pageCache Deduplication (0 network hits) vs. <Link fresh> Cache Bypass",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 4,
    name: "4. Multi-Level Nested Layouts (/nested/page-1 ↔ page-2) & Parallel @slot Error Containment",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 5,
    name: "5. Dynamic Layout Params (dept/[deptId]): Intra-Param State Preservation vs. Inter-Param Switch",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 6,
    name: "6. Dynamic Layout validateParams Enforcement (HTTP 404 on /dept/invalid)",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 7,
    name: "7. Dynamic Layout getStaticPaths + allowISG: false (/locked/alpha vs /locked/unlisted)",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 8,
    name: "8. router.refresh() (Page-Only) vs. router.refresh({ layout: true }) + Query String Integrity",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 9,
    name: "9. Page Error Boundary (error.tsx) Isolation Inside <DinouPageSlot /> & Soft-Nav Recovery",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 10,
    name: "10. reset_layout Boundary (/reset-branch & /reset-branch/sub Unmount Ancestor Layout)",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 11,
    name: "11. no_layout Boundary (/no-layout-page Standalone Render & Clean Remount on Return)",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 12,
    name: "12. Surgical On-Demand Revalidation (revalidatePage vs. revalidateLayout vs. revalidateTag)",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 13,
    name: "13. Clock-Based Layout TTL (revalidate=1s) vs. Page TTL (revalidate=1s) Surgical Expiration",
    status: "pending",
    detail: "Waiting...",
  },
];

function getGlobalSuiteState(): HsSuiteGlobalState {
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
  if (!w.__HS_SUITE_STATE__) {
    w.__HS_SUITE_STATE__ = {
      running: false,
      finished: false,
      passedCount: 0,
      failedCount: 0,
      results: INITIAL_TESTS.map((t) => ({ ...t })),
    };
  }
  return w.__HS_SUITE_STATE__;
}

function notifySuiteUpdate(next: HsSuiteGlobalState) {
  if (typeof window === "undefined") return;
  (window as any).__HS_SUITE_STATE__ = next;
  window.dispatchEvent(new CustomEvent("hs-suite-update"));
}

async function waitForEl(id: string, timeoutMs = 10000): Promise<HTMLElement> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = document.getElementById(id);
    if (el) return el;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error(`Timeout waiting for #${id}`);
}

async function waitForTextChange(
  id: string,
  prevText: string,
  timeoutMs = 10000
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = document.getElementById(id);
    const txt = el?.textContent?.trim() ?? "";
    if (txt && txt !== prevText) return txt;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error(`Timeout waiting for #${id} text to change from "${prevText}"`);
}

function getText(id: string): string {
  return document.getElementById(id)?.textContent?.trim() ?? "";
}

function clickEl(id: string) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found to click`);
  el.click();
}

export function HsAutomatedSuiteRunner() {
  const [suiteState, setSuiteState] = useState<HsSuiteGlobalState>(() =>
    getGlobalSuiteState()
  );

  useEffect(() => {
    const handler = () => {
      setSuiteState({ ...getGlobalSuiteState() });
    };
    window.addEventListener("hs-suite-update", handler);
    setSuiteState({ ...getGlobalSuiteState() });
    return () => window.removeEventListener("hs-suite-update", handler);
  }, []);

  const startAutomatedSuite = async () => {
    const state: HsSuiteGlobalState = {
      running: true,
      finished: false,
      passedCount: 0,
      failedCount: 0,
      results: INITIAL_TESTS.map((t) => ({ ...t })),
    };
    notifySuiteUpdate(state);

    const setStep = (
      id: number,
      status: HsTestItemResult["status"],
      detail: string
    ) => {
      const idx = state.results.findIndex((r) => r.id === id);
      if (idx !== -1) {
        state.results[idx] = { ...state.results[idx], status, detail };
      }
      state.passedCount = state.results.filter((r) => r.status === "passed").length;
      state.failedCount = state.results.filter((r) => r.status === "failed").length;
      notifySuiteUpdate({ ...state, results: [...state.results] });
    };

    const runStep = async (id: number, fn: () => Promise<string>) => {
      setStep(id, "running", "Executing...");
      try {
        const detail = await fn();
        setStep(id, "passed", detail);
      } catch (err: any) {
        setStep(id, "failed", err?.message || String(err));
      }
    };

    const origFetch = window.fetch.bind(window);
    const fetchedUrls: string[] = [];
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const u =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : input.url;
      fetchedUrls.push(u);
      return origFetch(input, init);
    };

    try {
      if (window.location.pathname !== "/t-rigurous-hs") {
        (window as any).__DINOU_ROUTER_NAVIGATE__("/t-rigurous-hs");
      }
      await waitForEl("hs-index-page");

      // TEST 1
      await runStep(1, async () => {
        const rawLayouts: string[] = (window as any).__DINOU_LAYOUTS__ || [];
        const normLayouts = rawLayouts.map((l) =>
          l.startsWith("!")
            ? "!" + l.slice(1).replace(/^\/+/, "")
            : l.replace(/^\/+/, "")
        );
        const required = [
          "horizontal-segmentation-test",
          "horizontal-segmentation-test/nested",
          "horizontal-segmentation-test/reset-branch",
          "horizontal-segmentation-test/dept/[deptId]",
          "horizontal-segmentation-test/locked/[code]",
          "horizontal-segmentation-test/refresh-lab",
          "!horizontal-segmentation-test/no-layout-page",
        ];
        for (const req of required) {
          if (!normLayouts.includes(req)) {
            throw new Error(`Missing "${req}" in window.__DINOU_LAYOUTS__`);
          }
        }
        const layoutTitle = getText("hs-section-layout-title");
        const pageTitle = getText("hs-index-page-title");
        const pageProp = getText("hs-index-page-prop");
        if (layoutTitle !== "Horizontal Segmentation Section Shell") {
          throw new Error(`Unexpected layout title: ${layoutTitle}`);
        }
        if (pageTitle !== "HS Index Page" || pageProp !== "Page Prop: 101") {
          throw new Error(`Unexpected page props: ${pageTitle} / ${pageProp}`);
        }
        return `Verified ${required.length} layout manifest entries (including !no_layout) & independent layout/page props`;
      });

      // TEST 2
      await runStep(2, async () => {
        const curCount = Number(getText("hs-section-client-count") || "0");
        if (curCount === 0) {
          clickEl("hs-section-client-inc");
          clickEl("hs-section-client-inc");
          await new Promise((r) => setTimeout(r, 50));
        }
        const expectedCount = getText("hs-section-client-count");
        const mountId0 = getText("hs-section-mount-id");
        const layoutSeq0 = getText("hs-section-layout-seq");

        fetchedUrls.length = 0;
        clickEl("hs-link-sibling-a");
        await waitForEl("hs-sibling-a-page");

        const layoutReqs = fetchedUrls.filter((u) =>
          u.includes("/____rsc_layout____")
        );
        if (layoutReqs.length > 0) {
          throw new Error(
            `Expected 0 /____rsc_layout____ requests on sibling nav, got ${layoutReqs.length}`
          );
        }
        if (getText("hs-section-client-count") !== expectedCount) {
          throw new Error("Layout client count lost on sibling-a nav");
        }
        if (getText("hs-section-mount-id") !== mountId0) {
          throw new Error("Layout client component remounted on sibling-a nav");
        }
        if (getText("hs-section-layout-seq") !== layoutSeq0) {
          throw new Error("Layout server seq changed on sibling-a nav");
        }

        clickEl("hs-link-sibling-b");
        await waitForEl("hs-sibling-b-page");
        if (getText("hs-section-client-count") !== expectedCount) {
          throw new Error("Layout client count lost on sibling-b nav");
        }
        return `0 layout requests fired; Mount ID (${mountId0}), count (${expectedCount}), and Layout Seq (#${layoutSeq0}) preserved across siblings`;
      });

      // TEST 3
      await runStep(3, async () => {
        fetchedUrls.length = 0;
        clickEl("hs-link-sibling-a");
        await waitForEl("hs-sibling-a-page");
        const cachedSeq = getText("hs-sibling-a-seq");
        const payloadReqsCached = fetchedUrls.filter(
          (u) =>
            (u.includes("/____rsc_page") || u.includes("/____rsc_payload")) &&
            u.includes("/t-rigurous-hs/sibling-a")
        );
        if (payloadReqsCached.length !== 0) {
          throw new Error(
            `Expected 0 network requests on cached sibling-a revisit, got ${payloadReqsCached.length}`
          );
        }

        const mutRes = await hsMutateSiblingAOnly("fresh-link-verified");
        clickEl("hs-link-sibling-b");
        await waitForEl("hs-sibling-b-page");

        fetchedUrls.length = 0;
        clickEl("hs-link-sibling-a-fresh");
        await waitForEl("hs-sibling-a-page");
        const freshReqs = fetchedUrls.filter(
          (u) =>
            (u.includes("/____rsc_page") || u.includes("/____rsc_payload")) &&
            u.includes("/t-rigurous-hs/sibling-a")
        );
        if (freshReqs.length === 0) {
          throw new Error("Expected <Link fresh> to fetch fresh page.rsc payload");
        }
        const newSeq = getText("hs-sibling-a-seq");
        if (Number(newSeq) < mutRes.siblingASeq) {
          throw new Error(
            `Expected siblingASeq >= ${mutRes.siblingASeq}, got ${newSeq}`
          );
        }
        return `pageCache served repeat visit with 0 network hits (seq #${cachedSeq}); <Link fresh> bypassed cache (seq #${newSeq})`;
      });

      // TEST 4
      await runStep(4, async () => {
        const outerCount = getText("hs-section-client-count");
        clickEl("hs-link-nested-1");
        await waitForEl("hs-nested-page-1");
        await waitForEl("hs-nested-layout");

        await waitForEl("hs-badge-slot-content");
        await waitForEl("hs-broken-slot-fallback");

        clickEl("hs-nested-client-inc");
        await new Promise((r) => setTimeout(r, 50));
        const nestedCount = getText("hs-nested-client-count");
        const nestedSeq0 = getText("hs-nested-layout-seq");

        fetchedUrls.length = 0;
        clickEl("hs-link-nested-2");
        await waitForEl("hs-nested-page-2");

        const nestedLayoutReqs = fetchedUrls.filter((u) =>
          u.includes("/____rsc_layout____")
        );
        if (nestedLayoutReqs.length !== 0) {
          throw new Error(
            `Expected 0 layout requests between /nested/page-1 and /nested/page-2, got ${nestedLayoutReqs.length}`
          );
        }
        if (getText("hs-section-client-count") !== outerCount) {
          throw new Error("Outer layout client state lost in nested nav");
        }
        if (getText("hs-nested-client-count") !== nestedCount) {
          throw new Error("Nested layout client state lost between page-1 and page-2");
        }
        if (getText("hs-nested-layout-seq") !== nestedSeq0) {
          throw new Error("Nested layout server seq changed between page-1 and page-2");
        }
        return `Both L1 (count=${outerCount}) & L2 (count=${nestedCount}) layouts preserved; @badge rendered & @brokenSlot isolated in error.tsx`;
      });

      // TEST 5
      await runStep(5, async () => {
        clickEl("hs-link-dept-eng");
        await waitForEl("hs-dept-index-page");
        if (getText("hs-dept-param") !== "Dept Param: eng") {
          throw new Error(`Expected Dept Param: eng, got ${getText("hs-dept-param")}`);
        }
        clickEl("hs-dept-client-inc");
        await new Promise((r) => setTimeout(r, 50));
        const deptCount = getText("hs-dept-client-count");
        const deptMount0 = getText("hs-dept-mount-id");

        clickEl("hs-link-dept-eng-members");
        await waitForEl("hs-dept-members-page");
        if (getText("hs-dept-client-count") !== deptCount) {
          throw new Error("Dept layout state lost on intra-param navigation (/dept/eng/members)");
        }
        if (getText("hs-dept-mount-id") !== deptMount0) {
          throw new Error("Dept layout remounted on intra-param navigation");
        }

        clickEl("hs-link-dept-design");
        await waitForEl("hs-dept-index-page");
        const start = Date.now();
        while (
          getText("hs-dept-param") !== "Dept Param: design" &&
          Date.now() - start < 8000
        ) {
          await new Promise((r) => setTimeout(r, 40));
        }
        if (getText("hs-dept-param") !== "Dept Param: design") {
          throw new Error(
            `Expected Dept Param: design after param switch, got ${getText("hs-dept-param")}`
          );
        }
        return `Intra-param nav (/dept/eng -> /dept/eng/members) kept state (count=${deptCount}); inter-param nav (/dept/design) updated layout props`;
      });

      // TEST 6
      await runStep(6, async () => {
        const resPage = await origFetch("/t-rigurous-hs/dept/invalid");
        const resLayout = await origFetch(
          "/____rsc_layout____/t-rigurous-hs/dept/invalid"
        );
        if (resPage.status !== 404 || resLayout.status !== 404) {
          throw new Error(
            `Expected 404 for invalid layout param, got HTML=${resPage.status}, RSC_LAYOUT=${resLayout.status}`
          );
        }
        return `Both SSR (/dept/invalid -> 404) and /____rsc_layout____ (/dept/invalid -> 404) enforced layout validateParams`;
      });

      // TEST 7
      await runStep(7, async () => {
        clickEl("hs-link-locked-alpha");
        await waitForEl("hs-locked-page");
        if (getText("hs-locked-page") !== "Code: alpha") {
          throw new Error(`Expected Code: alpha, got ${getText("hs-locked-page")}`);
        }
        const unlistedRes = await origFetch(
          "/t-rigurous-hs/locked/unlisted"
        );
        if (unlistedRes.status !== 404 && unlistedRes.status !== 200) {
          throw new Error(`Unexpected status ${unlistedRes.status} for /locked/unlisted`);
        }
        return `Pre-generated /locked/alpha rendered (${getText("hs-locked-label")}); /locked/unlisted returned HTTP ${unlistedRes.status}`;
      });

      // TEST 8
      await runStep(8, async () => {
        clickEl("hs-link-refresh-lab");
        await waitForEl("hs-refresh-lab-page");
        if (getText("hs-refresh-query-filter") !== "active") {
          throw new Error(
            `Expected query filter="active", got "${getText("hs-refresh-query-filter")}"`
          );
        }
        const outerCount = getText("hs-section-client-count");
        const layoutSeq0 = getText("hs-refresh-layout-seq");
        const pageSeq0 = getText("hs-refresh-page-seq");

        clickEl("hs-btn-refresh-page-only");
        const pageSeq1 = await waitForTextChange("hs-refresh-page-seq", pageSeq0);
        const layoutSeqAfterPageRefresh = getText("hs-refresh-layout-seq");
        if (layoutSeqAfterPageRefresh !== layoutSeq0) {
          throw new Error(
            `router.refresh() should NOT re-run layout! Before=${layoutSeq0}, After=${layoutSeqAfterPageRefresh}`
          );
        }
        if (getText("hs-refresh-query-filter") !== "active") {
          throw new Error(
            `Query param filter corrupted after router.refresh(): "${getText("hs-refresh-query-filter")}"`
          );
        }

        clickEl("hs-btn-refresh-with-layout");
        const layoutSeq2 = await waitForTextChange("hs-refresh-layout-seq", layoutSeq0);
        const pageSeq2 = await waitForTextChange("hs-refresh-page-seq", pageSeq1);
        if (getText("hs-section-client-count") !== outerCount) {
          throw new Error("Section layout client state lost during router.refresh({ layout: true })");
        }
        return `router.refresh() updated page (#${pageSeq0}→#${pageSeq1}) while keeping layout (#${layoutSeq0}) & ?filter=active; { layout: true } updated both (#${layoutSeq2}, #${pageSeq2})`;
      });

      // TEST 9
      await runStep(9, async () => {
        clickEl("hs-link-error-healthy");
        await waitForEl("hs-error-healthy-page");
        const outerCountBefore = getText("hs-section-client-count");

        clickEl("hs-link-error-broken");
        await waitForEl("hs-page-error-boundary");

        if (!document.getElementById("hs-section-layout")) {
          throw new Error("Parent layout unmounted when child page crashed!");
        }
        if (getText("hs-section-client-count") !== outerCountBefore) {
          throw new Error("Parent layout client state lost when child page crashed!");
        }

        clickEl("hs-link-error-healthy");
        await waitForEl("hs-error-healthy-page");
        return `Page crash caught inside <DinouPageSlot /> (#hs-page-error-boundary); parent layout stayed alive (count=${outerCountBefore}) and recovered`;
      });

      // TEST 10
      await runStep(10, async () => {
        clickEl("hs-link-reset");
        try {
          await waitForEl("hs-reset-layout");
          await waitForEl("hs-reset-root-page");

          if (document.getElementById("hs-section-layout")) {
            throw new Error("#hs-section-layout should NOT be mounted inside reset_layout branch!");
          }
          if (document.body.getAttribute("data-hydrated") !== "true") {
            throw new Error("body[data-hydrated=true] missing after reset_layout navigation");
          }

          clickEl("hs-reset-client-inc");
          await new Promise((r) => setTimeout(r, 50));
          const resetCount = getText("hs-reset-client-count");

          clickEl("hs-reset-link-sub");
          await waitForEl("hs-reset-sub-page");
          if (getText("hs-reset-client-count") !== resetCount) {
            throw new Error("Reset branch layout state lost on subpage navigation");
          }
          return `reset_layout unmounted parent #hs-section-layout, preserved #hs-reset-layout state (count=${resetCount}) to /sub, and kept data-hydrated="true"`;
        } finally {
          if (!document.getElementById("hs-index-page")) {
            if (document.getElementById("hs-reset-link-back")) {
              clickEl("hs-reset-link-back");
            } else if (typeof (window as any).__DINOU_ROUTER_NAVIGATE__ === "function") {
              (window as any).__DINOU_ROUTER_NAVIGATE__("/t-rigurous-hs");
            }
            await waitForEl("hs-index-page");
          }
        }
      });

      // TEST 11
      await runStep(11, async () => {
        clickEl("hs-link-no-layout");
        try {
          await waitForEl("hs-no-layout-root");

          if (document.getElementById("hs-section-layout")) {
            throw new Error("#hs-section-layout should NOT be mounted on no_layout page!");
          }
          if (document.getElementById("hs-reset-layout")) {
            throw new Error("#hs-reset-layout should NOT be mounted on no_layout page!");
          }
          if (document.body.getAttribute("data-hydrated") !== "true") {
            throw new Error("body[data-hydrated=true] missing on no_layout page");
          }

          return `no_layout rendered #hs-no-layout-root with 0 ancestor layouts and cleanly remounted #hs-section-layout on return`;
        } finally {
          if (!document.getElementById("hs-index-page")) {
            if (document.getElementById("hs-no-layout-back-link")) {
              clickEl("hs-no-layout-back-link");
            } else if (typeof (window as any).__DINOU_ROUTER_NAVIGATE__ === "function") {
              (window as any).__DINOU_ROUTER_NAVIGATE__("/t-rigurous-hs");
            }
            await waitForEl("hs-section-layout");
            await waitForEl("hs-index-page");
          }
        }
      });

      // TEST 12
      await runStep(12, async () => {
        const layoutSeq0 = getText("hs-section-layout-seq");
        const pageSeq0 = getText("hs-index-page-seq");

        clickEl("hs-btn-reval-page-only");
        const pageSeq1 = await waitForTextChange("hs-index-page-seq", pageSeq0);
        const layoutSeq1 = getText("hs-section-layout-seq");
        if (layoutSeq1 !== layoutSeq0) {
          throw new Error(
            `revalidatePage should not update layout seq (${layoutSeq0} -> ${layoutSeq1})`
          );
        }

        clickEl("hs-btn-reval-layout-only");
        const layoutSeq2 = await waitForTextChange("hs-section-layout-seq", layoutSeq1);

        clickEl("hs-btn-reval-tag-layout-surgical");
        const layoutSeq3 = await waitForTextChange("hs-section-layout-seq", layoutSeq2);

        // Verify lazy index.html re-composition on hard GET (F5) for both index and unvisited sibling-b:
        const [indexHtmlRes, siblingBHtmlRes] = await Promise.all([
          origFetch("/t-rigurous-hs", { headers: { Accept: "text/html" } }),
          origFetch("/t-rigurous-hs/sibling-b", { headers: { Accept: "text/html" } }),
        ]);
        const [indexHtml, siblingBHtml] = await Promise.all([
          indexHtmlRes.text(),
          siblingBHtmlRes.text(),
        ]);
        if (!indexHtml.includes(`id="hs-section-layout-seq">${layoutSeq3}<`)) {
          throw new Error(`Lazy index.html re-composition failed on /t-rigurous-hs: expected layout seq #${layoutSeq3} in SSR HTML`);
        }
        if (!indexHtml.includes(`id="hs-index-page-seq">${pageSeq1}<`)) {
          throw new Error(`Lazy index.html re-composition lost page.rsc state on /t-rigurous-hs: expected page seq #${pageSeq1}`);
        }
        if (!siblingBHtml.includes(`id="hs-section-layout-seq">${layoutSeq3}<`)) {
          throw new Error(`Lazy index.html re-composition failed on child /sibling-b: expected layout seq #${layoutSeq3} in SSR HTML`);
        }
        if (!siblingBHtml.includes(`id="hs-sibling-b-seq">100<`)) {
          throw new Error(`Lazy index.html re-composition unexpectedly re-executed /sibling-b page.tsx!`);
        }

        return `revalidatePage (#${pageSeq0}→#${pageSeq1}), revalidateLayout & surgical tag (#${layoutSeq0}→#${layoutSeq2}→#${layoutSeq3}), + lazy F5 HTML re-composed (${layoutSeq3} + preserved page.rsc)`;
      });

      // TEST 13: Clock-Based Layout TTL (1s) vs. Page TTL (1s) Surgical Expiration
      await runStep(13, async () => {
        // Reset TTL routes to clean 100 baseline and start fresh 1s clock window
        await hsMutateRawState({
          ttlLayoutSeq: 100,
          ttlPageSeq: 100,
          ttlPageOnlySeq: 100,
        });
        await hsRevalidateTtlRoutes();

        const curSectionLayoutSeq = getText("hs-section-layout-seq");

        // 13a. Layout TTL (1s) expires while child page TTL (3600s) is valid; poison child page to 999
        // Also test Page-Only TTL (1s) under long-lived section layout (poison sectionLayoutSeq to 999)
        await hsMutateRawState({
          ttlLayoutSeq: 601,
          ttlPageSeq: 999,
          ttlPageOnlySeq: 602,
          sectionLayoutSeq: 999,
        });

        await new Promise((r) => setTimeout(r, 1250));

        // Trigger TTL expiry on both /ttl-isr (layout TTL=1s) and /ttl-page-only (page TTL=1s)
        await Promise.all([
          origFetch("/t-rigurous-hs/ttl-isr", { headers: { Accept: "text/html" } }),
          origFetch("/t-rigurous-hs/ttl-page-only", { headers: { Accept: "text/html" } }),
        ]);
        await new Promise((r) => setTimeout(r, 300));

        const [ttlIsrHtml, ttlPageOnlyHtml] = await Promise.all([
          origFetch("/t-rigurous-hs/ttl-isr", { headers: { Accept: "text/html" } }).then((r) => r.text()),
          origFetch("/t-rigurous-hs/ttl-page-only", { headers: { Accept: "text/html" } }).then((r) => r.text()),
        ]);

        await hsMutateRawState({
          ttlPageSeq: 100,
          sectionLayoutSeq: Number(curSectionLayoutSeq) || 100,
        });

        if (!ttlIsrHtml.includes('id="hs-ttl-layout-seq">601<')) {
          throw new Error(`Expected expired TTL layout (1s) to update to 601 in /ttl-isr HTML`);
        }
        if (!ttlIsrHtml.includes('id="hs-ttl-page-seq">100<')) {
          throw new Error(`Layout TTL expiry re-executed long-lived child page (expected 100, not 999)!`);
        }
        if (!ttlPageOnlyHtml.includes('id="hs-ttl-page-only-seq">602<')) {
          throw new Error(`Expected expired TTL page (1s) to update to 602 in /ttl-page-only HTML`);
        }
        if (!ttlPageOnlyHtml.includes(`id="hs-section-layout-seq">${curSectionLayoutSeq}<`)) {
          throw new Error(`Page TTL expiry re-executed section layout (expected ${curSectionLayoutSeq}, not 999)!`);
        }

        return `Layout TTL=1s updated layout.rsc & index.html (601) keeping child page=100; Page TTL=1s updated page.rsc & index.html (602) keeping section layout=${curSectionLayoutSeq}`;
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
      id="hs-automated-suite-panel"
      className="p-4 my-3 rounded-xl bg-slate-900/95 border border-indigo-500/40 space-y-3 text-xs shadow-lg"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-indigo-300">
            Automated Horizontal Segmentation E2E Stress Runner (12 Scenarios)
          </h2>
          <p className="text-slate-400">
            Executes live soft navigations, network payload assertions, layout state probes,{" "}
            <code>reset_layout</code>, <code>no_layout</code>, <code>router.refresh</code>, and surgical revalidations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {suiteState.finished && (
            <span
              id="hs-suite-summary-badge"
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
            id="hs-run-automated-suite"
            type="button"
            disabled={suiteState.running}
            onClick={startAutomatedSuite}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold cursor-pointer shadow"
          >
            {suiteState.running
              ? "Running Automated Suite..."
              : "▶ Run All 12 Horizontal Segmentation Tests"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
        {suiteState.results.map((item) => (
          <div
            key={item.id}
            id={`hs-test-row-${item.id}`}
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
                id={`hs-test-status-${item.id}`}
                className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-black/30 font-mono"
              >
                {item.status}
              </span>
            </div>
            <div
              id={`hs-test-detail-${item.id}`}
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
