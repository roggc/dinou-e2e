// Shared cross-runtime state for Per-Segment Mixed PPR + 3D Synergy E2E suite (/t-ppr-mixed-segments)

const STATE_KEY = Symbol.for("dinou.e2e.mppr.state");

export interface MpprState {
  // L1 (ppr = false)
  l1Seq: number;
  l1SuspenseSeq: number;
  l1SlotSeq: number;

  // Index Page under L1 (false -> false)
  indexSeq: number;
  indexSuspenseSeq: number;

  // L2 (ppr = true) + @badge (inherits ppr = true from L2)
  l2ShellSeq: number;
  l2NoDynamicSeq: number;
  l2HoleSeq: number;
  l2HoleSlotSeq: number;
  l2BadgeShellSeq: number;
  l2BadgeHoleSeq: number;

  // l2-optin/page.tsx (false -> true -> false)
  ftfPageSeq: number;
  ftfPageSuspenseSeq: number;
  ftfPageSlotSeq: number;

  // l2-optin/page-ppr/page.tsx (false -> true -> true)
  fttPageShellSeq: number;
  fttPageHoleSeq: number;

  // l2-optin/l3-optout/layout.tsx (L3: ppr = false)
  l3Seq: number;
  l3SuspenseSeq: number;
  l3SlotSeq: number;

  // l2-optin/l3-optout/page.tsx (false -> true -> false -> true)
  ftftPageShellSeq: number;
  ftftPageHoleSeq: number;

  // l2-optin/l3-optout/static-leaf/page.tsx (false -> true -> false -> false)
  ftffPageSeq: number;
  ftffPageSuspenseSeq: number;
}

export const DEFAULT_MPPR_STATE: MpprState = {
  l1Seq: 100,
  l1SuspenseSeq: 100,
  l1SlotSeq: 100,

  indexSeq: 100,
  indexSuspenseSeq: 100,

  l2ShellSeq: 100,
  l2NoDynamicSeq: 100,
  l2HoleSeq: 100,
  l2HoleSlotSeq: 100,
  l2BadgeShellSeq: 100,
  l2BadgeHoleSeq: 100,

  ftfPageSeq: 100,
  ftfPageSuspenseSeq: 100,
  ftfPageSlotSeq: 100,

  fttPageShellSeq: 100,
  fttPageHoleSeq: 100,

  l3Seq: 100,
  l3SuspenseSeq: 100,
  l3SlotSeq: 100,

  ftftPageShellSeq: 100,
  ftftPageHoleSeq: 100,

  ftffPageSeq: 100,
  ftffPageSuspenseSeq: 100,
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
          stateFile: path.resolve(proc.cwd(), ".dinou/dist2/mppr-test-state.json"),
        };
      }
    }
  } catch (e) {}
  return null;
}

export function getMpprState(): MpprState {
  const nodeEnv = getNodeFsAndPath();
  if (nodeEnv) {
    try {
      if (nodeEnv.fs.existsSync(nodeEnv.stateFile)) {
        const raw = JSON.parse(nodeEnv.fs.readFileSync(nodeEnv.stateFile, "utf8"));
        const merged = { ...DEFAULT_MPPR_STATE, ...raw };
        (globalThis as any)[STATE_KEY] = merged;
        return merged;
      }
    } catch (e) {}
  }
  const mem = (globalThis as any)[STATE_KEY];
  if (mem && typeof mem === "object") {
    return { ...DEFAULT_MPPR_STATE, ...mem };
  }
  return { ...DEFAULT_MPPR_STATE };
}

export function writeMpprState(patch: Partial<MpprState>): MpprState {
  const current = getMpprState();
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

export function resetMpprState(): MpprState {
  const fresh = { ...DEFAULT_MPPR_STATE };
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

