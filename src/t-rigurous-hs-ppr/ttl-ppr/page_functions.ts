import { getHsPprState } from "../hsppr-state";

export const ppr = true;

export function revalidate() {
  return 3600; // 1 hour TTL on child PPR page (must NOT expire when layout's 1s TTL expires!)
}

export async function getProps() {
  const st = getHsPprState();
  return {
    ttlPagePropsSeq: st.ttlPagePropsSeq,
  };
}

export function getCacheTags() {
  return ["hsppr-ttl-page-tag"];
}

