export async function validateParams(params: any) {
  // Reject 'invalid' id
  return params?.id !== "invalid";
}

export async function getProps(params: any) {
  return {
    layoutData: `Data for ${params?.id}`,
  };
}

export function getStaticPaths() {
  return [{ id: "1" }, { id: "2" }];
}

export function getCacheTags() {
  return ["dyn-layout-tag"];
}
