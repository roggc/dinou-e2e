export async function validateParams(params: Record<string, string>) {
  if (Object.keys(params || {}).sort().join(",") !== "org,project,task") {
    return false;
  }
  return typeof params.task === "string" && params.task.startsWith("task-");
}

export function getStaticPaths() {
  return [{ org: "org-1", project: "proj-a", task: "task-1" }];
}

