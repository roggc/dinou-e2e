// src/t-rigurous-hs-ppr/hsppr-state.ts
// Shared server-side state for the Horizontal Segmentation + Partial Prerendering (No-CacheSlot) E2E suite.

const STATE_KEY = Symbol.for("dinou.e2e.rigorous.hsppr.state");

export interface HsPprServerState {
  // L1 Layout (/t-rigurous-hs-ppr)
  l1LayoutSeq: number;
  l1LayoutPropsSeq: number;
  l1LayoutHoleSeq: number;

  // @sidebar parallel route in L1 Layout
  sidebarShellSeq: number;
  sidebarHoleSeq: number;

  // Page A (Index PPR route /t-rigurous-hs-ppr)
  pageAShellSeq: number;
  pageAPropsSeq: number;
  pageAStaticSuspenseSeq: number;
  pageAHole1Seq: number;
  pageAHole2Seq: number;
  pageAHole2InnerSeq: number;

  // Page B (Sibling PPR route /t-rigurous-hs-ppr/ppr-b)
  pageBShellSeq: number;
  pageBHoleSeq: number;

  // Static Opt-Out Sibling (/t-rigurous-hs-ppr/static-optout, ppr = false)
  staticOptOutSeq: number;

  // L2 Nested Layout & Nested Page (/t-rigurous-hs-ppr/nested)
  l2LayoutShellSeq: number;
  l2LayoutPropsSeq: number;
  l2LayoutHoleSeq: number;
  nestedPageShellSeq: number;
  nestedPagePropsSeq: number;
  nestedPageHoleSeq: number;

  // reset_layout PPR route (/t-rigurous-hs-ppr/reset-ppr)
  resetLayoutShellSeq: number;
  resetPageShellSeq: number;
  resetPageHoleSeq: number;

  // no_layout PPR route (/t-rigurous-hs-ppr/no-layout-ppr)
  noLayoutShellSeq: number;
  noLayoutHoleSeq: number;

  // Dynamic param PPR route (/t-rigurous-hs-ppr/team/[team])
  teamLayoutShellSeq: number;
  teamPageShellSeq: number;
  teamPageHoleSeq: number;

  // Clock-based Layout TTL + PPR child route (/t-rigurous-hs-ppr/ttl-ppr)
  ttlLayoutShellSeq: number;
  ttlLayoutPropsSeq: number;
  ttlLayoutHoleSeq: number;
  ttlPageShellSeq: number;
  ttlPagePropsSeq: number;
  ttlPageHoleSeq: number;

  // Inverse Clock-based Page TTL (1s) under long-lived L1 Layout (3600s) (/t-rigurous-hs-ppr/page-ttl-ppr)
  pageTtlShellSeq: number;
  pageTtlPropsSeq: number;
  pageTtlHoleSeq: number;
}

export const DEFAULT_HSPPR_STATE: HsPprServerState = {
  l1LayoutSeq: 100,
  l1LayoutPropsSeq: 100,
  l1LayoutHoleSeq: 100,

  sidebarShellSeq: 100,
  sidebarHoleSeq: 100,

  pageAShellSeq: 100,
  pageAPropsSeq: 100,
  pageAStaticSuspenseSeq: 100,
  pageAHole1Seq: 100,
  pageAHole2Seq: 100,
  pageAHole2InnerSeq: 100,

  pageBShellSeq: 100,
  pageBHoleSeq: 100,

  staticOptOutSeq: 100,

  l2LayoutShellSeq: 100,
  l2LayoutPropsSeq: 100,
  l2LayoutHoleSeq: 100,
  nestedPageShellSeq: 100,
  nestedPagePropsSeq: 100,
  nestedPageHoleSeq: 100,

  resetLayoutShellSeq: 100,
  resetPageShellSeq: 100,
  resetPageHoleSeq: 100,

  noLayoutShellSeq: 100,
  noLayoutHoleSeq: 100,

  teamLayoutShellSeq: 100,
  teamPageShellSeq: 100,
  teamPageHoleSeq: 100,

  ttlLayoutShellSeq: 100,
  ttlLayoutPropsSeq: 100,
  ttlLayoutHoleSeq: 100,
  ttlPageShellSeq: 100,
  ttlPagePropsSeq: 100,
  ttlPageHoleSeq: 100,

  pageTtlShellSeq: 100,
  pageTtlPropsSeq: 100,
  pageTtlHoleSeq: 100,
};

function getNodeFsAndPath(): { fs: any; stateFile: string } | null {
  try {
    const proc = typeof process !== "undefined" ? (process as any) : null;
    if (proc && typeof proc.getBuiltinModule === "function" && typeof proc.cwd === "function") {
      const fs = proc.getBuiltinModule("node:fs");
      const path = proc.getBuiltinModule("node:path");
      if (fs && path) {
        return {
          fs,
          stateFile: path.resolve(proc.cwd(), ".dinou/dist2/hsppr-test-state.json"),
        };
      }
    }
  } catch (e) {}
  return null;
}

export function getHsPprState(): HsPprServerState {
  const nodeEnv = getNodeFsAndPath();
  if (nodeEnv) {
    try {
      if (nodeEnv.fs.existsSync(nodeEnv.stateFile)) {
        const raw = JSON.parse(nodeEnv.fs.readFileSync(nodeEnv.stateFile, "utf8"));
        const merged = { ...DEFAULT_HSPPR_STATE, ...raw };
        (globalThis as any)[STATE_KEY] = merged;
        return merged;
      }
    } catch (e) {}
  }
  const mem = (globalThis as any)[STATE_KEY];
  if (mem && typeof mem === "object") {
    return { ...DEFAULT_HSPPR_STATE, ...mem };
  }
  return { ...DEFAULT_HSPPR_STATE };
}

export function writeHsPprState(patch: Partial<HsPprServerState>): HsPprServerState {
  const current = getHsPprState();
  const next = { ...current, ...patch };
  (globalThis as any)[STATE_KEY] = next;
  const nodeEnv = getNodeFsAndPath();
  if (nodeEnv) {
    try {
      const pathMod = (process as any).getBuiltinModule("node:path");
      nodeEnv.fs.mkdirSync(pathMod.dirname(nodeEnv.stateFile), { recursive: true });
      nodeEnv.fs.writeFileSync(nodeEnv.stateFile, JSON.stringify(next, null, 2), "utf8");
    } catch (e) {}
  }
  return next;
}

export function resetHsPprState(): HsPprServerState {
  const fresh = { ...DEFAULT_HSPPR_STATE };
  (globalThis as any)[STATE_KEY] = fresh;
  const nodeEnv = getNodeFsAndPath();
  if (nodeEnv) {
    try {
      if (nodeEnv.fs.existsSync(nodeEnv.stateFile)) {
        nodeEnv.fs.unlinkSync(nodeEnv.stateFile);
      }
    } catch (e) {}
  }
  return fresh;
}

