import React from "react";

export default function HsDeptIndexPage({ params }: { params: { deptId: string } }) {
  return (
    <div id="hs-dept-index-page">
      <div id="hs-page-id">dept-index-{params.deptId}</div>
      <div id="hs-dept-page-msg">Overview for {params.deptId}</div>
    </div>
  );
}

