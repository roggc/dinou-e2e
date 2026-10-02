import type { ReactNode } from "react";

export default function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: any;
}) {
  return (
    <div id="groups-params-layout">
      <div id="layout-params-text">layout params: {JSON.stringify(params)}</div>
      {children}
    </div>
  );
}
