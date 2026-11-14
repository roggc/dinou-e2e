export function getCacheTags(params?: { ws?: string }) {
  return [`reval-dash-layout-${params?.ws ?? "default"}`];
}

