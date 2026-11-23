const STATE_KEY = Symbol.for("dinou.e2e.3d.cube.state");

export interface Cube3DState {
  // Check #37 — Asymmetric dynamic layout
  hsL1LayoutSeq: number;
  hsIndexPageSeq: number;
  hsAsymDynLayoutSeq: number;
  hsAsymStaticPageSeq: number;

  // Check #38 — Bidirectional nested cache-slots + dynamic-host 1s TTL
  csNestedOuterSeq: number;
  csNestedInnerSeq: number;
  csFastSeq: number;
  csAlphaSeq: number;

  // Check #39 — Pure PPR deep + 1s shell TTL
  pprRigShellSeq: number;
  pprRigStaticSuspenseSeq: number;
  pprOuterStaticVal: number;
  pprHoleCookieSeq: number;
  pprHoleQuerySeq: number;
  pprHoleClientSeq: number;
  pprHoleInnerInStaticSeq: number;
  pprHoleOuterDynSeq: number;
  pprHoleDeepInnerSeq: number;
  pprHoleMemoSeq: number;
  pprTtlShellSeq: number;
  pprTtlHoleSeq: number;

  // Check #40 — Per-segment mixed PPR chains
  pprMixedL1Seq: number;
  pprMixedL2ShellSeq: number;
  pprMixedL2HoleSeq: number;
  pprMixedStaticPageSeq: number;
  pprMixedLeafShellSeq: number;
  pprMixedLeafHoleSeq: number;
  pprInhLayoutSeq: number;
  pprInhShellSeq: number;
  pprInhHoleSeq: number;
  pprInhOptOutSeq: number;

  // Check #41 — Pairwise Y+Z (PPR + Cache-Slot deep + 1s TTLs)
  synShellSeq: number;
  synShellSlotSeq: number;
  synShellTtlSlotSeq: number;
  synStaticSuspenseHostSeq: number;
  synStaticSuspenseSlotSeq: number;
  synHoleNoCacheSlotSeq: number;
  synHoleSlotASeq: number;
  synHoleTtlSlotSeq: number;
  synHole3HostSeq: number;
  synClientSlotSeq: number;

  // Check #42 — Pairwise X+Y (HS + Cache-Slot deep)
  hscsL1HostSeq: number;
  hscsL1OuterSlotSeq: number;
  hscsL1InnerSlotSeq: number;
  hscsSidebarHostSeq: number;
  hscsSidebarSlotSeq: number;
  hscsL2HostSeq: number;
  hscsL2SlotSeq: number;
  hscsNestedPageHostSeq: number;
  hscsNestedPageSlotSeq: number;

  // Check #43 — Pairwise X+Z (HS + PPR deep)
  hspprL1ShellSeq: number;
  hspprL1HoleSeq: number;
  hspprSidebarShellSeq: number;
  hspprSidebarHoleSeq: number;
  hspprAShellSeq: number;
  hspprAStaticSuspSeq: number;
  hspprAHoleSeq: number;
  hspprBShellSeq: number;
  hspprBHoleSeq: number;
  hspprOptOutShellSeq: number;
  hspprL2ShellSeq: number;
  hspprL2HoleSeq: number;
  hspprNestedShellSeq: number;
  hspprNestedHoleSeq: number;

  // Checks #22, #44, #45, #46 — Triple Synergy X+Y+Z deep
  tsL1ShellSeq: number;
  tsLayoutShellSlotSeq: number;
  tsL1HoleSeq: number;
  tsPprAShellSeq: number;
  tsPageShellSlotSeq: number;
  tsPprATtlShellSlotSeq: number;
  tsPprAHoleHostSeq: number;
  tsHoleSlotSeq: number;
  tsHoleSlot2Seq: number;
  tsPprBShellSeq: number;
  tsPprBHoleSeq: number;
  tsStaticASeq: number;
  tsL2ShellSeq: number;
  tsNestedLayoutSlotSeq: number;
  tsL2HoleSeq: number;
  tsNestedPprShellSeq: number;
  tsNestedPprHoleHostSeq: number;
  tsNestedStaticHostSeq: number;
}

export const DEFAULT_CUBE_3D_STATE: Cube3DState = {
  hsL1LayoutSeq: 100,
  hsIndexPageSeq: 100,
  hsAsymDynLayoutSeq: 100,
  hsAsymStaticPageSeq: 100,

  csNestedOuterSeq: 100,
  csNestedInnerSeq: 100,
  csFastSeq: 100,
  csAlphaSeq: 100,

  pprRigShellSeq: 100,
  pprRigStaticSuspenseSeq: 100,
  pprOuterStaticVal: 100,
  pprHoleCookieSeq: 100,
  pprHoleQuerySeq: 100,
  pprHoleClientSeq: 100,
  pprHoleInnerInStaticSeq: 100,
  pprHoleOuterDynSeq: 100,
  pprHoleDeepInnerSeq: 100,
  pprHoleMemoSeq: 100,
  pprTtlShellSeq: 100,
  pprTtlHoleSeq: 100,

  pprMixedL1Seq: 100,
  pprMixedL2ShellSeq: 100,
  pprMixedL2HoleSeq: 100,
  pprMixedStaticPageSeq: 100,
  pprMixedLeafShellSeq: 100,
  pprMixedLeafHoleSeq: 100,
  pprInhLayoutSeq: 100,
  pprInhShellSeq: 100,
  pprInhHoleSeq: 100,
  pprInhOptOutSeq: 100,

  synShellSeq: 100,
  synShellSlotSeq: 100,
  synShellTtlSlotSeq: 100,
  synStaticSuspenseHostSeq: 100,
  synStaticSuspenseSlotSeq: 100,
  synHoleNoCacheSlotSeq: 100,
  synHoleSlotASeq: 100,
  synHoleTtlSlotSeq: 100,
  synHole3HostSeq: 100,
  synClientSlotSeq: 100,

  hscsL1HostSeq: 100,
  hscsL1OuterSlotSeq: 100,
  hscsL1InnerSlotSeq: 100,
  hscsSidebarHostSeq: 100,
  hscsSidebarSlotSeq: 100,
  hscsL2HostSeq: 100,
  hscsL2SlotSeq: 100,
  hscsNestedPageHostSeq: 100,
  hscsNestedPageSlotSeq: 100,

  hspprL1ShellSeq: 100,
  hspprL1HoleSeq: 100,
  hspprSidebarShellSeq: 100,
  hspprSidebarHoleSeq: 100,
  hspprAShellSeq: 100,
  hspprAStaticSuspSeq: 100,
  hspprAHoleSeq: 100,
  hspprBShellSeq: 100,
  hspprBHoleSeq: 100,
  hspprOptOutShellSeq: 100,
  hspprL2ShellSeq: 100,
  hspprL2HoleSeq: 100,
  hspprNestedShellSeq: 100,
  hspprNestedHoleSeq: 100,

  tsL1ShellSeq: 100,
  tsLayoutShellSlotSeq: 100,
  tsL1HoleSeq: 100,
  tsPprAShellSeq: 100,
  tsPageShellSlotSeq: 100,
  tsPprATtlShellSlotSeq: 100,
  tsPprAHoleHostSeq: 100,
  tsHoleSlotSeq: 100,
  tsHoleSlot2Seq: 100,
  tsPprBShellSeq: 100,
  tsPprBHoleSeq: 100,
  tsStaticASeq: 100,
  tsL2ShellSeq: 100,
  tsNestedLayoutSlotSeq: 100,
  tsL2HoleSeq: 100,
  tsNestedPprShellSeq: 100,
  tsNestedPprHoleHostSeq: 100,
  tsNestedStaticHostSeq: 100,
};

function getNodeFsAndPath(): { fs: any; stateFile: string } | null {
  try {
    const proc = typeof process !== "undefined" ? (process as any) : null;
    if (
      proc &&
      typeof proc.getBuiltinModule === "function" &&
      typeof proc.cwd === "function"
    ) {
      const fs = proc.getBuiltinModule("node:fs");
      const path = proc.getBuiltinModule("node:path");
      if (fs && path) {
        return {
          fs,
          stateFile: path.resolve(proc.cwd(), ".dinou/cube-3d-state.json"),
        };
      }
    }
  } catch {}
  return null;
}

export function readCubeState(): Cube3DState {
  const nodeEnv = getNodeFsAndPath();
  if (nodeEnv) {
    try {
      if (nodeEnv.fs.existsSync(nodeEnv.stateFile)) {
        const raw = JSON.parse(nodeEnv.fs.readFileSync(nodeEnv.stateFile, "utf8"));
        const merged = { ...DEFAULT_CUBE_3D_STATE, ...raw };
        (globalThis as any)[STATE_KEY] = merged;
        return merged;
      }
    } catch {}
  }
  const mem = (globalThis as any)[STATE_KEY];
  if (mem && typeof mem === "object") {
    return { ...DEFAULT_CUBE_3D_STATE, ...mem };
  }
  return { ...DEFAULT_CUBE_3D_STATE };
}

export function writeCubeState(patch: Partial<Cube3DState>): Cube3DState {
  const current = readCubeState();
  const next = { ...current, ...patch };
  (globalThis as any)[STATE_KEY] = next;
  const nodeEnv = getNodeFsAndPath();
  if (nodeEnv) {
    try {
      const pathMod = (process as any).getBuiltinModule("node:path");
      nodeEnv.fs.mkdirSync(pathMod.dirname(nodeEnv.stateFile), { recursive: true });
      nodeEnv.fs.writeFileSync(
        nodeEnv.stateFile,
        JSON.stringify(next, null, 2),
        "utf8"
      );
    } catch {}
  }
  return next;
}

export function resetCubeState(): Cube3DState {
  const next = { ...DEFAULT_CUBE_3D_STATE };
  (globalThis as any)[STATE_KEY] = next;
  const nodeEnv = getNodeFsAndPath();
  if (nodeEnv) {
    try {
      const pathMod = (process as any).getBuiltinModule("node:path");
      nodeEnv.fs.mkdirSync(pathMod.dirname(nodeEnv.stateFile), { recursive: true });
      nodeEnv.fs.writeFileSync(
        nodeEnv.stateFile,
        JSON.stringify(next, null, 2),
        "utf8"
      );
    } catch {}
  }
  return next;
}

export const cubeSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
