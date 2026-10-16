import type { PageFunctions } from "dinou";

const pageConfig: PageFunctions = {
  getProps: async () => ({
    pageTitle: "Default Subpage Independent Title",
    page: 99,
  }),
};

export default pageConfig;
