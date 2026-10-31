import { readHsState } from "../hs-state";

export function revalidate() {
  return 3600; // Long-lived 1-hour TTL on child page
}

export function getCacheTags() {
  return ["hs-ttl-page-tag"];
}

export async function getProps() {
  const st = readHsState();
  return {
    ttlPagePropsSeq: st.ttlPageSeq,
  };
}

