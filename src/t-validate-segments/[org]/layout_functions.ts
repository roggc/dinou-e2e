export async function validateParams(params: Record<string, string>) {
  // Strictly segment-scoped: outer [org] layout must receive ONLY ["org"], never child [project] or [task] params!
  if (Object.keys(params || {}).join(",") !== "org") {
    return false;
  }
  return typeof params.org === "string" && params.org.startsWith("org-");
}

export function getStaticPaths() {
  return [{ org: "org-1" }];
}

