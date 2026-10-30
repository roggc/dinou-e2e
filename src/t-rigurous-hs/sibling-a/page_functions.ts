import { readHsState } from "../hs-state";

export async function getProps() {
  const state = readHsState();
  return {
    pageTitle: "HS Sibling A Page",
    page: 202,
    pageRenderSeq: state.siblingASeq,
    pageNote: state.siblingANote,
  };
}

export function getCacheTags() {
  return ["hs-sibling-a-page-tag"];
}
