import { getContext } from "dinou";
import { bumpHsCounter, readHsState } from "../hs-state";

export function revalidate() {
  return 0;
}

export async function getProps() {
  const ctx = getContext();
  const hasRefreshVersion = Boolean(
    (ctx?.req?.query as Record<string, string> | undefined)?.v
  );
  const state = hasRefreshVersion ? bumpHsCounter("refreshLayoutSeq") : readHsState();
  return {
    refreshLayoutSeq: state.refreshLayoutSeq,
  };
}
