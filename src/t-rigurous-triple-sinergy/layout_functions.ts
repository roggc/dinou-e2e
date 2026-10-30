import { readTsState } from "./ts-state";

export const ppr = true;

export async function getProps() {
  const state = readTsState();
  return {
    layoutSeq: state.layoutSeq,
    layoutNote: state.layoutNote,
  };
}

export function getCacheTags() {
  return ["ts-layout-tag"];
}

