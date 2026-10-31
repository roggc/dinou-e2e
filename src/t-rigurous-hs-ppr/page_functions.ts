import { getHsPprState } from "./hsppr-state";

export async function getProps() {
  const st = getHsPprState();
  return {
    pageAPropsSeq: st.pageAPropsSeq,
  };
}

export function getCacheTags() {
  return ["hsppr-page-a-tag"];
}

