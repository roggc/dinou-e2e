import type { ReactNode } from "react";

export default function ValidateSegmentsResetLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { org: string; scope: string };
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <title>Reset Layout Escape</title>
      </head>
      <body>
        <div data-testid="vs-reset-layout">
          <span data-testid="vs-reset-layout-param">
            Reset Layout: {params?.org}/{params?.scope}
          </span>
          {children}
        </div>
      </body>
    </html>
  );
}

