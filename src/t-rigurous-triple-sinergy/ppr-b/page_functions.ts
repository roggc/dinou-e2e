import { readTsState } from "../ts-state";

export const ppr = true;

export async function getProps() {
  const st = readTsState();
  return {
    pprBPageSeq: st.pprBPageSeq,
  };
}

export function getCacheTags() {
  return ["ts-ppr-b-page-tag"];
}

