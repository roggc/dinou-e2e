import { getHsCsState } from "./hscs-state";

export const revalidate = 3600;

export function getTags() {
  return ["hscs-l1-layout-tag"];
}

export async function getProps() {
  const st = getHsCsState();
  return {
    l1LayoutPropsSeq: st.l1LayoutPropsSeq,
  };
}

