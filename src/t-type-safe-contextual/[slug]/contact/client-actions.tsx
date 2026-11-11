"use client";

import { Link, useRouter, usePathname, useSearchParams, ROUTE } from "./dinou";

export function ClientActions() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div data-testid="ctx-client-actions" data-client-route={ROUTE}>
      <p data-testid="client-pathname">{pathname}</p>
      <p data-testid="client-panel-param">{searchParams.get("panel") ?? "none"}</p>

      {/* Client-bundled contextual <Link> */}
      <Link data-testid="client-link-sub" to="sub">
        Client Link Sub
      </Link>

      {/* Client-bundled contextual useRouter().push() WITHOUT { from } */}
      <button
        type="button"
        data-testid="client-btn-push-sub"
        onClick={() => router.push("sub")}
      >
        Client Push Sub
      </button>

      <button
        type="button"
        data-testid="client-btn-push-hub"
        onClick={() => router.push("../..")}
      >
        Client Push Hub
      </button>

      <button
        type="button"
        data-testid="client-btn-push-beta-sub"
        onClick={() =>
          router.push("/t-type-safe-contextual/[slug]/contact/sub", {
            params: { slug: "beta" },
          })
        }
      >
        Client Push Beta Sub
      </button>
    </div>
  );
}

