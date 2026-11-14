import type { LayoutProps } from "./dinou";
import { nextRevalStamp } from "../../../lib/revalStore";

export default function RevalSettingsLayout({
  children,
  params,
}: LayoutProps) {
  const ws = params.ws;
  return (
    <section data-testid="settings-layout-wrapper">
      <header data-testid="settings-layout-stamp">
        {nextRevalStamp("SettingsLayout", ws)}
      </header>
      {children}
    </section>
  );
}
