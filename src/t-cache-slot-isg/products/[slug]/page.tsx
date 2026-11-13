import { Suspense } from "react";
import { DinouCacheSlot, type DinouCacheSlotProps } from "dinou/server";
import type { PageProps } from "./dinou";

let processBootId: string | null = null;
const pageRenderCounts = new Map<string, number>();
const slotRenderCounts = new Map<string, number>();

function ensureBootId(): string {
  if (!processBootId) {
    processBootId = `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .padEnd(4, "0")}`;
  }
  return processBootId;
}

async function StockBadge({ slug }: { slug: string }) {
  const bootId = ensureBootId();
  const next = (slotRenderCounts.get(slug) ?? 0) + 1;
  slotRenderCounts.set(slug, next);
  return (
    <p data-testid="slot-render-count">{`Slot:${slug}:${bootId}:${next}`}</p>
  );
}

export default function SlotIsgProductPage({ params }: PageProps) {
  const nextPage = (pageRenderCounts.get(params.slug) ?? 0) + 1;
  pageRenderCounts.set(params.slug, nextPage);

  const stockRevalidate = params.slug.startsWith("swr-") ? 2 : 3600;
  const fnSlotProps: DinouCacheSlotProps = {
    id: `e2e-fn-${params.slug}`,
    revalidate: 3600,
    children: async () => (
      <p data-testid="slot-fn-child">{`FnSlot:${params.slug}`}</p>
    ),
  };

  return (
    <section>
      <h1 data-testid="page-render-count">{`Page:${params.slug}:${nextPage}`}</h1>
      <Suspense fallback={<p data-testid="slot-fallback">Loading stock...</p>}>
        <DinouCacheSlot
          id={`e2e-stock-${params.slug}`}
          revalidate={stockRevalidate}
        >
          <StockBadge slug={params.slug} />
        </DinouCacheSlot>
      </Suspense>
      <Suspense
        fallback={<p data-testid="slot-fn-fallback">Loading details...</p>}
      >
        <DinouCacheSlot {...fnSlotProps} />
      </Suspense>
    </section>
  );
}
