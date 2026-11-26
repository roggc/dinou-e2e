import { getContext } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";

export const revalidate = 0;

export async function getProps() {
  const s = readCubeState();
  const ctx = getContext();
  ctx?.res?.setHeader("Vary", "Accept-Language");
  ctx?.res?.setHeader("X-Cube-Dyn", `dyn-v${s.hhDynSeq}`);
  ctx?.res?.setHeader("Cache-Control", "private, max-age=30");
  return {
    dynSeq: s.hhDynSeq,
  };
}
