import { readTsState } from "../ts-state";

export const ppr = true;

export async function getProps() {
  const st = readTsState();
  return {
    nestedLayoutSeq: st.nestedLayoutSeq,
  };
}

export function getCacheTags() {
  return ["ts-nested-layout-tag"];
}

