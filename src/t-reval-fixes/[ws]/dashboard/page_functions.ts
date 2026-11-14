export function getCacheTags(params?: { ws?: string }) {
  return [`reval-dash-page-${params?.ws ?? "default"}`];
}

