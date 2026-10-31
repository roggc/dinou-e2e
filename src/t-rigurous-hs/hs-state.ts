import fs from "node:fs";
import path from "node:path";

const STATE_FILE = path.resolve(process.cwd(), ".dinou/hs-test-state.json");

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

export function readHsState(): HsState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      return { ...DEFAULT_STATE, ...raw };
    }
  } catch (e) {}
  return { ...DEFAULT_STATE };
}

export function writeHsState(patch: Partial<HsState>): HsState {
  const current = readHsState();
  const next = { ...current, ...patch };
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2), "utf8");
  } catch (e) {}
  return next;
}

export function resetHsState(): HsState {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(DEFAULT_STATE, null, 2), "utf8");
  } catch (e) {}
  return { ...DEFAULT_STATE };
}

export function bumpHsCounter(key: keyof HsState): HsState {
  const current = readHsState();
  const val = typeof current[key] === "number" ? (current[key] as number) + 1 : 101;
  return writeHsState({ [key]: val } as Partial<HsState>);
}
