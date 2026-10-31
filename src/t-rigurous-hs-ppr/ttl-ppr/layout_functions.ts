import { getHsPprState } from "../hsppr-state";

export const ppr = true;

export function revalidate() {
  return 1; // 1 second clock TTL on layout
}

export async function getProps() {
  const st = getHsPprState();
  return {
    ttlLayoutPropsSeq: st.ttlLayoutPropsSeq,
  };
}

export function getCacheTags() {
  return ["hsppr-ttl-layout-tag"];
}

