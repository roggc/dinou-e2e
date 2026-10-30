import React from "react";
import { HsLayoutClientState } from "../../hs-client";

export default function HsDeptLayout({
  children,
  params,
  deptName,
}: {
  children: React.ReactNode;
  params: { deptId: string };
  deptName?: string;
}) {
  return (
    <div id="hs-dept-layout" className="p-4 border border-sky-500 rounded my-2">
      <div id="hs-dept-param">Dept Param: {params.deptId}</div>
      <div id="hs-dept-name">{deptName}</div>
      <HsLayoutClientState idPrefix="hs-dept" />
      <div id="hs-dept-outlet">{children}</div>
    </div>
  );
}

