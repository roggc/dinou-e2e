import { getHsPprState } from "./hsppr-state";

export const ppr = true;

export async function getProps() {
  const st = getHsPprState();
  return {
    l1LayoutPropsSeq: st.l1LayoutPropsSeq,
  };
}

export function getCacheTags() {
  return ["hsppr-l1-layout-tag"];
}

