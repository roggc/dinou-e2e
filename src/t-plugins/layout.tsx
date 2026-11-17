import type { ReactNode } from "react";

export default function TPluginsLayout({ children }: { children: ReactNode }) {
  return <div data-testid="t-plugins-layout">{children}</div>;
}

