import { Link, ROUTE, type PageProps } from "./dinou";

export default function ContextualPricingPage(_props: PageProps) {
  return (
    <main id="ctx-pricing-page" data-testid="ctx-pricing-page" data-route={ROUTE}>
      <h1>Contextual Pricing</h1>
      <p data-testid="pricing-route">{ROUTE}</p>
      {/* ".." from /t-type-safe-contextual/pricing resolves to /t-type-safe-contextual */}
      <Link data-testid="pricing-back-hub" to="..">
        Back to Hub
      </Link>
    </main>
  );
}

