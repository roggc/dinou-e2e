import { readHsState } from "../hs-state";

export function revalidate() {
  return 1; // 1-second clock-based TTL on child page (under long-lived section layout)
}

export function getCacheTags() {
  return ["hs-ttl-page-only-tag"];
}

export async function getProps() {
  const st = readHsState();
  return {
    ttlPageOnlyPropsSeq: st.ttlPageOnlySeq,
  };
}

