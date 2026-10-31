import { getHsCsState } from "../hscs-state";

export const revalidate = 3600;

export function getTags() {
  return ["hscs-nested-page-tag"];
}

export async function getProps() {
  const st = getHsCsState();
  return {
    nestedPageSeq: st.nestedPageSeq,
  };
}

