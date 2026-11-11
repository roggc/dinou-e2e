import { Link, ROUTE, type SlotProps } from "./dinou";

// Inside @sidebar, "./dinou" sets:
// - SlotProps -> { params: { slug: string } }
// - ROUTE     -> "/t-type-safe-contextual/[slug]" (the URL segment, NOT /@sidebar!)
export default async function ContextualSidebarSlot({ params }: SlotProps) {
  if (params.slug === "crash-slot") {
    throw new Error("Simulated sidebar slot failure");
  }

  return (
    <nav data-testid="ctx-sidebar" data-slot-route={ROUTE}>
      <p data-testid="sidebar-slug">{params.slug}</p>
      <p data-testid="sidebar-route">{ROUTE}</p>
      <ul>
        <li>
          {/* Even when the browser is deep on /t-type-safe-contextual/acme/contact/sub,
              clicking this link MUST slice back to /t-type-safe-contextual/acme/contact */}
          <Link data-testid="sidebar-link-contact" to="contact">
            Sidebar Contact
          </Link>
        </li>
        <li>
          <Link data-testid="sidebar-link-sub" to="contact/sub">
            Sidebar Sub
          </Link>
        </li>
        <li>
          {/* ".." from /t-type-safe-contextual/[slug] resolves to /t-type-safe-contextual */}
          <Link data-testid="sidebar-link-hub" to="..">
            Sidebar Hub
          </Link>
        </li>
        <li>
          {/* Standalone query/hash links inside a scoped @slot must preserve the active deeper pathname */}
          <Link data-testid="sidebar-link-query" to="?panel=open">
            Open Panel Query
          </Link>
        </li>
        <li>
          <Link data-testid="sidebar-link-hash" to="#details-anchor">
            Jump Hash
          </Link>
        </li>
      </ul>
    </nav>
  );
}

