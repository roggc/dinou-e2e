export async function validateParams(params: Record<string, string>) {
  if (Object.keys(params || {}).sort().join(",") !== "org,scope") {
    return false;
  }
  return typeof params.scope === "string" && params.scope.startsWith("scope-");
}

export function getStaticPaths() {
  return [{ org: "org-1", scope: "scope-ok" }];
}

