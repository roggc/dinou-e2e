import { readTsState } from "./ts-state";

export async function getProps() {
  const state = readTsState();
  return {
    pprAPageSeq: state.pprAPageSeq,
    pprAPageNote: state.pprAPageNote,
  };
}

export function getCacheTags() {
  return ["ts-ppr-a-page-tag"];
}

