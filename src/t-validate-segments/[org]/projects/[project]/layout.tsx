import type { ReactNode } from "react";

export default function ValidateSegmentsProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { org: string; project: string };
}) {
  return (
    <div data-testid="vs-project-layout" className="p-3 border rounded space-y-2">
      <div data-testid="vs-project-layout-param">
        Project Layout: {params?.org}/{params?.project}
      </div>
      {children}
    </div>
  );
}

