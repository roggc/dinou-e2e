"use client";

import { useState, useEffect } from "react";
import { refreshSlot, useRouter } from "dinou";
import {
  tsBumpKeys,
  tsMutateOnly,
  tsResetAllAndRevalidate,
  tsRunRevalidateTag,
  tsRunRevalidatePage,
  tsRunRevalidateLayout,
  tsEchoAction,
} from "./ts-actions";

export function TsClientStateBox({ idPrefix }: { idPrefix: string }) {
  const [count, setCount] = useState(0);
  const [text, setText] = useState("");
  const [mountId, setMountId] = useState("ssr");

  useEffect(() => {
    setMountId(Math.random().toString(36).slice(2, 8));
  }, []);

  return (
    <div
      id={`${idPrefix}-client-box`}
      className="flex flex-wrap items-center gap-2.5 p-2 my-1.5 rounded-lg bg-slate-800/90 border border-slate-700 text-xs"
    >
      <span className="font-semibold text-cyan-300">State ({idPrefix})</span>
      <span className="text-slate-400">
        Mount:{" "}
        <code id={`${idPrefix}-mount-id`} className="text-amber-300">
          {mountId}
        </code>
      </span>
      <div className="flex items-center gap-1.5">
        <span>Count:</span>
        <strong
          id={`${idPrefix}-client-count`}
          className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-200 border border-cyan-700"
        >
          {count}
        </strong>
        <button
          id={`${idPrefix}-client-inc`}
          type="button"
          onClick={() => setCount((c) => c + 1)}
          className="px-2 py-0.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium cursor-pointer"
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
        className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-100"
      />
    </div>
  );
}

export function TsHoleSlotClientWidget({
  slotSeq,
  onServerEcho,
}: {
  slotSeq: number;
  onServerEcho?: (msg: string) => Promise<{ ok: boolean; echo: string; at: number }>;
}) {
  const [clicks, setClicks] = useState(0);
  const [directRes, setDirectRes] = useState("idle");
  const [propRes, setPropRes] = useState(
    typeof onServerEcho === "function" ? "fn-ready" : "fn-missing"
  );

  return (
    <div
      id="ts-hole-slot-client-widget"
      className="p-2.5 mt-2 rounded-lg bg-slate-950 border border-fuchsia-600/60 text-xs space-y-1.5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span>
          Widget Slot Seq:{" "}
          <strong id="ts-hole-slot-widget-seq" className="text-fuchsia-300">
            {slotSeq}
          </strong>
        </span>
        <span>
          Widget Clicks:{" "}
          <strong id="ts-hole-slot-widget-clicks" className="text-emerald-300">
            {clicks}
          </strong>
        </span>
        <button
          id="btn-ts-hole-slot-widget-inc"
          type="button"
          onClick={() => setClicks((c) => c + 1)}
          className="px-2 py-0.5 rounded bg-fuchsia-700 hover:bg-fuchsia-600 text-white cursor-pointer"
        >
          +1 Widget Click
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span>
          Direct Action:{" "}
          <code id="ts-hole-slot-direct-res" className="text-amber-300">
            {directRes}
          </code>
        </span>
        <button
          id="btn-ts-hole-slot-direct-action"
          type="button"
          onClick={async () => {
            const r = await tsEchoAction(`direct-${slotSeq}`);
            setDirectRes(r.echo);
          }}
          className="px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-white cursor-pointer"
        >
          Call Direct Action
        </button>
        <span>
          Prop Action:{" "}
          <code id="ts-hole-slot-prop-res" className="text-amber-300">
            {propRes}
          </code>
        </span>
        <button
          id="btn-ts-hole-slot-prop-action"
          type="button"
          onClick={async () => {
            if (typeof onServerEcho !== "function") {
              setPropRes("err:not-a-function");
              return;
            }
            const r = await onServerEcho(`prop-${slotSeq}`);
            setPropRes(`ok:${r.echo}`);
          }}
          className="px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-white cursor-pointer"
        >
          Call Prop Action
        </button>
      </div>
    </div>
  );
}

export function TsManualControls() {
  const router = useRouter();
  return (
    <div id="ts-manual-controls" className="flex flex-wrap gap-2 my-2 text-xs">
      <button
        id="ts-btn-router-refresh-page"
        type="button"
        onClick={() => router.refresh()}
        className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white cursor-pointer"
      >
        router.refresh() (Page Only)
      </button>
      <button
        id="ts-btn-router-refresh-layout"
        type="button"
        onClick={() => router.refresh({ layout: true })}
        className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white cursor-pointer"
      >
        router.refresh(&#123; layout: true &#125;)
      </button>
      <button
        id="ts-btn-live-refresh-layout-slot"
        type="button"
        onClick={() => router.refreshSlot("ts-layout-shell-slot-tag", { fresh: true })}
        className="px-2.5 py-1 rounded bg-purple-700 hover:bg-purple-600 text-white cursor-pointer"
      >
        refreshSlot(&quot;ts-layout-shell-slot-tag&quot;)
      </button>
      <button
        id="ts-btn-live-refresh-ppr-a-shell-slot"
        type="button"
        onClick={() => refreshSlot("ts-ppr-a-shell-slot", { fresh: true })}
        className="px-2.5 py-1 rounded bg-indigo-700 hover:bg-indigo-600 text-white cursor-pointer"
      >
        refreshSlot(&quot;ts-ppr-a-shell-slot&quot;)
      </button>
      <button
        id="ts-btn-live-refresh-ppr-a-hole-slot"
        type="button"
        onClick={() => refreshSlot("ts-ppr-a-hole-slot-tag", { fresh: true })}
        className="px-2.5 py-1 rounded bg-fuchsia-700 hover:bg-fuchsia-600 text-white cursor-pointer"
      >
        refreshSlot(&quot;ts-ppr-a-hole-slot-tag&quot;)
      </button>
    </div>
  );
}

export interface TsTestItemResult {
  id: number;
  name: string;
  status: "pending" | "running" | "passed" | "failed";
  detail: string;
}

interface TsSuiteGlobalState {
  running: boolean;
  finished: boolean;
  passedCount: number;
  failedCount: number;
  results: TsTestItemResult[];
}

const INITIAL_TS_TESTS: TsTestItemResult[] = [
  {
    id: 1,
    name: "1. Raw PPR Stream Split (Layout + Layout Slot + Page Shell + Shell Slot in Shell vs. Dynamic Hole + Hole Slot in <template>) & Static Opt-Out",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 2,
    name: "2. PPR Static Shell Immutability vs. Live Dynamic Hole on Unrevalidated Mutation (Zero Hydration/RSC Drift)",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 3,
    name: "3. Cross-Mode Horizontal Soft Navigation (PPR A → PPR B → Static A → Static B → PPR B → PPR A: 0 Layout Fetches, State Preserved)",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 4,
    name: "4. Live Vertical refreshSlot Across Layout Slot, PPR Shell Slot & PPR Hole Slot (Preserving Local Client useState & Server Actions)",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 5,
    name: "5. Nested <DinouCacheSlot> (Outer + Inner) Inside Dynamic PPR Hole: revalidateTag(inner) Refreshes Inner While Preserving Outer & Shell",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 6,
    name: "6. Surgical revalidateTag('ts-ppr-a-hole-slot-tag'): Updates Hole Slot Only Without Re-rendering PPR Static Shell or Layout",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 7,
    name: "7. Surgical revalidateTag('ts-ppr-a-shell-slot-tag'): Updates PPR Static Shell Slot & Preserves Hole Streaming Without Re-executing Layout",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 8,
    name: "8. Surgical revalidatePage('/t-rigurous-triple-sinergy') & revalidateTag('ts-ppr-a-page-tag') on PPR Route: Updates Page Shell Without Re-executing Layout or Shell Slot",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 9,
    name: "9. Surgical revalidateTag('ts-layout-shell-slot-tag'): Updates Layout Slot & Re-composes Both Revalidated Static Child & PPR Child HTML",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 10,
    name: "10. revalidateLayout('/t-rigurous-triple-sinergy') & revalidateTag('ts-layout-tag'): Lazy HTML Re-composition Across Both PPR (shell.html) & Static (index.html) Children",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 11,
    name: "11. Multi-Level Nested Layout (L1 PPR + L2 Nested) Soft Navigation & Ancestor revalidateLayout Cascade to Nested PPR & Static Children",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 12,
    name: "12. router.refresh() vs. router.refresh({ layout: true }) with Query Params (?mode=live) on PPR Route + no_layout & reset_layout PPR Boundaries",
    status: "pending",
    detail: "Waiting...",
  },
  {
    id: 13,
    name: "13. Clock-Based <DinouCacheSlot revalidate={1}> TTL Expiration in PPR Static Shell & Dynamic Hole Preserving Segmented Layout & Page",
    status: "pending",
    detail: "Waiting...",
  },
];

function getGlobalTsSuiteState(): TsSuiteGlobalState {
  if (typeof window === "undefined") {
    return {
      running: false,
      finished: false,
      passedCount: 0,
      failedCount: 0,
      results: INITIAL_TS_TESTS,
    };
  }
  const w = window as any;
  if (!w.__TS_SUITE_STATE__) {
    w.__TS_SUITE_STATE__ = {
      running: false,
      finished: false,
      passedCount: 0,
      failedCount: 0,
      results: INITIAL_TS_TESTS.map((t) => ({ ...t })),
    };
  }
  return w.__TS_SUITE_STATE__;
}

function notifyTsSuiteUpdate(next: TsSuiteGlobalState) {
  if (typeof window === "undefined") return;
  (window as any).__TS_SUITE_STATE__ = next;
  window.dispatchEvent(new CustomEvent("ts-suite-update"));
}

async function waitForEl(id: string, timeoutMs = 12000): Promise<HTMLElement> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = document.getElementById(id);
    if (el) return el;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error(`Timeout waiting for #${id}`);
}

async function waitForText(
  id: string,
  expected: string,
  timeoutMs = 12000
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = document.getElementById(id);
    const txt = el?.textContent?.trim() ?? "";
    if (txt === expected) return txt;
    await new Promise((r) => setTimeout(r, 40));
  }
  const actual = document.getElementById(id)?.textContent?.trim() ?? "<missing>";
  throw new Error(`Timeout waiting for #${id} === "${expected}" (got "${actual}")`);
}

function getText(id: string): string {
  return document.getElementById(id)?.textContent?.trim() ?? "";
}

function clickEl(id: string) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found to click`);
  el.click();
}

function extractIdValueFromHtml(html: string, id: string): string | null {
  const re = new RegExp(`id="${id}"[^>]*>([^<]+)<`);
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

export function TsAutomatedSuiteRunner() {
  const [suiteState, setSuiteState] = useState<TsSuiteGlobalState>(() =>
    getGlobalTsSuiteState()
  );

  useEffect(() => {
    const handler = () => {
      setSuiteState({ ...getGlobalTsSuiteState() });
    };
    window.addEventListener("ts-suite-update", handler);
    setSuiteState({ ...getGlobalTsSuiteState() });
    return () => window.removeEventListener("ts-suite-update", handler);
  }, []);

  const startAutomatedSuite = async () => {
    const state: TsSuiteGlobalState = {
      running: true,
      finished: false,
      passedCount: 0,
      failedCount: 0,
      results: INITIAL_TS_TESTS.map((t) => ({ ...t })),
    };
    notifyTsSuiteUpdate(state);

    const setStep = (
      id: number,
      status: TsTestItemResult["status"],
      detail: string
    ) => {
      const idx = state.results.findIndex((r) => r.id === id);
      if (idx !== -1) {
        state.results[idx] = { ...state.results[idx], status, detail };
      }
      state.passedCount = state.results.filter((r) => r.status === "passed").length;
      state.failedCount = state.results.filter((r) => r.status === "failed").length;
      notifyTsSuiteUpdate({ ...state, results: [...state.results] });
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

    const isProdMode =
      typeof window !== "undefined" &&
      typeof (window as any).__DINOU_STRICT_MODE__ === "undefined";

    try {
      // Ensure clean baseline state (all counters = 100)
      await tsResetAllAndRevalidate();
      if (window.location.pathname !== "/t-rigurous-triple-sinergy") {
        (window as any).__DINOU_ROUTER_NAVIGATE__("/t-rigurous-triple-sinergy", { fresh: true });
      } else {
        (window as any).__DINOU_ROUTER_REFRESH__({ layout: true });
      }
      await waitForEl("ts-ppr-a-page");
      await waitForEl("ts-ppr-a-hole-resolved");
      await waitForText("ts-layout-seq", "100");
      await waitForText("ts-ppr-a-page-seq", "100");

      // =========================================================================
      // SCENARIO 1: Raw PPR Stream Split & Tri-State PPR Inheritance Opt-Out
      // =========================================================================
      await runStep(1, async () => {
        const [pprHtmlRes, staticHtmlRes] = await Promise.all([
          origFetch("/t-rigurous-triple-sinergy?mode=raw-check", {
            headers: { Accept: "text/html" },
          }),
          origFetch("/t-rigurous-triple-sinergy/static-a", {
            headers: { Accept: "text/html" },
          }),
        ]);
        const [pprHtml, staticHtml] = await Promise.all([
          pprHtmlRes.text(),
          staticHtmlRes.text(),
        ]);

        const splitIdx = pprHtml.indexOf('<template id="ppr-content-');
        if (isProdMode && splitIdx === -1) {
          throw new Error(
            'Expected PPR HTML response on /t-rigurous-triple-sinergy to contain streamed <template id="ppr-content-...">'
          );
        }
        const shellPart = splitIdx === -1 ? pprHtml : pprHtml.slice(0, splitIdx);
        const streamPart = splitIdx === -1 ? pprHtml : pprHtml.slice(splitIdx);

        if (extractIdValueFromHtml(shellPart, "ts-layout-seq") !== "100") {
          throw new Error("Layout seq (#ts-layout-seq=100) missing from static shell prelude");
        }
        if (extractIdValueFromHtml(shellPart, "ts-layout-slot-seq") !== "100") {
          throw new Error("Layout slot (#ts-layout-slot-seq=100) missing from static shell prelude");
        }
        if (extractIdValueFromHtml(shellPart, "ts-ppr-a-page-seq") !== "100") {
          throw new Error("PPR A page shell (#ts-ppr-a-page-seq=100) missing from static shell prelude");
        }
        if (extractIdValueFromHtml(shellPart, "ts-ppr-a-shell-slot-seq") !== "100") {
          throw new Error("PPR A shell slot (#ts-ppr-a-shell-slot-seq=100) missing from static shell prelude");
        }
        if (isProdMode) {
          if (!shellPart.includes('id="ts-ppr-a-hole-fallback"')) {
            throw new Error("PPR A Suspense fallback (#ts-ppr-a-hole-fallback) missing from static shell prelude");
          }
          if (shellPart.includes('id="ts-ppr-a-hole-resolved"')) {
            throw new Error("Dynamic hole (#ts-ppr-a-hole-resolved) leaked into static shell prelude!");
          }
        }
        if (!streamPart.includes('id="ts-ppr-a-hole-resolved"')) {
          throw new Error("Dynamic hole (#ts-ppr-a-hole-resolved) missing from streamed <template>!");
        }
        if (extractIdValueFromHtml(streamPart, "ts-ppr-a-hole-query") !== "raw-check") {
          throw new Error("Dynamic hole query param (raw-check) missing from streamed <template>!");
        }
        if (extractIdValueFromHtml(streamPart, "ts-ppr-a-hole-slot-seq") !== "100") {
          throw new Error("Dynamic hole <DinouCacheSlot> (#ts-ppr-a-hole-slot-seq=100) missing from streamed <template>!");
        }

        // Verify /t-rigurous-triple-sinergy/static-a opted out of PPR via export const ppr = false
        if (
          staticHtml.includes('data-ppr-hole=') ||
          staticHtml.includes('<template id="ppr-content-')
        ) {
          throw new Error(
            "/t-rigurous-triple-sinergy/static-a has export const ppr = false but emitted PPR holes!"
          );
        }
        if (!staticHtml.includes('id="ts-static-a-page-seq">100<')) {
          throw new Error("/t-rigurous-triple-sinergy/static-a missing static page seq 100");
        }

        return "Verified static shell (layout + layoutSlot + pageShell + pageShellSlot + fallback) vs streamed <template> (dynamic hole + holeSlot) & static-a ppr=false opt-out";
      });

      // =========================================================================
      // SCENARIO 2: PPR Static Shell Immutability vs. Live Dynamic Hole on Unrevalidated Mutation
      // =========================================================================
      await runStep(2, async () => {
        // Mutate layoutSeq (100->101), pprAPageSeq (100->101), and pprAHoleSeq (100->101) WITHOUT revalidating!
        await tsMutateOnly({
          layoutSeq: isProdMode ? 101 : 100,
          pprAPageSeq: isProdMode ? 101 : 100,
          pprAHoleSeq: 101,
        });

        try {
          // 1. Check raw HTML GET: shell must remain 100, hole must stream 101
          const htmlRes = await origFetch("/t-rigurous-triple-sinergy?mode=unreval", {
            headers: { Accept: "text/html" },
          });
          const html = await htmlRes.text();
          const rawLayoutSeq = extractIdValueFromHtml(html, "ts-layout-seq");
          const rawPageSeq = extractIdValueFromHtml(html, "ts-ppr-a-page-seq");
          const rawHoleSeq = extractIdValueFromHtml(html, "ts-ppr-a-hole-seq");
          const rawHoleSlotSeq = extractIdValueFromHtml(html, "ts-ppr-a-hole-slot-seq");

          if (rawLayoutSeq !== "100" || rawPageSeq !== "100") {
            throw new Error(
              `Unrevalidated mutation leaked into PPR static shell HTML! Expected layout=100, page=100, got layout=${rawLayoutSeq}, page=${rawPageSeq}`
            );
          }
          if (rawHoleSeq !== "101") {
            throw new Error(
              `Dynamic PPR hole did not reflect live mutation! Expected holeSeq=101, got ${rawHoleSeq}`
            );
          }
          if (rawHoleSlotSeq !== "100") {
            throw new Error(
              `Cached <DinouCacheSlot> inside dynamic hole did not hit cache! Expected 100, got ${rawHoleSlotSeq}`
            );
          }

          // 2. Check /____rsc_layout____ and /____rsc_page____ (used by client hydration and router.refresh()):
          // Since neither layout nor PPR static shell was revalidated, router.refresh({ layout: true })
          // must NOT overwrite the cached layout (100) or cached PPR static shell (100) with 101!
          clickEl("ts-btn-router-refresh-layout");
          await waitForText("ts-ppr-a-hole-seq", "101");
          await new Promise((r) => setTimeout(r, 100));

          const domLayoutSeq = getText("ts-layout-seq");
          const domPageSeq = getText("ts-ppr-a-page-seq");
          const domHoleSeq = getText("ts-ppr-a-hole-seq");
          const domHoleSlotSeq = getText("ts-ppr-a-hole-slot-seq");

          if (domLayoutSeq !== "100") {
            throw new Error(
              `Client /____rsc_layout____ bypassed cached layout.rsc on PPR layout! Expected layoutSeq=100, got ${domLayoutSeq}`
            );
          }
          if (domPageSeq !== "100") {
            throw new Error(
              `Client /____rsc_page____ re-executed static shell of PPR page without revalidation! Expected pageSeq=100, got ${domPageSeq} (causes hydration mismatch against shell.html!)`
            );
          }
          if (domHoleSeq !== "101" || domHoleSlotSeq !== "100") {
            throw new Error(
              `Unexpected hole state after refresh: holeSeq=${domHoleSeq}, holeSlotSeq=${domHoleSlotSeq}`
            );
          }

          return `Static shell stayed immutable (layout=100, page=100) across both SSR HTML & RSC endpoints while dynamic hole updated live (hole=101, cachedHoleSlot=100)`;
        } finally {
          // Restore layoutSeq & pprAPageSeq in state file to 100 so they match cache
          await tsMutateOnly({ layoutSeq: 100, pprAPageSeq: 100 });
        }
      });

      // =========================================================================
      // SCENARIO 3: Cross-Mode Horizontal Soft Navigation (PPR A <-> PPR B <-> Static A <-> Static B)
      // =========================================================================
      await runStep(3, async () => {
        if (Number(getText("ts-layout-client-count") || "0") === 0) {
          clickEl("ts-layout-client-inc");
          clickEl("ts-layout-client-inc");
        }
        if (Number(getText("ts-layout-slot-client-count") || "0") === 0) {
          clickEl("ts-layout-slot-client-inc");
        }
        await new Promise((r) => setTimeout(r, 50));

        const expectedLayoutCount = getText("ts-layout-client-count");
        const expectedLayoutSlotCount = getText("ts-layout-slot-client-count");
        const layoutMount0 = getText("ts-layout-mount-id");
        const layoutSlotMount0 = getText("ts-layout-slot-mount-id");

        fetchedUrls.length = 0;

        // 1. PPR A -> PPR B
        clickEl("ts-link-ppr-b");
        await waitForEl("ts-ppr-b-page");
        await waitForEl("ts-ppr-b-hole-resolved");

        // 2. PPR B -> Static A
        clickEl("ts-link-static-a");
        await waitForEl("ts-static-a-page");

        // 3. Static A -> Static B
        clickEl("ts-link-static-b");
        await waitForEl("ts-static-b-page");

        // 4. Static B -> PPR B (Static -> PPR transition!)
        clickEl("ts-link-ppr-b");
        await waitForEl("ts-ppr-b-page");
        await waitForEl("ts-ppr-b-hole-resolved");

        // 5. PPR B -> PPR A
        clickEl("ts-link-ppr-a");
        await waitForEl("ts-ppr-a-page");
        await waitForEl("ts-ppr-a-hole-resolved");

        const layoutFetches = fetchedUrls.filter((u) =>
          u.includes("/____rsc_layout")
        );
        if (layoutFetches.length > 0) {
          throw new Error(
            `Expected 0 /____rsc_layout requests across PPR<->Static sibling navs, got ${layoutFetches.length}`
          );
        }
        if (getText("ts-layout-mount-id") !== layoutMount0) {
          throw new Error("Layout client component remounted during PPR<->Static navigation!");
        }
        if (getText("ts-layout-slot-mount-id") !== layoutSlotMount0) {
          throw new Error("Layout <DinouCacheSlot> client component remounted during navigation!");
        }
        if (
          getText("ts-layout-client-count") !== expectedLayoutCount ||
          getText("ts-layout-slot-client-count") !== expectedLayoutSlotCount
        ) {
          throw new Error("Layout or Layout Slot client counter lost during navigation!");
        }

        return `0 layout requests across 5 PPR↔Static transitions; layout Mount (${layoutMount0}, count=${expectedLayoutCount}) & layoutSlot Mount (${layoutSlotMount0}, count=${expectedLayoutSlotCount}) preserved`;
      });

      // =========================================================================
      // SCENARIO 4: Live Vertical refreshSlot Across Layout, PPR Shell & PPR Hole
      // =========================================================================
      await runStep(4, async () => {
        // Increment client counters inside all 3 slots
        clickEl("ts-ppr-a-shell-slot-client-inc");
        clickEl("btn-ts-hole-slot-widget-inc");
        clickEl("btn-ts-hole-slot-widget-inc");
        await new Promise((r) => setTimeout(r, 50));

        const layoutSlotCountBefore = getText("ts-layout-slot-client-count");
        const shellSlotCountBefore = getText("ts-ppr-a-shell-slot-client-count");
        const holeWidgetClicksBefore = getText("ts-hole-slot-widget-clicks");

        // Test Direct & Prop Server Actions inside PPR Hole Slot before & after live refresh
        clickEl("btn-ts-hole-slot-direct-action");
        await waitForText("ts-hole-slot-direct-res", "ts-ack:direct-100");
        clickEl("btn-ts-hole-slot-prop-action");
        await waitForText("ts-hole-slot-prop-res", "ok:ts-ack:prop-100");

        // Bump all 3 slot counters on server
        await tsBumpKeys([
          "layoutSlotSeq",
          "pprAShellSlotSeq",
          "pprAHoleSlotSeq",
        ]);

        // A. Live refresh PPR Hole Slot by TAG
        clickEl("ts-btn-live-refresh-ppr-a-hole-slot");
        await waitForText("ts-ppr-a-hole-slot-seq", "101");
        if (getText("ts-hole-slot-widget-clicks") !== holeWidgetClicksBefore) {
          throw new Error("PPR Hole Slot client useState lost on live refreshSlot(tag)!");
        }
        if (getText("ts-ppr-a-shell-slot-seq") !== "100" || getText("ts-layout-slot-seq") !== "100") {
          throw new Error("Refreshing hole slot unexpectedly refreshed shell or layout slot!");
        }

        // Verify prop-passed Server Action still works on the newly refreshed slot tree
        clickEl("btn-ts-hole-slot-prop-action");
        await waitForText("ts-hole-slot-prop-res", "ok:ts-ack:prop-101");

        // B. Live refresh PPR Shell Slot by ID
        clickEl("ts-btn-live-refresh-ppr-a-shell-slot");
        await waitForText("ts-ppr-a-shell-slot-seq", "101");
        if (getText("ts-ppr-a-shell-slot-client-count") !== shellSlotCountBefore) {
          throw new Error("PPR Shell Slot client useState lost on live refreshSlot(id)!");
        }

        // C. Live refresh Layout Slot by TAG (via router.refreshSlot)
        clickEl("ts-btn-live-refresh-layout-slot");
        await waitForText("ts-layout-slot-seq", "101");
        if (getText("ts-layout-slot-client-count") !== layoutSlotCountBefore) {
          throw new Error("Layout Slot client useState lost on live router.refreshSlot(tag)!");
        }

        return `All 3 slots (layout=101, shell=101, hole=101) refreshed in-place preserving local useState (clicks=${holeWidgetClicksBefore}) & prop Server Actions`;
      });

      // =========================================================================
      // SCENARIO 5: Nested <DinouCacheSlot> (Outer + Inner) Inside Dynamic PPR Hole
      // =========================================================================
      await runStep(5, async () => {
        const outerBefore = getText("ts-hole-nested-outer-seq");
        const innerBefore = getText("ts-hole-nested-inner-seq");
        if (outerBefore !== "100" || innerBefore !== "100") {
          throw new Error(`Expected initial nested hole slots 100/100, got ${outerBefore}/${innerBefore}`);
        }

        // Bump BOTH outer and inner counters in state, but invalidate ONLY the inner slot tag!
        await tsBumpKeys(["holeNestedOuterSeq", "holeNestedInnerSeq"]);
        await tsRunRevalidateTag("ts-hole-nested-inner-tag");

        clickEl("ts-btn-router-refresh-page");
        await waitForText("ts-hole-nested-inner-seq", "101");

        const outerAfter = getText("ts-hole-nested-outer-seq");
        if (outerAfter !== "100") {
          throw new Error(
            `Invalidating inner nested slot should NOT invalidate outer slot! Expected outer=100, got ${outerAfter}`
          );
        }

        return `Inner nested slot in PPR hole updated (100→101) via refreshNestedSlotsInTree while outer slot stayed cached (100)`;
      });

      // =========================================================================
      // SCENARIO 6: Surgical revalidateTag("ts-ppr-a-hole-slot-tag")
      // =========================================================================
      await runStep(6, async () => {
        // Bump hole slot seq (101->102), and also temporarily bump pprAPageSeq & layoutSeq in DB
        await tsMutateOnly({
          layoutSeq: isProdMode ? 999 : 100,
          pprAPageSeq: isProdMode ? 999 : 100,
          pprAHoleSlotSeq: 102,
        });
        try {
          await tsRunRevalidateTag("ts-ppr-a-hole-slot-tag");

          const htmlRes = await origFetch("/t-rigurous-triple-sinergy", {
            headers: { Accept: "text/html" },
          });
          const html = await htmlRes.text();
          const rawLayoutSeq = extractIdValueFromHtml(html, "ts-layout-seq");
          const rawPageSeq = extractIdValueFromHtml(html, "ts-ppr-a-page-seq");
          const rawHoleSlotSeq = extractIdValueFromHtml(html, "ts-ppr-a-hole-slot-seq");

          if (rawHoleSlotSeq !== "102") {
            throw new Error(`Expected hole slot seq 102 in streamed HTML, got ${rawHoleSlotSeq}`);
          }
          if (rawLayoutSeq !== "100" || rawPageSeq !== "100") {
            throw new Error(
              `revalidateTag on dynamic hole slot unexpectedly invalidated static shell or layout! layout=${rawLayoutSeq}, page=${rawPageSeq}`
            );
          }

          clickEl("ts-btn-router-refresh-page");
          await waitForText("ts-ppr-a-hole-slot-seq", "102");
          return `revalidateTag("ts-ppr-a-hole-slot-tag") updated hole slot to 102 while keeping static shell (100) and layout (100) untouched`;
        } finally {
          await tsMutateOnly({ layoutSeq: 100, pprAPageSeq: 100 });
        }
      });

      // =========================================================================
      // SCENARIO 7: Surgical revalidateTag("ts-ppr-a-shell-slot-tag")
      // =========================================================================
      await runStep(7, async () => {
        // Mutate layoutSeq (999) and pprAPageSeq (999) WITHOUT revalidating layout or page,
        // and bump pprAShellSlotSeq to 102, then revalidateTag("ts-ppr-a-shell-slot-tag")
        await tsMutateOnly({
          layoutSeq: isProdMode ? 999 : 100,
          pprAPageSeq: isProdMode ? 999 : 100,
          pprAShellSlotSeq: 102,
        });
        try {
          await tsRunRevalidateTag("ts-ppr-a-shell-slot-tag");

          const htmlRes = await origFetch("/t-rigurous-triple-sinergy?mode=after-shell-slot", {
            headers: { Accept: "text/html" },
          });
          const html = await htmlRes.text();

          if (isProdMode && !html.includes('<template id="ppr-content-')) {
            throw new Error(
              "After revalidateTag('ts-ppr-a-shell-slot-tag'), /t-rigurous-triple-sinergy lost its PPR dynamic hole streaming!"
            );
          }
          const rawShellSlotSeq = extractIdValueFromHtml(html, "ts-ppr-a-shell-slot-seq");
          const rawLayoutSeq = extractIdValueFromHtml(html, "ts-layout-seq");
          const rawHoleQuery = extractIdValueFromHtml(html, "ts-ppr-a-hole-query");

          if (rawShellSlotSeq !== "102") {
            throw new Error(
              `Expected PPR shell slot seq 102 in regenerated shell.html, got ${rawShellSlotSeq}`
            );
          }
          if (rawLayoutSeq !== "100") {
            throw new Error(
              `Regenerating PPR shell after shell-slot invalidation re-executed layout.tsx! Expected layoutSeq=100 (from cached layout.rsc), got ${rawLayoutSeq}`
            );
          }
          if (rawHoleQuery !== "after-shell-slot") {
            throw new Error(
              `Expected dynamic hole query "after-shell-slot", got ${rawHoleQuery}`
            );
          }

          clickEl("ts-btn-router-refresh-page");
          await waitForText("ts-ppr-a-shell-slot-seq", "102");
          return `PPR shell slot updated to 102, hole streaming preserved, and cached layout.rsc (layoutSeq=100) was NOT re-executed`;
        } finally {
          await tsMutateOnly({ layoutSeq: 100, pprAPageSeq: 100 });
        }
      });

      // =========================================================================
      // SCENARIO 8: Surgical revalidatePage("/t-rigurous-triple-sinergy") & revalidateTag("ts-ppr-a-page-tag") on PPR Route
      // =========================================================================
      await runStep(8, async () => {
        // Put layoutSeq=999 and pprAShellSlotSeq=999 (unrevalidated!) while bumping pprAPageSeq to 102
        await tsMutateOnly({
          layoutSeq: isProdMode ? 999 : 100,
          pprAShellSlotSeq: 999,
          pprAPageSeq: 102,
          pprAPageNote: "ppr-a-reval-page",
        });
        try {
          await tsRunRevalidatePage("/t-rigurous-triple-sinergy");

          const htmlRes1 = await origFetch("/t-rigurous-triple-sinergy?mode=after-reval-page", {
            headers: { Accept: "text/html" },
          });
          const html1 = await htmlRes1.text();
          if (isProdMode && !html1.includes('<template id="ppr-content-')) {
            throw new Error(
              "revalidatePage('/t-rigurous-triple-sinergy') destroyed PPR [data-ppr-hole] streaming placeholders in shell.html!"
            );
          }
          const pageSeq1 = extractIdValueFromHtml(html1, "ts-ppr-a-page-seq");
          const layoutSeq1 = extractIdValueFromHtml(html1, "ts-layout-seq");
          const shellSlotSeq1 = extractIdValueFromHtml(html1, "ts-ppr-a-shell-slot-seq");
          const holeQuery1 = extractIdValueFromHtml(html1, "ts-ppr-a-hole-query");

          if (pageSeq1 !== "102") {
            throw new Error(`Expected pprAPageSeq=102 after revalidatePage, got ${pageSeq1}`);
          }
          if (layoutSeq1 !== "100") {
            throw new Error(
              `revalidatePage on PPR route re-executed layout.tsx! Expected layoutSeq=100, got ${layoutSeq1}`
            );
          }
          if (shellSlotSeq1 !== "102") {
            throw new Error(
              `revalidatePage on PPR route bypassed cached <DinouCacheSlot>! Expected shellSlotSeq=102, got ${shellSlotSeq1}`
            );
          }
          if (holeQuery1 !== "after-reval-page") {
            throw new Error(`Expected dynamic hole query "after-reval-page", got ${holeQuery1}`);
          }

          // Also test revalidateTag("ts-ppr-a-page-tag")
          await tsMutateOnly({ pprAPageSeq: 103, pprAPageNote: "ppr-a-reval-tag" });
          await tsRunRevalidateTag("ts-ppr-a-page-tag");

          clickEl("ts-btn-router-refresh-page");
          await waitForText("ts-ppr-a-page-seq", "103");
          if (getText("ts-layout-seq") !== "100") {
            throw new Error(`Expected layoutSeq=100 after page tag revalidation, got ${getText("ts-layout-seq")}`);
          }

          return `revalidatePage & revalidateTag("ts-ppr-a-page-tag") updated PPR static shell (100→102→103) while preserving PPR hole streaming, cached layout.rsc (100), and cached shell slot (102)`;
        } finally {
          await tsMutateOnly({ layoutSeq: 100, pprAShellSlotSeq: 102 });
        }
      });

      // =========================================================================
      // SCENARIO 9: Surgical revalidateTag("ts-layout-shell-slot-tag") Across Static & PPR Children
      // =========================================================================
      await runStep(9, async () => {
        // First revalidate static-b as a page so its metadata.json only has static-b's page slotTags
        await tsMutateOnly({ staticBPageSeq: 101 });
        await tsRunRevalidatePage("/t-rigurous-triple-sinergy/static-b");

        // Now bump layoutSlotSeq to 102 (while setting layoutSeq=999, staticBPageSeq=999 and pprAPageSeq=999 unrevalidated!)
        // and invalidate ONLY "ts-layout-shell-slot-tag"
        await tsMutateOnly({
          layoutSeq: isProdMode ? 999 : 100,
          layoutSlotSeq: 102,
          staticAPageSeq: isProdMode ? 999 : 100,
          staticASlotSeq: 101,
          staticBPageSeq: isProdMode ? 999 : 101,
          pprAPageSeq: isProdMode ? 999 : 103,
        });
        try {
          await tsRunRevalidateTag("ts-layout-shell-slot-tag");
          await tsRunRevalidateTag("ts-static-a-slot-tag");

          // Verify /t-rigurous-triple-sinergy (PPR), /t-rigurous-triple-sinergy/static-a (Static) & /t-rigurous-triple-sinergy/static-b (Static)
          const [pprHtmlRes, staticAHtmlRes, staticBHtmlRes] = await Promise.all([
            origFetch("/t-rigurous-triple-sinergy", { headers: { Accept: "text/html" } }),
            origFetch("/t-rigurous-triple-sinergy/static-a", { headers: { Accept: "text/html" } }),
            origFetch("/t-rigurous-triple-sinergy/static-b", { headers: { Accept: "text/html" } }),
          ]);
          const [pprHtml, staticAHtml, staticBHtml] = await Promise.all([
            pprHtmlRes.text(),
            staticAHtmlRes.text(),
            staticBHtmlRes.text(),
          ]);

          const pprLayoutSeq = extractIdValueFromHtml(pprHtml, "ts-layout-seq");
          const staticBLayoutSeq = extractIdValueFromHtml(staticBHtml, "ts-layout-seq");
          const pprLayoutSlot = extractIdValueFromHtml(pprHtml, "ts-layout-slot-seq");
          const staticBLayoutSlot = extractIdValueFromHtml(staticBHtml, "ts-layout-slot-seq");
          const pprPageSeq = extractIdValueFromHtml(pprHtml, "ts-ppr-a-page-seq");
          const staticBPageSeq = extractIdValueFromHtml(staticBHtml, "ts-static-b-page-seq");
          const staticAPageSeq = extractIdValueFromHtml(staticAHtml, "ts-static-a-page-seq");
          const staticASlotSeq = extractIdValueFromHtml(staticAHtml, "ts-static-a-slot-seq");

          if (staticBLayoutSlot !== "102" || pprLayoutSlot !== "102") {
            throw new Error(
              `Layout slot did not update after revalidateTag("ts-layout-shell-slot-tag")! staticB=${staticBLayoutSlot}, pprA=${pprLayoutSlot} (exp 102)`
            );
          }
          if (pprLayoutSeq !== "100" || staticBLayoutSeq !== "100") {
            throw new Error(
              `revalidateTag("ts-layout-shell-slot-tag") unexpectedly re-executed outer layout.tsx! Expected layoutSeq=100, got ppr=${pprLayoutSeq}, staticB=${staticBLayoutSeq}`
            );
          }
          if (staticBPageSeq !== "101" || pprPageSeq !== "103") {
            throw new Error(
              `Lazy re-composition after layout slot tag invalidation unexpectedly re-executed child page.tsx! staticB=${staticBPageSeq} (exp 101), pprA=${pprPageSeq} (exp 103)`
            );
          }
          if (staticASlotSeq !== "101" || staticAPageSeq !== "100") {
            throw new Error(
              `revalidateTag("ts-static-a-slot-tag") on Static Page (ppr=false) failed surgical slot-only refresh! Expected slot=101 & page=100, got slot=${staticASlotSeq}, page=${staticAPageSeq}`
            );
          }

          clickEl("ts-btn-router-refresh-layout");
          await waitForText("ts-layout-slot-seq", "102");
          return `Surgical slot-only revalidation verified on Layout Slot (slot=102, layout=100) and Static Page Slot (slot=101, staticA=100) without re-executing layout.tsx or page.tsx`;
        } finally {
          await tsMutateOnly({
            layoutSeq: 100,
            staticAPageSeq: 100,
            staticBPageSeq: 101,
            pprAPageSeq: 103,
          });
        }
      });

      // =========================================================================
      // SCENARIO 10: revalidateLayout & revalidateTag("ts-layout-tag") Across PPR & Static Children
      // =========================================================================
      await runStep(10, async () => {
        // Bump layoutSeq to 105 (and set all page seqs to 999 unrevalidated to prove no page.tsx re-runs!)
        await tsMutateOnly({
          layoutSeq: 105,
          layoutNote: "ts-layout-reval",
          pprAPageSeq: isProdMode ? 999 : 103,
          pprBPageSeq: isProdMode ? 999 : 100,
          staticAPageSeq: isProdMode ? 999 : 100,
          staticBPageSeq: isProdMode ? 999 : 101,
        });
        try {
          await tsRunRevalidateLayout("/t-rigurous-triple-sinergy");

          const [pprAHtml, pprBHtml, staticAHtml, staticBHtml] = await Promise.all([
            origFetch("/t-rigurous-triple-sinergy?mode=f5-check", { headers: { Accept: "text/html" } }).then((r) => r.text()),
            origFetch("/t-rigurous-triple-sinergy/ppr-b?mode=f5-b", { headers: { Accept: "text/html" } }).then((r) => r.text()),
            origFetch("/t-rigurous-triple-sinergy/static-a", { headers: { Accept: "text/html" } }).then((r) => r.text()),
            origFetch("/t-rigurous-triple-sinergy/static-b", { headers: { Accept: "text/html" } }).then((r) => r.text()),
          ]);

          for (const [label, html] of [
            ["PPR A", pprAHtml],
            ["PPR B", pprBHtml],
            ["Static A", staticAHtml],
            ["Static B", staticBHtml],
          ] as const) {
            const lSeq = extractIdValueFromHtml(html, "ts-layout-seq");
            if (lSeq !== "105") {
              throw new Error(
                `Lazy layout re-composition failed on ${label} after revalidateLayout! Expected layoutSeq=105 in HTML, got ${lSeq}`
              );
            }
          }

          // Verify PPR A & PPR B still streamed their dynamic holes and kept their cached page shells (103 and 100)
          if (isProdMode && (!pprAHtml.includes('<template id="ppr-content-') || !pprBHtml.includes('<template id="ppr-content-'))) {
            throw new Error("Lazy layout re-composition on PPR routes lost <template> hole streaming!");
          }
          if (extractIdValueFromHtml(pprAHtml, "ts-ppr-a-page-seq") !== "103") {
            throw new Error(`PPR A page shell was re-executed during lazy layout re-composition!`);
          }
          if (extractIdValueFromHtml(pprBHtml, "ts-ppr-b-page-seq") !== "100") {
            throw new Error(`PPR B page shell was re-executed during lazy layout re-composition!`);
          }
          if (extractIdValueFromHtml(staticAHtml, "ts-static-a-page-seq") !== "100") {
            throw new Error(`Static A page was re-executed during lazy layout re-composition!`);
          }
          if (extractIdValueFromHtml(staticBHtml, "ts-static-b-page-seq") !== "101") {
            throw new Error(`Static B page was re-executed during lazy layout re-composition!`);
          }

          // Also test surgical revalidateTag("ts-layout-tag")
          await tsMutateOnly({ layoutSeq: 106, layoutNote: "ts-layout-tag-reval" });
          await tsRunRevalidateTag("ts-layout-tag");

          clickEl("ts-btn-router-refresh-layout");
          await waitForText("ts-layout-seq", "106");

          const pprAHtml2 = await origFetch("/t-rigurous-triple-sinergy", {
            headers: { Accept: "text/html" },
          }).then((r) => r.text());
          if (extractIdValueFromHtml(pprAHtml2, "ts-layout-seq") !== "106") {
            throw new Error("revalidateTag('ts-layout-tag') did not lazily re-compose PPR A shell.html to 106!");
          }

          return `Both PPR (PPR A=103, PPR B=100) & Static (Static A=100, Static B=101) children lazily re-composed HTML with new layoutSeq (105→106) without re-executing any page.tsx`;
        } finally {
          await tsMutateOnly({
            pprAPageSeq: 103,
            pprBPageSeq: 100,
            staticAPageSeq: 100,
            staticBPageSeq: 101,
          });
        }
      });

      // =========================================================================
      // SCENARIO 11: Multi-Level Nested Layout (L1 + L2) Soft Nav & Ancestor Cascade
      // =========================================================================
      await runStep(11, async () => {
        const l1Count = getText("ts-layout-client-count");
        clickEl("ts-link-nested-ppr");
        await waitForEl("ts-nested-layout");
        await waitForEl("ts-nested-ppr-page");
        await waitForEl("ts-nested-ppr-hole-resolved");

        clickEl("ts-nested-layout-client-inc");
        await new Promise((r) => setTimeout(r, 50));
        const l2Count = getText("ts-nested-layout-client-count");

        fetchedUrls.length = 0;
        clickEl("ts-link-nested-static");
        await waitForEl("ts-nested-static-page");

        const nestedLayoutReqs = fetchedUrls.filter((u) =>
          u.includes("/____rsc_layout")
        );
        if (nestedLayoutReqs.length > 0) {
          throw new Error(
            `Expected 0 layout requests between /nested (PPR) and /nested/static-child (Static), got ${nestedLayoutReqs.length}`
          );
        }
        if (
          getText("ts-layout-client-count") !== l1Count ||
          getText("ts-nested-layout-client-count") !== l2Count
        ) {
          throw new Error("L1 or L2 layout state lost during nested PPR->Static soft navigation!");
        }

        // Now revalidate ancestor L1 layout (/t-rigurous-triple-sinergy) and verify cascade to BOTH /nested (PPR) and /nested/static-child (Static)
        await tsMutateOnly({ layoutSeq: 107 });
        await tsRunRevalidateLayout("/t-rigurous-triple-sinergy");

        const [nestedPprHtml, nestedStaticHtml] = await Promise.all([
          origFetch("/t-rigurous-triple-sinergy/nested", { headers: { Accept: "text/html" } }).then((r) => r.text()),
          origFetch("/t-rigurous-triple-sinergy/nested/static-child", { headers: { Accept: "text/html" } }).then((r) => r.text()),
        ]);

        if (extractIdValueFromHtml(nestedStaticHtml, "ts-layout-seq") !== "107") {
          throw new Error("Ancestor L1 revalidateLayout did not cascade to /nested/static-child HTML!");
        }
        if (extractIdValueFromHtml(nestedPprHtml, "ts-layout-seq") !== "107") {
          throw new Error("Ancestor L1 revalidateLayout did not cascade to PPR /nested shell.html!");
        }

        clickEl("ts-link-ppr-a");
        await waitForEl("ts-ppr-a-page");
        clickEl("ts-btn-router-refresh-layout");
        await waitForText("ts-layout-seq", "107");

        return `L1 (count=${l1Count}) & L2 (count=${l2Count}) preserved across nested PPR↔Static nav; L1 revalidateLayout cascaded layoutSeq=107 to both nested PPR & Static HTML`;
      });

      // =========================================================================
      // SCENARIO 12: router.refresh() with Query Params on PPR + no_layout / reset_layout PPR
      // =========================================================================
      await runStep(12, async () => {
        clickEl("ts-link-ppr-a-query");
        await waitForEl("ts-ppr-a-hole-resolved");
        await waitForText("ts-ppr-a-hole-query", "live-query");

        const l1Count = getText("ts-layout-client-count");
        fetchedUrls.length = 0;

        await tsBumpKeys(["pprAHoleSeq"]);
        clickEl("ts-btn-router-refresh-page");
        await waitForText("ts-ppr-a-hole-seq", "102");

        const layoutReqsOnPageRefresh = fetchedUrls.filter((u) =>
          u.includes("/____rsc_layout")
        );
        if (layoutReqsOnPageRefresh.length > 0) {
          throw new Error("router.refresh() (page-only) should not fetch /____rsc_layout!");
        }
        if (getText("ts-ppr-a-hole-query") !== "live-query") {
          throw new Error(
            `Query param ?mode=live-query lost after router.refresh() on PPR page: got "${getText("ts-ppr-a-hole-query")}"`
          );
        }
        if (getText("ts-layout-client-count") !== l1Count) {
          throw new Error("Layout state lost on router.refresh()!");
        }

        // Navigate to no_layout PPR page and back
        clickEl("ts-link-no-layout-ppr");
        await waitForEl("ts-no-layout-ppr-page");
        if (document.getElementById("ts-section-layout")) {
          throw new Error("#ts-section-layout should NOT be mounted on no_layout PPR page!");
        }
        if (document.body.getAttribute("data-hydrated") !== "true") {
          throw new Error("body[data-hydrated=true] missing on no_layout PPR page!");
        }

        clickEl("ts-no-layout-back-link");
        await waitForEl("ts-section-layout");
        await waitForEl("ts-ppr-a-page");

        return `router.refresh() preserved ?mode=live-query & layout state with 0 layout fetches; no_layout PPR boundary isolated & restored #ts-section-layout cleanly`;
      });

      // =========================================================================
      // SCENARIO 13: Clock-Based <DinouCacheSlot revalidate={1}> TTL Expiration in PPR Static Shell & Dynamic Hole
      // =========================================================================
      await runStep(13, async () => {
        // Re-anchor 1s TTL slots to 100 and start a fresh 1s clock window
        await tsMutateOnly({
          pprATtlShellSlotSeq: 100,
          pprATtlHoleSlotSeq: 100,
        });
        await tsRunRevalidateTag("ts-ppr-a-ttl-shell-slot-tag");
        await tsRunRevalidateTag("ts-ppr-a-ttl-hole-slot-tag");

        const curLayoutSeq = getText("ts-layout-seq");
        const curPageSeq = getText("ts-ppr-a-page-seq");
        const curShellSlotSeq = getText("ts-ppr-a-shell-slot-seq");
        const curHoleSlotSeq = getText("ts-ppr-a-hole-slot-seq");

        // Mutate 1s TTL slots to 501 AND poison host L1 Layout, PPR Page A, and 3600s slots to 999 WITHOUT calling revalidateTag or fresh:true
        await tsMutateOnly({
          pprATtlShellSlotSeq: 501,
          pprATtlHoleSlotSeq: 501,
          layoutSeq: isProdMode ? 999 : Number(curLayoutSeq) || 107,
          pprAPageSeq: isProdMode ? 999 : Number(curPageSeq) || 103,
          pprAShellSlotSeq: 999,
          pprAHoleSlotSeq: 999,
        });

        // Wait 1.25s for the 1s TTL of both slots to expire by clock
        await new Promise((r) => setTimeout(r, 1250));

        // Call refreshSlot WITHOUT { fresh: true } on both the PPR Shell 1s-TTL slot and PPR Hole 1s-TTL slot
        refreshSlot("ts-ppr-a-ttl-shell-slot");
        refreshSlot("ts-ppr-a-ttl-hole-slot");
        await waitForText("ts-ppr-a-ttl-shell-slot-seq", "501");
        await waitForText("ts-ppr-a-ttl-hole-slot-seq", "501");

        // Also verify raw wire GET /t-rigurous-triple-sinergy?mode=ttl-wire reflects 501 in both shellPart and streamPart while preserving frozen host layout/page and 3600s slots!
        await new Promise((r) => setTimeout(r, 250));
        const wireRes = await origFetch("/t-rigurous-triple-sinergy?mode=ttl-wire", {
          headers: { Accept: "text/html" },
        });
        const wireHtml = await wireRes.text();
        const wireSplitIdx = wireHtml.indexOf('<template id="ppr-content-');
        const shellPart = wireSplitIdx === -1 ? wireHtml : wireHtml.slice(0, wireSplitIdx);
        const streamPart = wireSplitIdx === -1 ? wireHtml : wireHtml.slice(wireSplitIdx);

        await tsMutateOnly({
          layoutSeq: Number(curLayoutSeq) || 107,
          pprAPageSeq: Number(curPageSeq) || 103,
          pprAShellSlotSeq: Number(curShellSlotSeq) || 102,
          pprAHoleSlotSeq: Number(curHoleSlotSeq) || 102,
        });

        if (extractIdValueFromHtml(shellPart, "ts-ppr-a-ttl-shell-slot-seq") !== "501") {
          throw new Error(
            `Expected expired 1s-TTL shell slot to update to 501 in PPR shell.html, got ${extractIdValueFromHtml(
              shellPart,
              "ts-ppr-a-ttl-shell-slot-seq"
            )}`
          );
        }
        if (extractIdValueFromHtml(streamPart, "ts-ppr-a-ttl-hole-slot-seq") !== "501") {
          throw new Error(
            `Expected expired 1s-TTL hole slot to update to 501 in PPR streamPart, got ${extractIdValueFromHtml(
              streamPart,
              "ts-ppr-a-ttl-hole-slot-seq"
            )}`
          );
        }
        if (
          extractIdValueFromHtml(shellPart, "ts-layout-seq") !== curLayoutSeq ||
          extractIdValueFromHtml(shellPart, "ts-ppr-a-page-seq") !== curPageSeq ||
          extractIdValueFromHtml(shellPart, "ts-ppr-a-shell-slot-seq") !== curShellSlotSeq ||
          extractIdValueFromHtml(streamPart, "ts-ppr-a-hole-slot-seq") !== curHoleSlotSeq
        ) {
          throw new Error(
            "Clock-TTL slot refresh leaked poisoned host layout/page or 3600s slot state!"
          );
        }

        return `1s TTL slots in PPR Static Shell & Dynamic Hole expired by clock -> updated to 501 in DOM & wire while preserving L1=${curLayoutSeq}, PageA=${curPageSeq} & 3600s slots`;
      });
    } finally {
      window.fetch = origFetch;
      state.running = false;
      state.finished = true;
      state.passedCount = state.results.filter((r) => r.status === "passed").length;
      state.failedCount = state.results.filter((r) => r.status === "failed").length;
      notifyTsSuiteUpdate({ ...state, results: [...state.results] });
    }
  };

  return (
    <div
      id="ts-automated-suite-panel"
      className="p-4 my-3 rounded-xl bg-slate-900/95 border border-cyan-500/40 space-y-3 text-xs shadow-lg"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-cyan-300">
            Triple Synergy E2E Stress Runner: Horizontal + Vertical + PPR (12 Scenarios)
          </h2>
          <p className="text-slate-400">
            Tests all 3 axes simultaneously: segmented layouts, <code>&lt;DinouCacheSlot&gt;</code>,{" "}
            <code>refreshSlot</code>, PPR static shells, streaming holes, and surgical revalidation.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {suiteState.finished && (
            <span
              id="ts-suite-summary-badge"
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
            id="ts-run-automated-suite"
            type="button"
            disabled={suiteState.running}
            onClick={startAutomatedSuite}
            className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold cursor-pointer shadow"
          >
            {suiteState.running
              ? "Running Triple Synergy Suite..."
              : "▶ Run All 12 Triple Synergy Tests"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
        {suiteState.results.map((item) => (
          <div
            key={item.id}
            id={`ts-test-row-${item.id}`}
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
                id={`ts-test-status-${item.id}`}
                className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-black/30 font-mono"
              >
                {item.status}
              </span>
            </div>
            <div
              id={`ts-test-detail-${item.id}`}
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

