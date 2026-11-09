export async function validateParams(params: Record<string, string>) {
  // Strictly segment-scoped: nested [project] layout must receive ONLY ["org", "project"], never child [task] param!
  if (Object.keys(params || {}).sort().join(",") !== "org,project") {
    return false;
  }
  return typeof params.project === "string" && params.project.startsWith("proj-");
}

export function getStaticPaths() {
  return [{ org: "org-1", project: "proj-a" }];
}

