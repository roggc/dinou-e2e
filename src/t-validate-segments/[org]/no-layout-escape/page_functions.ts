export async function validateParams(params: Record<string, string>) {
  // Rejects only "page-blocked", allowing e.g. "bad-org" (which the bypassed [org] layout would reject)
  return params?.org !== "page-blocked";
}

export function getStaticPaths() {
  return [{ org: "org-1" }];
}

