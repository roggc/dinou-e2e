const STATE_KEY = Symbol.for("dinou.e2e.rigorous.hs.state");

export interface HsState {
  sectionLayoutSeq: number;
  sectionLayoutNote: string;
  indexPageSeq: number;
  indexPageNote: string;
  siblingASeq: number;
  siblingANote: string;
  siblingBSeq: number;
  siblingBNote: string;
  nestedLayoutSeq: number;
  nestedPage1Seq: number;
  nestedPage2Seq: number;
  refreshLayoutSeq: number;
  refreshPageSeq: number;
  ttlLayoutSeq: number;
  ttlPageSeq: number;
  ttlPageOnlySeq: number;
}

const DEFAULT_STATE: HsState = {
  sectionLayoutSeq: 100,
  sectionLayoutNote: "layout-v0",
  indexPageSeq: 100,
  indexPageNote: "index-v0",
  siblingASeq: 100,
  siblingANote: "sibling-a-v0",
  siblingBSeq: 100,
  siblingBNote: "sibling-b-v0",
  nestedLayoutSeq: 100,
  nestedPage1Seq: 100,
  nestedPage2Seq: 100,
  refreshLayoutSeq: 100,
  refreshPageSeq: 100,
  ttlLayoutSeq: 100,
  ttlPageSeq: 100,
  ttlPageOnlySeq: 100,
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
          stateFile: path.resolve(proc.cwd(), ".dinou/hs-test-state.json"),
        };
      }
    }
  } catch (e) {}
  return null;
}

export function readHsState(): HsState {
  const nodeEnv = getNodeFsAndPath();
  if (nodeEnv) {
    try {
      if (nodeEnv.fs.existsSync(nodeEnv.stateFile)) {
        const raw = JSON.parse(nodeEnv.fs.readFileSync(nodeEnv.stateFile, "utf8"));
        const merged = { ...DEFAULT_STATE, ...raw };
        (globalThis as any)[STATE_KEY] = merged;
        return merged;
      }
    } catch (e) {}
  }
  const mem = (globalThis as any)[STATE_KEY];
  if (mem && typeof mem === "object") {
    return { ...DEFAULT_STATE, ...mem };
  }
  return { ...DEFAULT_STATE };
}

export function writeHsState(patch: Partial<HsState>): HsState {
  const current = readHsState();
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

export function resetHsState(): HsState {
  (globalThis as any)[STATE_KEY] = { ...DEFAULT_STATE };
  const nodeEnv = getNodeFsAndPath();
  if (nodeEnv) {
    try {
      const pathMod = (process as any).getBuiltinModule("node:path");
      nodeEnv.fs.mkdirSync(pathMod.dirname(nodeEnv.stateFile), { recursive: true });
      nodeEnv.fs.writeFileSync(nodeEnv.stateFile, JSON.stringify(DEFAULT_STATE, null, 2), "utf8");
    } catch (e) {}
  }
  return { ...DEFAULT_STATE };
}

export function bumpHsCounter(key: keyof HsState): HsState {
  const current = readHsState();
  const val = typeof current[key] === "number" ? (current[key] as number) + 1 : 101;
  return writeHsState({ [key]: val } as Partial<HsState>);
}
