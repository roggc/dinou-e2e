import type { ReactNode } from "react";

export default function TPluginsDashboardLiveLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <section data-testid="t-plugins-live-layout">{children}</section>;
}

