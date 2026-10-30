import { readHsState } from "../hs-state";

export async function getProps() {
  const state = readHsState();
  return {
    nestedTitle: "Nested Sub-Layout Shell",
    nestedLayoutSeq: state.nestedLayoutSeq,
  };
}
