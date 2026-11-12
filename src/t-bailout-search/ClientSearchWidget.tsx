"use client";

import { useSearchParams } from "dinou";

export function ClientSearchWidget() {
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "EMPTY";
  const tags = searchParams.getAll("tag").join(",");
  const hasEmpty = searchParams.has("empty");
  return (
    <div>
      <p data-testid="client-search-value">{`ClientSearch:${q}`}</p>
      {tags ? <p data-testid="client-search-tags">{`ClientTags:${tags}`}</p> : null}
      {hasEmpty ? (
        <p data-testid="client-search-empty">{`ClientEmpty:${searchParams.get("empty")}`}</p>
      ) : null}
    </div>
  );
}
