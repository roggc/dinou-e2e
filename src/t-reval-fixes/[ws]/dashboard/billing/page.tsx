import type { PageProps } from "./dinou";
import { nextRevalStamp } from "../../../lib/revalStore";

export default function RevalBillingPage({ params }: PageProps) {
  const ws = params.ws;
  return (
    <main data-testid="billing-page-wrapper">
      <h1 data-testid="billing-page-stamp">
        {nextRevalStamp("BillingPage", ws)}
      </h1>
    </main>
  );
}
