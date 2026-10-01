import React from "react";

export default function DynPage({ pageMsg, params }: any) {
  return (
    <div id="dyn-page">
      <h3 id="dyn-page-heading">Page Param: {params?.id}</h3>
      <p id="dyn-page-msg">{pageMsg}</p>
    </div>
  );
}
