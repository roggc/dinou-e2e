import React from "react";

export default function HsDeptMembersPage({ params }: { params: { deptId: string } }) {
  return (
    <div id="hs-dept-members-page">
      <div id="hs-page-id">dept-members-{params.deptId}</div>
      <div id="hs-dept-page-msg">Members of {params.deptId}</div>
    </div>
  );
}

