import type { LayoutFunctions } from "dinou";

const layoutConfig: LayoutFunctions<"/t-page-config-default/dyn/[id]"> = {
  validateParams: async (params) => {
    return params?.id !== "invalid";
  },
  getProps: async (params) => {
    return {
      layoutData: `Default Data for ${params?.id}`,
    };
  },
  getStaticPaths: [{ id: "1" }, { id: "2" }],
  getCacheTags: () => ["default-dyn-layout-tag"],
};

export default layoutConfig;
