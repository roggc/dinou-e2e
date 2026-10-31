import { readHsState } from "../hs-state";

export function revalidate() {
  return 1; // 1-second clock-based TTL on non-PPR layout
}

export function getCacheTags() {
  return ["hs-ttl-layout-tag"];
}

export async function getProps() {
  const st = readHsState();
  return {
    ttlLayoutPropsSeq: st.ttlLayoutSeq,
  };
}

