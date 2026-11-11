import { Link, ROUTE, type PageProps } from "./dinou";

export default function ContextualHubPage(_props: PageProps) {
  return (
    <main id="ctx-hub-page" data-testid="ctx-hub-page" data-route={ROUTE}>
      <h1>Contextual Dinou Hub</h1>
      <p data-testid="hub-route">{ROUTE}</p>

      <nav style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        {/* Relative dynamic navigation from /t-type-safe-contextual -> /t-type-safe-contextual/acme/contact */}
        <Link
          data-testid="hub-to-acme-contact"
          to="[slug]/contact"
          params={{ slug: "acme" }}
        >
          Go to Acme Contact
        </Link>

        {/* Relative navigation into unwrapped (marketing)/pricing route group */}
        <Link data-testid="hub-to-pricing" to="pricing">
          Go to Pricing (Group)
        </Link>
      </nav>
    </main>
  );
}

