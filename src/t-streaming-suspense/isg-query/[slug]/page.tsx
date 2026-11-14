import { Suspense } from "react";
import type { PageProps } from "./dinou";
import { nextStreamStamp, ServerUidBadge, sleep } from "../../lib/streamStore";

async function getCatalogDetails(slug: string) {
  const delayMs = slug.startsWith("slow-") ? 700 : 30;
  await sleep(delayMs);
  return (
    <div data-testid="isg-catalog-resolved">
      <span>{`CatalogDetails:${slug}`}</span>
      <ServerUidBadge testId="isg-catalog-uid" label={`CatalogUid:${slug}`} />
    </div>
  );
}

export default function IsgQueryStreamingPage({ params }: PageProps) {
  const { slug } = params;

  return (
    <main data-testid="isg-query-page">
      <h1 data-testid="isg-query-stamp">
        {nextStreamStamp("IsgQueryPage", slug)}
      </h1>
      <Suspense
        fallback={
          <div data-testid="isg-query-skeleton">Loading catalog...</div>
        }
      >
        {getCatalogDetails(slug)}
      </Suspense>
    </main>
  );
}

