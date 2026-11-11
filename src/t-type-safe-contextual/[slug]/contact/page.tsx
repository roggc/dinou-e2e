import { Link, ROUTE, type PageProps } from "./dinou";
import type { ContactExtraProps } from "./page_functions";
import { ClientActions } from "./client-actions";
import { ColocatedCard } from "./_components/colocated-card";

export default function ContextualContactPage({
  params,
  greeting,
}: PageProps<ContactExtraProps>) {
  return (
    <article id="ctx-contact-page" data-testid="ctx-contact-page" data-route={ROUTE}>
      <h1 data-testid="contact-heading">Contact: {params.slug}</h1>
      <p data-testid="contact-greeting">{greeting}</p>
      <p data-testid="contact-route">{ROUTE}</p>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {/* 1. Bare relative link (no `from` prop!) */}
        <Link data-testid="rsc-link-sub-bare" to="sub">
          RSC Sub (bare)
        </Link>

        {/* 2. Dot-slash relative link (no `from` prop!) */}
        <Link data-testid="rsc-link-sub-dot" to="./sub">
          RSC Sub (dot)
        </Link>

        {/* 3. Multi-level parent relative link (".." has no page.tsx, "../.." is /t-type-safe-contextual) */}
        <Link data-testid="rsc-link-hub" to="../..">
          RSC Back to Hub
        </Link>

        {/* 4. Absolute dynamic pattern + required typed `params` on the same contextual <Link> */}
        <Link
          data-testid="rsc-link-beta-sub"
          to="/t-type-safe-contextual/[slug]/contact/sub"
          params={{ slug: "beta" }}
        >
          RSC Switch to Beta Sub
        </Link>

        {/* 5. Explicit `from` override on contextual <Link> */}
        <Link
          data-testid="rsc-link-override-pricing"
          from="/t-type-safe-contextual"
          to="pricing"
        >
          RSC Override to Pricing
        </Link>
      </div>

      <ClientActions />
      <ColocatedCard />
    </article>
  );
}

