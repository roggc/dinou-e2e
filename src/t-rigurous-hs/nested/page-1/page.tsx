import React from "react";
import { readHsState } from "../../hs-state";

export default async function HsNestedPage1() {
  const state = readHsState();
  return (
    <article id="hs-nested-page-1" className="p-3 bg-slate-950 rounded">
      <div id="hs-page-id">nested-page-1</div>
      <div id="hs-nested-page-1-seq">{state.nestedPage1Seq}</div>
    </article>
  );
}
