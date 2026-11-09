import type { ReactNode } from "react";

export default function ValidateSegmentsOrgLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { org: string };
}) {
  return (
    <div data-testid="vs-org-layout" className="p-4 space-y-3">
      <div data-testid="vs-org-layout-param">Org Layout: {params?.org}</div>
      {children}
    </div>
  );
}

