"use client";

import { Link, useSearchParams, ROUTE, type PageProps } from "./dinou";

export default function ContextualSubPage({ params }: PageProps) {
  const searchParams = useSearchParams();

  return (
    <article id="ctx-sub-page" data-testid="ctx-sub-page" data-route={ROUTE}>
      <h1 data-testid="sub-heading">Subpage: {params.slug}</h1>
      <p data-testid="sub-route">{ROUTE}</p>
      <p data-testid="sub-panel-param">{searchParams.get("panel") ?? "none"}</p>
      <div id="details-anchor" data-testid="sub-anchor">
        Details Section
      </div>

      {/* ".." from /t-type-safe-contextual/[slug]/contact/sub -> /t-type-safe-contextual/[slug]/contact */}
      <Link data-testid="sub-back-contact" to="..">
        Back to Contact
      </Link>

      {/* "../../.." -> /t-type-safe-contextual */}
      <Link data-testid="sub-back-hub" to="../../..">
        Back to Hub
      </Link>
    </article>
  );
}

