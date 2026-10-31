// src/t-rigurous-hs-cache-slot/hscs-state.ts
// Shared server-side state for the Horizontal Segmentation + <DinouCacheSlot> (No-PPR) E2E suite.

const STATE_KEY = Symbol.for("dinou.e2e.rigorous.hscs.state");

export interface HsCsServerState {
  // L1 Layout & its slots
  l1LayoutSeq: number;
  l1LayoutPropsSeq: number;
  l1SlotSeq: number;
  l1SharedSlotSeq: number;
  l1OuterSlotSeq: number;
  l1InnerSlotSeq: number;
  l1TtlSlotSeq: number;

  // @sidebar parallel route & its slot
  sidebarOuterSeq: number;
  sidebarSlotSeq: number;

  // Page A (Index) & its slots
  pageASeq: number;
  pageAPropsSeq: number;
  pageASlotSeq: number;
  pageASharedSlotSeq: number;
  pageAOuterSlotSeq: number;
  pageAInnerSlotSeq: number;
  pageANoCacheSlotSeq: number;
  pageATtlSlotSeq: number;
  slotActionCalls: number;

  // Page B (Sibling) & its slot
  pageBSeq: number;
  pageBSlotSeq: number;

  // L2 Nested Layout & Nested Page & their slots
  l2LayoutSeq: number;
  l2SlotSeq: number;
  nestedPageSeq: number;
  nestedPageSlotSeq: number;
}

export const DEFAULT_HSCS_STATE: HsCsServerState = {
  l1LayoutSeq: 100,
  l1LayoutPropsSeq: 100,
  l1SlotSeq: 100,
  l1SharedSlotSeq: 100,
  l1OuterSlotSeq: 100,
  l1InnerSlotSeq: 100,
  l1TtlSlotSeq: 100,

  sidebarOuterSeq: 100,
  sidebarSlotSeq: 100,

  pageASeq: 100,
  pageAPropsSeq: 100,
  pageASlotSeq: 100,
  pageASharedSlotSeq: 100,
  pageAOuterSlotSeq: 100,
  pageAInnerSlotSeq: 100,
  pageANoCacheSlotSeq: 100,
  pageATtlSlotSeq: 100,
  slotActionCalls: 0,

  pageBSeq: 100,
  pageBSlotSeq: 100,

  l2LayoutSeq: 100,
  l2SlotSeq: 100,
  nestedPageSeq: 100,
  nestedPageSlotSeq: 100,
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
          stateFile: path.resolve(proc.cwd(), ".dinou/dist2/hscs-test-state.json"),
        };
      }
    }
  } catch (e) {}
  return null;
}

export function getHsCsState(): HsCsServerState {
  const nodeEnv = getNodeFsAndPath();
  if (nodeEnv) {
    try {
      if (nodeEnv.fs.existsSync(nodeEnv.stateFile)) {
        const raw = JSON.parse(nodeEnv.fs.readFileSync(nodeEnv.stateFile, "utf8"));
        const merged = { ...DEFAULT_HSCS_STATE, ...raw };
        (globalThis as any)[STATE_KEY] = merged;
        return merged;
      }
    } catch (e) {}
  }
  const mem = (globalThis as any)[STATE_KEY];
  if (mem && typeof mem === "object") {
    return { ...DEFAULT_HSCS_STATE, ...mem };
  }
  return { ...DEFAULT_HSCS_STATE };
}

export function writeHsCsState(patch: Partial<HsCsServerState>): HsCsServerState {
  const current = getHsCsState();
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

export function resetHsCsState(): HsCsServerState {
  const next = { ...DEFAULT_HSCS_STATE };
  (globalThis as any)[STATE_KEY] = next;
  const nodeEnv = getNodeFsAndPath();
  if (nodeEnv) {
    try {
      if (nodeEnv.fs.existsSync(nodeEnv.stateFile)) {
        nodeEnv.fs.unlinkSync(nodeEnv.stateFile);
      }
    } catch (e) {}
  }
  return next;
}
