"use client";

import React, { useState, useEffect } from "react";
import { refreshSlot, useRouter } from "dinou";
import {
  mpprMutateState,
  mpprResetAll,
  mpprRunRevalidateTag,
  mpprRunRevalidatePage,
  mpprRunRevalidateLayout,
} from "./mppr-actions";

export function MpprClientBox({ idPrefix }: { idPrefix: string }) {
  const [count, setCount] = useState(0);
  const [mountId, setMountId] = useState("ssr");

  useEffect(() => {
    setMountId(Math.random().toString(36).slice(2, 8));
  }, []);

  return (
    <div
      id={`${idPrefix}-client-box`}
      className="inline-flex items-center gap-2 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs font-mono"
    >
      <span>
        Mount: <code id={`${idPrefix}-mount-id`}>{mountId}</code>
      </span>
      <span>
        Count: <strong id={`${idPrefix}-client-count`}>{count}</strong>
      </span>
      <button
        id={`${idPrefix}-client-inc`}
        type="button"
        onClick={() => setCount((c) => c + 1)}
        className="px-1.5 py-0.5 rounded bg-cyan-700 text-white cursor-pointer"
      >
        +1
      </button>
    </div>
  );
}

interface MpprStepResult {
  id: number;
  name: string;
  status: "pending" | "running" | "passed" | "failed";
  detail: string;
}

const STEPS: MpprStepResult[] = [
  { id: 1, name: "Wire & Hole Split: F->T->F & F->T->T (Nested Layout Opt-In + @badge)", status: "pending", detail: "" },
  { id: 2, name: "4-Level Alternating Wire Alignment: F->T->F->T & F->T->F->F", status: "pending", detail: "" },
  { id: 3, name: "Unrevalidated Mutation + router.refresh() & router.refresh({ layout: true })", status: "pending", detail: "" },
  { id: 4, name: "Surgical revalidateLayout / revalidateTag Across Mixed L1(F)->L2(T)->L3(F) + Lazy Recomposition", status: "pending", detail: "" },
  { id: 5, name: "Surgical revalidatePage on Static Child (F->T->F) & PPR Child (F->T->F->T)", status: "pending", detail: "" },
  { id: 6, name: "Triple Synergy: Live refreshSlot & Slot-Only revalidateTag Across Mixed PPR Chain", status: "pending", detail: "" },
  { id: 7, name: "SPA Soft-Nav (<Link>) Entering, Traversing & Leaving Mixed-PPR Nested Layouts", status: "pending", detail: "" },
];

function splitPprWire(html: string) {
  const idx = html.indexOf('<template id="ppr-content-');
  return {
    hasPprTemplate: idx !== -1,
    shell: idx === -1 ? html : html.slice(0, idx),
    stream: idx === -1 ? html : html.slice(idx),
  };
}

function extractIdText(html: string, id: string): string | null {
  const re = new RegExp(`id="${id}"[^>]*>([^<]*)<`);
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

export function MpprSuiteRunner() {
  const router = useRouter();
  const [summary, setSummary] = useState("READY");
  const [steps, setSteps] = useState<MpprStepResult[]>(STEPS);

  const readText = (id: string) => document.getElementById(id)?.textContent?.trim() ?? "";
  const clickEl = (id: string) => {
    const el = document.getElementById(id) as HTMLElement | null;
    if (!el) throw new Error(`Missing element #${id}`);
    el.click();
  };

  const waitFor = async (fn: () => boolean, label: string, timeoutMs = 12000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        if (fn()) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 40));
    }
    throw new Error(`Timeout waiting for ${label}`);
  };

  const runAll = async () => {
    const isProdMode =
      typeof window !== "undefined" &&
      typeof (window as any).__DINOU_STRICT_MODE__ === "undefined";

    const current: MpprStepResult[] = STEPS.map((s) => ({ ...s }));
    setSummary("RUNNING");
    setSteps([...current]);

    const runStep = async (idx: number, fn: () => Promise<string>) => {
      current[idx].status = "running";
      current[idx].detail = "Running...";
      setSteps([...current]);
      try {
        const detail = await fn();
        current[idx].status = "passed";
        current[idx].detail = detail;
      } catch (err: any) {
        current[idx].status = "failed";
        current[idx].detail = err?.message || String(err);
      }
      setSteps([...current]);
    };

    // Navigate to 4-level alternating route /t-ppr-mixed-segments/l2-optin/l3-optout and reset cleanly
    if (window.location.pathname !== "/t-ppr-mixed-segments/l2-optin/l3-optout") {
      clickEl("mppr-link-ftft");
      await waitFor(
        () =>
          window.location.pathname === "/t-ppr-mixed-segments/l2-optin/l3-optout" &&
          !!document.getElementById("mppr-ftft-page"),
        "initial navigation to /t-ppr-mixed-segments/l2-optin/l3-optout"
      );
    }

    await mpprResetAll();
    document.cookie = "mppr_user=cookie-v1; path=/";
    router.refresh({ layout: true });
    await waitFor(
      () =>
        readText("mppr-l1-seq") === "100" &&
        readText("mppr-l1-static-suspense-seq") === "100" &&
        readText("mppr-l1-slot-seq") === "100" &&
        readText("mppr-l2-shell-seq") === "100" &&
        readText("mppr-l2-nodynamic-seq") === "100" &&
        readText("mppr-l2-hole-seq") === "100" &&
        readText("mppr-l2-hole-slot-seq") === "100" &&
        readText("mppr-l2-badge-shell-seq") === "100" &&
        readText("mppr-l2-badge-hole-seq") === "100" &&
        readText("mppr-l3-seq") === "100" &&
        readText("mppr-l3-static-suspense-seq") === "100" &&
        readText("mppr-l3-slot-seq") === "100" &&
        readText("mppr-ftft-page-shell-seq") === "100" &&
        readText("mppr-ftft-page-hole-seq") === "100",
      "baseline reset to 100"
    );

    // STEP 1: Wire & Hole Split for F->T->F (/l2-optin) and F->T->T (/l2-optin/page-ppr)
    await runStep(0, async () => {
      const [ftfRes, fttRes, ffRes] = await Promise.all([
        fetch("/t-ppr-mixed-segments/l2-optin?l2mode=wire-l2&bmode=wire-b", {
          headers: { Accept: "text/html" },
          credentials: "same-origin",
        }),
        fetch("/t-ppr-mixed-segments/l2-optin/page-ppr?l2mode=ftt-l2&bmode=ftt-b&pmode=ftt-p", {
          headers: { Accept: "text/html" },
          credentials: "same-origin",
        }),
        fetch("/t-ppr-mixed-segments", {
          headers: { Accept: "text/html" },
          credentials: "same-origin",
        }),
      ]);
      const [ftfHtml, fttHtml, ffHtml] = await Promise.all([
        ftfRes.text(),
        fttRes.text(),
        ffRes.text(),
      ]);

      // F->F baseline must have 0 PPR holes
      if (ffHtml.includes("data-ppr-hole=") || ffHtml.includes('<template id="ppr-content-')) {
        throw new Error("F->F route (/t-ppr-mixed-segments) unexpectedly emitted PPR holes!");
      }

      // F->T->F: L1(false) suspense & Page(false) suspense in shell; ONLY L2(true) + @badge(true) stream ppr-hole-2 & ppr-hole-3!
      const ftf = splitPprWire(ftfHtml);
      if (isProdMode && !ftf.hasPprTemplate) {
        throw new Error("Expected PPR template tail on F->T->F (/l2-optin)");
      }
      if (
        extractIdText(ftf.shell, "mppr-l1-static-suspense-seq") !== "100" ||
        extractIdText(ftf.shell, "mppr-l2-nodynamic-seq") !== "100" ||
        extractIdText(ftf.shell, "mppr-ftf-page-suspense-seq") !== "100"
      ) {
        throw new Error("F->T->F failed to pre-render L1 suspense, L2 noDynamic, or Page(false) suspense in shell");
      }
      if (isProdMode) {
        const shellHoles = [...ftf.shell.matchAll(/data-ppr-hole="(ppr-hole-\d+)"/g)].map((m) => m[1]);
        if (JSON.stringify(shellHoles) !== JSON.stringify(["ppr-hole-2", "ppr-hole-3"])) {
          throw new Error(`F->T->F expected holes [ppr-hole-2, ppr-hole-3], got ${JSON.stringify(shellHoles)}`);
        }
      }
      if (
        extractIdText(ftf.stream, "mppr-l2-hole-query") !== "wire-l2" ||
        extractIdText(ftf.stream, "mppr-l2-badge-hole-query") !== "wire-b"
      ) {
        throw new Error("F->T->F streamed holes did not receive live query params");
      }

      // F->T->T: adds ppr-hole-4 for Page(true)
      const ftt = splitPprWire(fttHtml);
      if (isProdMode) {
        const fttHoles = [...ftt.shell.matchAll(/data-ppr-hole="(ppr-hole-\d+)"/g)].map((m) => m[1]);
        if (JSON.stringify(fttHoles) !== JSON.stringify(["ppr-hole-2", "ppr-hole-3", "ppr-hole-4"])) {
          throw new Error(`F->T->T expected holes [ppr-hole-2, ppr-hole-3, ppr-hole-4], got ${JSON.stringify(fttHoles)}`);
        }
      }
      if (extractIdText(ftt.stream, "mppr-ftt-page-hole-query") !== "ftt-p") {
        throw new Error("F->T->T page hole ppr-hole-4 did not stream live query");
      }

      return "Verified F->F (0 holes), F->T->F ([ppr-hole-2, ppr-hole-3]) & F->T->T ([ppr-hole-2, ppr-hole-3, ppr-hole-4])";
    });

    // STEP 2: 4-Level Alternating Wire Alignment (F->T->F->T & F->T->F->F)
    await runStep(1, async () => {
      const [ftftRes, ftffRes] = await Promise.all([
        fetch("/t-ppr-mixed-segments/l2-optin/l3-optout?l2mode=alt-l2&bmode=alt-b&ftftmode=alt-p", {
          headers: { Accept: "text/html" },
          credentials: "same-origin",
        }),
        fetch("/t-ppr-mixed-segments/l2-optin/l3-optout/static-leaf?l2mode=leaf-l2&bmode=leaf-b", {
          headers: { Accept: "text/html" },
          credentials: "same-origin",
        }),
      ]);
      const [ftftHtml, ftffHtml] = await Promise.all([ftftRes.text(), ftffRes.text()]);

      const ftft = splitPprWire(ftftHtml);
      if (
        extractIdText(ftft.shell, "mppr-l1-static-suspense-seq") !== "100" ||
        extractIdText(ftft.shell, "mppr-l3-static-suspense-seq") !== "100"
      ) {
        throw new Error("F->T->F->T failed to resolve L1(false) and L3(false) <Suspense> statically in shell");
      }
      if (isProdMode) {
        const holes = [...ftft.shell.matchAll(/data-ppr-hole="(ppr-hole-\d+)"/g)].map((m) => m[1]);
        if (JSON.stringify(holes) !== JSON.stringify(["ppr-hole-2", "ppr-hole-3", "ppr-hole-4"])) {
          throw new Error(`F->T->F->T hole offset drifted! Got ${JSON.stringify(holes)}`);
        }
      }
      if (extractIdText(ftft.stream, "mppr-ftft-page-hole-query") !== "alt-p") {
        throw new Error("F->T->F->T ppr-hole-4 did not stream alt-p");
      }

      const ftff = splitPprWire(ftffHtml);
      if (extractIdText(ftff.shell, "mppr-ftff-page-suspense-seq") !== "100") {
        throw new Error("F->T->F->F leaf page static <Suspense> missing from shell");
      }
      if (isProdMode) {
        const leafHoles = [...ftff.shell.matchAll(/data-ppr-hole="(ppr-hole-\d+)"/g)].map((m) => m[1]);
        if (JSON.stringify(leafHoles) !== JSON.stringify(["ppr-hole-2", "ppr-hole-3"])) {
          throw new Error(`F->T->F->F expected [ppr-hole-2, ppr-hole-3], got ${JSON.stringify(leafHoles)}`);
        }
      }

      return "L1(false) & L3(false) static <Suspense> resolved in shell with zero hole-index drift";
    });

    // STEP 3: Unrevalidated Mutation + router.refresh() & router.refresh({ layout: true }) on F->T->F->T
    await runStep(2, async () => {
      clickEl("mppr-l1-client-inc");
      clickEl("mppr-l2-client-inc");
      clickEl("mppr-l3-client-inc");
      clickEl("mppr-ftft-page-client-inc");
      await waitFor(
        () =>
          readText("mppr-l1-client-count") === "1" &&
          readText("mppr-l2-client-count") === "1" &&
          readText("mppr-l3-client-count") === "1" &&
          readText("mppr-ftft-page-client-count") === "1",
        "client counters = 1"
      );
      const l1Mount = readText("mppr-l1-mount-id");
      const l2Mount = readText("mppr-l2-mount-id");
      const l3Mount = readText("mppr-l3-mount-id");

      await mpprMutateState({
        l1Seq: isProdMode ? 101 : 100,
        l1SuspenseSeq: isProdMode ? 101 : 100,
        l2ShellSeq: isProdMode ? 101 : 100,
        l2NoDynamicSeq: isProdMode ? 101 : 100,
        l2BadgeShellSeq: isProdMode ? 101 : 100,
        l3Seq: isProdMode ? 101 : 100,
        l3SuspenseSeq: isProdMode ? 101 : 100,
        ftftPageShellSeq: isProdMode ? 101 : 100,
        l2HoleSeq: 101,
        l2BadgeHoleSeq: 101,
        ftftPageHoleSeq: 101,
      });

      try {
        // Page-only refresh: updates FTFT page hole to 101, shells stay 100
        router.refresh();
        await waitFor(() => readText("mppr-ftft-page-hole-seq") === "101", "page hole = 101");
        if (readText("mppr-ftft-page-shell-seq") !== "100") {
          throw new Error(`Unrevalidated FTFT page shell leaked: ${readText("mppr-ftft-page-shell-seq")}`);
        }

        // Layout+Page refresh: updates L2 & @badge holes to 101, while L1(false), L2 noDynamic, L3(false) stay 100!
        router.refresh({ layout: true });
        await waitFor(
          () =>
            readText("mppr-l2-hole-seq") === "101" &&
            readText("mppr-l2-badge-hole-seq") === "101",
          "L2 & @badge holes = 101"
        );
        if (
          readText("mppr-l1-seq") !== "100" ||
          readText("mppr-l1-static-suspense-seq") !== "100" ||
          readText("mppr-l2-shell-seq") !== "100" ||
          readText("mppr-l2-nodynamic-seq") !== "100" ||
          readText("mppr-l3-seq") !== "100" ||
          readText("mppr-l3-static-suspense-seq") !== "100"
        ) {
          throw new Error("router.refresh({ layout: true }) leaked unrevalidated static shell or noDynamic()!");
        }
        if (
          readText("mppr-l1-mount-id") !== l1Mount ||
          readText("mppr-l2-mount-id") !== l2Mount ||
          readText("mppr-l3-mount-id") !== l3Mount ||
          readText("mppr-ftft-page-client-count") !== "1"
        ) {
          throw new Error("Client state lost during router.refresh({ layout: true })");
        }
        return "All static shells & noDynamic() stayed frozen at 100 while L2, @badge & Page holes updated to 101";
      } finally {
        await mpprMutateState({
          l1Seq: 100,
          l1SuspenseSeq: 100,
          l2ShellSeq: 100,
          l2NoDynamicSeq: 100,
          l2BadgeShellSeq: 100,
          l3Seq: 100,
          l3SuspenseSeq: 100,
          ftftPageShellSeq: 100,
        });
      }
    });

    // STEP 4: Surgical revalidateTag / revalidateLayout Across Mixed Chain + Lazy shell.html Recomposition
    await runStep(3, async () => {
      // 4a. Revalidate middle L2(true) via tag while poisoning L1(false) and Page(true) in-memory state to 999
      await mpprMutateState({
        l1Seq: isProdMode ? 999 : 100,
        l1SuspenseSeq: isProdMode ? 999 : 100,
        l2ShellSeq: 102,
        l2NoDynamicSeq: 102,
        l2BadgeShellSeq: 102,
        l3Seq: 102,
        l3SuspenseSeq: 102,
        ftftPageShellSeq: isProdMode ? 999 : 100,
      });

      try {
        // Revalidating L2(true) updates L2; on GET /l2-optin/l3-optout, L3 cascades (isAncestorNewer) and shell.html lazily recomposes with frozen FTFT page shell (100, NOT 999)!
        // Note: L1 is an ancestor of L2, so when L2 revalidates it runs L1+L2; keep L1 at 100 so we isolate L1 vs Page!
        await mpprMutateState({ l1Seq: 100, l1SuspenseSeq: 100 });
        await mpprRunRevalidateTag("mppr-l2-true-tag");

        const wireRes = await fetch("/t-ppr-mixed-segments/l2-optin/l3-optout?ftftmode=after-l2-reval", {
          headers: { Accept: "text/html" },
          credentials: "same-origin",
        });
        const { shell, stream } = splitPprWire(await wireRes.text());
        if (
          extractIdText(shell, "mppr-l2-shell-seq") !== "102" ||
          extractIdText(shell, "mppr-l2-nodynamic-seq") !== "102" ||
          extractIdText(shell, "mppr-l3-static-suspense-seq") !== "102"
        ) {
          throw new Error("Expected L2 & L3 shells to update to 102 in recomposed shell.html");
        }
        if (extractIdText(shell, "mppr-ftft-page-shell-seq") !== "100") {
          throw new Error(
            `Lazy recomposition re-executed FTFT Page instead of frozen shell.rsc! Got ${extractIdText(
              shell,
              "mppr-ftft-page-shell-seq"
            )}`
          );
        }
        if (extractIdText(stream, "mppr-ftft-page-hole-query") !== "after-l2-reval") {
          throw new Error("Page ppr-hole-4 lost alignment after L2+L3 layout revalidation!");
        }

        // 4b. Revalidate outer L1(false) and verify ancestor cascade down L1(false)->L2(true)->L3(false)
        await mpprMutateState({ l1Seq: 103, l1SuspenseSeq: 103 });
        await mpprRunRevalidateLayout("/t-ppr-mixed-segments");

        await mpprMutateState({ ftftPageShellSeq: 100 });
        router.refresh({ layout: true });
        await waitFor(
          () =>
            readText("mppr-l1-seq") === "103" &&
            readText("mppr-l1-static-suspense-seq") === "103" &&
            readText("mppr-l2-shell-seq") === "102" &&
            readText("mppr-ftft-page-shell-seq") === "100",
          "DOM reflecting L1=103, L2=102, Page=100"
        );
        return "L1(false)=103 & L2(true)+L3(false)=102 cascaded cleanly while FTFT Page shell stayed frozen at 100";
      } finally {
        await mpprMutateState({ ftftPageShellSeq: 100 });
      }
    });

    // STEP 5: Surgical revalidatePage on Static Child (F->T->F) & PPR Child (F->T->F->T)
    await runStep(4, async () => {
      // Poison L2 shell to 999 without revalidating L2, and revalidate BOTH leaf pages
      await mpprMutateState({
        l2ShellSeq: isProdMode ? 999 : 102,
        ftfPageSeq: 104,
        ftfPageSuspenseSeq: 104,
        ftftPageShellSeq: 104,
        ftftPageHoleSeq: 104,
      });

      try {
        await mpprRunRevalidatePage("/t-ppr-mixed-segments/l2-optin");
        await mpprRunRevalidatePage("/t-ppr-mixed-segments/l2-optin/l3-optout");

        const [ftfWire, ftftWire] = await Promise.all([
          fetch("/t-ppr-mixed-segments/l2-optin?l2mode=after-ftf-reval", {
            headers: { Accept: "text/html" },
          }).then((r) => r.text()),
          fetch("/t-ppr-mixed-segments/l2-optin/l3-optout?ftftmode=after-ftft-reval", {
            headers: { Accept: "text/html" },
          }).then((r) => r.text()),
        ]);

        const ftfSplit = splitPprWire(ftfWire);
        if (
          extractIdText(ftfSplit.shell, "mppr-ftf-page-seq") !== "104" ||
          extractIdText(ftfSplit.shell, "mppr-ftf-page-suspense-seq") !== "104" ||
          extractIdText(ftfSplit.shell, "mppr-l2-shell-seq") !== "102"
        ) {
          throw new Error("revalidatePage on F->T->F failed to compose fresh static page (104) with cached L2 (102)");
        }
        if (extractIdText(ftfSplit.stream, "mppr-l2-hole-query") !== "after-ftf-reval") {
          throw new Error("revalidatePage on F->T->F broke L2 dynamic hole streaming");
        }

        const ftftSplit = splitPprWire(ftftWire);
        if (
          extractIdText(ftftSplit.shell, "mppr-ftft-page-shell-seq") !== "104" ||
          extractIdText(ftftSplit.shell, "mppr-l2-shell-seq") !== "102"
        ) {
          throw new Error("revalidatePage on F->T->F->T failed to compose fresh PPR page (104) with cached L2/L3 (102)");
        }
        if (extractIdText(ftftSplit.stream, "mppr-ftft-page-hole-query") !== "after-ftft-reval") {
          throw new Error("revalidatePage on F->T->F->T shifted ppr-hole-4!");
        }

        router.refresh();
        await waitFor(() => readText("mppr-ftft-page-shell-seq") === "104", "FTFT page shell = 104");
        return "revalidatePage updated both Page(false) & Page(true) to 104 while keeping cached L2=102 and hole alignment intact";
      } finally {
        await mpprMutateState({ l2ShellSeq: 102 });
      }
    });

    // STEP 6: Triple Synergy — Live refreshSlot & Slot-Only revalidateTag Across Mixed PPR Chain
    await runStep(5, async () => {
      clickEl("mppr-l1-slot-client-inc");
      clickEl("mppr-l2-hole-slot-client-inc");
      clickEl("mppr-l3-slot-client-inc");
      await waitFor(
        () =>
          readText("mppr-l1-slot-client-count") === "1" &&
          readText("mppr-l2-hole-slot-client-count") === "1" &&
          readText("mppr-l3-slot-client-count") === "1",
        "slot client counters = 1"
      );

      await mpprMutateState({
        l1SlotSeq: 105,
        l2HoleSlotSeq: 105,
        l3SlotSeq: 105,
        l3Seq: isProdMode ? 999 : 102,
      });

      try {
        // Live refreshSlot on L1(false) slot & L2(true) dynamic-hole slot
        refreshSlot("mppr-l1-slot-tag", { fresh: true });
        refreshSlot("mppr-l2-hole-slot", { fresh: true });
        await waitFor(
          () =>
            readText("mppr-l1-slot-seq") === "105" &&
            readText("mppr-l2-hole-slot-seq") === "105",
          "L1 & L2 hole slots = 105"
        );
        if (
          readText("mppr-l1-slot-client-count") !== "1" ||
          readText("mppr-l2-hole-slot-client-count") !== "1"
        ) {
          throw new Error("refreshSlot lost client useState inside mixed-PPR slots!");
        }

        // Surgical revalidateTag on L3(false) slot without re-executing L3(false) shell (999)
        await mpprRunRevalidateTag("mppr-l3-slot-tag");
        router.refresh({ layout: true });
        await waitFor(() => readText("mppr-l3-slot-seq") === "105", "L3 slot = 105");
        if (readText("mppr-l3-seq") !== "102") {
          throw new Error(`revalidateTag("mppr-l3-slot-tag") unexpectedly re-executed L3! Got ${readText("mppr-l3-seq")}`);
        }
        if (readText("mppr-l3-slot-client-count") !== "1") {
          throw new Error("L3 slot client state lost during slot-only refresh!");
        }
        return "Live refreshSlot & surgical slot revalidateTag succeeded across L1(F), L2(T) hole & L3(F) preserving useState";
      } finally {
        await mpprMutateState({ l3Seq: 102 });
      }
    });

    // STEP 7: SPA Soft-Navigation (<Link>) Entering, Traversing & Leaving Mixed-PPR Nested Layouts
    await runStep(6, async () => {
      const l1Mount0 = readText("mppr-l1-mount-id");
      const l1Count0 = readText("mppr-l1-client-count");
      const l2Mount0 = readText("mppr-l2-mount-id");
      const l2Count0 = readText("mppr-l2-client-count");

      // 1. F->T->F->T  ==>  F->T->F->F (sibling under L3)
      clickEl("mppr-link-ftff");
      await waitFor(() => !!document.getElementById("mppr-ftff-page"), "nav to F->T->F->F");

      // 2. F->T->F->F  ==>  F->T->F (leaving L3(false), staying in L2(true))
      clickEl("mppr-link-ftf");
      await waitFor(() => !!document.getElementById("mppr-ftf-page"), "nav to F->T->F");
      if (readText("mppr-ftf-page-seq") !== "104") {
        throw new Error(`Expected F->T->F static page.rsc seq=104 on soft-nav, got ${readText("mppr-ftf-page-seq")}`);
      }

      // Live refreshSlot on F->T->F page slot
      clickEl("mppr-ftf-page-slot-client-inc");
      await waitFor(() => readText("mppr-ftf-page-slot-client-count") === "1", "ftf slot count = 1");
      await mpprMutateState({ ftfPageSlotSeq: 106 });
      refreshSlot("mppr-ftf-page-slot-tag", { fresh: true });
      await waitFor(() => readText("mppr-ftf-page-slot-seq") === "106", "ftf slot = 106");
      if (readText("mppr-ftf-page-slot-client-count") !== "1") {
        throw new Error("FTF page slot lost useState on refreshSlot!");
      }

      // 3. F->T->F  ==>  F->T->T (Static child -> PPR child inside L2(true)!)
      clickEl("mppr-link-ftt");
      await waitFor(() => !!document.getElementById("mppr-ftt-page-hole-resolved"), "nav to F->T->T");
      if (readText("mppr-l2-mount-id") !== l2Mount0 || readText("mppr-l2-client-count") !== l2Count0) {
        throw new Error("L2(true) layout remounted or lost state across l2-optin subroutes!");
      }

      // 4. F->T->T  ==>  F->F (leaving L2(true) back to outer L1(false)!)
      clickEl("mppr-link-index");
      await waitFor(() => !!document.getElementById("mppr-index-page"), "nav to F->F index");
      if (readText("mppr-l1-mount-id") !== l1Mount0 || readText("mppr-l1-client-count") !== l1Count0) {
        throw new Error("L1(false) outer layout remounted when leaving L2(true)!");
      }

      // 5. F->F  ==>  F->T->F->T (entering L2(true) + L3(false) + Page(true) via SPA soft-nav!)
      clickEl("mppr-link-ftft");
      await waitFor(
        () =>
          !!document.getElementById("mppr-ftft-page-hole-resolved") &&
          !!document.getElementById("mppr-l2-hole-resolved"),
        "re-entering F->T->F->T"
      );
      if (readText("mppr-l1-mount-id") !== l1Mount0 || readText("mppr-l1-client-count") !== l1Count0) {
        throw new Error("L1(false) outer layout remounted when entering L2(true)+L3(false)!");
      }

      return `L1 Mount (${l1Mount0}) & L2 Mount (${l2Mount0}) preserved across F->T->F->T <-> F->T->F->F <-> F->T->F <-> F->T->T <-> F->F`;
    });

    const passed = current.filter((s) => s.status === "passed").length;
    const failed = current.filter((s) => s.status === "failed").length;
    setSummary(`DONE: ${passed}/${current.length} PASSED, ${failed} FAILED`);
  };

  return (
    <div className="p-2.5 rounded bg-slate-900 border border-slate-700 space-y-2 text-xs font-mono">
      <div className="flex items-center gap-3">
        <button
          id="mppr-run-all-btn"
          type="button"
          onClick={runAll}
          className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer"
        >
          Run 7 Mixed-Segment PPR Scenarios
        </button>
        <strong id="mppr-suite-summary">{summary}</strong>
      </div>
      <ul className="space-y-1">
        {steps.map((s) => (
          <li key={s.id} className="flex flex-wrap gap-2">
            <span>#{s.id}</span>
            <strong id={`mppr-step-status-${s.id}`}>{s.status.toUpperCase()}</strong>
            <span>{s.name}</span>
            {s.detail ? <span id={`mppr-step-detail-${s.id}`} className="text-slate-400">— {s.detail}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
