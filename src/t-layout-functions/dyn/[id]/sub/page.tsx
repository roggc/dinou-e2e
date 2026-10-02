import React from "react";

export default function DynSubPage({ params }: any) {
  return (
    <div id="dyn-sub-page">
      <h3 id="dyn-sub-heading">Subpage Param: {params?.id}</h3>
    </div>
  );
}
