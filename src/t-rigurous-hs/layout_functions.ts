import { readHsState } from "./hs-state";

export async function getProps() {
  const state = readHsState();
  return {
    layoutTitle: "Horizontal Segmentation Section Shell",
    layoutMenu: ["Overview", "Sibling A", "Sibling B", "Nested"],
    layoutRenderSeq: state.sectionLayoutSeq,
    layoutNote: state.sectionLayoutNote,
  };
}

export function getCacheTags() {
  return ["hs-section-layout-tag"];
}
