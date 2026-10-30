import { readHsState } from "../hs-state";

export async function getProps() {
  const state = readHsState();
  return {
    pageTitle: "HS Sibling B Page",
    page: 303,
    pageRenderSeq: state.siblingBSeq,
    pageNote: state.siblingBNote,
  };
}
