import { readTsState } from "../ts-state";

export const ppr = false;

export async function getProps() {
  const st = readTsState();
  return {
    staticBPageSeq: st.staticBPageSeq,
  };
}

export function getCacheTags() {
  return ["ts-static-b-page-tag"];
}

