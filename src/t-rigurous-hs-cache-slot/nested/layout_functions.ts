import { getHsCsState } from "../hscs-state";

export const revalidate = 3600;

export function getTags() {
  return ["hscs-l2-layout-tag"];
}

export async function getProps() {
  const st = getHsCsState();
  return {
    l2LayoutSeq: st.l2LayoutSeq,
  };
}

