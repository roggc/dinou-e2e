export function getCacheTags(params?: { ws?: string }) {
  return [`reval-billing-layout-${params?.ws ?? "default"}`];
}

