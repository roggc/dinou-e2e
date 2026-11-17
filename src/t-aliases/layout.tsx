import type { ReactNode } from "react";
import "@alias-styles/theme.css";
import panelStyles from "@alias-styles/panel.module.css";

export default function AliasesLayout({ children }: { children: ReactNode }) {
  return (
    <div
      data-testid="t-aliases-layout"
      data-server-module-class={panelStyles.card || ""}
    >
      {children}
    </div>
  );
}

