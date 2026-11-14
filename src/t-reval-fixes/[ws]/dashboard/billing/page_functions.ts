export function getCacheTags(params?: { ws?: string }) {
  return [`reval-billing-page-${params?.ws ?? "default"}`];
}

