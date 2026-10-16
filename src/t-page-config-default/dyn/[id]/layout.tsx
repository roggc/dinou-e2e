import React from "react";

export default function DefaultDynLayout({ children, layoutData, params }: any) {
  return (
    <div id="default-dyn-layout" style={{ border: "2px dashed blue", padding: 10 }}>
      <h2 id="default-dyn-layout-heading">Layout Param: {params?.id}</h2>
      <span id="default-dyn-layout-data">{layoutData}</span>
      {children}
    </div>
  );
}
