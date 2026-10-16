import type { LayoutFunctions } from "dinou";

const layoutConfig: LayoutFunctions = {
  getProps: async () => ({
    layoutTitle: "Default Layout Functions Title",
    layoutMenu: ["Default-Home", "Default-Settings", "Default-Profile"],
  }),
  revalidate: 3600,
  getCacheTags: () => ["default-layout-test-tag"],
};

export default layoutConfig;
