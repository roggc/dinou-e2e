import type { PageFunctions } from "dinou";

const pageConfig: PageFunctions<"/t-page-config-default/dyn/[id]"> = {
  getProps: async (params) => {
    return {
      pageMsg: `Default Page message for ${params?.id}`,
    };
  },
};

export default pageConfig;
