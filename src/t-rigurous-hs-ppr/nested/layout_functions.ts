import { getHsPprState } from "../hsppr-state";

export const ppr = true;

export async function getProps() {
  const st = getHsPprState();
  return {
    l2LayoutPropsSeq: st.l2LayoutPropsSeq,
  };
}

export function getCacheTags() {
  return ["hsppr-l2-layout-tag"];
}

