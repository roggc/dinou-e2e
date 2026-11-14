export function getCacheTags(params?: { ws?: string }) {
  return [`reval-settings-page-${params?.ws ?? "default"}`];
}

