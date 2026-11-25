export function getStaticPaths() {
  return ["fast", "slow", "live"];
}

export async function revalidate(params?: { id?: string }) {
  if (params?.id === "live") return 0;
  if (params?.id === "fast") return 1;
  return 3600;
}

export function getCacheTags(params?: { id?: string }) {
  return [`ttl-dynfn-l-${params?.id || "unknown"}`];
}
