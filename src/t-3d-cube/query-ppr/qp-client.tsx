"use client";

import { usePathname, useRouter, useSearchParams } from "dinou";

export function QueryPprClientPanel({ scope }: { scope: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const tab = searchParams.get("tab") ?? "none";
  const sort = searchParams.get("sort") ?? "none";

  return (
    <div id={`qp-client-panel-${scope}`} style={{ display: "flex", gap: 8, alignItems: "center", margin: "6px 0" }}>
      <code id={`qp-sp-path-${scope}`}>{pathname}</code>
      <strong id={`qp-sp-tab-${scope}`}>{tab}</strong>
      <strong id={`qp-sp-sort-${scope}`}>{sort}</strong>
      <button
        id={`btn-qp-refresh-page-${scope}`}
        type="button"
        onClick={() => router.refresh()}
      >
        router.refresh()
      </button>
      <button
        id={`btn-qp-refresh-layout-${scope}`}
        type="button"
        onClick={() => router.refresh({ layout: true })}
      >
        router.refresh(layout)
      </button>
    </div>
  );
}
