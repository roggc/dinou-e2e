import React from "react";

export default function DefaultDynPage({ pageMsg, params }: any) {
  return (
    <div id="default-dyn-page">
      <h3 id="default-dyn-page-heading">Page Param: {params?.id}</h3>
      <p id="default-dyn-page-msg">{pageMsg}</p>
    </div>
  );
}
