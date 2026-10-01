import type { ReactNode } from "react";

export default function BrokenRootLayout({ children }: { children: ReactNode }) {
  throw new Error("Deliberate Root Layout Crash");
  return <html><body>{children}</body></html>;
}
