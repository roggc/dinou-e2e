import { readTsState } from "../ts-state";

export const ppr = false;

export async function getProps() {
  const st = readTsState();
  return {
    staticAPageSeq: st.staticAPageSeq,
  };
}

export function getCacheTags() {
  return ["ts-static-a-page-tag"];
}

