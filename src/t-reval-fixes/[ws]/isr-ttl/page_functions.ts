export const revalidate = 6;

export function getCacheTags(params?: { ws?: string }) {
  return [`reval-ttl-page-${params?.ws ?? "default"}`];
}
