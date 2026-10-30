const STATE_KEY = Symbol.for("dinou.e2e.rigorous.ts.state");

export interface TsState {
  layoutSeq: number;
  layoutNote: string;
  layoutSlotSeq: number;

  nestedLayoutSeq: number;
  nestedLayoutSlotSeq: number;

  pprAPageSeq: number;
  pprAPageNote: string;
  pprAShellSlotSeq: number;
  pprAHoleSeq: number;
  pprAHoleSlotSeq: number;
  holeNestedOuterSeq: number;
  holeNestedInnerSeq: number;

  pprBPageSeq: number;
  pprBShellSlotSeq: number;
  pprBHoleSeq: number;
  pprBHoleSlotSeq: number;

  staticAPageSeq: number;
  staticASlotSeq: number;

  staticBPageSeq: number;
  staticBSlotSeq: number;

  nestedPprPageSeq: number;
  nestedPprHoleSeq: number;
  nestedStaticPageSeq: number;
}

export const DEFAULT_TS_STATE: TsState = {
  layoutSeq: 100,
  layoutNote: "ts-layout-v0",
  layoutSlotSeq: 100,

  nestedLayoutSeq: 100,
  nestedLayoutSlotSeq: 100,

  pprAPageSeq: 100,
  pprAPageNote: "ppr-a-v0",
  pprAShellSlotSeq: 100,
  pprAHoleSeq: 100,
  pprAHoleSlotSeq: 100,
  holeNestedOuterSeq: 100,
  holeNestedInnerSeq: 100,

  pprBPageSeq: 100,
  pprBShellSlotSeq: 100,
  pprBHoleSeq: 100,
  pprBHoleSlotSeq: 100,

  staticAPageSeq: 100,
  staticASlotSeq: 100,

  staticBPageSeq: 100,
  staticBSlotSeq: 100,

  nestedPprPageSeq: 100,
  nestedPprHoleSeq: 100,
  nestedStaticPageSeq: 100,
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
          stateFile: path.resolve(proc.cwd(), ".dinou/dist2/ts-test-state.json"),
        };
      }
    }
  } catch (e) {}
  return null;
}

export function readTsState(): TsState {
  const nodeEnv = getNodeFsAndPath();
  if (nodeEnv) {
    try {
      if (nodeEnv.fs.existsSync(nodeEnv.stateFile)) {
        const raw = JSON.parse(nodeEnv.fs.readFileSync(nodeEnv.stateFile, "utf8"));
        const merged = { ...DEFAULT_TS_STATE, ...raw };
        (globalThis as any)[STATE_KEY] = merged;
        return merged;
      }
    } catch (e) {}
  }
  const mem = (globalThis as any)[STATE_KEY];
  if (mem && typeof mem === "object") {
    return { ...DEFAULT_TS_STATE, ...mem };
  }
  return { ...DEFAULT_TS_STATE };
}

export function writeTsState(patch: Partial<TsState>): TsState {
  const current = readTsState();
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

export function resetTsState(): TsState {
  const next = { ...DEFAULT_TS_STATE };
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

