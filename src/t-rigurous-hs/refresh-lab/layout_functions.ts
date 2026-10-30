import { bumpHsCounter } from "../hs-state";

export function revalidate() {
  return 0;
}

export async function getProps() {
  const state = bumpHsCounter("refreshLayoutSeq");
  return {
    refreshLayoutSeq: state.refreshLayoutSeq,
  };
}
