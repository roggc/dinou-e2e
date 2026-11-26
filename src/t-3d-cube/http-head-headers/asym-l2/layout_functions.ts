import { getContext } from "dinou/server";
import { readCubeState } from "../../shared/cube-state";

export const revalidate = 0;

export async function getProps() {
  const s = readCubeState();
  const ctx = getContext();
  ctx?.res?.setHeader("Vary", "Accept-Language");
  ctx?.res?.setHeader("X-Cube-Asym-L2", `asym-l2-v${s.hhAsymL2Seq}`);
  return {
    l2Seq: s.hhAsymL2Seq,
  };
}
