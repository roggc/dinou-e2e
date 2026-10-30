import { readTsState } from "../../ts-state";

export const ppr = false;

export async function getProps() {
  const st = readTsState();
  return {
    nestedStaticPageSeq: st.nestedStaticPageSeq,
  };
}

