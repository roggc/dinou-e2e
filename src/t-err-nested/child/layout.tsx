import type { ReactNode } from "react";

export default function BrokenNestedLayout({ children }: { children: ReactNode }) {
  throw new Error("Deliberate Nested Layout Error");
  return <div id="broken-nested-shell">{children}</div>;
}
