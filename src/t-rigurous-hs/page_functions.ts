import { readHsState } from "./hs-state";

export async function getProps() {
  const state = readHsState();
  return {
    pageTitle: "HS Index Page",
    page: 101,
    pageRenderSeq: state.indexPageSeq,
    pageNote: state.indexPageNote,
  };
}

export function getCacheTags() {
  return ["hs-index-page-tag"];
}
