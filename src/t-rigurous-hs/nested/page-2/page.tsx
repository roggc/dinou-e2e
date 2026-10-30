import React from "react";
import { readHsState } from "../../hs-state";

export default async function HsNestedPage2() {
  const state = readHsState();
  return (
    <article id="hs-nested-page-2" className="p-3 bg-slate-950 rounded">
      <div id="hs-page-id">nested-page-2</div>
      <div id="hs-nested-page-2-seq">{state.nestedPage2Seq}</div>
    </article>
  );
}
