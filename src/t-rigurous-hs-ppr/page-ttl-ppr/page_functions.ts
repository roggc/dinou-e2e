import { getHsPprState } from "../hsppr-state";

export const ppr = true;

export function revalidate() {
  return 1; // 1-second clock-based TTL on PPR child page (under 3600s L1 Layout)
}

export function getCacheTags() {
  return ["hsppr-page-ttl-only-tag"];
}

export async function getProps() {
  const st = getHsPprState();
  return {
    pageTtlPropsSeq: st.pageTtlPropsSeq,
  };
}

