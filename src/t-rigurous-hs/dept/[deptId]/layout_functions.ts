export function getStaticPaths() {
  return ["eng", "design"];
}

export function validateParams(params: { deptId?: string }) {
  return params.deptId === "eng" || params.deptId === "design";
}

export async function getProps(params: { deptId?: string }) {
  return {
    deptName: params.deptId === "eng" ? "Engineering Dept" : "Design Dept",
    deptRenderTime: Date.now(),
  };
}

