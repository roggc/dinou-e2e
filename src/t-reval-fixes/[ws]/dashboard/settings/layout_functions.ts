export function getCacheTags(params?: { ws?: string }) {
  return [`reval-settings-layout-${params?.ws ?? "default"}`];
}

