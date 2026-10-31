import { getHsPprState } from "../hsppr-state";

export async function getProps() {
  const st = getHsPprState();
  return {
    nestedPagePropsSeq: st.nestedPagePropsSeq,
  };
}

export function getCacheTags() {
  return ["hsppr-nested-page-tag"];
}

