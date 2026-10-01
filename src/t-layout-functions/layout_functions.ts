export async function getProps() {
  return {
    layoutTitle: "Dinou Layout Functions Title",
    layoutMenu: ["Home", "Settings", "Profile"],
  };
}

export function revalidate() {
  return 3600000;
}

export function getCacheTags() {
  return ["layout-test-tag"];
}
