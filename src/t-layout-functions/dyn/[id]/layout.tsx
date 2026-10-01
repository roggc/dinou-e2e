import React from "react";

export default function DynLayout({ children, layoutData, params }: any) {
  return (
    <div id="dyn-layout" style={{ border: "2px dashed blue", padding: 10 }}>
      <h2 id="dyn-layout-heading">Layout Param: {params?.id}</h2>
      <span id="dyn-layout-data">{layoutData}</span>
      {children}
    </div>
  );
}
