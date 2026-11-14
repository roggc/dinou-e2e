import type { LayoutProps } from "./dinou";
import { nextRevalStamp } from "../../../lib/revalStore";

export default function RevalBillingLayout({
  children,
  params,
}: LayoutProps) {
  const ws = params.ws;
  return (
    <section data-testid="billing-layout-wrapper">
      <header data-testid="billing-layout-stamp">
        {nextRevalStamp("BillingLayout", ws)}
      </header>
      {children}
    </section>
  );
}
