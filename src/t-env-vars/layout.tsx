import type { ReactNode } from "react";

export default function EnvVarsLayout({ children }: { children: ReactNode }) {
  return <section data-testid="t-env-vars-layout">{children}</section>;
}

