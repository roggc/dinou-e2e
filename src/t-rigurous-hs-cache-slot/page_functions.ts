import { getHsCsState } from "./hscs-state";

export const revalidate = 3600;

export function getTags() {
  return ["hscs-page-a-tag"];
}

export async function getProps() {
  const st = getHsCsState();
  return {
    pageAPropsSeq: st.pageAPropsSeq,
  };
}

