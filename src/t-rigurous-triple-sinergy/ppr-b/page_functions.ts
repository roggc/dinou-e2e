import { readTsState } from "../ts-state";

export async function getProps() {
  const st = readTsState();
  return {
    pprBPageSeq: st.pprBPageSeq,
  };
}

export function getCacheTags() {
  return ["ts-ppr-b-page-tag"];
}

